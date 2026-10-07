/** App startup: load config, restore the tab session (§34), and wire the
 * standing subscriptions (status-bar action counts, window title, session
 * autosave). Also the two small config-backed toggles (`setColorMode` /
 * `setWordWrap`) and the maximize/fullscreen chrome watcher. Split out of
 * `controller.ts` in the v0.5.0 refactor. `directory.ts` reuses
 * `restoreOrBootstrapTabs` for the workspace re-load on a folder switch. */
import { loadBaseline } from "./hash";
import { get } from "svelte/store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "./tauriApi";
import { countActions, countWords } from "./tokens";
import { todayISO } from "./date";
import {
  activeTabId,
  agendaFileExists,
  appVersion,
  autoCheckUpdates,
  backendKind,
  calendarSyncEnabled,
  chromeExpanded,
  colorMode,
  currentDateISO,
  fontSize,
  languageMode,
  lineHeight,
  pureBlack,
  isMobile,
  justUpdatedToVersion,
  markTabClean,
  modal,
  notesDir,
  oneDriveAccount,
  oneDriveSignInExpired,
  oneDriveConnecting,
  oneDriveFolder,
  oneDriveFolderPickerOpen,
  oneDriveSyncStatus,
  readableLineLength,
  recentNotesDirs,
  scratchpadGateContext,
  showToast,
  statusCounts,
  statusPos,
  statusSelection,
  statusWordCount,
  startupTabMode,
  syncHealth,
  tabs,
  themeMode,
  unsavedScratchpadNames,
  wordWrap,
} from "./stores";
import {
  flushAllPendingSaves,
  recomputeSaveState,
  refreshAllNotesCache,
  setWriteConflictHandler,
} from "./persistence";
import { checkActiveTabForDrift, handleWriteConflict } from "./drift";
import { initCalendarSyncDiffTracking, maybeSilentSyncEmptyNote, refreshAgendaFileExists } from "./calendarSyncActions";
import { refreshSyncConflicts, syncOneDriveNow } from "./oneDriveSync";
import { checkForUpdatesOnLaunch } from "./updates";
import { applyPeekConfig } from "./peek";
import { occurrenceHint } from "./occurrences";
import { locale, t } from "./i18n";
import { describeApiError } from "./apiError";
import { getOnboardingTemplate } from "./onboardingTemplate";
import type { ColorMode, LanguageMode, NoteTab, StartupTabMode, ThemeMode } from "./types";

// --- Standing subscriptions (wired once, from initApp) -----------------

/** Keep the status bar's action counts in sync with whichever tab is
 * active, including edits made through the drawers/modals rather than
 * typing. `latestTabs` is a plain cache of the last `tabs` value so the
 * `activeTabId` subscription can read it without a `get()`. */
let latestTabs: NoteTab[] = [];
let statusSyncWired = false;
function wireStatusBarSync() {
  if (statusSyncWired) return;
  statusSyncWired = true;
  tabs.subscribe((v) => {
    latestTabs = v;
    syncActiveStatus();
  });
  activeTabId.subscribe(() => {
    syncActiveStatus();
    statusPos.set({ line: 1, col: 1 });
    statusSelection.set(null); // #37: a fresh tab starts with no selection
  });
}
function syncActiveStatus() {
  const t = latestTabs.find((x) => x.id === get(activeTabId));
  if (t) {
    statusCounts.set(countActions(t.content));
    statusWordCount.set(countWords(t.content));
  }
  // §102: the ambient save indicator describes the active tab, so it
  // re-derives whenever the active tab or the tab list changes.
  recomputeSaveState();
}

/** The folder's own last path segment, not the full path — shared by the
 * window-title sync below and (§merged-titlebar) the status bar's own
 * folder-name display, so the two can never disagree about what "the
 * folder name" means. Fires on every `notesDir` change regardless of
 * which code path caused it (initial boot, or a directory switch),
 * rather than needing a call at each call site. */
export function folderNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}
let titleSyncWired = false;
function wireWindowTitleSync() {
  if (titleSyncWired) return;
  titleSyncWired = true;
  notesDir.subscribe((dir) => {
    if (!dir) return;
    getCurrentWindow()
      .setTitle(`ChronoNote - ${folderNameFromPath(dir)}`)
      .catch(() => {});
  });
}

// --- §93: zero-loss exit barrier -------------------------------------
//
// The autosave debounce (400ms) means the last burst of typing before an
// OS window close (X button, Alt+F4) could be lost. Intercept the close:
// flush every pending + in-flight disk write first, then destroy the
// window. A non-empty scratchpad has no disk file, so it goes through the
// same unsaved-scratchpads gate a notes-folder switch uses (§39) —
// close is cancelled until the user promotes or discards it.

let closeBarrierWired = false;
function wireCloseBarrier() {
  if (closeBarrierWired) return;
  closeBarrierWired = true;
  const win = getCurrentWindow();
  win
    .onCloseRequested(async (event) => {
      // Take the close off Tauri's hands; we decide when the window dies.
      event.preventDefault();
      const unsaved = get(tabs).filter((t) => t.isScratchpad && t.content.trim() !== "");
      if (unsaved.length > 0) {
        unsavedScratchpadNames.set(unsaved.map((t) => t.filename));
        scratchpadGateContext.set("close");
        modal.set("unsavedScratchpads");
        return; // stay open; the modal's buttons resolve it
      }
      await flushThenDestroy();
    })
    .catch(() => {
      // No window handle (tests without the mock event plumbing, or a
      // non-Tauri context) — the barrier just isn't active there.
    });
}

async function flushThenDestroy() {
  try {
    await flushAllPendingSaves();
  } finally {
    await getCurrentWindow().destroy();
  }
}

// --- §94: external-modification detection triggers -------------------
//
// Check the active tab for drift whenever it becomes active, and whenever
// the OS window regains focus (the "I edited the file in another app and
// alt-tabbed back" case). The check itself is in `drift.ts` and is a
// cheap no-op when nothing changed.

let driftWired = false;
function wireDriftDetection() {
  if (driftWired) return;
  driftWired = true;
  activeTabId.subscribe(() => {
    void checkActiveTabForDrift();
  });
  if (typeof window !== "undefined") {
    window.addEventListener("focus", () => {
      void checkActiveTabForDrift();
      refreshCurrentDate();
    });
  }
  getCurrentWindow()
    .onFocusChanged(({ payload: focused }) => {
      if (!focused) return;
      void checkActiveTabForDrift();
      // Same "regained focus" moment covers the sync button's gray-out
      // state too — `.agenda.json` is written by an external process,
      // which realistically only happens while ChronoNote itself is
      // unfocused. Skip the check entirely when the feature's off or
      // unavailable, rather than a wasted read every single focus.
      if (get(calendarSyncEnabled) && (get(backendKind) !== "web" || !!get(oneDriveAccount))) {
        void refreshAgendaFileExists();
      }
      // #72: also the fastest way to notice a midnight rollover that
      // happened while the app sat unfocused — no need to wait out the
      // rollover interval's own delay once the app is actually looked at
      // again.
      refreshCurrentDate();
    })
    .catch(() => {
      // No window handle — focus trigger just isn't active here.
    });
}

// --- #72: keep `currentDateISO` live across a midnight rollover --------
//
// A plain `todayISO()` call inside a template expression (the top bar's
// past/today/future tab colouring, before this fix) only re-evaluates
// when something else Svelte is already watching changes — usually not
// true right at midnight, so a tab left open overnight kept showing
// yesterday's colours until some unrelated interaction (switching tabs,
// resizing) happened to force a re-render. A cheap interval catches the
// rollover on its own; a window-focus check (piggybacking on the same
// hook §94's drift detection already uses) also catches it the moment the
// app is looked at again after being away, without waiting up to the
// interval's own delay.

const DATE_ROLLOVER_CHECK_MS = 30_000;
let dateRolloverWired = false;

function refreshCurrentDate() {
  const today = todayISO();
  if (get(currentDateISO) !== today) currentDateISO.set(today);
}

function wireDateRollover() {
  if (dateRolloverWired) return;
  dateRolloverWired = true;
  // `currentDateISO`'s initial value (`stores.ts`) is only as fresh as
  // whenever that module happened to load — normally the same instant as
  // boot, but re-syncing explicitly here means `initApp()` never depends
  // on that coincidence.
  refreshCurrentDate();
  setInterval(refreshCurrentDate, DATE_ROLLOVER_CHECK_MS);
}

/** Unsaved-scratchpads gate, "close" context: Cancel — stay in the app. */
export function cancelAppClose() {
  unsavedScratchpadNames.set([]);
  scratchpadGateContext.set(null);
  modal.set("none");
}

/** Unsaved-scratchpads gate, "close" context: Discard & Quit — drop the
 * scratchpads, flush the real notes, then close. */
export async function confirmDiscardAndClose() {
  unsavedScratchpadNames.set([]);
  scratchpadGateContext.set(null);
  modal.set("none");
  await flushThenDestroy();
}

// --- Boot ---

export function applyColorModeToDom(mode: ColorMode) {
  document.documentElement.dataset.colorMode = mode;
}

/** #48: `system` means "no override" — `app.css`'s `prefers-color-scheme`
 * query alone decides, exactly like before this setting existed — so the
 * `data-theme` attribute is removed rather than set to `"system"` (no CSS
 * selector matches that value; the attribute's mere *absence* is what the
 * bare `:root` / media-query blocks are written against). */
export function applyThemeModeToDom(mode: ThemeMode) {
  if (mode === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}

export function applyPureBlackToDom(pureBlack: boolean) {
  if (pureBlack) document.documentElement.setAttribute("data-pure-black", "");
  else document.documentElement.removeAttribute("data-pure-black");
}

/** i18n roadmap: reflects the *resolved* display language (never
 * `"system"` itself — `./i18n`'s `locale` store already resolved that)
 * onto `<html lang>`, a real accessibility/correctness fix (screen
 * readers and the browser's own spell-checker pick the right language)
 * that falls out of having a resolved locale at all. Called once at
 * boot and again on every `setLanguageMode`, mirroring
 * `applyThemeModeToDom`'s call sites below. */
export function applyLocaleToDom(resolvedLocale: string) {
  document.documentElement.lang = resolvedLocale;
}

/** Set while a session restore (or a directory switch's fresh restore) is
 * rebuilding the `tabs`/`activeTabId` stores step by step, so the
 * persistence subscribers below don't write a half-built intermediate
 * state to disk (§34). */
let restoringTabs = false;

/** Spec §34: restores the tabs and active tab this specific notes folder
 * had open last time (skipping any that no longer exist on disk), and
 * always force-opens today's dated tab as well — confirmed design
 * decisions: today's tab is always present, and it's also the fallback
 * active tab whenever the previously-active one can't be restored (its
 * file was deleted, or it was a scratchpad, which never persists). A
 * folder with no saved session yet (first time it's opened) just gets
 * today's tab, same as before this feature existed. */
export async function restoreOrBootstrapTabs() {
  restoringTabs = true;
  // A save from just before this call (e.g. performDirectorySwitch clearing
  // `tabs`/`activeTabId` ahead of the restore) may already be pending —
  // cancel it so it can't fire mid-restore and persist a half-built state.
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  try {
    const todayFilename = todayISO() + ".txt";
    const session = await api.readTabSession();
    const otherFilenames = (session?.openTabs ?? []).filter((f) => f !== todayFilename);

    // Fire every read concurrently (one IPC round-trip in flight per file,
    // all in parallel) rather than one-at-a-time — with several tabs open,
    // a sequential await-per-file loop was adding a full extra round-trip
    // of latency per tab before the editor became typable. §94:
    // `read_note_with_metadata` so each tab starts with a clean-hash
    // baseline for external-modification detection.
    const [otherReads, todayRead] = await Promise.all([
      Promise.all(otherFilenames.map((filename) => api.readNoteWithMetadata(filename))),
      api.readNoteWithMetadata(todayFilename),
    ]);

    const restored: NoteTab[] = [];
    const cleanHashes: Array<[string, string | null]> = [];
    otherFilenames.forEach((filename, i) => {
      const { content, metadata } = otherReads[i];
      if (content === null) return; // file no longer exists — silently skip
      const id = `tab-${Date.now()}-${filename}`;
      restored.push({ id, filename, isScratchpad: false, content });
      cleanHashes.push([id, loadBaseline(metadata)]);
    });

    const todayId = `tab-${Date.now()}-${todayFilename}`;
    const todayTab: NoteTab = {
      id: todayId,
      filename: todayFilename,
      isScratchpad: false,
      content: todayRead.content ?? "",
    };
    restored.push(todayTab);
    cleanHashes.push([todayId, loadBaseline(todayRead.metadata)]);

    // Restore preserved scratchpad drafts (e.g. mobile process termination survival)
    try {
      const drafts = await api.loadScratchpadDrafts();
      if (drafts && typeof drafts === "object") {
        for (const [name, draftContent] of Object.entries(drafts)) {
          if (typeof draftContent === "string" && draftContent.trim().length > 0) {
            const scratchId = `tab-${Date.now()}-${name}`;
            restored.push({
              id: scratchId,
              filename: name,
              isScratchpad: true,
              content: draftContent,
            });
          }
        }
      }
    } catch {
      // Backend may not support scratchpad draft persistence (e.g. demo mock)
    }

    tabs.set(restored);
    for (const [id, hash] of cleanHashes) markTabClean(id, hash);
    // #23: on the first launch of a new day (and the very first launch
    // after install, where `session` is null), open with today's note
    // active regardless of which tab was last active — the point of a
    // daily-notes app is to land you on today when the day turns over.
    // Later launches the same day restore the last-active tab as before.
    const isFirstOpenToday = (session?.lastOpenedDate ?? null) !== todayISO();
    let finalActive: NoteTab = todayTab;
    let dropTodayTab = false;

    if (!isFirstOpenToday && session?.activeTab) {
      finalActive = restored.find((t) => t.filename === session.activeTab) ?? todayTab;
    } else if (isFirstOpenToday && session?.activeTab && get(startupTabMode) === "smart_last_active") {
      // Smart decision logic (§spec 5.3):
      // 1. Check Today's Note: If today's note has non-whitespace content, open Today.
      // 2. Check Today's Agenda: If Calendar Sync is enabled and today has agenda meetings, open Today.
      // 3. Otherwise (Today is clean & clear): restore session.activeTab.
      const todayHasContent = (todayRead.content ?? "").trim().length > 0;
      let todayHasMeetings = false;
      if (get(calendarSyncEnabled) && get(agendaFileExists)) {
        try {
          const meetings = await api.readAgendaForDate(todayISO());
          todayHasMeetings = meetings.filter((m) => m.trim().length > 0).length > 0;
        } catch {
          todayHasMeetings = false;
        }
      }

      if (!todayHasContent && !todayHasMeetings) {
        const lastActiveMatch = restored.find((t) => t.filename === session.activeTab);
        if (lastActiveMatch) {
          finalActive = lastActiveMatch;
          // #125: today's tab is only opened here when it gets the focus (or was already open last time). Today is
          // empty, so there is nothing to lose by not opening it; it is created when it is opened on purpose.
          dropTodayTab = !(session.openTabs ?? []).includes(todayFilename);
        }
      }
    }

    activeTabId.set(finalActive.id);
    if (dropTodayTab) tabs.update((list) => list.filter((x) => x.id !== todayTab.id));
    void maybeSilentSyncEmptyNote(finalActive);
  } finally {
    restoringTabs = false;
  }
  scheduleTabSessionSave();
}

let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastPersistedSessionKey = "";

function scheduleTabSessionSave() {
  if (restoringTabs) return;
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(persistTabSession, 150);
}

function persistTabSession() {
  sessionSaveTimer = null;
  const list = get(tabs);
  const activeId = get(activeTabId);
  const openTabs = list
    .filter((t) => !t.isScratchpad)
    .map((t) => t.filename)
    .sort();
  const activeTab = list.find((t) => t.id === activeId);
  const activeFilename = activeTab && !activeTab.isScratchpad ? activeTab.filename : null;

  // #23: stamp the session with today's date so the next boot can tell
  // whether it's the first launch of a new day. Part of the dedup key so
  // the day rolling over always forces a fresh write, even if the open
  // tabs and active tab are unchanged from yesterday.
  const today = todayISO();
  const key = JSON.stringify({ openTabs, activeFilename, today });
  if (key === lastPersistedSessionKey) return;
  lastPersistedSessionKey = key;
  api.writeTabSession(openTabs, activeFilename, today).catch(() => {
    // Best-effort bookkeeping, not user note content — fail silently.
  });
}

export async function initApp() {
  wireStatusBarSync();
  wireWindowTitleSync();
  wireCloseBarrier();
  wireDriftDetection();
  setWriteConflictHandler(handleWriteConflict);
  wireDateRollover();
  initCalendarSyncDiffTracking();
  const cfg = await api.getConfig();
  notesDir.set(cfg.notesDir);
  recentNotesDirs.set(cfg.recentNotesDirs);
  colorMode.set(cfg.colorMode);
  applyColorModeToDom(cfg.colorMode);
  themeMode.set(cfg.themeMode);
  applyThemeModeToDom(cfg.themeMode);
  languageMode.set(cfg.languageMode);
  applyLocaleToDom(get(locale));
  // §110: "limit line width" implies word-wrap. Reconcile a stale config
  // (from the version where the two were gated the other way round).
  readableLineLength.set(cfg.readableLineLength);
  wordWrap.set(cfg.wordWrap || cfg.readableLineLength);
  autoCheckUpdates.set(cfg.autoCheckUpdates);
  calendarSyncEnabled.set(cfg.calendarSyncEnabled);
  fontSize.set(cfg.fontSize ?? 13);
  lineHeight.set(cfg.lineHeight ?? 1.6);
  pureBlack.set(cfg.pureBlack ?? false);
  applyPureBlackToDom(cfg.pureBlack ?? false);
  startupTabMode.set(cfg.startupTabMode ?? "today");
  applyPeekConfig(cfg.peek);
  occurrenceHint.set(cfg.occurrenceHint ?? false);
  if (cfg.calendarSyncEnabled && (get(backendKind) !== "web" || !!get(oneDriveAccount))) {
    await refreshAgendaFileExists();
  }
  // First-time installation onboarding (§onboarding, §255):
  // Strictly once per installation globally (tracked in config.json).
  // Distinguish genuine first install from existing user upgrades:
  // If the user upgraded from an earlier version (lastSeenVersion is set),
  // or a tab session already exists, or existing notes are present on disk,
  // skip seeding and mark completed silently. On the web app the welcome is a
  // scratchpad rather than a dated file (see below).
  let welcomeScratchpadName: string | null = null;
  if (cfg.onboardingCompleted === false) {
    try {
      const isUpgrade = Boolean(cfg.lastSeenVersion);
      const isWeb = get(backendKind) === "web";

      if (isUpgrade) {
        await api.setOnboardingCompleted(true);
      } else {
        const existingFiles = (await api.listNoteFiles()) ?? [];
        if (existingFiles.length > 0) {
          await api.setOnboardingCompleted(true);
        } else {
          const session = await api.readTabSession();
          if (session && session.openTabs && session.openTabs.length > 0) {
            await api.setOnboardingCompleted(true);
          } else {
            const template = getOnboardingTemplate(get(locale));
            if (isWeb) {
              // The web app's browser storage is empty on every new browser/
              // device, and a OneDrive sync after boot would collide with a
              // welcome note written as today's file. A scratchpad has no file,
              // so it can't. It is seeded as a draft; restoreOrBootstrapTabs
              // then restores it as an ordinary scratchpad tab.
              welcomeScratchpadName = get(t)("onboarding.scratchpadName", undefined);
              await api.saveScratchpadDrafts({ [welcomeScratchpadName]: template });
            } else {
              await api.writeNote(todayISO() + ".txt", template);
            }
            await api.setOnboardingCompleted(true);
            if (get(isMobile)) {
              showToast(get(t)("toast.onboarding.mobileHint", undefined));
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to seed onboarding note:", err);
    }
  }
  await restoreOrBootstrapTabs();
  if (welcomeScratchpadName) {
    const welcome = get(tabs).find((t) => t.isScratchpad && t.filename === welcomeScratchpadName);
    if (welcome) activeTabId.set(welcome.id);
  }
  // #62: warm the "all notes" disk-read cache in the background, right
  // after the app has something to show — never awaited, so it can't
  // delay becoming interactive. Section History/Actions Drawer's "All
  // Files"/Cross-Tab Search's "All Files" all share this one cache
  // (`persistence.ts`'s `diskNotesCacheRaw`) and used to each pay its
  // full one-time disk-read cost themselves, whichever happened to be
  // opened first — usually finished by the time any of them are actually
  // opened now; each still has its own loading indicator for whenever
  // it isn't (a very large notes folder, or a very fast keypress).
  // Deferred a moment past app-ready (not just un-awaited): the read itself is
  // off the UI thread, but on a big OneDrive folder it still competes with the
  // editor's first paint for disk and CPU.
  setTimeout(() => void refreshAllNotesCache(), 1500);
  tabs.subscribe(() => scheduleTabSessionSave());
  activeTabId.subscribe(() => scheduleTabSessionSave());
  const version = await api.getAppVersion();
  appVersion.set(version);
  // #50: a first launch after an in-place update shows a one-time
  // "Updated to vX.Y.Z" status-bar link (see StatusBar.svelte); a fresh
  // install or a config from before this field existed has no prior
  // version to say we updated *from*, so `lastSeenVersion` being unset
  // just means "record the current version, nothing to announce."
  if (cfg.lastSeenVersion && cfg.lastSeenVersion !== version) {
    justUpdatedToVersion.set(version);
  }
  if (cfg.lastSeenVersion !== version) {
    api.setLastSeenVersion(version).catch(() => {
      // Best-effort bookkeeping — worst case the notice repeats next launch.
    });
  }
  // §update-check: a silent background check, never blocking app-ready.
  // Quiet by design — "no update" and a failed check both leave no trace
  // beyond the About drawer; only "an update is available" shows anything
  // (a status-bar message), and only the user's own click ever downloads.
  // Meaningless in the web app (see AboutModal.svelte's same gate).
  if (cfg.autoCheckUpdates && get(backendKind) !== "web") {
    void checkForUpdatesOnLaunch();
  }
  void initOneDriveSync();
}

let oneDriveSyncWired = false;
let lastAutoSyncTime = 0;

export async function initOneDriveSync() {
  if (get(backendKind) !== "web") return;
  if (oneDriveSyncWired) return;
  oneDriveSyncWired = true;

  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const returnedState = urlParams.get("state") ?? undefined;
    const error = urlParams.get("error");
    const errorDescription = urlParams.get("error_description");

    if (code) {
      const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, document.title, cleanUrl);

      oneDriveConnecting.set(true);
      void api
        .oneDriveExchangeCode(code, returnedState)
        .then(async (result) => {
          oneDriveConnecting.set(false);
          if (result.success && result.account) {
            oneDriveAccount.set(result.account);
        oneDriveSignInExpired.set(false);
            const folder = await api.oneDriveGetFolder();
            if (folder) {
              oneDriveFolder.set(folder);
              void syncOneDriveNow();
            } else {
              // Signed in but no folder yet: ask for it right away rather than
              // leaving a "Choose a folder" label for the user to find.
              oneDriveFolderPickerOpen.set(true);
            }
            showToast(
              folder ? get(t)("toast.boot.oneDrive.connected", undefined) : get(t)("toast.boot.oneDrive.connectedChooseFolder", undefined),
            );
          } else if (result.error) {
            showToast(`${get(t)("toast.boot.oneDrive.signInFailedPrefix", undefined)} ${describeApiError(result.error)}`);
          }
        })
        .catch((err) => {
          oneDriveConnecting.set(false);
          showToast(`${get(t)("toast.boot.oneDrive.signInFailedPrefix", undefined)} ${describeApiError(err)}`);
        });
    } else if (error) {
      const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, document.title, cleanUrl);
      showToast(`${get(t)("toast.boot.oneDrive.signInErrorPrefix", undefined)} ${errorDescription || error}`);
    }
  }

  try {
    const account = await api.oneDriveGetAccount();
    if (account) {
      oneDriveAccount.set(account);
      const folder = await api.oneDriveGetFolder();
      if (folder) oneDriveFolder.set(folder);
      void syncOneDriveNow();
    }
  } catch {
    // Fail silently
  }

  // Periodic status polling (every 6 seconds). Also picks up sync conflicts
  // the engine has just held back, since the sync itself is fire-and-forget.
  setInterval(async () => {
    if (get(oneDriveAccount)) {
      try {
        const status = await api.oneDriveGetSyncStatus();
        oneDriveSyncStatus.set(status);
      } catch {}
      void refreshSyncConflicts();
      void refreshSyncHealth();
    }
  }, 6000);

  const triggerResumeSync = () => {
    if (!get(oneDriveAccount)) return;
    const now = Date.now();
    if (now - lastAutoSyncTime < 15000) return;
    lastAutoSyncTime = now;
    void syncOneDriveNow();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") triggerResumeSync();
    });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("focus", triggerResumeSync);
    window.addEventListener("online", triggerResumeSync);
  }
}

export async function refreshSyncHealth(): Promise<void> {
  if (get(backendKind) !== "web") return;
  try {
    const health = await api.getSyncHealth();
    syncHealth.set(health);
  } catch (err) {
    console.error("Failed to fetch sync health:", err);
  }
}

/** Tracks whether the OS window is maximized or fullscreen, so the top bar
 * can show icon+label when there's room and icon-only when there isn't. */
export async function initWindowChromeWatcher() {
  const win = getCurrentWindow();
  async function refresh() {
    try {
      const [fullscreen, maximized] = await Promise.all([win.isFullscreen(), win.isMaximized()]);
      chromeExpanded.set(fullscreen || maximized);
    } catch {
      // Window introspection unavailable — keep the icon-only default.
    }
  }
  await refresh();
  await win.onResized(() => {
    refresh();
  });
}

export async function setColorMode(mode: ColorMode) {
  colorMode.set(mode);
  applyColorModeToDom(mode);
  try {
    await api.setColorMode(mode);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.theme", undefined));
  }
}

/** #48 — light / dark / system. Distinct from `setColorMode` above (the
 * glyph palette); this is the chrome's own light-vs-dark rendering. */
export async function setThemeMode(mode: ThemeMode) {
  themeMode.set(mode);
  applyThemeModeToDom(mode);
  try {
    await api.setThemeMode(mode);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.lightDark", undefined));
  }
}

/** i18n roadmap — UI display language override, independent of theme. */
export async function setLanguageMode(mode: LanguageMode) {
  languageMode.set(mode);
  applyLocaleToDom(get(locale));
  try {
    await api.setLanguageMode(mode);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.language", undefined));
  }
}

export async function setWordWrap(enabled: boolean) {
  wordWrap.set(enabled);
  try {
    await api.setWordWrap(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.wordWrap", undefined));
  }
}

export async function setReadableLineLength(enabled: boolean) {
  readableLineLength.set(enabled);
  // §110: "limit line width" owns word-wrap while it's on — turning it on
  // force-enables wrap; the Settings wrap toggle is disabled meanwhile.
  if (enabled && !get(wordWrap)) await setWordWrap(true);
  try {
    await api.setReadableLineLength(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.readingWidth", undefined));
  }
}

export async function setAutoCheckUpdates(enabled: boolean) {
  autoCheckUpdates.set(enabled);
  try {
    await api.setAutoCheckUpdates(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.updateCheck", undefined));
  }
}

export async function setCalendarSyncEnabled(enabled: boolean) {
  calendarSyncEnabled.set(enabled);
  // Turning it on shouldn't show a stale/default "gray" state until the
  // next window-focus check happens to fire — check right away.
  if (enabled) void refreshAgendaFileExists();
  try {
    await api.setCalendarSyncEnabled(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.calendarSync", undefined));
  }
}

export async function setFontSize(size: number) {
  const clamped = Math.min(18, Math.max(12, size));
  fontSize.set(clamped);
  try {
    await api.setFontSize(clamped);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.fontSize", undefined));
  }
}

export async function setLineHeight(height: number) {
  const clamped = Math.min(1.8, Math.max(1.3, height));
  lineHeight.set(clamped);
  try {
    await api.setLineHeight(clamped);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.lineHeight", undefined));
  }
}

export async function setPureBlack(enabled: boolean) {
  pureBlack.set(enabled);
  applyPureBlackToDom(enabled);
  try {
    await api.setPureBlack(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.pureBlack", undefined));
  }
}

export async function setStartupTabMode(mode: StartupTabMode) {
  startupTabMode.set(mode);
  try {
    await api.setStartupTabMode(mode);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.startup", undefined));
  }
}

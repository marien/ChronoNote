/** App startup: load config, restore the tab session (§34), and wire the
 * standing subscriptions (status-bar action counts, window title, session
 * autosave). Also the two small config-backed toggles (`setColorMode` /
 * `setWordWrap`) and the maximize/fullscreen chrome watcher. Split out of
 * `controller.ts` in the v0.5.0 refactor. `directory.ts` reuses
 * `restoreOrBootstrapTabs` for the workspace re-load on a folder switch. */
import { get } from "svelte/store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import * as api from "./tauriApi";
import { countActions, countWords } from "./tokens";
import { todayISO } from "./date";
import type { OneDriveLoginResult } from "./tauriCommands";
import {
  activeTabId,
  appVersion,
  autoCheckUpdates,
  backendKind,
  calendarSyncEnabled,
  chromeExpanded,
  colorMode,
  currentDateISO,
  justUpdatedToVersion,
  markTabClean,
  modal,
  notesDir,
  oneDriveAccount,
  oneDriveConnecting,
  oneDriveFolder,
  oneDriveSyncStatus,
  readableLineLength,
  recentNotesDirs,
  scratchpadGateContext,
  showToast,
  statusCounts,
  statusPos,
  statusSelection,
  statusWordCount,
  tabs,
  themeMode,
  unsavedScratchpadNames,
  wordWrap,
} from "./stores";
import { flushAllPendingSaves, recomputeSaveState, refreshAllNotesCache } from "./persistence";
import { checkActiveTabForDrift } from "./drift";
import { refreshAgendaFileExists } from "./calendarSyncActions";
import { refreshSyncConflicts, syncOneDriveNow } from "./oneDriveSync";
import { checkForUpdatesOnLaunch } from "./updates";
import type { ColorMode, NoteTab, ThemeMode } from "./types";

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
      if (get(calendarSyncEnabled) && get(backendKind) !== "web") void refreshAgendaFileExists();
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
      cleanHashes.push([id, metadata.contentHash]);
    });

    const todayId = `tab-${Date.now()}-${todayFilename}`;
    const todayTab: NoteTab = {
      id: todayId,
      filename: todayFilename,
      isScratchpad: false,
      content: todayRead.content ?? "",
    };
    restored.push(todayTab);
    cleanHashes.push([todayId, todayRead.metadata.contentHash]);

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
    const activeMatch =
      !isFirstOpenToday && session?.activeTab
        ? restored.find((t) => t.filename === session.activeTab)
        : undefined;
    activeTabId.set((activeMatch ?? todayTab).id);
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
  wireDateRollover();
  const cfg = await api.getConfig();
  notesDir.set(cfg.notesDir);
  recentNotesDirs.set(cfg.recentNotesDirs);
  colorMode.set(cfg.colorMode);
  applyColorModeToDom(cfg.colorMode);
  themeMode.set(cfg.themeMode);
  applyThemeModeToDom(cfg.themeMode);
  // §110: "limit line width" implies word-wrap. Reconcile a stale config
  // (from the version where the two were gated the other way round).
  readableLineLength.set(cfg.readableLineLength);
  wordWrap.set(cfg.wordWrap || cfg.readableLineLength);
  autoCheckUpdates.set(cfg.autoCheckUpdates);
  calendarSyncEnabled.set(cfg.calendarSyncEnabled);
  if (cfg.calendarSyncEnabled && get(backendKind) !== "web") void refreshAgendaFileExists();
  await restoreOrBootstrapTabs();
  // #62: warm the "all notes" disk-read cache in the background, right
  // after the app has something to show — never awaited, so it can't
  // delay becoming interactive. Section History/Actions Drawer's "All
  // Files"/Cross-Tab Search's "All Files" all share this one cache
  // (`persistence.ts`'s `diskNotesCacheRaw`) and used to each pay its
  // full one-time disk-read cost themselves, whichever happened to be
  // opened first — usually finished by the time any of them are actually
  // opened now; each still has its own loading indicator for whenever
  // it isn't (a very large notes folder, or a very fast keypress).
  void refreshAllNotesCache();
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
  // The desktop updater plugin doesn't exist on Android (updates arrive
  // through however the app was installed), and is meaningless on the web.
  if (cfg.autoCheckUpdates && get(backendKind) !== "web" && get(backendKind) !== "android") {
    void checkForUpdatesOnLaunch();
  }
  void initOneDriveSync();
}

let oneDriveSyncWired = false;
let lastAutoSyncTime = 0;

export async function initOneDriveSync() {
  if (get(backendKind) !== "android" && get(backendKind) !== "web") return;
  if (oneDriveSyncWired) return;
  oneDriveSyncWired = true;

  if (get(backendKind) === "android") {
    // Completes the deep-link OAuth flow: "Connect Microsoft Account"
    // returns immediately with `pending: true` once it's opened the
    // browser (see SettingsModal.svelte's `handleOneDriveLogin`), and the
    // real outcome arrives here whenever Android delivers the
    // `chrononote://auth` redirect back to the app — Rust's
    // `wire_onedrive_deep_link` (lib.rs) does the token exchange and
    // emits this event. Wired globally, not just while Settings happens
    // to be open, since the user may well have switched back to the
    // editor by the time it resolves.
    void listen<OneDriveLoginResult>("onedrive-login-result", (event) => {
      oneDriveConnecting.set(false);
      const result = event.payload;
      if (result.success && result.account) {
        oneDriveAccount.set(result.account);
        // Signing in doesn't pick a folder — say what's still needed rather
        // than leaving the user to discover it when "Sync now" fails.
        showToast(get(oneDriveFolder) ? "Connected to OneDrive" : "Connected to OneDrive — now choose a folder to sync");
      } else if (result.error) {
        showToast(`OneDrive sign-in failed: ${result.error}`);
      }
    });
  } else if (get(backendKind) === "web" && typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const error = urlParams.get("error");
    const errorDescription = urlParams.get("error_description");

    if (code) {
      const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, document.title, cleanUrl);

      oneDriveConnecting.set(true);
      void api
        .oneDriveExchangeCode(code)
        .then(async (result) => {
          oneDriveConnecting.set(false);
          if (result.success && result.account) {
            oneDriveAccount.set(result.account);
            const folder = await api.oneDriveGetFolder();
            if (folder) {
              oneDriveFolder.set(folder);
              void syncOneDriveNow();
            }
            showToast(folder ? "Connected to OneDrive" : "Connected to OneDrive — now choose a folder to sync");
          } else if (result.error) {
            showToast(`OneDrive sign-in failed: ${result.error}`);
          }
        })
        .catch((err) => {
          oneDriveConnecting.set(false);
          showToast(`OneDrive sign-in failed: ${err instanceof Error ? err.message : String(err)}`);
        });
    } else if (error) {
      const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, document.title, cleanUrl);
      showToast(`OneDrive sign-in error: ${errorDescription || error}`);
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
    showToast("Failed to save theme preference");
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
    showToast("Failed to save light/dark preference");
  }
}

export async function setWordWrap(enabled: boolean) {
  wordWrap.set(enabled);
  try {
    await api.setWordWrap(enabled);
  } catch {
    showToast("Failed to save word-wrap preference");
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
    showToast("Failed to save reading-width preference");
  }
}

export async function setAutoCheckUpdates(enabled: boolean) {
  autoCheckUpdates.set(enabled);
  try {
    await api.setAutoCheckUpdates(enabled);
  } catch {
    showToast("Failed to save update-check preference");
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
    showToast("Failed to save calendar-sync preference");
  }
}

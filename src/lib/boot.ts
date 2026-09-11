/** App startup: load config, restore the tab session (§34), and wire the
 * standing subscriptions (status-bar action counts, window title, session
 * autosave). Also the two small config-backed toggles (`setColorMode` /
 * `setWordWrap`) and the maximize/fullscreen chrome watcher. Split out of
 * `controller.ts` in the v0.5.0 refactor. `directory.ts` reuses
 * `restoreOrBootstrapTabs` for the workspace re-load on a folder switch. */
import { get } from "svelte/store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "./tauriApi";
import { countActions, countWords } from "./tokens";
import { todayISO } from "./date";
import {
  activeTabId,
  appVersion,
  autoCheckUpdates,
  chromeExpanded,
  colorMode,
  markTabClean,
  modal,
  notesDir,
  readableLineLength,
  recentNotesDirs,
  scratchpadGateContext,
  showToast,
  statusCounts,
  statusPos,
  statusSelection,
  statusWordCount,
  tabs,
  unsavedScratchpadNames,
  wordWrap,
} from "./stores";
import { flushAllPendingSaves, recomputeSaveState } from "./persistence";
import { checkActiveTabForDrift } from "./drift";
import { checkForUpdatesOnLaunch } from "./updates";
import type { ColorMode, NoteTab } from "./types";

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

/** Shows which notes folder (project/scope, see §6.3) is currently active
 * right in the window title, without needing to open Settings — just the
 * folder's own name, not the full path. Fires on every `notesDir` change
 * regardless of which code path caused it (initial boot, or a directory
 * switch), rather than needing a call at each call site. */
function folderNameFromPath(path: string): string {
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
  getCurrentWindow()
    .onFocusChanged(({ payload: focused }) => {
      if (focused) void checkActiveTabForDrift();
    })
    .catch(() => {
      // No window handle — focus trigger just isn't active here.
    });
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
  const cfg = await api.getConfig();
  notesDir.set(cfg.notesDir);
  recentNotesDirs.set(cfg.recentNotesDirs);
  colorMode.set(cfg.colorMode);
  applyColorModeToDom(cfg.colorMode);
  // §110: "limit line width" implies word-wrap. Reconcile a stale config
  // (from the version where the two were gated the other way round).
  readableLineLength.set(cfg.readableLineLength);
  wordWrap.set(cfg.wordWrap || cfg.readableLineLength);
  autoCheckUpdates.set(cfg.autoCheckUpdates);
  await restoreOrBootstrapTabs();
  tabs.subscribe(() => scheduleTabSessionSave());
  activeTabId.subscribe(() => scheduleTabSessionSave());
  api.getAppVersion().then((v) => appVersion.set(v));
  // §update-check: a silent background check, never blocking app-ready.
  // Quiet by design — "no update" and a failed check both leave no trace
  // beyond the About drawer; only "an update is available" shows anything
  // (a status-bar message), and only the user's own click ever downloads.
  if (cfg.autoCheckUpdates) void checkForUpdatesOnLaunch();
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

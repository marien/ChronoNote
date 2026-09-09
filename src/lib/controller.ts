import { get } from "svelte/store";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "./tauriApi";
import {
  countActions,
  cycleActionSymbol,
  getSectionHeaderForLine,
  isSetextUnderline,
  normalizeHeaderTitle,
  titleForMatching,
} from "./tokens";
import { todayISO } from "./date";
import { linesToSections } from "./sectionImport";
import type { ActionSnapshotItem, ColorMode, HistoryItem, NoteTab } from "./types";

// App state lives in `./stores`; disk writes + the notes read-cache live
// in `./persistence`; tab lifecycle in `./tabs`; copy/paste defer in
// `./paste`; cross-tab search in `./search`; ordering helpers in
// `./tabSort`. This module re-exports all of them so components can keep
// importing from `./controller`, and holds the behaviour on top.
export * from "./stores";
export * from "./persistence";
export * from "./paste";
export * from "./tabSort";
export * from "./tabs";
export * from "./search";
import {
  actionSnapshot,
  activeTabId,
  allNotesCache,
  appVersion,
  chromeExpanded,
  clearAllEditorViewState,
  colorMode,
  editorApi,
  historyItems,
  historyTargetHeader,
  modal,
  notesDir,
  pendingNotesDirSwitch,
  recentNotesDirs,
  searchResultsStore,
  showToast,
  statusCounts,
  statusPos,
  tabs,
  unsavedScratchpadNames,
  wordWrap,
} from "./stores";
import {
  flushSave,
  invalidateDiskNotesCache,
  refreshAllNotesCache,
  writeNoteAndInvalidateCache,
  writeTabContent,
} from "./persistence";
import { compareTabsByRecency, sortFilenamesByRecency } from "./tabSort";
import { jumpToFileLine, openOrCreateDatedFile } from "./tabs";

// (`updateActiveTabContent` and `scheduleSave` also come from
// `./persistence` via the `export *` above — used by `EditorPane`, not
// this module.)

// Keep the status bar's action counts in sync with whichever tab is active,
// including edits made through the drawers/modals rather than typing.
let latestTabs: NoteTab[] = [];
tabs.subscribe((v) => {
  latestTabs = v;
  syncActiveStatus();
});
activeTabId.subscribe(() => {
  syncActiveStatus();
  statusPos.set({ line: 1, col: 1 });
});
function syncActiveStatus() {
  const t = latestTabs.find((x) => x.id === get(activeTabId));
  if (t) statusCounts.set(countActions(t.content));
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
notesDir.subscribe((dir) => {
  if (!dir) return;
  getCurrentWindow()
    .setTitle(`ChronoNote - ${folderNameFromPath(dir)}`)
    .catch(() => {});
});

// --- Boot ---

function applyColorModeToDom(mode: ColorMode) {
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
async function restoreOrBootstrapTabs() {
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
    // of latency per tab before the editor became typable.
    const [otherContents, todayContent] = await Promise.all([
      Promise.all(otherFilenames.map((filename) => api.readNote(filename))),
      api.readNote(todayFilename),
    ]);

    const restored: NoteTab[] = [];
    otherFilenames.forEach((filename, i) => {
      const content = otherContents[i];
      if (content === null) return; // file no longer exists — silently skip
      restored.push({ id: `tab-${Date.now()}-${filename}`, filename, isScratchpad: false, content });
    });

    const todayTab: NoteTab = {
      id: `tab-${Date.now()}-${todayFilename}`,
      filename: todayFilename,
      isScratchpad: false,
      content: todayContent ?? "",
    };
    restored.push(todayTab);

    tabs.set(restored);
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
  const cfg = await api.getConfig();
  notesDir.set(cfg.notesDir);
  recentNotesDirs.set(cfg.recentNotesDirs);
  colorMode.set(cfg.colorMode);
  applyColorModeToDom(cfg.colorMode);
  wordWrap.set(cfg.wordWrap);
  await restoreOrBootstrapTabs();
  tabs.subscribe(() => scheduleTabSessionSave());
  activeTabId.subscribe(() => scheduleTabSessionSave());
  api.getAppVersion().then((v) => appVersion.set(v));
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

// Tab lifecycle (switch/cycle/create/open/close/reopen/safety/promote),
// the date picker, and `jumpToFileLine` live in `./tabs` now — re-exported
// via `export * from "./tabs"` above. `closeAllModals` moved to `./stores`.

// --- Action drawer (toggle between open tabs and all files) ---

/** "Action lines" the drawer surfaces: all four action states (`# `/
 * `v `/`> `/`x `, standalone or indented, §50) and both `=> ` forms — a
 * consequence-action's own inner symbol (`=> <symbol>`, §41) and plain
 * delegated-to-a-person lines (`=> @name`). "Only Open" (§44/§67) is what
 * narrows this down to `#` alone; inclusion here covers every state so
 * turning that toggle off reveals `v `/`x ` lines too (previously
 * excluded from the drawer outright, regardless of the toggle). */
function isActionLine(line: string): boolean {
  return /^\s*[#>vx]\s/.test(line) || line.includes("=> @") || /=>\s[#>vx]\s/.test(line);
}

export function buildActionSnapshotOpenTabs(): ActionSnapshotItem[] {
  const snapshot: ActionSnapshotItem[] = [];
  for (const tab of [...get(tabs)].sort(compareTabsByRecency)) {
    const lines = tab.content.split("\n");
    lines.forEach((line, lineIdx) => {
      if (isActionLine(line)) {
        snapshot.push({
          id: `${tab.id}-${lineIdx}`,
          tabId: tab.id,
          filename: tab.filename,
          lineIdx,
          line,
          header: normalizeHeaderTitle(getSectionHeaderForLine(lines, lineIdx)),
        });
      }
    });
  }
  return snapshot;
}

export async function buildActionSnapshotAllFiles(): Promise<ActionSnapshotItem[]> {
  await refreshAllNotesCache();
  const allSources = get(allNotesCache);
  const openTabIdByFilename = new Map(get(tabs).filter((t) => !t.isScratchpad).map((t) => [t.filename, t.id]));
  const snapshot: ActionSnapshotItem[] = [];
  for (const filename of sortFilenamesByRecency(Object.keys(allSources))) {
    const lines = allSources[filename].split("\n");
    lines.forEach((line, lineIdx) => {
      if (isActionLine(line)) {
        snapshot.push({
          id: `${filename}-${lineIdx}`,
          tabId: openTabIdByFilename.get(filename),
          filename,
          lineIdx,
          line,
          header: normalizeHeaderTitle(getSectionHeaderForLine(lines, lineIdx)),
        });
      }
    });
  }
  return snapshot;
}

export function openActionDrawer() {
  actionSnapshot.set(buildActionSnapshotOpenTabs());
  modal.set("actions");
}

/** Opens the file if it isn't already a tab (reusing the same open-or-
 * switch path the date picker uses), and returns the resulting tab id. */
async function ensureFileOpenAndGetTabId(filename: string): Promise<string> {
  const existing = get(tabs).find((t) => t.filename === filename);
  if (existing) return existing.id;
  await openOrCreateDatedFile(filename.replace(/\.txt$/, ""));
  const opened = get(tabs).find((t) => t.filename === filename);
  return opened!.id;
}

/** Ctrl+Space inside the action drawer. Deliberately does NOT rebuild
 * `actionSnapshot` afterward: the drawer's item list is captured once when
 * it opens, so a completed item keeps its row (shown with the "done"
 * style) for as long as the drawer stays open, and only drops out on the
 * next fresh `openActionDrawer()` call. */
export function toggleActionLine(tabId: string, lineIdx: number) {
  const list = get(tabs);
  const tab = list.find((t) => t.id === tabId);
  if (!tab) return;
  const lines = tab.content.split("\n");
  const updated = cycleActionSymbol(lines[lineIdx]);
  if (updated === null) return;
  lines[lineIdx] = updated;
  tabs.set(writeTabContent(tabId, lines.join("\n"), list));
}

export function forwardActionToToday(tabId: string, lineIdx: number) {
  const list = get(tabs);
  const src = list.find((t) => t.id === tabId);
  if (!src) return;
  const lines = src.content.split("\n");
  const target = lines[lineIdx];
  // Indented (§50), same as everywhere else an action symbol is
  // recognized. Deliberately not extended to the `=> <symbol>` form
  // (§41) — forwarding a delegated consequence-action raises questions
  // (keep or drop the "=> " context?) outside this request's scope.
  const match = target.match(/^(\s*)([#>])(\s.*)$/);
  if (!match) return;
  const [, indent, , rest] = match;

  lines[lineIdx] = indent + ">" + rest;
  // The forwarded copy starts fresh at today's top level — the source's
  // indentation was relative to structure (a bullet, a section) that has
  // no meaning in today's note.
  const taskText = "#" + rest;
  const todayFilename = todayISO() + ".txt";

  let next = writeTabContent(tabId, lines.join("\n"), list);
  const todayTab = next.find((t) => t.filename === todayFilename);
  if (todayTab) {
    next = writeTabContent(todayTab.id, `${taskText}\n${todayTab.content}`, next);
  } else {
    api.readNote(todayFilename).then((existing) => {
      const base = existing ?? "";
      writeNoteAndInvalidateCache(todayFilename, `${taskText}\n${base}`).catch(() => {});
    });
  }
  tabs.set(next);
  showToast("Forwarded to today's top priorities!");
}

/** Toggle/forward for an Action Drawer item that may come from "All Files"
 * mode and not have an open tab yet — opens it first if needed. */
export async function toggleActionLineItem(item: { tabId?: string; filename: string; lineIdx: number }) {
  const tabId = item.tabId ?? (await ensureFileOpenAndGetTabId(item.filename));
  toggleActionLine(tabId, item.lineIdx);
}

export async function forwardActionToTodayItem(item: { tabId?: string; filename: string; lineIdx: number }) {
  const tabId = item.tabId ?? (await ensureFileOpenAndGetTabId(item.filename));
  forwardActionToToday(tabId, item.lineIdx);
}

// --- Section history (Ctrl+Shift+H) ---

export async function openMeetingHistory() {
  const tab = get(tabs).find((t) => t.id === get(activeTabId));
  if (!tab) return;
  const lines = tab.content.split("\n");
  const cursorLineIdx = editorApi ? editorApi.getCursorLineIdx() : 0;
  const rawHeader = getSectionHeaderForLine(lines, cursorLineIdx);
  // Matching (not display) ignores a date embedded in the title, so
  // "Weekly Sync - 2026-08-08" and "...- 2026-08-09" are recognized as
  // the same recurring section (§37) — the drawer's own heading shows
  // this canonical form too, since it now aggregates entries from many
  // different dates under one topic.
  const targetHeader = titleForMatching(normalizeHeaderTitle(rawHeader));
  if (!targetHeader) {
    showToast("Cursor is not on or inside a named section.");
    return;
  }

  await refreshAllNotesCache();
  const allSources = get(allNotesCache);
  const sortedFiles = Object.keys(allSources).sort().reverse();
  const items: HistoryItem[] = [];
  const seen = new Set<string>();

  for (const filename of sortedFiles) {
    const flines = allSources[filename].split("\n");
    let inSection = false;
    flines.forEach((line, idx) => {
      if (idx + 1 < flines.length && isSetextUnderline(flines[idx + 1])) {
        const h = titleForMatching(normalizeHeaderTitle(flines[idx].trim()));
        inSection = h.toLowerCase() === targetHeader.toLowerCase();
        return;
      }
      if (!inSection) return;
      // §40/§50: `x` and indentation join the other three action symbols.
      // §41/§59: `=> ` isn't anchored to the start of the line either —
      // it can follow other text ("Talked to Sam => # follow up") — so
      // this checks for it anywhere, not just as the line's first two
      // characters, the same fix `cycleActionSymbol`/`stripLeadingToken`
      // needed for the same reason.
      const isActionOrFollow = /^\s*[#vx>]\s/.test(line) || line.includes("=> ");
      if (isActionOrFollow) {
        // Strip a plain leading symbol (still anchored — those are always
        // at the true start of the line) and, separately, a `=> ` and its
        // optional assignee/inner symbol wherever *that* falls, so two
        // occurrences of the same action reworded with different leading
        // context still dedupe as one.
        const normalizedBody = line
          .replace(/^\s*[#vx>]\s+/, "")
          .replace(/=>\s+(@\w+\s+|[#vx>]\s+)?/, "")
          .trim()
          .toLowerCase();
        if (!seen.has(normalizedBody)) {
          seen.add(normalizedBody);
          items.push({ filename, lineIdx: idx, line, date: filename.replace(/\.txt$/, "") });
        }
      }
    });
  }

  historyTargetHeader.set(targetHeader);
  historyItems.set(items);
  modal.set("history");
}

export async function jumpToHistoryItem(item: HistoryItem) {
  await jumpToFileLine({ filename: item.filename, lineIdx: item.lineIdx });
}

export function importHistoricalItem(rawLine: string) {
  let toInsert = rawLine;
  if (toInsert.startsWith("> ")) toInsert = "# " + toInsert.slice(2);
  editorApi?.insertAtCursor(toInsert + "\n");
  showToast(`Imported "${toInsert.slice(0, 30)}..." into note`);
}

// Cross-tab search (Ctrl+Shift+F) lives in `./search` now — re-exported
// via `export * from "./search"` above.

// --- Section import (Ctrl+Shift+I): paste lines, each becomes a section ---

/** In-memory only (spec 1.1's "Zero Database" tenet) — text the drawer was
 * closed with before it was actually imported, so reopening the drawer can
 * offer it back up (§33). Never written to disk, and deliberately cleared
 * on a notes-directory switch by `performDirectorySwitch`, since a folder
 * switch is meant to feel like a clean slate. */
let importDraftText = "";

export function openSectionImport() {
  modal.set("sectionImport");
}

export function getImportDraftText(): string {
  return importDraftText;
}

/** Called when the drawer is dismissed without importing (Cancel, Escape,
 * or an outside click) — keeps unsubmitted text around for next time, or
 * clears a stale draft if the field was left empty. */
export function saveImportDraft(text: string) {
  importDraftText = text.trim() ? text : "";
}

export function clearImportDraft() {
  importDraftText = "";
}

export function importSectionsIntoActiveTab(rawText: string) {
  const tab = get(tabs).find((t) => t.id === get(activeTabId));
  if (!tab) return;
  const merged = linesToSections(tab.content, rawText);
  if (merged === tab.content) {
    showToast("Nothing to import.");
    return;
  }
  tabs.set(writeTabContent(tab.id, merged, get(tabs)));
  showToast("Sections imported.");
}

// --- Settings (Ctrl+,) ---

export function openSettings() {
  modal.set("settings");
}

export function openShortcutsHelp() {
  modal.set("shortcuts");
}

export function openGlyphLegend() {
  modal.set("glyphLegend");
}

export const PROJECT_URL = "https://github.com/marien/ChronoNote";

export function openAbout() {
  modal.set("about");
}

/** Opens a link in the OS's default browser rather than inside the app's
 * own webview — used by the About drawer's project link. Errors are
 * swallowed rather than surfaced: worst case a click does nothing, which
 * isn't worth a toast/modal of its own. */
export function openProjectLink() {
  api.openExternalUrl(PROJECT_URL).catch(() => {});
}

/** Directory switching is treated as project/scope switching: everything
 * currently loaded (open tabs, search/action/history caches) is scoped to
 * the old directory and becomes stale the moment `notesDir` changes, so a
 * confirmed switch does a full workspace reset rather than just repointing
 * config. The one thing that gate has to protect is unpromoted scratchpad
 * content — it's the only state that would actually be destroyed, since
 * everything else is already safely persisted to the old folder. */
/** Shared by the Browse dialog and by picking a recent folder directly
 * (§39) — both need the same unsaved-scratchpad safety gate before a
 * full workspace reset. */
async function switchNotesDirectoryWithSafetyCheck(path: string) {
  const unresolved = get(tabs).filter((t) => t.isScratchpad && t.content.trim() !== "");
  if (unresolved.length > 0) {
    pendingNotesDirSwitch.set(path);
    unsavedScratchpadNames.set(unresolved.map((t) => t.filename));
    modal.set("unsavedScratchpads");
    return;
  }
  await performDirectorySwitch(path);
}

export async function pickAndSwitchNotesDirectory() {
  const current = get(notesDir);
  const picked = await openFolderDialog({ directory: true, defaultPath: current || undefined });
  if (!picked || Array.isArray(picked)) return;
  await switchNotesDirectoryWithSafetyCheck(picked);
}

/** Settings' recent-folders list (§39) — same safety flow as Browse, just
 * skipping the native dialog since the path is already known. */
export async function switchToRecentDirectory(path: string) {
  await switchNotesDirectoryWithSafetyCheck(path);
}

export function cancelDirectorySwitch() {
  pendingNotesDirSwitch.set(null);
  unsavedScratchpadNames.set([]);
  modal.set("settings");
}

export async function confirmDiscardAndSwitch() {
  const path = get(pendingNotesDirSwitch);
  pendingNotesDirSwitch.set(null);
  unsavedScratchpadNames.set([]);
  if (path) await performDirectorySwitch(path);
}

async function performDirectorySwitch(path: string) {
  for (const t of get(tabs)) {
    if (!t.isScratchpad) flushSave(t.id);
  }
  const cfg = await api.setNotesDir(path);
  notesDir.set(cfg.notesDir);
  recentNotesDirs.set(cfg.recentNotesDirs);

  clearImportDraft();
  invalidateDiskNotesCache();
  allNotesCache.set({});
  actionSnapshot.set([]);
  historyItems.set([]);
  historyTargetHeader.set("");
  searchResultsStore.set([]);
  tabs.set([]);
  activeTabId.set("");
  clearAllEditorViewState();

  await restoreOrBootstrapTabs();
  modal.set("none");
  showToast(`Switched notes directory to ${path}`);
}

// Copy/paste deferral (§64, §82) + the §86 (#9) paste-forward undo link
// live in `./paste` now, re-exported via `export * from "./paste"` above.
// `closeTab` calls `notifyTabClosed` so a link pointing at a closed tab
// is dropped.

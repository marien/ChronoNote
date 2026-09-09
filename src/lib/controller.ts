import { get, writable } from "svelte/store";
import { tick } from "svelte";
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
import type { ActionSnapshotItem, ColorMode, HistoryItem, NoteTab, SearchResultItem } from "./types";

export type ModalKind =
  | "none"
  | "date"
  | "actions"
  | "history"
  | "search"
  | "safety"
  | "sectionImport"
  | "settings"
  | "shortcuts"
  | "glyphLegend"
  | "about"
  | "unsavedScratchpads";

export const tabs = writable<NoteTab[]>([]);
export const activeTabId = writable<string>("");
export const notesDir = writable<string>("");
/** Up to 5 previously-used notes folders, most-recent-first — spec §39.
 * Maintained server-side (Rust) in `set_notes_dir`; this store just
 * mirrors whatever `AppConfig` last reported. */
export const recentNotesDirs = writable<string[]>([]);
export const colorMode = writable<ColorMode>("grayscale");
/** Soft word-wrap in the editor (§80). Mirrors `AppConfig.wordWrap`;
 * `EditorPane` subscribes to it and reconfigures a CodeMirror compartment
 * live, so toggling takes effect without a remount. Off by default. */
export const wordWrap = writable<boolean>(false);
/** Whether the top bar should show icon+label (true) or icon-only (false) —
 * driven by the OS window being maximized or fullscreen. */
export const chromeExpanded = writable<boolean>(false);

/** Action Drawer's "Only Open" toggle (§44), remembered across drawer
 * opens/closes for the rest of the session rather than resetting to a
 * fixed default every time — in-memory only, like `chromeExpanded` above,
 * not persisted to disk. Defaults to on at launch. */
export const actionDrawerShowOnlyOpen = writable<boolean>(true);

/** Date picker's "Open Only" toggle (§43) — same in-memory,
 * remembered-for-the-session treatment as `actionDrawerShowOnlyOpen`
 * above, but defaults to *off* at launch (unlike the Action Drawer's),
 * per what was actually asked for each. */
export const datePickerOpenOnly = writable<boolean>(false);

export const toastMessage = writable<string>("");
export const statusPos = writable<{ line: number; col: number }>({ line: 1, col: 1 });
export const statusCounts = writable<{ open: number; closed: number; forwarded: number }>({
  open: 0,
  closed: 0,
  forwarded: 0,
});

export const modal = writable<ModalKind>("none");
/** Populated once at startup (`initApp`) for the About drawer — read live
 * from Tauri rather than hardcoded, so it can't drift from whatever
 * version is actually running. Empty string until then. */
export const appVersion = writable<string>("");
export const pendingCloseTabId = writable<string | null>(null);
export const safetyMessage = writable<string>("");
export const pendingNotesDirSwitch = writable<string | null>(null);
export const unsavedScratchpadNames = writable<string[]>([]);

export const allNotesCache = writable<Record<string, string>>({});
export const actionSnapshot = writable<ActionSnapshotItem[]>([]);
export const historyItems = writable<HistoryItem[]>([]);
export const historyTargetHeader = writable<string>("");
export const searchResultsStore = writable<SearchResultItem[]>([]);

export interface EditorApi {
  getContent: () => string;
  setContent: (text: string) => void;
  insertAtCursor: (text: string) => void;
  jumpToLine: (lineIdx: number) => void;
  getCursorLineIdx: () => number;
  focus: () => void;
}

export let editorApi: EditorApi | null = null;
export function registerEditorApi(next: EditorApi | null) {
  editorApi = next;
}

/** Remembers each tab's cursor/selection and scroll position across
 * switches, so returning to a tab resumes exactly where you left off
 * instead of dropping you at the top with the cursor at (1,1) — every tab
 * switch fully remounts CodeMirror (see the `{#key}` block in App.svelte
 * and `EditorPane.svelte`'s `onDestroy`/`onMount`), which would otherwise
 * lose both. Keyed by tab id, in-memory only — not persisted to disk or
 * restored across app restarts, since this is about switching tabs
 * within a running session, not session restore (a separate, existing
 * mechanism). Cleared when a tab actually closes, in `closeTab()` below,
 * so entries can't accumulate for tabs that no longer exist. */
export interface EditorViewState {
  selectionJSON: unknown;
  // A CodeMirror `StateEffect` from `view.scrollSnapshot()` (typed `unknown`
  // here so this module doesn't need to depend on `@codemirror/state` —
  // `EditorPane.svelte` is the only thing that creates or consumes it).
  // Anchored to a specific line/block rather than a raw pixel offset, so
  // it stays correct even if line heights shift slightly between saving
  // and restoring.
  scrollEffect: unknown;
  // §86 (#9): the CodeMirror history field, serialized via
  // `state.toJSON({ history: historyField })`. Restored on the next
  // remount of this tab *only* when `docAtSave` still equals the tab's
  // current content — an edit made to the tab while it was inactive (an
  // action-drawer change, or its own `# ` lines deferred by a paste in
  // another tab) shifts the change positions the saved history encodes,
  // so in that case the tab gets a fresh undo baseline instead. `unknown`
  // for the same module-boundary reason as `scrollEffect`.
  historyJSON?: unknown;
  docAtSave?: string;
}
const editorViewStateByTabId = new Map<string, EditorViewState>();
export function saveEditorViewState(tabId: string, state: EditorViewState) {
  editorViewStateByTabId.set(tabId, state);
}
export function getEditorViewState(tabId: string): EditorViewState | undefined {
  return editorViewStateByTabId.get(tabId);
}

export function getActiveTabId(): string {
  return get(activeTabId);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(msg: string) {
  toastMessage.set(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastMessage.set(""), 2400);
}

export function setStatusPosition(line: number, col: number) {
  statusPos.set({ line, col });
}

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

// --- Persistence (debounced on typing, immediate on deliberate actions) ---

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function scheduleSave(tab: NoteTab) {
  if (tab.isScratchpad) return;
  clearTimeout(saveTimers[tab.id]);
  saveTimers[tab.id] = setTimeout(() => {
    delete saveTimers[tab.id];
    writeNoteAndInvalidateCache(tab.filename, tab.content).catch(() => showToast("Failed to save note"));
  }, 400);
}

function flushSave(tabId: string) {
  const timer = saveTimers[tabId];
  if (timer) {
    clearTimeout(timer);
    delete saveTimers[tabId];
  }
  const tab = latestTabs.find((t) => t.id === tabId);
  if (tab && !tab.isScratchpad) {
    writeNoteAndInvalidateCache(tab.filename, tab.content).catch(() => showToast("Failed to save note"));
  }
}

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

// --- Tabs ---

/** Dated tabs sort earliest-to-latest (plain string comparison works since
 * filenames are strict `YYYY-MM-DD.txt`); scratchpads always sort after
 * every dated tab, keeping their existing relative order (stable sort). A
 * display-order concern only — the `tabs` store itself is never reordered,
 * every insertion function keeps appending as before. Used consistently
 * wherever "visual tab order" matters: the tab bar itself, cycling, and
 * picking which tab activates next after a close. */
function compareTabsForDisplay(a: NoteTab, b: NoteTab): number {
  if (a.isScratchpad && b.isScratchpad) return 0;
  if (a.isScratchpad) return 1;
  if (b.isScratchpad) return -1;
  return a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0;
}

export function sortedTabsForDisplay(list: NoteTab[]): NoteTab[] {
  return [...list].sort(compareTabsForDisplay);
}

/** Opposite direction from `compareTabsForDisplay`: most recent dated tab
 * first, scratchpads still last. Used for the action drawer/search "Open
 * Tabs" grouping order, to match "All Files" mode's most-recent-first
 * ordering (see `sortFilenamesByRecency`) rather than the tab bar's own
 * earliest-first convention. */
function compareTabsByRecency(a: NoteTab, b: NoteTab): number {
  if (a.isScratchpad && b.isScratchpad) return 0;
  if (a.isScratchpad) return 1;
  if (b.isScratchpad) return -1;
  return a.filename < b.filename ? 1 : a.filename > b.filename ? -1 : 0;
}

/** `YYYY-MM-DD.txt` filenames sort chronologically as plain strings, so
 * ascending-then-reverse gives most-recent-first without parsing dates. */
export function sortFilenamesByRecency(filenames: string[]): string[] {
  return [...filenames].sort().reverse();
}

export function switchTab(id: string) {
  const prev = get(activeTabId);
  if (prev && prev !== id) flushSave(prev);
  activeTabId.set(id);
}

/** Ctrl+Tab / Ctrl+Shift+Tab: cycle to the next/previous open tab (in
 * visual/display order), wrapping around. Plain Tab stays reserved for
 * indentation inside the editor. */
export function cycleTab(direction: 1 | -1) {
  const list = sortedTabsForDisplay(get(tabs));
  if (list.length === 0) return;
  const idx = list.findIndex((t) => t.id === get(activeTabId));
  const nextIdx = ((idx === -1 ? 0 : idx) + direction + list.length) % list.length;
  switchTab(list[nextIdx].id);
}

export function createScratchpad() {
  const list = get(tabs);
  const n = list.filter((t) => t.isScratchpad).length + 1;
  const newTab: NoteTab = { id: `tab-${Date.now()}`, filename: `Scratchpad ${n}`, isScratchpad: true, content: "" };
  tabs.set([...list, newTab]);
  activeTabId.set(newTab.id);
}

export async function openOrCreateDatedFile(dateStr: string) {
  const filename = `${dateStr}.txt`;
  const list = get(tabs);
  const existing = list.find((t) => t.filename === filename);
  if (existing) {
    switchTab(existing.id);
    return;
  }
  const content = (await api.readNote(filename)) ?? "";
  const newTab: NoteTab = { id: `tab-${Date.now()}`, filename, isScratchpad: false, content };
  tabs.set([...list, newTab]);
  activeTabId.set(newTab.id);
}

/** Blocks close with the safety modal for two independent reasons: unresolved
 * open actions (the original check), or a scratchpad with real content —
 * since scratchpads are never written to disk, closing one with content
 * still in it would destroy that content permanently with zero warning. */
export function requestTabClose(tabId: string) {
  const tab = get(tabs).find((t) => t.id === tabId);
  if (!tab) return;
  const counts = countActions(tab.content);
  const isNonEmptyScratchpad = tab.isScratchpad && tab.content.trim() !== "";

  if (counts.open === 0 && !isNonEmptyScratchpad) {
    closeTab(tabId);
    return;
  }

  const reasons: string[] = [];
  if (counts.open > 0) {
    reasons.push(`has ${counts.open} unresolved open action(s)`);
  }
  if (isNonEmptyScratchpad) {
    reasons.push(
      "is a scratchpad — closing it will permanently discard its content, since scratchpads are never saved to disk",
    );
  }
  pendingCloseTabId.set(tabId);
  safetyMessage.set(`Tab "${tab.filename}" ${reasons.join(" and ")}. Are you sure you want to close it?`);
  modal.set("safety");
}

interface ClosedTabSnapshot {
  filename: string;
  isScratchpad: boolean;
  content: string;
}

const closedTabHistory: ClosedTabSnapshot[] = [];
const MAX_CLOSED_HISTORY = 20;

export function closeTab(tabId: string) {
  flushSave(tabId);
  const list = get(tabs);
  const idx = list.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  editorViewStateByTabId.delete(tabId);
  // §86 (#9): a paste-defer undo link that points at the tab being closed
  // (either end) can no longer be honoured.
  if (pasteDeferLink && (pasteDeferLink.targetTabId === tabId || pasteDeferLink.sourceTabId === tabId)) {
    pasteDeferLink = null;
  }
  closedTabHistory.push({
    filename: list[idx].filename,
    isScratchpad: list[idx].isScratchpad,
    content: list[idx].content,
  });
  if (closedTabHistory.length > MAX_CLOSED_HISTORY) closedTabHistory.shift();

  const wasActive = get(activeTabId) === tabId;
  const sortedIdx = sortedTabsForDisplay(list).findIndex((t) => t.id === tabId);

  const remaining = list.filter((t) => t.id !== tabId);
  if (remaining.length === 0) {
    tabs.set([]);
    createScratchpad();
    return;
  }
  tabs.set(remaining);
  if (wasActive) {
    const sortedAfter = sortedTabsForDisplay(remaining);
    const nextIdx = Math.max(0, Math.min(sortedIdx - 1, sortedAfter.length - 1));
    activeTabId.set(sortedAfter[nextIdx].id);
  }
}

/** Ctrl+Shift+T / Ctrl+Shift+N: reopen the most recently closed tab, with a
 * multi-level history so repeated presses walk further back. A real dated
 * note is reopened by rereading it from disk (via the existing open-or-
 * switch path) rather than trusting the cached snapshot, since that's
 * always correct even if the file changed while the tab was closed. A
 * scratchpad has no disk copy to fall back on, so its cached content is
 * restored verbatim into a fresh tab — this is the "I confirmed the
 * §21 warning but regret it" recovery path. */
export async function reopenLastClosedTab() {
  const snapshot = closedTabHistory.pop();
  if (!snapshot) {
    showToast("No recently closed tabs.");
    return;
  }
  if (snapshot.isScratchpad) {
    const list = get(tabs);
    const newTab: NoteTab = {
      id: `tab-${Date.now()}`,
      filename: snapshot.filename,
      isScratchpad: true,
      content: snapshot.content,
    };
    tabs.set([...list, newTab]);
    activeTabId.set(newTab.id);
  } else {
    await openOrCreateDatedFile(snapshot.filename.replace(/\.txt$/, ""));
  }
}

export function confirmSafetyClose() {
  const id = get(pendingCloseTabId);
  modal.set("none");
  pendingCloseTabId.set(null);
  if (id) closeTab(id);
}

export function cancelSafetyClose() {
  modal.set("none");
  pendingCloseTabId.set(null);
}

export function closeAllModals() {
  modal.set("none");
}

/** Spec 1.3: scratchpads stay purely in memory until explicitly promoted
 * into the storage folder, prepended into today's daily note. */
export async function promoteScratchpad(tabId: string) {
  const list = get(tabs);
  const idx = list.findIndex((t) => t.id === tabId);
  if (idx === -1 || !list[idx].isScratchpad) return;
  const scratchContent = list[idx].content.trim();
  if (!scratchContent) {
    showToast("Nothing to promote.");
    return;
  }
  const todayFilename = todayISO() + ".txt";
  const existingToday = (await api.readNote(todayFilename)) ?? "";
  const merged = existingToday ? `${existingToday}\n\n\n${scratchContent}\n` : `${scratchContent}\n`;
  await writeNoteAndInvalidateCache(todayFilename, merged);

  const remaining = list.filter((t) => t.id !== tabId);
  let todayTab = remaining.find((t) => t.filename === todayFilename);
  if (todayTab) {
    todayTab.content = merged;
  } else {
    todayTab = { id: `tab-${Date.now()}`, filename: todayFilename, isScratchpad: false, content: merged };
    remaining.push(todayTab);
  }
  tabs.set(remaining);
  activeTabId.set(todayTab.id);
  showToast(`Promoted scratchpad into ${todayFilename}`);
}

// --- Editing ---

export function updateActiveTabContent(newContent: string) {
  const list = get(tabs);
  const idx = list.findIndex((t) => t.id === get(activeTabId));
  if (idx === -1) return;
  const updated = { ...list[idx], content: newContent };
  const next = [...list];
  next[idx] = updated;
  tabs.set(next);
  scheduleSave(updated);
}

function writeTabContent(tabId: string, newContent: string, list: NoteTab[]): NoteTab[] {
  const idx = list.findIndex((t) => t.id === tabId);
  if (idx === -1) return list;
  const next = [...list];
  next[idx] = { ...next[idx], content: newContent };
  if (!next[idx].isScratchpad) {
    writeNoteAndInvalidateCache(next[idx].filename, newContent).catch(() => showToast("Failed to save note"));
  }
  if (tabId === get(activeTabId) && editorApi) editorApi.setContent(newContent);
  return next;
}

// --- Date picker ---

export function openDatePicker() {
  modal.set("date");
}

/** The expensive part of "all notes" is the disk read — the merge with
 * currently-open tabs' live (possibly unsaved) content below is cheap and
 * always re-run, so a cached disk layer can't go stale with respect to
 * anything actually open right now. `null` means "needs a fresh read";
 * invalidated by writeNoteAndInvalidateCache() and on a directory switch.
 * (§38 — this used to unconditionally re-read every file on every single
 * Action Drawer/Search/Date-picker/History open.) */
let diskNotesCacheRaw: Record<string, string> | null = null;

export async function refreshAllNotesCache() {
  if (diskNotesCacheRaw === null) {
    const entries = await api.readAllNotes();
    diskNotesCacheRaw = {};
    for (const [fn, content] of entries) diskNotesCacheRaw[fn] = content;
  }
  const map: Record<string, string> = { ...diskNotesCacheRaw };
  for (const t of get(tabs)) if (!t.isScratchpad) map[t.filename] = t.content;
  allNotesCache.set(map);
}

/** All disk writes should go through this rather than calling
 * api.writeNote() directly, so the disk-read cache above knows when it
 * might be stale. Skips invalidation when the written filename already
 * has an open, non-scratchpad tab — that case is always correctly
 * reflected by refreshAllNotesCache()'s live-tab overlay regardless of
 * the disk layer's staleness, so ordinary autosave (the overwhelming
 * majority of writes) doesn't pay for a refetch. Only a write for a
 * filename with *no* open tab — promoteScratchpad's brand-new today
 * file, forwardActionToToday's no-open-tab fallback — actually needs to
 * invalidate. */
function writeNoteAndInvalidateCache(filename: string, content: string): Promise<void> {
  const hasOpenTab = get(tabs).some((t) => !t.isScratchpad && t.filename === filename);
  if (!hasOpenTab) diskNotesCacheRaw = null;
  return api.writeNote(filename, content);
}

export async function commitDatePick(dateStr: string) {
  modal.set("none");
  await openOrCreateDatedFile(dateStr);
}

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

/** Shared by the action drawer, search, and section history: jump to a
 * line in a file, opening it first (reading fresh from disk) if it isn't
 * already an open tab. */
export async function jumpToFileLine(item: { tabId?: string; filename: string; lineIdx: number }) {
  modal.set("none");
  if (item.tabId) {
    switchTab(item.tabId);
  } else {
    await openOrCreateDatedFile(item.filename.replace(/\.txt$/, ""));
  }
  await tick();
  editorApi?.jumpToLine(item.lineIdx);
  editorApi?.focus();
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

// --- Cross-tab search (open tabs only) ---

export function openCrossTabSearch() {
  searchResultsStore.set([]);
  modal.set("search");
}

export function runSearch(query: string, scope: "open" | "all" = "open") {
  const q = query.trim();
  if (!q) {
    searchResultsStore.set([]);
    return;
  }
  const results: SearchResultItem[] = [];
  if (scope === "open") {
    for (const tab of [...get(tabs)].sort(compareTabsByRecency)) {
      const lines = tab.content.split("\n");
      lines.forEach((line, lineIdx) => {
        if (line.toLowerCase().includes(q.toLowerCase())) {
          results.push({ tabId: tab.id, tabFilename: tab.filename, lineIdx, line });
        }
      });
    }
  } else {
    const allSources = get(allNotesCache);
    const openTabIdByFilename = new Map(get(tabs).filter((t) => !t.isScratchpad).map((t) => [t.filename, t.id]));
    for (const filename of sortFilenamesByRecency(Object.keys(allSources))) {
      const lines = allSources[filename].split("\n");
      lines.forEach((line, lineIdx) => {
        if (line.toLowerCase().includes(q.toLowerCase())) {
          results.push({ tabId: openTabIdByFilename.get(filename), tabFilename: filename, lineIdx, line });
        }
      });
    }
  }
  searchResultsStore.set(results);
}

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
  diskNotesCacheRaw = null;
  allNotesCache.set({});
  actionSnapshot.set([]);
  historyItems.set([]);
  historyTargetHeader.set("");
  searchResultsStore.set([]);
  tabs.set([]);
  activeTabId.set("");
  editorViewStateByTabId.clear();

  await restoreOrBootstrapTabs();
  modal.set("none");
  showToast(`Switched notes directory to ${path}`);
}

// --- Copy/paste deferral: copying a "# " line and pasting it into today's
// note marks the original as "> " (deferred) back in its source tab. ---

let lastCopiedAction: { text: string; sourceTabId: string } | null = null;

/** Indentation-tolerant (§50, same as everywhere else an open-action
 * symbol is recognized) and multi-line: a copied block only needs *some*
 * line to be an open action, not the whole selection to start with one —
 * copying a few lines together (a mix of open actions and plain text, or
 * several open actions at once) is exactly the case this needs to keep
 * working for. */
const OPEN_ACTION_LINE = /^(\s*)#(\s)/;

/** Called on every `copy` inside the editor. `lastCopiedAction` is only
 * ever meaningful for the *very next* paste, so any fresh copy must
 * replace it — a copy that carries an open action becomes the new record,
 * a copy that doesn't (a plain line, a done/deferred action, a section
 * header) clears it.
 *
 * §82: it used to only *set* the record, never clear it. So: copy an
 * open-action block in an old tab (e.g. to paste into another app), then
 * copy something unrelated in today's tab, then paste — the stale
 * old-tab record was still live and its `# ` lines got marked `> ` in the
 * wrong tab. */
export function recordCopiedAction(text: string, sourceTabId: string) {
  lastCopiedAction = new RegExp(OPEN_ACTION_LINE, "m").test(text) ? { text, sourceTabId } : null;
}

/** §86 (#9): links the most recent paste-forward to the `# ` → `> ` defer
 * it caused in the *source* tab, so that undoing the paste in the target
 * tab also flips the source's actions back to open. One at a time, like
 * `lastCopiedAction` — the next paste-forward replaces it. `reverted`
 * tracks whether the source is currently back to `# ` (an undo happened),
 * so a redo of the same paste can re-apply the defer. Cleared when either
 * tab closes, or when the source's `> ` block can no longer be found
 * (closed, or hand-edited) — in which case there's nothing safe to flip. */
interface PasteDeferLink {
  targetTabId: string;
  sourceTabId: string;
  openBlock: string;
  deferredBlock: string;
  reverted: boolean;
}
let pasteDeferLink: PasteDeferLink | null = null;

/** Test-only view of the link state. */
export function _pasteDeferLinkForTest(): Readonly<PasteDeferLink> | null {
  return pasteDeferLink;
}

function deferRestoredToast(sourceFilename: string, blockText: string) {
  const n = (blockText.match(new RegExp(OPEN_ACTION_LINE, "gm")) ?? []).length;
  showToast(
    n > 1
      ? `${n} deferred tasks on ${sourceFilename} restored to open`
      : `Deferred task on ${sourceFilename} restored to open`,
  );
}

/** Called by `EditorPane` after an `undo` transaction that changed the
 * document in the active (target) tab. If that undo is the one that
 * removed the pasted block, flip the linked source tab's `> ` back to
 * `# ` to match. */
export function onEditorUndo(activeTabId: string, before: string, after: string) {
  const link = pasteDeferLink;
  if (!link || link.reverted || link.targetTabId !== activeTabId) return;
  // Only the undo step that actually removes the pasted block should fire —
  // earlier undos (of edits made after the paste) leave it in place.
  if (!before.includes(link.openBlock) || after.includes(link.openBlock)) return;

  const list = get(tabs);
  const src = list.find((t) => t.id === link.sourceTabId);
  if (src && src.content.includes(link.deferredBlock)) {
    tabs.set(writeTabContent(src.id, src.content.replace(link.deferredBlock, link.openBlock), list));
    deferRestoredToast(src.filename, link.openBlock);
    link.reverted = true;
  } else {
    pasteDeferLink = null;
  }
}

/** Mirror of `onEditorUndo` for a `redo` that re-inserts the pasted block:
 * re-applies the defer on the source tab. */
export function onEditorRedo(activeTabId: string, before: string, after: string) {
  const link = pasteDeferLink;
  if (!link || !link.reverted || link.targetTabId !== activeTabId) return;
  if (before.includes(link.openBlock) || !after.includes(link.openBlock)) return;

  const list = get(tabs);
  const src = list.find((t) => t.id === link.sourceTabId);
  if (src && src.content.includes(link.openBlock)) {
    tabs.set(writeTabContent(src.id, src.content.replace(link.openBlock, link.deferredBlock), list));
    const n = (link.openBlock.match(new RegExp(OPEN_ACTION_LINE, "gm")) ?? []).length;
    showToast(
      n > 1 ? `${n} tasks on ${src.filename} deferred again` : `Task on ${src.filename} deferred again`,
    );
    link.reverted = false;
  } else {
    pasteDeferLink = null;
  }
}

export function handlePasteIntoTab(targetTabId: string) {
  if (!lastCopiedAction) return;
  const copied = lastCopiedAction;
  lastCopiedAction = null;

  const todayFilename = todayISO() + ".txt";
  const targetTab = get(tabs).find((t) => t.id === targetTabId);
  // §49: today or any later date counts as "forwarding," not just today
  // exactly. Scratchpads are excluded outright — their filename (e.g.
  // "Scratchpad 1") isn't a date at all, and would sort after any real
  // date string, which would otherwise make this comparison wrongly treat
  // pasting into a scratchpad as "later than today."
  if (
    !targetTab ||
    targetTab.isScratchpad ||
    targetTab.filename < todayFilename ||
    copied.sourceTabId === targetTabId
  ) {
    return;
  }

  const list = get(tabs);
  const srcTab = list.find((t) => t.id === copied.sourceTabId);
  if (srcTab && srcTab.content.includes(copied.text)) {
    // Defer every open action *within* the copied block, not just one at
    // its start — pasting a multi-line copy that happens to carry several
    // "# " lines (or one indented past the block's first line) should
    // forward all of them, the same as pasting just one always has.
    const deferredBlock = copied.text.replace(new RegExp(OPEN_ACTION_LINE, "gm"), "$1>$2");
    const newSrcContent = srcTab.content.replace(copied.text, deferredBlock);
    tabs.set(writeTabContent(srcTab.id, newSrcContent, list));
    // §86 (#9): remember this defer so an undo of the paste in the target
    // tab can flip it back.
    pasteDeferLink = {
      targetTabId,
      sourceTabId: srcTab.id,
      openBlock: copied.text,
      deferredBlock,
      reverted: false,
    };
    const count = (copied.text.match(new RegExp(OPEN_ACTION_LINE, "gm")) ?? []).length;
    showToast(
      count > 1
        ? `${count} original tasks on ${srcTab.filename} marked deferred`
        : `Original task on ${srcTab.filename} marked deferred`,
    );
  }
}

import { get, writable } from "svelte/store";
import { tick } from "svelte";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "./tauriApi";
import { countActions, getSectionHeaderForLine, isSetextUnderline, normalizeHeaderTitle } from "./tokens";
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
  | "unsavedScratchpads";

export const tabs = writable<NoteTab[]>([]);
export const activeTabId = writable<string>("");
export const notesDir = writable<string>("");
export const colorMode = writable<ColorMode>("grayscale");
/** Whether the top bar should show icon+label (true) or icon-only (false) —
 * driven by the OS window being maximized or fullscreen. */
export const chromeExpanded = writable<boolean>(false);

export const toastMessage = writable<string>("");
export const statusPos = writable<{ line: number; col: number }>({ line: 1, col: 1 });
export const statusCounts = writable<{ open: number; closed: number; forwarded: number }>({
  open: 0,
  closed: 0,
  forwarded: 0,
});

export const modal = writable<ModalKind>("none");
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
    api.writeNote(tab.filename, tab.content).catch(() => showToast("Failed to save note"));
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
    api.writeNote(tab.filename, tab.content).catch(() => showToast("Failed to save note"));
  }
}

// --- Boot ---

function applyColorModeToDom(mode: ColorMode) {
  document.documentElement.dataset.colorMode = mode;
}

async function bootstrapTodayTab() {
  const filename = todayISO() + ".txt";
  const content = (await api.readNote(filename)) ?? "";
  const id = `tab-${Date.now()}`;
  tabs.set([{ id, filename, isScratchpad: false, content }]);
  activeTabId.set(id);
}

export async function initApp() {
  const cfg = await api.getConfig();
  notesDir.set(cfg.notesDir);
  colorMode.set(cfg.colorMode);
  applyColorModeToDom(cfg.colorMode);
  await bootstrapTodayTab();
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
function sortFilenamesByRecency(filenames: string[]): string[] {
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
  await api.writeNote(todayFilename, merged);

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
    api.writeNote(next[idx].filename, newContent).catch(() => showToast("Failed to save note"));
  }
  if (tabId === get(activeTabId) && editorApi) editorApi.setContent(newContent);
  return next;
}

// --- Date picker ---

export function openDatePicker() {
  modal.set("date");
}

export async function refreshAllNotesCache() {
  const entries = await api.readAllNotes();
  const map: Record<string, string> = {};
  for (const [fn, content] of entries) map[fn] = content;
  for (const t of get(tabs)) if (!t.isScratchpad) map[t.filename] = t.content;
  allNotesCache.set(map);
}

export async function commitDatePick(dateStr: string) {
  modal.set("none");
  await openOrCreateDatedFile(dateStr);
}

// --- Action drawer (toggle between open tabs and all files) ---

function isActionLine(line: string): boolean {
  return line.startsWith("# ") || line.startsWith("> ") || line.includes("=> @");
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
  const target = lines[lineIdx];
  let updated: string | null = null;
  if (target.startsWith("# ")) updated = "v " + target.slice(2);
  else if (target.startsWith("v ")) updated = "> " + target.slice(2);
  else if (target.startsWith("> ")) updated = "# " + target.slice(2);
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
  if (!target.startsWith("# ") && !target.startsWith("> ")) return;

  lines[lineIdx] = "> " + target.slice(2);
  const taskText = "# " + target.slice(2);
  const todayFilename = todayISO() + ".txt";

  let next = writeTabContent(tabId, lines.join("\n"), list);
  const todayTab = next.find((t) => t.filename === todayFilename);
  if (todayTab) {
    next = writeTabContent(todayTab.id, `${taskText}\n${todayTab.content}`, next);
  } else {
    api.readNote(todayFilename).then((existing) => {
      const base = existing ?? "";
      api.writeNote(todayFilename, `${taskText}\n${base}`).catch(() => {});
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
  const targetHeader = normalizeHeaderTitle(rawHeader);
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
        const h = normalizeHeaderTitle(flines[idx].trim());
        inSection = h.toLowerCase() === targetHeader.toLowerCase();
        return;
      }
      if (!inSection) return;
      const isActionOrFollow =
        line.startsWith("# ") || line.startsWith("v ") || line.startsWith("> ") || line.startsWith("=> ");
      if (isActionOrFollow) {
        const normalizedBody = line
          .replace(/^(#|v|>|=>)\s+(@\w+\s+)?/, "")
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

export function openSectionImport() {
  modal.set("sectionImport");
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

/** Directory switching is treated as project/scope switching: everything
 * currently loaded (open tabs, search/action/history caches) is scoped to
 * the old directory and becomes stale the moment `notesDir` changes, so a
 * confirmed switch does a full workspace reset rather than just repointing
 * config. The one thing that gate has to protect is unpromoted scratchpad
 * content — it's the only state that would actually be destroyed, since
 * everything else is already safely persisted to the old folder. */
export async function pickAndSwitchNotesDirectory() {
  const current = get(notesDir);
  const picked = await openFolderDialog({ directory: true, defaultPath: current || undefined });
  if (!picked || Array.isArray(picked)) return;

  const unresolved = get(tabs).filter((t) => t.isScratchpad && t.content.trim() !== "");
  if (unresolved.length > 0) {
    pendingNotesDirSwitch.set(picked);
    unsavedScratchpadNames.set(unresolved.map((t) => t.filename));
    modal.set("unsavedScratchpads");
    return;
  }
  await performDirectorySwitch(picked);
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

  allNotesCache.set({});
  actionSnapshot.set([]);
  historyItems.set([]);
  historyTargetHeader.set("");
  searchResultsStore.set([]);
  tabs.set([]);
  activeTabId.set("");

  await bootstrapTodayTab();
  modal.set("none");
  showToast(`Switched notes directory to ${path}`);
}

// --- Copy/paste deferral: copying a "# " line and pasting it into today's
// note marks the original as "> " (deferred) back in its source tab. ---

let lastCopiedAction: { text: string; sourceTabId: string } | null = null;

export function recordCopiedAction(text: string, sourceTabId: string) {
  if (text.startsWith("# ")) {
    lastCopiedAction = { text, sourceTabId };
  }
}

export function handlePasteIntoTab(targetTabId: string) {
  if (!lastCopiedAction) return;
  const copied = lastCopiedAction;
  lastCopiedAction = null;

  const todayFilename = todayISO() + ".txt";
  const targetTab = get(tabs).find((t) => t.id === targetTabId);
  if (!targetTab || targetTab.filename !== todayFilename || copied.sourceTabId === targetTabId) {
    return;
  }

  const list = get(tabs);
  const srcTab = list.find((t) => t.id === copied.sourceTabId);
  if (srcTab && srcTab.content.includes(copied.text)) {
    const newSrcContent = srcTab.content.replace(copied.text, "> " + copied.text.slice(2));
    tabs.set(writeTabContent(srcTab.id, newSrcContent, list));
    showToast(`Original task on ${srcTab.filename} marked deferred`);
  }
}

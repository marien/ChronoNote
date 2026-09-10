/** Every piece of app state the UI binds to lives here — the Svelte
 * stores plus the two non-store singletons (`editorApi`, the per-tab
 * editor-view-state map). `controller.ts` re-exports all of it
 * (`export * from "./stores"`) and holds the *behaviour* that reads and
 * writes it, so components can keep importing either `./stores` or
 * `./controller`. Split out of `controller.ts` in the v0.5.0 refactor so
 * that file is about what happens, not what exists. */
import { get, writable } from "svelte/store";
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
  | "about"
  | "unsavedScratchpads"
  | "conflict"
  | "commandPalette";

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
/** §99: cap the editor text column to a ~720px reading measure. Mirrors
 * `AppConfig.readableLineLength`; `EditorPane` reads it (with `wordWrap`)
 * to toggle a max-width wrapper live. On by default, but only visible
 * when `wordWrap` is also on. */
export const readableLineLength = writable<boolean>(true);
/** Whether the top bar should show icon+label (true) or icon-only (false) —
 * driven by the OS window being maximized or fullscreen. */
export const chromeExpanded = writable<boolean>(false);

/** Action Drawer's "Only Open" toggle (§44), remembered across drawer
 * opens/closes for the rest of the session rather than resetting to a
 * fixed default every time — in-memory only, like `chromeExpanded` above,
 * not persisted to disk. Defaults to on at launch. */
export const actionDrawerShowOnlyOpen = writable<boolean>(true);


export const toastMessage = writable<string>("");
export const statusPos = writable<{ line: number; col: number }>({ line: 1, col: 1 });
export const statusCounts = writable<{ open: number; closed: number; forwarded: number }>({
  open: 0,
  closed: 0,
  forwarded: 0,
});
/** Word count of the active tab's content — status-bar left zone (§100).
 * Kept in sync by `boot.ts`'s active-status subscription, same as
 * `statusCounts`. */
export const statusWordCount = writable<number>(0);

/** §100: ambient autosave state for the status-bar centre zone.
 *   `idle`   nothing written this session / scratchpad
 *   `saving` a disk write is in flight
 *   `saved`  the last disk write succeeded
 *   `error`  the last disk write failed (a toast also fired)
 * Driven by `persistence.ts`. Distinct from the per-tab drift baseline
 * (§94) — this is only about *our* writes reaching disk. */
export type SaveState = "idle" | "saving" | "saved" | "error";
export const saveState = writable<SaveState>("idle");

/** §108: the non-modal in-document find bar (Ctrl+F). `findOpen` toggles
 * the floating widget docked top-right of the editor; `findMatch` mirrors
 * "N of M" as the editor reports it. The editor stays fully live while
 * this is open — it's not a modal. */
export const findOpen = writable<boolean>(false);
export const findMatch = writable<{ current: number; total: number }>({ current: 0, total: 0 });

export const modal = writable<ModalKind>("none");
/** Populated once at startup (`initApp`) for the About drawer — read live
 * from Tauri rather than hardcoded, so it can't drift from whatever
 * version is actually running. Empty string until then. */
export const appVersion = writable<string>("");
export const pendingCloseTabId = writable<string | null>(null);
export const safetyMessage = writable<string>("");
export const pendingNotesDirSwitch = writable<string | null>(null);
export const unsavedScratchpadNames = writable<string[]>([]);
/** Which flow raised the unsaved-scratchpads gate: a notes-folder switch
 * (§39) or an app quit (§93 close barrier). `null` when the gate isn't
 * up. Drives the modal's wording and which resolve handlers its buttons
 * call. */
export const scratchpadGateContext = writable<"switch" | "close" | null>(null);

export const allNotesCache = writable<Record<string, string>>({});
export const actionSnapshot = writable<ActionSnapshotItem[]>([]);
export const historyItems = writable<HistoryItem[]>([]);
export const historyTargetHeader = writable<string>("");
export const searchResultsStore = writable<SearchResultItem[]>([]);

export function getActiveTabId(): string {
  return get(activeTabId);
}

/** Dismiss whatever modal is open. A one-liner over the `modal` store,
 * but called from nearly every component and behaviour module, so it
 * lives next to the store rather than in any one feature file. */
export function closeAllModals() {
  modal.set("none");
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Flash a transient message in the status bar; auto-clears after 2.4s. */
export function showToast(msg: string) {
  toastMessage.set(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastMessage.set(""), 2400);
}

export function setStatusPosition(line: number, col: number) {
  statusPos.set({ line, col });
}

export interface EditorApi {
  getContent: () => string;
  setContent: (text: string) => void;
  insertAtCursor: (text: string) => void;
  jumpToLine: (lineIdx: number) => void;
  getCursorLineIdx: () => number;
  focus: () => void;
  /** §108: in-document find, driven by the floating `FindBar`. */
  find: {
    setQuery: (q: string) => void;
    next: () => void;
    prev: () => void;
    clear: () => void;
  };
}

/** The single live editor's imperative handle, or `null` between mounts.
 * `EditorPane` registers/clears it; everything else reaches the editor
 * through this. A plain module-level binding rather than a store — its
 * consumers call methods on it imperatively, they don't react to it. */
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
 * mechanism). Cleared when a tab actually closes, in `closeTab()`, so
 * entries can't accumulate for tabs that no longer exist. */
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
export function clearEditorViewState(tabId: string) {
  editorViewStateByTabId.delete(tabId);
}
/** Wipe every tab's saved editor state — used on a notes-directory switch,
 * where the whole tab set is torn down and rebuilt. */
export function clearAllEditorViewState() {
  editorViewStateByTabId.clear();
}

/** §94: per-tab SHA-256 of the note's disk content as of the last load or
 * successful save — the "clean" baseline the drift check compares the
 * current on-disk hash against. Keyed by tab id, in-memory only (like the
 * editor-view-state map above), and cleared when a tab closes or on a
 * directory switch. A tab with no entry (a scratchpad, or a note whose
 * initial load predates this being recorded) simply never triggers a
 * drift prompt. */
const cleanHashByTabId = new Map<string, string>();
export function markTabClean(tabId: string, hash: string | null | undefined) {
  if (hash) cleanHashByTabId.set(tabId, hash);
}
export function getTabCleanHash(tabId: string): string | undefined {
  return cleanHashByTabId.get(tabId);
}
export function clearTabCleanHash(tabId: string) {
  cleanHashByTabId.delete(tabId);
}
export function clearAllTabCleanHashes() {
  cleanHashByTabId.clear();
}

/** §94: the conflict currently awaiting the user's decision, or `null`.
 * Set when the drift check finds the active tab both dirty *and* changed
 * on disk; drives `ConflictModal`. */
export const conflictInfo = writable<{
  tabId: string;
  filename: string;
  diskContent: string;
  diskHash: string;
} | null>(null);

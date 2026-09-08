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

export function getActiveTabId(): string {
  return get(activeTabId);
}

export interface EditorApi {
  getContent: () => string;
  setContent: (text: string) => void;
  insertAtCursor: (text: string) => void;
  jumpToLine: (lineIdx: number) => void;
  getCursorLineIdx: () => number;
  focus: () => void;
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

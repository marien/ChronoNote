/** Every piece of app state the UI binds to lives here — the Svelte
 * stores plus the two non-store singletons (`editorApi`, the per-tab
 * editor-view-state map). `controller.ts` re-exports all of it
 * (`export * from "./stores"`) and holds the *behaviour* that reads and
 * writes it, so components can keep importing either `./stores` or
 * `./controller`. Split out of `controller.ts` in the v0.5.0 refactor so
 * that file is about what happens, not what exists. */
import { get, writable } from "svelte/store";
import { todayISO } from "./date";
import type {
  ActionSnapshotItem,
  ColorMode,
  HistoryItem,
  PreviousSectionOccurrence,
  NoteTab,
  SearchResultItem,
  SectionOccurrence,
  ThemeMode,
} from "./types";
import { isAndroid } from "./platform";
import type { SyncConflict } from "./tauriCommands";

export type ModalKind =
  | "none"
  | "date"
  | "actions"
  | "history"
  | "search"
  | "safety"
  | "settings"
  | "shortcuts"
  | "about"
  | "unsavedScratchpads"
  | "conflict"
  | "commandPalette"
  // #56: the top bar's collapsed-action overflow popover — same
  // anchored-popover shape as "date", not a centred `.overlay` card.
  | "topBarMore"
  // Calendar sync (v0.9.0) review step, after "Sync calendar for this day".
  | "syncReview"
  // Android OneDrive sync: notes whose phone and cloud versions couldn't be
  // merged automatically, waiting on the user's choice.
  | "syncConflicts";

export const tabs = writable<NoteTab[]>([]);
export const activeTabId = writable<string>("");
/** #72: today's date, kept live via `boot.ts`'s `wireDateRollover()` — a
 * plain `todayISO()` call inside a template expression (as the top bar's
 * past/today/future tab colouring used to do) only ever re-evaluates when
 * *something else* Svelte is already watching changes, which usually
 * isn't true across a midnight rollover (nothing else about the UI
 * necessarily changes right then). Reading `$currentDateISO` instead
 * makes "today changed" a real reactive dependency, so tab colours (and
 * anything else date-relative) actually refresh at midnight instead of
 * waiting for an unrelated re-render (switching tabs, resizing, typing)
 * to happen to pick up the new date. */
export const currentDateISO = writable<string>(todayISO());
export const notesDir = writable<string>("");
/** Up to 5 previously-used notes folders, most-recent-first — spec §39.
 * Maintained server-side (Rust) in `set_notes_dir`; this store just
 * mirrors whatever `AppConfig` last reported. */
export const recentNotesDirs = writable<string[]>([]);
export const colorMode = writable<ColorMode>("color");
/** #48: light / dark / system — independent of `colorMode` above (the
 * glyph palette). Mirrors `AppConfig.themeMode`; `applyThemeModeToDom()`
 * (`boot.ts`) reflects it onto `<html data-theme>` for `app.css`. */
export const themeMode = writable<ThemeMode>("system");
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
/** #37/#38: the current editor selection, for the status-bar left zone —
 * `null` when nothing is selected (a bare caret). `lines` counts the
 * document lines the selection touches (1 for an in-line selection). */
export const statusSelection = writable<{ lines: number } | null>(null);
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

/** §108: the non-modal in-document find bar (Ctrl/Cmd+F). `findOpen` toggles
 * the floating widget docked top-right of the editor; `findMatch` mirrors
 * "N of M" as the editor reports it. The editor stays fully live while
 * this is open — it's not a modal. */
export const findOpen = writable<boolean>(false);
export const findMatch = writable<{ current: number; total: number }>({ current: 0, total: 0 });

export const modal = writable<ModalKind>("none");
/** #71: which Settings tab to land on when Settings is opened next —
 * read once by `SettingsModal.svelte` as its initial `activeSettingsTab`
 * (falling back to the usual "appearance" default when unset), then
 * cleared, so an ordinary Settings open right after still starts on the
 * first tab as always. Set by `openSettingsOnNotesFolder` (the status
 * bar's folder icon/name, §71) — a generic "which tab" store rather than
 * a single-purpose boolean, in case a future entry point needs the same
 * mechanism for a different tab. */
export const settingsInitialTab = writable<string | null>(null);
/** Populated once at startup (`initApp`) for the About drawer — read live
 * from Tauri rather than hardcoded, so it can't drift from whatever
 * version is actually running. Empty string until then. */
export const appVersion = writable<string>("");

/** Which of the three entry points booted this frontend — set explicitly
 * by each `main*.ts` (never inferred from which backend engine happens to
 * be installed, since the mock backend itself powers *two* of these:
 * `main.ts`'s dev-only `?mock` branch pretends to be `"desktop"` for
 * Playwright, while `main-demo.ts` uses the exact same `MockBackend`
 * engine but declares `"demo"`). Defaults to `"desktop"`, correct for
 * both the real Tauri build and that dev/test mock path. Gates the UI
 * differences the web-app design doc calls for: `"web"` hides the Notes
 * Location and Updates settings sections and shows the browser-storage
 * status-bar badge; anything other than `"demo"` shows the Data
 * (export/import) section. */
export const backendKind = writable<"desktop" | "demo" | "web" | "android">(isAndroid ? "android" : "desktop");

/** Form-factor detection: whether the current viewport or device is
 * touch/mobile-oriented (< 600px or pointer: coarse). Drives the Mobile
 * Accessory Bar and compact header with the Tab Drawer. */
export const isMobile = writable<boolean>(isAndroid);

/** Whether the mobile tab drawer (bottom sheet) is currently open. */
export const mobileTabDrawerOpen = writable<boolean>(false);

/** Connected Microsoft account info for OneDrive sync. */
export const oneDriveAccount = writable<{ email: string; displayName: string } | null>(null);

/** Chosen notes folder in OneDrive. */
export const oneDriveFolder = writable<{ folderId: string; folderPath: string } | null>(null);

/** Whether the OneDrive folder picker is open outside Settings - right after a web
 * sign-in with no folder chosen yet, or from the status bar's "Choose a folder". */
export const oneDriveFolderPickerOpen = writable(false);

/** OneDrive synchronization status. */
export const oneDriveSyncStatus = writable<"idle" | "syncing" | "offline" | "error">("idle");
/** Notes the OneDrive sync engine is holding back because the phone and
 * cloud versions diverged in a way it couldn't merge (see `syncConflicts.ts`). */
export const syncConflicts = writable<SyncConflict[]>([]);
/** True while a OneDrive sync is running (see `oneDriveSync.ts`) — drives the
 * spinner in the status bar and the disabled "Sync now" button. */
export const oneDriveSyncing = writable(false);

/** Android only: true from the moment the system browser opens for a
 * `chrononote://auth` sign-in until the `onedrive-login-result` event
 * resolves it (see `boot.ts`'s `initOneDriveSync`) — the real outcome
 * arrives asynchronously, possibly long after the user switches back to
 * the app, so this can't just be local state in the Settings modal
 * (which may not even be open when it resolves). Always stays `false`
 * on desktop, which already blocks until it has a real result. */
export const oneDriveConnecting = writable<boolean>(false);

/** §update-check: whether ChronoNote silently checks github.com for a
 * newer release on launch. Mirrors `AppConfig.autoCheckUpdates` — on by
 * default (disclosed + toggleable in Settings). */
export const autoCheckUpdates = writable<boolean>(true);

/** Calendar sync's "Sync calendar for this day" button is opt-in — hidden
 * from the top bar/More actions/command palette entirely until turned on
 * in Settings. Mirrors `AppConfig.calendarSyncEnabled`, off by default. */
export const calendarSyncEnabled = writable<boolean>(false);
/** Whether `.agenda.json` currently exists in the notes folder — drives
 * graying out the sync button rather than hiding it (that's what
 * `calendarSyncEnabled` is for). Refreshed at boot, on window focus, and
 * after switching notes folders (`calendarSyncActions.ts::refreshAgendaFileExists`)
 * — never polled continuously, since the file is expected to change only
 * while ChronoNote is unfocused (an external process wrote it). */
export const agendaFileExists = writable<boolean>(false);
/**
 *   `idle`       nothing checked yet this session
 *   `checking`   a check is in flight
 *   `upToDate`   the last check found no newer release
 *   `available`  a newer release exists — `updateAvailableVersion` is set
 *   `downloading` the user clicked "Download & install"
 *   `ready`      downloaded and installed; a restart finishes it
 *   `error`      the last check or download/install failed — see
 *                `updateErrorMessage`
 * Driven by `updates.ts`, read by the About drawer and the status-bar
 * launch-time banner. */
export type UpdateStatus = "idle" | "checking" | "upToDate" | "available" | "downloading" | "ready" | "error";
export const updateStatus = writable<UpdateStatus>("idle");
export const updateAvailableVersion = writable<string | null>(null);
export const updateReleaseNotes = writable<string | null>(null);
export const updateDownloadProgress = writable<{ doneBytes: number; totalBytes: number } | null>(null);
export const updateErrorMessage = writable<string | null>(null);

/** #50: set once on boot when this launch is the first after an in-place
 * update (the running app version differs from `AppConfig.lastSeenVersion`)
 * — the version just updated *to*, for a status-bar "Updated to vX.Y.Z"
 * link that opens its GitHub release page. `null` otherwise, and once
 * dismissed for the session — `boot.ts` persists the new version
 * immediately, so it's never shown again for that version. */
export const justUpdatedToVersion = writable<string | null>(null);

export const pendingCloseTabId = writable<string | null>(null);
export const safetyMessage = writable<string>("");
export const pendingNotesDirSwitch = writable<string | null>(null);
export const unsavedScratchpadNames = writable<string[]>([]);
/** Which flow raised the unsaved-scratchpads gate: a notes-folder switch
 * (§39) or an app quit (§93 close barrier). `null` when the gate isn't
 * up. Drives the modal's wording and which resolve handlers its buttons
 * call. */
export const scratchpadGateContext = writable<"switch" | "close" | null>(null);

/** #66: "copy to next occurrence" couldn't find a target via search, so
 * the date picker is reused to ask for one — this is what's waiting to
 * be resolved once a date is picked (`commitDatePick` in `tabs.ts`
 * checks this before falling back to its normal "jump to this date"
 * behavior). `closeAllModals()` clears it too, so cancelling the picker
 * (Escape, outside click) abandons the copy rather than leaving it to
 * hijack some later, unrelated use of the same picker. */
export interface CopyForwardPending {
  sourceTabId: string;
  fromLine: number;
  toLine: number;
  /** The matching-normalized section title being searched for. */
  targetHeader: string;
  /** What a brand-new section's header should read, if the picked date's
   * note doesn't have one yet — the source note's own header text (no
   * calendar title is available in this fallback path). */
  newSectionHeaderText: string;
}
export const copyForwardPending = writable<CopyForwardPending | null>(null);

export const allNotesCache = writable<Record<string, string>>({});
export const actionSnapshot = writable<ActionSnapshotItem[]>([]);
export const historyItems = writable<HistoryItem[]>([]);
/** §150: every dated occurrence of the section being aggregated — past,
 * today, and future — each carrying its own (possibly empty) slice of the
 * same deduped `historyItems`. Drives Section History's list, where a
 * header is now selectable per occurrence, not just per action row. */
export const historyOccurrences = writable<SectionOccurrence[]>([]);
/** #62: whether `openMeetingHistory()`'s disk read is still in flight —
 * the drawer opens immediately rather than waiting for it, so it needs
 * something to show meanwhile. Almost always false in practice once
 * `boot.ts`'s background cache warm has had a chance to finish; this is
 * the fallback for whenever it hasn't (a very fast keypress, or a large
 * notes folder). */
export const historyLoading = writable<boolean>(false);
export const historyTargetHeader = writable<string>("");
/** #27/#33: the section's previous occurrence (see `PreviousSectionOccurrence`).
 * `null` when there is no earlier occurrence to show. */
export const historyPreviousOccurrence = writable<PreviousSectionOccurrence | null>(null);
/** §150: Section History's "Only Open" toggle, remembered across drawer
 * opens/closes for the rest of the session — in-memory only, same
 * treatment as `actionDrawerShowOnlyOpen` above. Defaults to off: History
 * is a browse-everything review surface first, unlike the Action Drawer's
 * default worklist view. */
export const historyShowOnlyOpen = writable<boolean>(false);
export const searchResultsStore = writable<SearchResultItem[]>([]);

/** Calendar sync review — the state of one pending "Sync from a list…" (or
 * the file-based "Sync calendar for this day") review, from submit to
 * confirm. `null` when no review is in progress. */
export type CalendarSyncRemovalChoice = "flag" | "discard" | "move";

export interface CalendarSyncRemoval {
  header: string;
  lines: string[];
  choice: CalendarSyncRemovalChoice;
  /** Only used when `choice === "move"`; an ISO date string. */
  moveDate: string;
}

export interface CalendarSyncNewItem {
  title: string;
  checked: boolean;
}

export interface CalendarSyncReviewState {
  tabId: string;
  originalContent: string;
  agendaTitles: string[];
  newItems: CalendarSyncNewItem[];
  reorderedTitles: string[];
  removedEmpty: string[];
  removals: CalendarSyncRemoval[];
}

export const calendarSyncReview = writable<CalendarSyncReviewState | null>(null);

export function getActiveTabId(): string {
  return get(activeTabId);
}

/** Dismiss whatever modal is open. A one-liner over the `modal` store,
 * but called from nearly every component and behaviour module, so it
 * lives next to the store rather than in any one feature file. */
export function closeAllModals() {
  modal.set("none");
  // #66: a copy-forward waiting on a picked date is abandoned, not
  // resolved, if the picker closes any other way (Escape, outside click).
  copyForwardPending.set(null);
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

export function setStatusSelection(sel: { lines: number } | null) {
  statusSelection.set(sel);
}

export interface EditorApi {
  getContent: () => string;
  setContent: (text: string) => void;
  insertAtCursor: (text: string) => void;
  jumpToLine: (lineIdx: number) => void;
  getCursorLineIdx: () => number;
  /** #66: the current selection, extended to whole lines (a bare caret
   * counts as just its own line) — `text` is exactly those lines
   * verbatim, `fromLine`/`toLine` are 0-based and inclusive. */
  getSelection: () => { text: string; fromLine: number; toLine: number };
  focus: () => void;
  /** §108: in-document find, driven by the floating `FindBar`. */
  find: {
    setQuery: (q: string) => void;
    next: () => void;
    prev: () => void;
    clear: () => void;
  };
  applyToken?: (token: "#" | "v" | ">" | "x" | "-" | "=>" | "!") => void;
  indent?: (dedent?: boolean) => void;
  undo?: () => void;
  redo?: () => void;
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

/** Peek mode: a compact, see-through, always-on-top note window for taking notes during a call.
 *
 * It is the normal window shrunk, not a second window, so there is one editor and one document: whatever you type
 * is a normal edit with normal autosave. Peek shows only the section the cursor was in when you started it;
 * Alt+Left / Alt+Right switch to the previous / next occurrence of that section by opening that day's note in the
 * normal tab machinery (so a past occurrence is editable and the tab's grey/blue/green says past/today/future). The
 * window handling lives in `peekWindow.ts`, the one-section editor view in `editor/sectionFocus.ts`.
 *
 * Settings live in config.json (`PeekConfig`), applied at startup by `applyPeekConfig`. */
import { tick } from "svelte";
import { get, writable } from "svelte/store";
import { t } from "./i18n";
import { todayISO } from "./date";
import { occurrenceFiles, stepToOccurrence } from "./occurrences";
import { closeTab, switchTab } from "./tabs";
import { createPeekWindowController, nativePeekWindow } from "./peekWindow";
import { whenZenSettled } from "./zenWindow";
import { PEEK_DEFAULTS } from "./peekDefaults";
import * as api from "./tauriApi";
import type { PeekConfig, PeekHeader } from "./types";
import {
  activeTabId,
  allNotesCache,
  backendKind,
  editorApi,
  fontSize,
  isZenMode,
  lineHeight,
  modal,
  showToast,
  tabs,
} from "./stores";
import { exitCaretLine, findSectionRange, listSections, retitleSection } from "./peekSection";
import { underlineFor } from "./sectionFormat";
import { writeTabContent } from "./persistence";
import { setShortcutEnabled } from "./shortcuts";
import { getSectionHeaderForLine, normalizeHeaderTitle, titleForMatching } from "./tokens";

export type PeekHeaderMode = PeekHeader;
/** The Peek settings, as stored in `config.json` (`PeekConfig`, generated from Rust). */
export type PeekSettings = PeekConfig;

export { PEEK_DEFAULTS };
/** Most rows "fit the whole section" mode grows to. */
export const PEEK_MAX_FIT_LINES = 20;
/** Logical px of the header strip: the full strip (30px), or 0 when hidden / on hover (drawn as an overlay). */
const HEADER_FULL_PX = 30;
/** How long the pointer must be away before the header overlay collapses again. */
const COLLAPSE_DELAY_MS = 150;
/** Plus the editor's own padding. */
const EDITOR_PADDING_PX = 12;
/** The window only reserves layout space for the header in "always" mode (30px). For "hidden" and "on hover",
 * the bar/strip is drawn OVER the content while the pointer is over the window (`.peek-bar.overlay`),
 * so the editor starts at the top and the window never changes size. */
const headerPx = (header: PeekHeader) => (header === "always" ? HEADER_FULL_PX : 0);

export const peekSettings = writable<PeekSettings>({ ...PEEK_DEFAULTS });

// Settings live in config.json like every other setting. Nothing is written until the stored config has been
// applied once (`applyPeekConfig`), so starting up never writes the defaults over what is on disk; after that a
// change is saved shortly after the last edit (a slider drag fires many).
let configLoaded = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
peekSettings.subscribe((s) => {
  if (!configLoaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void api.setPeek(s).catch(() => {}), 300);
});

/** Called once at startup with `config.peek`. */
export function applyPeekConfig(cfg: PeekConfig | undefined): void {
  configLoaded = false;
  peekSettings.set({ ...PEEK_DEFAULTS, ...cfg });
  configLoaded = true;
}

/** On while the compact window is showing. */
export const peekMode = writable(false);
/** Called once Peek has fully closed and the full window is back (its native transparency restored). Mica
 * (`mica.ts`) re-applies itself here: it cannot do that from the `peekMode` change, which comes first. */
export const onPeekLeft = new Set<() => void>();
/** The matching form of the section's title (date-insensitive), or null when not in Peek. */
export const peekTarget = writable<string | null>(null);
/** Lines the section needs right now (reported by the editor), for fit-to-section sizing. */
export const peekFitLines = writable(0);
/** Header overlay expanded: true while the pointer is over the window in "hover" and "never" modes. */
export const peekHeaderExpanded = writable(false);
/** True while renaming an ad-hoc call section in the header bar. */
export const peekRenaming = writable(false);
export function startPeekRename(): void {
  peekRenaming.set(true);
}
export function cancelPeekRename(): void {
  peekRenaming.set(false);
}
/** Renames the current ad-hoc call section. Returns true if renamed, false if ignored/cancelled/duplicate. */
export function renamePeekSection(subject: string): boolean {
  if (!get(peekMode)) return false;
  const currentTarget = get(peekTarget);
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  if (!currentTarget || !tab) {
    peekRenaming.set(false);
    return false;
  }

  const content = editorApi?.getContent ? editorApi.getContent() : tab.content;
  const lines = content.split("\n");
  const range = findSectionRange(lines, currentTarget);
  if (!range) {
    peekRenaming.set(false);
    return false;
  }

  const trimmed = subject.trim();
  if (!trimmed) {
    peekRenaming.set(false);
    return false;
  }

  const newTitle = `'${trimmed}`;
  const oldTitle = lines[range.titleLine].trim();
  const oldSubject = oldTitle.replace(/^['’]/, "").trim();
  if (trimmed === oldSubject || newTitle === oldTitle) {
    peekRenaming.set(false);
    return false;
  }

  const newMatchingForm = titleForMatching(normalizeHeaderTitle(newTitle));
  const otherSections = listSections(lines).filter((s) => s.titleLine !== range.titleLine);
  const exists = otherSections.some(
    (s) => titleForMatching(normalizeHeaderTitle(s.title)).toLowerCase() === newMatchingForm.toLowerCase(),
  );
  if (exists) {
    showToast(get(t)("peek.toast.titleExists", undefined));
    peekRenaming.set(false);
    return false;
  }

  // ORDER MATTERS: Peek ends as soon as no section matches peekTarget (stayInSection in wirePeek).
  // First update peekTarget, then execute the programmatic CodeMirror replaceLines transaction.
  peekRenaming.set(false);
  peekTarget.set(newMatchingForm);
  const replacement = `${newTitle}\n${underlineFor(newTitle)}`;
  if (editorApi?.replaceLines) {
    editorApi.replaceLines(range.titleLine, range.titleLine + 1, replacement);
  } else {
    const newLines = retitleSection(lines, range, newTitle);
    tabs.set(writeTabContent(tab.id, newLines.join("\n"), get(tabs)));
  }
  void refreshPosition();
  return true;
}
/** True while Peek is "in focus": you typed, clicked or moved the pointer over it less than `fadeSeconds` ago. The
 * background then uses `opacityHover`; otherwise (and after the fade) `opacity`. */
export const peekInFocus = writable(false);
/** Position of the shown occurrence among all occurrences of the section (1-based), for the header. */
export const peekPosition = writable<{ index: number; total: number } | null>(null);

let windowController: ReturnType<typeof createPeekWindowController> | null = null;
const controller = async () => {
  windowController ??= createPeekWindowController(await nativePeekWindow());
  return windowController;
};

const desktop = () => get(backendKind) === "desktop";

function logicalHeight(s: PeekSettings, fit: number): number {
  const rows = s.lines > 0 ? s.lines : Math.min(Math.max(fit, 3), PEEK_MAX_FIT_LINES);
  return Math.round(rows * get(fontSize) * get(lineHeight) + headerPx(s.header) + EDITOR_PADDING_PX);
}

async function refreshPosition(): Promise<string[]> {
  const target = get(peekTarget);
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  if (!target || !tab) {
    peekPosition.set(null);
    return [];
  }
  const files = await occurrenceFiles(target);
  const index = files.indexOf(tab.filename);
  peekPosition.set(index >= 0 ? { index: index + 1, total: files.length } : null);
  return files;
}

export function togglePeek(): void {
  if (!desktop()) return;
  if (get(peekMode)) leavePeek();
  else void enterPeek();
}

/** What Peek needs to tidy up when it ends: the tab it was started from, every tab it showed (id -> its content
 * the first time Peek showed it, to tell afterwards whether you edited it), and which of those Peek had to open.
 * Leaving Peek takes you back to the note you started from and closes the notes Peek opened, so stepping through a
 * section's history leaves no pile of tabs behind. A note you edited is never closed, and if you are on one you
 * edited you stay on it. */
let peekOrigin: string | null = null;
const peekSeen = new Map<string, string>();
const peekOpened = new Set<string>();

function tidyTabsAfterPeek(keepTabs: boolean): void {
  const origin = peekOrigin;
  const seen = new Map(peekSeen);
  const opened = new Set(peekOpened);
  peekOrigin = null;
  peekSeen.clear();
  peekOpened.clear();
  if (keepTabs) return;
  const open = get(tabs);
  const edited = (id: string) => {
    const now = open.find((x) => x.id === id);
    return !!now && seen.has(id) && now.content !== seen.get(id);
  };
  const active = get(activeTabId);
  if (origin && active !== origin && !edited(active) && open.some((x) => x.id === origin)) switchTab(origin);
  for (const id of opened) if (open.some((x) => x.id === id) && !edited(id)) closeTab(id);
}

/** `section`: the (matching form of the) title of the section to show; without it Peek shows the section the caret is in. */
export async function enterPeek(section?: string): Promise<boolean> {
  if (!desktop() || get(peekMode)) return false;
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  if (!tab) return false;
  const cursor = editorApi ? editorApi.getCursorLineIdx() : 0;
  const target =
    section ?? titleForMatching(normalizeHeaderTitle(getSectionHeaderForLine(tab.content.split("\n"), cursor)));
  if (!target) {
    showToast(get(t)("peek.toast.noSection", undefined));
    return false;
  }
  if (get(isZenMode)) {
    // Leave Zen and let its window changes finish first: while it is still fullscreen the window reports the whole
    // monitor as its size, and that would be remembered as the size to come back to.
    isZenMode.set(false);
    await tick();
    await whenZenSettled();
  }
  peekHeaderExpanded.set(false);
  peekRenaming.set(false);
  peekOrigin = tab.id;
  peekSeen.clear();
  peekOpened.clear();
  peekTarget.set(target);
  peekFitLines.set(0);
  peekMode.set(true);
  void refreshPosition();
  return true;
}

/** `keepTabs`: leave the tabs exactly as they are (no return to the starting note, no closing of the notes Peek opened).
 * Used when a drawer or dialog opens: it works on the note you were looking at. */
export function leavePeek(options: { keepTabs?: boolean } = {}): void {
  if (!get(peekMode)) return;
  peekRenaming.set(false);
  const target = get(peekTarget);
  const shownTab = get(activeTabId);
  const caret = editorApi ? editorApi.getCursorLineIdx() : null;
  peekMode.set(false);
  peekTarget.set(null);
  peekPosition.set(null);
  tidyTabsAfterPeek(options.keepTabs === true);
  // The caret goes to the section Peek was showing (see `restoreCaretAfterPeek`). Not when a dialog opened Peek's end:
  // the dialog has the focus.
  pendingExit = null;
  if (options.keepTabs === true || !target) return;
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  const line = tab ? exitCaretLine(tab.content.split("\n"), target, tab.id === shownTab, caret) : null;
  if (tab && line !== null) pendingExit = { tabId: tab.id, line, exact: tab.id === shownTab && line === caret };
}

/** Where the caret goes once the window is back to full size (set by `leavePeek`). */
let pendingExit: { tabId: string; line: number; exact: boolean } | null = null;

/** Puts the caret in the section Peek was showing and scrolls it into view: the full-size editor still has the small
 * window's scroll position, which can have the section off screen. */
function restoreCaretAfterPeek(): void {
  const exit = pendingExit;
  pendingExit = null;
  if (!exit || get(peekMode) || get(activeTabId) !== exit.tabId) return;
  // The caret is already where it was in the section: leave it (and its column), only bring it into view.
  if (exit.exact && editorApi?.scrollCaretIntoView) editorApi.scrollCaretIntoView();
  else editorApi?.jumpToLine(exit.line);
  editorApi?.focus();
}

/** Alt+Left (-1) / Alt+Right (+1): the previous / next note that has this section. */
export async function stepPeekOccurrence(direction: -1 | 1): Promise<void> {
  if (!get(peekMode)) return;
  const target = get(peekTarget);
  if (!target) return;
  const shown = await stepToOccurrence(target, direction);
  if (shown) {
    const tab = get(tabs).find((x) => x.id === shown.tabId);
    if (tab && !peekSeen.has(tab.id)) {
      peekSeen.set(tab.id, tab.content);
      if (shown.opened) peekOpened.add(tab.id);
    }
  }
  void refreshPosition();
}

/** Past / today / future for the shown note, as the tab strip colours it. */
export function peekDateClass(
  filename: string | undefined,
  today: string = todayISO(),
): "past" | "today" | "future" | "" {
  if (!filename || !/^\d{4}-\d{2}-\d{2}/.test(filename)) return "";
  const date = filename.slice(0, 10);
  return date < today ? "past" : date > today ? "future" : "today";
}

/** Starts reacting to Peek being turned on/off and to its settings. Call once at startup; returns a cleanup. */
export function wirePeek(): () => void {
  if (!desktop()) return () => {};
  const cleanups: (() => void)[] = [];
  let applied = false;
  let lastLines = -1;
  let lastHeader: PeekHeader = get(peekSettings).header;

  // "In focus" while you are working in Peek: typing, clicking or moving the pointer over it makes the background take
  // `opacityHover`; `fadeSeconds` later without any of those it fades to `opacity` (0 = never fades). A pointer that
  // rests on the window, or one that leaves it, is not activity: the countdown just runs on.
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  const markActive = () => {
    if (!get(peekMode)) return;
    if (!get(peekInFocus)) peekInFocus.set(true);
    clearTimeout(fadeTimer);
    const seconds = get(peekSettings).fadeSeconds;
    if (seconds > 0) fadeTimer = setTimeout(() => peekInFocus.set(false), seconds * 1000);
  };

  cleanups.push(
    peekMode.subscribe((on) => {
      if (on === applied) return;
      applied = on;
      if (on) {
        markActive(); // starting Peek counts as activity
        showHeaderAtStart();
      }
      void (async () => {
        const win = await controller();
        const s = get(peekSettings);
        if (on) {
          lastLines = s.lines;
          await win.enter({
            geometry: s.geometry,
            logicalWidth: 420,
            logicalHeight: logicalHeight(s, get(peekFitLines)),
            forceHeight: s.lines === 0 || s.geometry === null || s.useLinesHeight,
            alwaysOnTop: s.alwaysOnTop,
          });
        } else {
          peekHeaderExpanded.set(false);
          clearTimeout(introTimer);
          clearTimeout(fadeTimer);
          peekInFocus.set(false);
          const compact = await win.leave();
          if (compact) peekSettings.update((x) => ({ ...x, geometry: compact, useLinesHeight: false }));
          await tick();
          restoreCaretAfterPeek();
          onPeekLeft.forEach((f) => f());
        }
      })();
    }),
  );

  // Peek is a very small window: a drawer or dialog opened by its shortcut would not fit in it. So opening any
  // modal ends Peek and the modal appears in the full window. The tabs stay as they are, because the modal works on
  // the note you were looking at (Section History opened from a past occurrence, for instance).
  cleanups.push(
    modal.subscribe((m) => {
      if (m !== "none" && get(peekMode)) leavePeek({ keepTabs: true });
    }),
  );

  // Peek stays in the section it was opened from. If the note on screen no longer has that section (another
  // note was switched to, or its text was replaced from outside), Peek ends: to work elsewhere, leave Peek.
  const stayInSection = () => {
    if (!get(peekMode)) return;
    const target = get(peekTarget);
    const tab = get(tabs).find((x) => x.id === get(activeTabId));
    if (!target || !tab || !findSectionRange(tab.content.split("\n"), target)) leavePeek();
  };
  cleanups.push(tabs.subscribe(stayInSection), activeTabId.subscribe(stayInSection));

  // Header strip overlay in "hover" and "never" modes: the window never changes size and content never moves.
  // The header (full bar in "hover", thin strip in "never") is drawn over the top of the content
  // (`peekHeaderExpanded` -> `.peek-bar.overlay`):
  //  - when Peek starts, so you can see which section opened; it goes again after the fade time (`fadeSeconds`, the
  //    same countdown as the background fade) unless the pointer is on the window;
  //  - while the pointer is over the window;
  //  - but NOT while you type: a key press hides it at once (it covers the top lines, where you may be typing), and
  //    moving the pointer brings it back.
  const overlayHeader = () => {
    const header = get(peekSettings).header;
    return header === "hover" || header === "never";
  };
  const setHeaderExpanded = (on: boolean) => {
    if (!get(peekMode) || !overlayHeader()) return;
    if (get(peekHeaderExpanded) !== on) peekHeaderExpanded.set(on);
  };
  let pointerInside = false;
  let introTimer: ReturnType<typeof setTimeout> | undefined;
  function showHeaderAtStart() {
    clearTimeout(introTimer);
    // The window has just shrunk and moved: where the pointer is now is unknown until it enters or moves.
    pointerInside = false;
    lastScreen = null;
    setHeaderExpanded(true);
    const seconds = get(peekSettings).fadeSeconds;
    if (seconds > 0) {
      introTimer = setTimeout(() => {
        if (!pointerInside) setHeaderExpanded(false);
      }, seconds * 1000);
    }
  }
  // Collapsing waits a moment and is cancelled by any pointer movement over the window: resizing moves the window
  // under a pointer that stands still, and the enter/leave events that causes must not flap the strip.
  let collapseTimer: ReturnType<typeof setTimeout> | undefined;
  const onPointerEnter = () => {
    pointerInside = true;
    clearTimeout(collapseTimer);
    markActive();
    setHeaderExpanded(true);
  };
  const onPointerLeave = () => {
    pointerInside = false;
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => setHeaderExpanded(false), COLLAPSE_DELAY_MS);
  };
  // Only a real movement counts: Chromium also sends a mousemove when the page scrolls or changes under a pointer that
  // stands still (typing does that), and that must not bring the header back. Screen coordinates, because the window
  // itself can move under the pointer.
  let lastScreen: { x: number; y: number } | null = null;
  const onPointerMove = (e: MouseEvent) => {
    pointerInside = true;
    clearTimeout(collapseTimer);
    markActive();
    const moved = !lastScreen || lastScreen.x !== e.screenX || lastScreen.y !== e.screenY;
    lastScreen = { x: e.screenX, y: e.screenY };
    if (moved) setHeaderExpanded(true);
  };
  // Typing hides the header. Shortcuts (Ctrl/Alt/Cmd + key) and modifier keys on their own are not typing, and the
  // call-name field keeps the bar while you type in it.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!get(peekMode) || !overlayHeader() || get(peekRenaming)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"].includes(e.key)) return;
    clearTimeout(introTimer);
    clearTimeout(collapseTimer);
    setHeaderExpanded(false);
  };
  document.documentElement.addEventListener("mouseenter", onPointerEnter);
  document.documentElement.addEventListener("mouseleave", onPointerLeave);
  document.documentElement.addEventListener("mousemove", onPointerMove);
  document.addEventListener("keydown", onKeyDown, true);
  // Typing, clicking and scrolling are activity too (capture phase: the editor handles these keys itself).
  const activityEvents = ["keydown", "mousedown", "wheel"] as const;
  for (const name of activityEvents) document.addEventListener(name, markActive, true);
  cleanups.push(() => {
    clearTimeout(collapseTimer);
    clearTimeout(introTimer);
    clearTimeout(fadeTimer);
    document.documentElement.removeEventListener("mouseenter", onPointerEnter);
    document.documentElement.removeEventListener("mouseleave", onPointerLeave);
    document.documentElement.removeEventListener("mousemove", onPointerMove);
    document.removeEventListener("keydown", onKeyDown, true);
    for (const name of activityEvents) document.removeEventListener(name, markActive, true);
  });
  // A changed fade time applies to the countdown that is running now.
  let lastFade = get(peekSettings).fadeSeconds;
  cleanups.push(
    peekSettings.subscribe((s) => {
      if (s.fadeSeconds === lastFade) return;
      lastFade = s.fadeSeconds;
      markActive();
    }),
  );

  // The "lines" setting (or the section growing in fit mode) resizes the window live.
  const resize = () => {
    if (!get(peekMode)) return;
    const s = get(peekSettings);
    if (s.lines !== 0 && s.lines === lastLines && s.header === lastHeader) return;
    lastHeader = s.header;
    if (s.lines !== lastLines && !s.useLinesHeight) {
      lastLines = s.lines;
      peekSettings.update((x) => ({ ...x, useLinesHeight: true }));
    }
    lastLines = s.lines;
    void controller().then((w) => w.setLogicalHeight(logicalHeight(s, get(peekFitLines))));
  };
  cleanups.push(peekSettings.subscribe(resize), peekFitLines.subscribe(resize));

  cleanups.push(
    peekSettings.subscribe((s) => {
      if (get(peekMode)) void controller().then((w) => w.setAlwaysOnTop(s.alwaysOnTop));
    }),
  );

  // Peek is part of the desktop app: its in-app shortcut is listed and active from startup (it stays off on the web).
  setShortcutEnabled("togglePeekMode", true);

  // Peek on the section at the caret is an in-app shortcut only (`togglePeekMode`, Ctrl+Shift+P). The one system-wide
  // Peek shortcut is the call-note one (`callNote.ts`): it also leaves Peek when it is showing.

  return () => cleanups.forEach((c) => c());
}

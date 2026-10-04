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
import { findSectionRange } from "./peekSection";
import { setShortcutEnabled } from "./shortcuts";
import { getSectionHeaderForLine, normalizeHeaderTitle, titleForMatching } from "./tokens";

export type PeekHeaderMode = PeekHeader;
/** The Peek settings, as stored in `config.json` (`PeekConfig`, generated from Rust). */
export type PeekSettings = PeekConfig;

export { PEEK_DEFAULTS };
/** Most rows "fit the whole section" mode grows to. */
export const PEEK_MAX_FIT_LINES = 20;
/** Logical px of the header strip: the full strip, or the thin colour/drag strip it collapses to (when hidden, and
 * in "on hover" mode until the pointer is over the window). */
const HEADER_FULL_PX = 30;
const HEADER_THIN_PX = 16;
/** How long the pointer must be away before the "on hover" strip collapses again. */
const COLLAPSE_DELAY_MS = 150;
/** Plus the editor's own padding. */
const EDITOR_PADDING_PX = 12;
const headerPx = (header: PeekHeader, expanded: boolean) =>
  header === "always" || (header === "hover" && expanded) ? HEADER_FULL_PX : HEADER_THIN_PX;

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
/** The matching form of the section's title (date-insensitive), or null when not in Peek. */
export const peekTarget = writable<string | null>(null);
/** Lines the section needs right now (reported by the editor), for fit-to-section sizing. */
export const peekFitLines = writable(0);
/** "On hover" header: true while the pointer is over the window and the thin strip has grown into the full header. */
export const peekHeaderExpanded = writable(false);
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
  return Math.round(rows * get(fontSize) * get(lineHeight) + headerPx(s.header, get(peekHeaderExpanded)) + EDITOR_PADDING_PX);
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
  if (!get(peekSettings).enabled) return;
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

export async function enterPeek(): Promise<boolean> {
  if (!desktop() || !get(peekSettings).enabled || get(peekMode)) return false;
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  if (!tab) return false;
  const cursor = editorApi ? editorApi.getCursorLineIdx() : 0;
  const target = titleForMatching(normalizeHeaderTitle(getSectionHeaderForLine(tab.content.split("\n"), cursor)));
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
  peekMode.set(false);
  peekTarget.set(null);
  peekPosition.set(null);
  tidyTabsAfterPeek(options.keepTabs === true);
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

  cleanups.push(
    peekMode.subscribe((on) => {
      if (on === applied) return;
      applied = on;
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
          // Leaving with the hover header expanded: collapse it first so the remembered height is the collapsed one.
          if (get(peekHeaderExpanded)) await win.resizeKeepingBottom(-(HEADER_FULL_PX - HEADER_THIN_PX));
          peekHeaderExpanded.set(false);
          const compact = await win.leave();
          if (compact) peekSettings.update((x) => ({ ...x, geometry: compact, useLinesHeight: false }));
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

  // Header strip "on hover": the thin strip grows into the full header while the pointer is over the window, and
  // the window grows UPWARD by the difference so its bottom edge (and the text) does not move.
  const setHeaderExpanded = (on: boolean) => {
    if (!get(peekMode) || get(peekSettings).header !== "hover" || get(peekHeaderExpanded) === on) return;
    peekHeaderExpanded.set(on);
    const delta = HEADER_FULL_PX - HEADER_THIN_PX;
    void controller().then((w) => w.resizeKeepingBottom(on ? delta : -delta));
  };
  // Collapsing waits a moment and is cancelled by any pointer movement over the window: resizing moves the window
  // under a pointer that stands still, and the enter/leave events that causes must not flap the strip.
  let collapseTimer: ReturnType<typeof setTimeout> | undefined;
  const onPointerEnter = () => {
    clearTimeout(collapseTimer);
    setHeaderExpanded(true);
  };
  const onPointerLeave = () => {
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => setHeaderExpanded(false), COLLAPSE_DELAY_MS);
  };
  const onPointerMove = () => clearTimeout(collapseTimer);
  document.documentElement.addEventListener("mouseenter", onPointerEnter);
  document.documentElement.addEventListener("mouseleave", onPointerLeave);
  document.documentElement.addEventListener("mousemove", onPointerMove);
  cleanups.push(() => {
    clearTimeout(collapseTimer);
    document.documentElement.removeEventListener("mouseenter", onPointerEnter);
    document.documentElement.removeEventListener("mouseleave", onPointerLeave);
    document.documentElement.removeEventListener("mousemove", onPointerMove);
  });

  // The "lines" setting (or the section growing in fit mode) resizes the window live.
  const resize = () => {
    if (!get(peekMode)) return;
    const s = get(peekSettings);
    if (s.lines !== 0 && s.lines === lastLines) return;
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
      if (s.enabled) void controller().then((w) => w.setAlwaysOnTop(s.alwaysOnTop));
    }),
  );

  // The feature toggle: while off, Peek has no shortcut anywhere and nothing about it runs; turning it off while
  // Peek is showing ends Peek.
  cleanups.push(
    peekSettings.subscribe((s) => {
      setShortcutEnabled("togglePeekMode", s.enabled);
      if (!s.enabled && get(peekMode)) leavePeek();
    }),
  );

  // Global shortcut: works while another app (the call) has the focus.
  let registered: string | null = null;
  const bindShortcut = async (accelerator: string) => {
    if (!accelerator && !registered) return; // switched off and never registered: nothing to do, nothing to load
    if (registered === accelerator) return;
    try {
      const gs = await import("@tauri-apps/plugin-global-shortcut");
      if (registered) await gs.unregister(registered).catch(() => {});
      registered = null;
      if (!accelerator) return;
      await gs.register(accelerator, (e) => {
        if (e.state === "Pressed") togglePeek();
      });
      registered = accelerator;
    } catch {
      // Taken by another app or not available: the in-app shortcut still works.
    }
  };
  cleanups.push(peekSettings.subscribe((s) => void bindShortcut(s.enabled ? s.shortcut : "")));

  return () => cleanups.forEach((c) => c());
}

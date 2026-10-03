/** Peek mode: a compact, see-through, always-on-top note window for taking notes during a call.
 *
 * It is the normal window shrunk, not a second window, so there is one editor and one document: whatever you type
 * is a normal edit with normal autosave. Peek shows only the section the cursor was in when you started it;
 * Alt+Left / Alt+Right switch to the previous / next occurrence of that section by opening that day's note in the
 * normal tab machinery (so a past occurrence is editable and the tab's grey/blue/green says past/today/future). The
 * window handling lives in `peekWindow.ts`, the one-section editor view in `editor/sectionFocus.ts`.
 *
 * Settings are per-device conveniences kept in localStorage for now (this is an experiment; if it stays they move
 * into config.json like the other settings). */
import { get, writable } from "svelte/store";
import { t } from "./i18n";
import { todayISO } from "./date";
import { extractSectionBody } from "./history";
import { refreshAllNotesCache } from "./persistence";
import { jumpToFileLine } from "./tabs";
import { createPeekWindowController, nativePeekWindow, type PeekGeometry } from "./peekWindow";
import {
  activeTabId,
  allNotesCache,
  backendKind,
  editorApi,
  fontSize,
  isZenMode,
  lineHeight,
  showToast,
  tabs,
} from "./stores";
import { getSectionHeaderForLine, normalizeHeaderTitle, titleForMatching } from "./tokens";

export type PeekHeaderMode = "always" | "hover" | "never";

export interface PeekSettings {
  /** Height in lines; 0 = fit the whole section (up to `PEEK_MAX_FIT_LINES`). */
  lines: number;
  /** Background opacity in percent (text is always fully opaque). */
  opacity: number;
  alwaysOnTop: boolean;
  header: PeekHeaderMode;
  /** Global shortcut (Tauri accelerator syntax). */
  shortcut: string;
  /** Where the compact window was last left, physical pixels. */
  geometry: PeekGeometry | null;
  /** The "lines" setting changed since the window was last left: use it for the height, not the remembered one. */
  useLinesHeight: boolean;
}

export const PEEK_MAX_FIT_LINES = 20;
export const PEEK_DEFAULTS: PeekSettings = {
  lines: 6,
  opacity: 70,
  alwaysOnTop: true,
  header: "always",
  shortcut: "CommandOrControl+F11",
  geometry: null,
  useLinesHeight: false,
};
/** Chrome around the text in logical px: the header strip plus the editor's own padding. */
const CHROME_PX = 30 + 12;
const STORAGE_KEY = "chrononote.peek";

function loadSettings(): PeekSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...PEEK_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // Private window / blocked storage: defaults.
  }
  return { ...PEEK_DEFAULTS };
}

export const peekSettings = writable<PeekSettings>(loadSettings());
peekSettings.subscribe((s) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Not persisted; the session still works.
  }
});

/** On while the compact window is showing. */
export const peekMode = writable(false);
/** The matching form of the section's title (date-insensitive), or null when not in Peek. */
export const peekTarget = writable<string | null>(null);
/** Lines the section needs right now (reported by the editor), for fit-to-section sizing. */
export const peekFitLines = writable(0);
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
  return Math.round(rows * get(fontSize) * get(lineHeight) + CHROME_PX);
}

/** Dated notes that contain the section, oldest first: disk notes overlaid with what the open tabs hold. */
async function occurrenceFiles(target: string): Promise<string[]> {
  await refreshAllNotesCache();
  const sources: Record<string, string> = { ...get(allNotesCache) };
  for (const tab of get(tabs)) if (!tab.isScratchpad) sources[tab.filename] = tab.content;
  return Object.keys(sources)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f))
    .sort()
    .filter((f) => extractSectionBody(sources[f].split("\n"), target) !== null);
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
  if (get(peekMode)) leavePeek();
  else void enterPeek();
}

export async function enterPeek(): Promise<boolean> {
  if (!desktop() || get(peekMode)) return false;
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  if (!tab) return false;
  const cursor = editorApi ? editorApi.getCursorLineIdx() : 0;
  const target = titleForMatching(normalizeHeaderTitle(getSectionHeaderForLine(tab.content.split("\n"), cursor)));
  if (!target) {
    showToast(get(t)("peek.toast.noSection", undefined));
    return false;
  }
  isZenMode.set(false);
  peekTarget.set(target);
  peekFitLines.set(0);
  peekMode.set(true);
  void refreshPosition();
  return true;
}

export function leavePeek(): void {
  if (!get(peekMode)) return;
  peekMode.set(false);
  peekTarget.set(null);
  peekPosition.set(null);
}

/** Alt+Left (-1) / Alt+Right (+1): the previous / next note that has this section. */
export async function stepPeekOccurrence(direction: -1 | 1): Promise<void> {
  if (!get(peekMode)) return;
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  const target = get(peekTarget);
  if (!tab || !target) return;
  const files = await refreshPosition();
  const index = files.indexOf(tab.filename);
  const next = files[index + direction];
  if (index < 0 || !next) return;
  const openTab = get(tabs).find((x) => x.filename === next && !x.isScratchpad);
  const sourceLines = openTab?.content.split("\n") ?? (get(allNotesCache)[next] ?? "").split("\n");
  const body = extractSectionBody(sourceLines, target);
  await jumpToFileLine({ tabId: openTab?.id, filename: next, lineIdx: body ? body.startLineIdx : 0 });
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
          const compact = await win.leave();
          if (compact) peekSettings.update((x) => ({ ...x, geometry: compact, useLinesHeight: false }));
        }
      })();
    }),
  );

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
      void controller().then((w) => w.setAlwaysOnTop(s.alwaysOnTop));
    }),
  );

  // Global shortcut: works while another app (the call) has the focus.
  let registered: string | null = null;
  const bindShortcut = async (accelerator: string) => {
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
  cleanups.push(peekSettings.subscribe((s) => void bindShortcut(s.shortcut)));

  return () => cleanups.forEach((c) => c());
}

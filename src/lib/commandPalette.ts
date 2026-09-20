/** §107: the unified command palette (Ctrl/Cmd+K). A fast-path layer over
 * the features that already have their own shortcuts and drawers —
 * nothing here is the *only* way to do anything. Split out of
 * `controller.ts` like the other feature modules.
 *
 * Prefix routing on the query:
 *   (none)  commands + open-tab titles
 *   >       application commands only
 *   ! or #  open actions across every daily note
 *   @       date navigation (the `parseDateQuery` grammar + recent dates)
 *   ?       hand off to the keyboard-shortcuts drawer
 */
import { get } from "svelte/store";
import {
  activeTabId,
  agendaFileExists,
  allNotesCache,
  backendKind,
  calendarSyncEnabled,
  colorMode,
  closeAllModals,
  editorApi,
  type EditorApi,
  modal,
  oneDriveAccount,
  oneDriveFolder,
  readableLineLength,
  tabs,
  wordWrap,
} from "./stores";
import { sortFilenamesByRecency } from "./tabSort";
import { refreshAllNotesCache } from "./persistence";
import { openActionLineIndices, stripLeadingToken } from "./tokens";
import { parseDateQuery } from "./date";
import {
  commitDatePick,
  createScratchpad,
  cycleTab,
  jumpToFileLine,
  openDatePicker,
  reopenLastClosedTab,
  requestTabClose,
  switchTab,
} from "./tabs";
import { openActionDrawer } from "./actions";
import { openMeetingHistory } from "./history";
import { openCrossTabSearch } from "./search";
import { canSyncCalendarForActiveTab, syncCalendarFromFile } from "./calendarSyncActions";
import { openAbout, openGlyphLegend, openSettings, openShortcutsHelp } from "./menu";
import { setColorMode, setReadableLineLength, setWordWrap } from "./boot";
import { checkForUpdates } from "./updates";
import { formatCombo, formatShortcut, shortcutById } from "./shortcuts";
import { exportAllNotesToFile } from "./exportImport";

export interface PaletteItem {
  /** Stable key for keyed `{#each}`. */
  id: string;
  /** Left-hand label. */
  label: string;
  /** Right-hand hint (a shortcut, a filename, a date…). */
  hint?: string;
  /** Grouping header this item sits under. */
  group: string;
  /** Matched character indices within `label` for highlight rendering. */
  matchedIndices?: number[];
  /** Run it. The palette closes first. */
  run: () => void | Promise<void>;
}

export interface FuzzyMatchResult {
  matches: boolean;
  score: number;
  indices: number[];
}

export function fuzzyMatchWithIndices(haystack: string, needle: string): FuzzyMatchResult | null {
  if (!needle) return { matches: true, score: 0, indices: [] };
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const indices: number[] = [];
  let i = 0;
  for (let j = 0; j < h.length; j++) {
    if (h[j] === n[i]) {
      indices.push(j);
      i++;
      if (i === n.length) break;
    }
  }
  if (i < n.length) return null;
  return { matches: true, score: indices.length, indices };
}

export function splitHighlighted(
  text: string,
  indices?: number[],
): Array<{ text: string; highlight: boolean }> {
  if (!text) return [];
  if (!indices || indices.length === 0) return [{ text, highlight: false }];

  const indexSet = new Set(indices.filter((idx) => idx >= 0 && idx < text.length));
  if (indexSet.size === 0) return [{ text, highlight: false }];

  const segments: Array<{ text: string; highlight: boolean }> = [];
  let currentHighlight = indexSet.has(0);
  let currentText = text[0];

  for (let i = 1; i < text.length; i++) {
    const isHi = indexSet.has(i);
    if (isHi === currentHighlight) {
      currentText += text[i];
    } else {
      segments.push({ text: currentText, highlight: currentHighlight });
      currentHighlight = isHi;
      currentText = text[i];
    }
  }
  segments.push({ text: currentText, highlight: currentHighlight });
  return segments;
}

export let paletteSelectionSnapshot: { anchor: number; head: number } | null = null;

export function openCommandPalette() {
  paletteSelectionSnapshot = editorApi?.getSelectionRange ? editorApi.getSelectionRange() : null;
  modal.set("commandPalette");
}

export function runPaletteLineAction(actionFn: (api: EditorApi) => boolean | void): boolean {
  closeAllModals();
  const api = editorApi;
  if (!api) return false;
  api.focus();
  if (paletteSelectionSnapshot && api.setSelectionRange) {
    api.setSelectionRange(paletteSelectionSnapshot);
  }
  return !!actionFn(api);
}

/** Every static "do a thing" command. Rebuilt on each call so the
 * toggle labels reflect current state. */
function commandItems(): PaletteItem[] {
  const wrap = get(wordWrap);
  const readable = get(readableLineLength);
  const color = get(colorMode);
  return [
    { id: "cmd-scratch", label: "New scratchpad", hint: formatShortcut("newScratchpad"), group: "Commands", run: createScratchpad },
    {
      id: "cmd-reopen",
      label: "Reopen last closed tab",
      hint: formatShortcut("reopenClosedTab"),
      group: "Commands",
      run: reopenLastClosedTab,
    },
    {
      id: "cmd-close",
      label: "Close current tab",
      // Just the key combo here, not `formatShortcut`'s "/ middle-click"
      // — that's the Shortcuts drawer's fuller description; a palette
      // hint tag wants to stay terse.
      hint: formatCombo(shortcutById("closeTab").combos[0]),
      group: "Commands",
      run: () => requestTabClose(get(activeTabId)),
    },
    // `cycleTab`'s two combos (plain / Shift, next / previous) each need
    // their own hint here — `formatShortcut` joins both together for the
    // Shortcuts drawer's one combined row, which isn't what either of
    // these two separate palette rows wants.
    {
      id: "cmd-next-tab",
      label: "Next tab",
      hint: formatCombo(shortcutById("cycleTab").combos[0]),
      group: "Commands",
      run: () => cycleTab(1),
    },
    {
      id: "cmd-prev-tab",
      label: "Previous tab",
      hint: formatCombo(shortcutById("cycleTab").combos[1]),
      group: "Commands",
      run: () => cycleTab(-1),
    },
    { id: "cmd-date", label: "Open a dated note…", hint: formatShortcut("openDateNote"), group: "Commands", run: openDatePicker },
    { id: "cmd-actions", label: "Actions", hint: formatShortcut("openActions"), group: "Commands", run: openActionDrawer },
    {
      id: "cmd-history",
      label: "Section history",
      hint: formatShortcut("openHistory"),
      group: "Commands",
      run: openMeetingHistory,
    },
    {
      id: "cmd-search",
      label: "Cross-tab search",
      hint: formatShortcut("crossTabSearch"),
      group: "Commands",
      run: openCrossTabSearch,
    },
    // Only listed at all once the feature's turned on in Settings, not
    // available in the web app (no local file to read), and only runnable
    // once the date and agenda-file-existence gates both pass.
    ...(get(calendarSyncEnabled) &&
    (get(backendKind) !== "web" || (!!get(oneDriveAccount) && !!get(oneDriveFolder))) &&
    canSyncCalendarForActiveTab() &&
    get(agendaFileExists)
      ? [
          {
            id: "cmd-sync-calendar",
            label: "Sync calendar for this day",
            hint: formatShortcut("syncCalendar"),
            group: "Commands",
            run: syncCalendarFromFile,
          },
        ]
      : []),
    {
      id: "cmd-export-notes",
      label: "Export all notes to file (.json)",
      hint: "Export",
      group: "Commands",
      run: async () => {
        await exportAllNotesToFile();
      },
    },
    {
      id: "cmd-line-close-open",
      label: "Close open action on current line",
      hint: formatCombo(shortcutById("cycleLineState").combos[0]),
      group: "Current line",
      run: () => runPaletteLineAction((api) => api.closeCurrentOpenAction?.()),
    },
    {
      id: "cmd-line-reopen-done",
      label: "Reopen done action on current line",
      hint: formatCombo(shortcutById("cycleLineStateReverse").combos[0]),
      group: "Current line",
      run: () => runPaletteLineAction((api) => api.reopenCurrentDoneAction?.()),
    },
    {
      id: "cmd-line-section",
      label: "Convert line to section header",
      hint: formatShortcut("convertToSection"),
      group: "Current line",
      run: () => runPaletteLineAction((api) => api.convertCurrentLineToSection?.()),
    },
    {
      id: "cmd-line-set-open",
      label: "Set line/selection to Open",
      hint: formatShortcut("setActionOpen"),
      group: "Current line",
      run: () => runPaletteLineAction((api) => api.setActionStateOnSelection?.("#")),
    },
    {
      id: "cmd-line-set-done",
      label: "Set line/selection to Done",
      hint: formatShortcut("setActionDone"),
      group: "Current line",
      run: () => runPaletteLineAction((api) => api.setActionStateOnSelection?.("v")),
    },
    {
      id: "cmd-line-set-deferred",
      label: "Set line/selection to Deferred",
      hint: formatShortcut("setActionDeferred"),
      group: "Current line",
      run: () => runPaletteLineAction((api) => api.setActionStateOnSelection?.(">")),
    },
    {
      id: "cmd-line-set-wontdo",
      label: "Set line/selection to Won't-Do",
      hint: formatShortcut("setActionWontDo"),
      group: "Current line",
      run: () => runPaletteLineAction((api) => api.setActionStateOnSelection?.("x")),
    },
    {
      id: "cmd-line-jump-next",
      label: "Jump to next open action",
      hint: formatCombo(shortcutById("jumpAction").combos[0]),
      group: "Current line",
      run: () => runPaletteLineAction((api) => api.jumpAdjacentOpenAction?.(1)),
    },
    {
      id: "cmd-line-jump-prev",
      label: "Jump to previous open action",
      hint: formatCombo(shortcutById("jumpAction").combos[1]),
      group: "Current line",
      run: () => runPaletteLineAction((api) => api.jumpAdjacentOpenAction?.(-1)),
    },
    {
      id: "cmd-wrap",
      label: `${wrap ? "Disable" : "Enable"} word wrap`,
      group: "Settings",
      run: () => setWordWrap(!wrap),
    },
    {
      id: "cmd-readable",
      label: `${readable ? "Disable" : "Enable"} readable line width`,
      group: "Settings",
      run: () => setReadableLineLength(!readable),
    },
    {
      id: "cmd-color",
      // Cycles grayscale → color → legacy → grayscale. The label names
      // the *next* palette so it reads as an action.
      label:
        color === "grayscale"
          ? "Switch to colored glyphs"
          : color === "color"
            ? "Switch to legacy glyphs (red / amber / green)"
            : "Switch to grayscale glyphs",
      group: "Settings",
      run: () =>
        setColorMode(color === "grayscale" ? "color" : color === "color" ? "legacy" : "grayscale"),
    },
    { id: "cmd-settings", label: "Settings", hint: formatShortcut("openSettings"), group: "Settings", run: openSettings },
    // Same "two combos, one id" situation as cycleTab above.
    {
      id: "cmd-shortcuts",
      label: "Keyboard shortcuts",
      hint: formatCombo(shortcutById("openShortcutsHelp").combos[0]),
      group: "Help",
      run: openShortcutsHelp,
    },
    {
      id: "cmd-legend",
      label: "Symbols & sections legend",
      hint: formatCombo(shortcutById("openShortcutsHelp").combos[1]),
      group: "Help",
      run: openGlyphLegend,
    },
    { id: "cmd-about", label: "About ChronoNote", hint: formatShortcut("openAbout"), group: "Help", run: openAbout },
    {
      id: "cmd-check-updates",
      label: "Check for updates",
      group: "Help",
      run: () => {
        openAbout();
        void checkForUpdates();
      },
    },
  ];
}

function openTabItems(): PaletteItem[] {
  return get(tabs).map((t) => ({
    id: `tab-${t.id}`,
    label: t.isScratchpad ? t.filename : t.filename.replace(/\.txt$/, ""),
    hint: t.isScratchpad ? "scratchpad" : "open tab",
    group: "Open tabs",
    run: () => switchTab(t.id),
  }));
}

export function fuzzyMatch(haystack: string, needle: string): boolean {
  return fuzzyMatchWithIndices(haystack, needle) !== null;
}

/** Build the visible result list for `query`. Async because the `!`/`#`
 * and `@` modes need the notes cache. */
export async function buildPaletteResults(query: string): Promise<PaletteItem[]> {
  const q = query.trim();

  if (q.startsWith("?")) {
    return [
      {
        id: "help-open",
        label: "Open the keyboard-shortcuts drawer",
        group: "Help",
        run: openShortcutsHelp,
      },
    ];
  }

  if (q.startsWith("!") || q.startsWith("#")) {
    const term = q.slice(1).trim();
    await refreshAllNotesCache();
    const cache = get(allNotesCache);
    const out: PaletteItem[] = [];
    for (const filename of sortFilenamesByRecency(Object.keys(cache))) {
      const lines = cache[filename].split("\n");
      for (const lineIdx of openActionLineIndices(cache[filename])) {
        const text = stripLeadingToken(lines[lineIdx]).trim();
        const label = text || "(empty action)";
        const match = fuzzyMatchWithIndices(label, term);
        if (!match) continue;
        out.push({
          id: `act-${filename}-${lineIdx}`,
          label,
          hint: filename.replace(/\.txt$/, ""),
          group: "Open actions",
          matchedIndices: match.indices,
          run: () => jumpToFileLine({ filename, lineIdx }),
        });
      }
    }
    return out.slice(0, 200);
  }

  if (q.startsWith("@")) {
    const term = q.slice(1).trim();
    const out: PaletteItem[] = [];
    const parsed = parseDateQuery(term);
    if (parsed) {
      const label = `Jump to ${parsed}`;
      const match = fuzzyMatchWithIndices(label, term);
      out.push({
        id: `date-${parsed}`,
        label,
        hint: "date",
        group: "Dates",
        matchedIndices: match ? match.indices : [],
        run: () => commitDatePick(parsed),
      });
    }
    await refreshAllNotesCache();
    for (const filename of sortFilenamesByRecency(Object.keys(get(allNotesCache)))) {
      const d = filename.replace(/\.txt$/, "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      if (out.some((i) => i.id === `date-${d}`)) continue;
      // Date query (@) maintains strict substring matching rather than fuzzy matching
      if (term && !d.includes(term)) continue;
      const idx = term ? d.indexOf(term) : -1;
      const matchedIndices = idx >= 0 ? Array.from({ length: term.length }, (_, k) => idx + k) : [];
      out.push({
        id: `date-${d}`,
        label: d,
        hint: "existing note",
        group: "Dates",
        matchedIndices,
        run: () => commitDatePick(d),
      });
    }
    return out.slice(0, 100);
  }

  const commandsOnly = q.startsWith(">");
  const term = commandsOnly ? q.slice(1).trim() : q;
  const pool = commandsOnly ? commandItems() : [...commandItems(), ...openTabItems()];
  const out: PaletteItem[] = [];
  for (const it of pool) {
    const labelMatch = fuzzyMatchWithIndices(it.label, term);
    if (labelMatch) {
      out.push({ ...it, matchedIndices: labelMatch.indices });
    } else {
      // Pre-existing behaviour: items also match when the query appears across `label + hint`.
      // When matched solely via the hint text, `matchedIndices` is deliberately kept empty so
      // spurious character underlines are not rendered across the label text.
      const fullMatch = fuzzyMatchWithIndices(`${it.label} ${it.hint ?? ""}`, term);
      if (fullMatch) {
        out.push({ ...it, matchedIndices: [] });
      }
    }
  }
  return out;
}

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
import { activeTabId, allNotesCache, colorMode, modal, readableLineLength, tabs, wordWrap } from "./stores";
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
import { openSectionImport } from "./sectionImportActions";
import { openAbout, openGlyphLegend, openSettings, openShortcutsHelp } from "./menu";
import { setColorMode, setReadableLineLength, setWordWrap } from "./boot";

export interface PaletteItem {
  /** Stable key for keyed `{#each}`. */
  id: string;
  /** Left-hand label. */
  label: string;
  /** Right-hand hint (a shortcut, a filename, a date…). */
  hint?: string;
  /** Grouping header this item sits under. */
  group: string;
  /** Run it. The palette closes first. */
  run: () => void | Promise<void>;
}

export function openCommandPalette() {
  modal.set("commandPalette");
}

/** Every static "do a thing" command. Rebuilt on each call so the
 * toggle labels reflect current state. */
function commandItems(): PaletteItem[] {
  const wrap = get(wordWrap);
  const readable = get(readableLineLength);
  const color = get(colorMode);
  return [
    { id: "cmd-scratch", label: "New scratchpad", hint: "Ctrl+N", group: "Commands", run: createScratchpad },
    { id: "cmd-reopen", label: "Reopen last closed tab", hint: "Ctrl+Shift+T", group: "Commands", run: reopenLastClosedTab },
    {
      id: "cmd-close",
      label: "Close current tab",
      hint: "Ctrl+W",
      group: "Commands",
      run: () => requestTabClose(get(activeTabId)),
    },
    { id: "cmd-next-tab", label: "Next tab", hint: "Ctrl+Tab", group: "Commands", run: () => cycleTab(1) },
    { id: "cmd-prev-tab", label: "Previous tab", hint: "Ctrl+Shift+Tab", group: "Commands", run: () => cycleTab(-1) },
    { id: "cmd-date", label: "Open a dated note…", hint: "Ctrl+O", group: "Commands", run: openDatePicker },
    { id: "cmd-actions", label: "Actions", hint: "Ctrl+Shift+A", group: "Commands", run: openActionDrawer },
    { id: "cmd-history", label: "Section history", hint: "Ctrl+Shift+H", group: "Commands", run: openMeetingHistory },
    { id: "cmd-search", label: "Cross-tab search", hint: "Ctrl+Shift+F", group: "Commands", run: openCrossTabSearch },
    { id: "cmd-import", label: "Import sections", hint: "Ctrl+Shift+I", group: "Commands", run: openSectionImport },
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
    { id: "cmd-settings", label: "Settings", hint: "Ctrl+,", group: "Settings", run: openSettings },
    { id: "cmd-shortcuts", label: "Keyboard shortcuts", hint: "Ctrl+/", group: "Help", run: openShortcutsHelp },
    { id: "cmd-legend", label: "Symbols & sections legend", hint: "Ctrl+Shift+/", group: "Help", run: openGlyphLegend },
    { id: "cmd-about", label: "About ChronoNote", hint: "Ctrl+Shift+,", group: "Help", run: openAbout },
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

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i++;
    if (i === n.length) return true;
  }
  return n.length === 0;
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
        if (!fuzzyMatch(text, term)) continue;
        out.push({
          id: `act-${filename}-${lineIdx}`,
          label: text || "(empty action)",
          hint: filename.replace(/\.txt$/, ""),
          group: "Open actions",
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
      out.push({
        id: `date-${parsed}`,
        label: `Jump to ${parsed}`,
        hint: "date",
        group: "Dates",
        run: () => commitDatePick(parsed),
      });
    }
    await refreshAllNotesCache();
    for (const filename of sortFilenamesByRecency(Object.keys(get(allNotesCache)))) {
      const d = filename.replace(/\.txt$/, "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      if (out.some((i) => i.id === `date-${d}`)) continue;
      if (term && !d.includes(term)) continue;
      out.push({
        id: `date-${d}`,
        label: d,
        hint: "existing note",
        group: "Dates",
        run: () => commitDatePick(d),
      });
    }
    return out.slice(0, 100);
  }

  const commandsOnly = q.startsWith(">");
  const term = commandsOnly ? q.slice(1).trim() : q;
  const pool = commandsOnly ? commandItems() : [...commandItems(), ...openTabItems()];
  return pool.filter((it) => fuzzyMatch(`${it.label} ${it.hint ?? ""}`, term));
}

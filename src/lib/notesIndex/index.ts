/** One index of all notes (R1 / S1; design in `docs/design/notes-index-design.md`).
 *
 * Decides, in one place, which text of a note is current (an open tab's, else the disk layer's), counts every
 * scratchpad as an entry of its own, and remembers what is derived from a note's text (`facets.ts`). S1 only
 * builds it; no view reads it yet, and `allNotesCache` keeps being written by `persistence.ts` as before. */
import { derived, type Readable } from "svelte/store";
import { tabs } from "../stores";
import type { NoteTab } from "../types";
import { diskVersion, isShownLoaded, shownNotes } from "./diskLayer";
import { patchTabs, rebuildEntries } from "./entries";

/** One note as the index knows it. Immutable: a changed text gives a new entry. */
export interface NoteEntry {
  key: string; // filename for a dated or named note; "scratchpad:<tabId>" for a scratchpad
  filename: string; // as shown to the user
  dateISO: string | null; // from YYYY-MM-DD.txt, else null
  text: string;
  source: "disk" | "tab"; // where the current text comes from
  tabId?: string;
}

export interface NotesIndex {
  entries: ReadonlyMap<string, NoteEntry>; // by key
  loaded: boolean; // the disk layer has been read once
  revision: number; // goes up when any entry is replaced, added or removed
}

export { ensureLoaded } from "./diskLayer";
export { noteTexts } from "./entries";

let current: NotesIndex = { entries: new Map(), loaded: false, revision: 0 };
let lastTabs: readonly NoteTab[] | null = null;
let lastVersion = -1;

/** Built from `tabs` and the disk layer's version. A change of `tabs` alone patches the previous map (typing in
 * one note replaces one entry); a change of the disk layer rebuilds it, reusing every unchanged entry. Runs only
 * while something subscribes; the state it keeps survives between subscribers. */
export const notesIndex: Readable<NotesIndex> = derived([tabs, diskVersion], ([$tabs, $version]) => {
  const shown = shownNotes();
  const entries =
    lastTabs === null || $version !== lastVersion
      ? rebuildEntries(current.entries, shown, $tabs)
      : patchTabs(current.entries, lastTabs, $tabs, shown);
  lastTabs = $tabs;
  lastVersion = $version;
  const loaded = isShownLoaded();
  if (entries === current.entries && loaded === current.loaded) return current;
  current = {
    entries,
    loaded,
    revision: entries === current.entries ? current.revision : current.revision + 1,
  };
  return current;
});

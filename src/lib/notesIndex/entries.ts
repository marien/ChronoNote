/** The two ways the notes index is built, as pure functions (no stores), so they can be tested alone.
 *
 * The rule, here and only here: a note with an open non-scratchpad tab has the tab's text (`source: "tab"`);
 * otherwise the disk layer's `shown` text (`source: "disk"`). Every scratchpad tab is an entry of its own. */
import type { NoteTab } from "../types";
import type { NoteEntry, NotesIndex } from "./index";

const DATED_FILE = /^(\d{4}-\d{2}-\d{2})\.txt$/;
const SCRATCHPAD_PREFIX = "scratchpad:";

/** The `YYYY-MM-DD` of a `YYYY-MM-DD.txt` filename, else null. */
export function dateISOOfFilename(filename: string): string | null {
  const m = DATED_FILE.exec(filename);
  return m ? m[1] : null;
}

export function scratchpadKey(tabId: string): string {
  return SCRATCHPAD_PREFIX + tabId;
}

export function isScratchpadKey(key: string): boolean {
  return key.startsWith(SCRATCHPAD_PREFIX);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** `prev` when it already says the same (text, source, tabId, filename), else a new entry. */
function entryFor(
  prev: NoteEntry | undefined,
  key: string,
  filename: string,
  text: string,
  source: "disk" | "tab",
  tabId: string | undefined,
): NoteEntry {
  if (
    prev !== undefined &&
    prev.text === text &&
    prev.source === source &&
    prev.tabId === tabId &&
    prev.filename === filename
  ) {
    return prev;
  }
  const entry: NoteEntry = {
    key,
    filename,
    dateISO: isScratchpadKey(key) ? null : dateISOOfFilename(filename),
    text,
    source,
  };
  if (tabId !== undefined) entry.tabId = tabId;
  return entry;
}

function tabEntry(prev: NoteEntry | undefined, tab: NoteTab): NoteEntry {
  return tab.isScratchpad
    ? entryFor(prev, scratchpadKey(tab.id), tab.filename, tab.content, "tab", tab.id)
    : entryFor(prev, tab.filename, tab.filename, tab.content, "tab", tab.id);
}

function sameEntries(a: ReadonlyMap<string, NoteEntry>, b: ReadonlyMap<string, NoteEntry>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, entry] of b) if (a.get(key) !== entry) return false;
  return true;
}

/** From scratch: every disk note without an open tab, every open tab. Reuses every entry of `prev` that says the
 * same. Returns `prev` itself when nothing differs. */
export function rebuildEntries(
  prev: ReadonlyMap<string, NoteEntry>,
  shown: Readonly<Record<string, string>>,
  tabs: readonly NoteTab[],
): ReadonlyMap<string, NoteEntry> {
  const openByName = new Map<string, NoteTab>();
  for (const t of tabs) if (!t.isScratchpad) openByName.set(t.filename, t); // the last tab of a name wins
  const next = new Map<string, NoteEntry>();
  for (const fn of Object.keys(shown)) {
    if (openByName.has(fn)) continue;
    next.set(fn, entryFor(prev.get(fn), fn, fn, shown[fn], "disk", undefined));
  }
  for (const [fn, t] of openByName) next.set(fn, tabEntry(prev.get(fn), t));
  for (const t of tabs) {
    if (t.isScratchpad) {
      const key = scratchpadKey(t.id);
      next.set(key, tabEntry(prev.get(key), t));
    }
  }
  return sameEntries(prev, next) ? prev : next;
}

function keyOfTab(t: NoteTab): string {
  return t.isScratchpad ? scratchpadKey(t.id) : t.filename;
}

/** The entry that `key` has for these tabs and disk texts, or undefined when there is none. */
function resolveKey(
  key: string,
  prevEntry: NoteEntry | undefined,
  shown: Readonly<Record<string, string>>,
  tabs: readonly NoteTab[],
): NoteEntry | undefined {
  let open: NoteTab | undefined;
  for (const t of tabs) if (keyOfTab(t) === key) open = t; // the last tab of a name wins
  if (open) return tabEntry(prevEntry, open);
  if (hasOwn(shown, key)) return entryFor(prevEntry, key, key, shown[key], "disk", undefined);
  return undefined;
}

/** Only `tabs` changed: copy `prev` and replace the entries of the tabs that were added, removed or changed
 * (`content`, `filename` or `isScratchpad`). A removed tab's note falls back to `shown`, or is dropped. Every
 * other entry stays the same object. Returns `prev` itself when nothing differs. */
export function patchTabs(
  prev: ReadonlyMap<string, NoteEntry>,
  prevTabs: readonly NoteTab[],
  tabs: readonly NoteTab[],
  shown: Readonly<Record<string, string>>,
): ReadonlyMap<string, NoteEntry> {
  const prevById = new Map<string, NoteTab>();
  for (const t of prevTabs) prevById.set(t.id, t);
  const currentIds = new Set<string>();
  const affected = new Set<string>();
  for (const t of tabs) {
    currentIds.add(t.id);
    const p = prevById.get(t.id);
    if (p === undefined) {
      affected.add(keyOfTab(t));
    } else if (p.content !== t.content || p.filename !== t.filename || p.isScratchpad !== t.isScratchpad) {
      affected.add(keyOfTab(t));
      affected.add(keyOfTab(p));
    }
  }
  for (const p of prevTabs) if (!currentIds.has(p.id)) affected.add(keyOfTab(p));
  if (affected.size === 0) return prev;

  const next = new Map(prev);
  let changed = false;
  for (const key of affected) {
    const before = prev.get(key);
    const after = resolveKey(key, before, shown, tabs);
    if (after === undefined) {
      if (next.delete(key)) changed = true;
    } else if (after !== before) {
      next.set(key, after);
      changed = true;
    }
  }
  return changed ? next : prev;
}

/** `key → text` of every non-scratchpad entry: what `allNotesCache` holds right after a refresh. */
export function noteTexts(index: NotesIndex): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of index.entries) if (!isScratchpadKey(key)) out[key] = entry.text;
  return out;
}

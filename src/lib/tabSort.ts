/** Pure tab/filename ordering helpers, shared by the tab bar, tab
 * cycling, close-successor selection, and the action-drawer / search /
 * history "most recent first" groupings. Split out of `controller.ts` in
 * the v0.5.0 refactor so the several behaviour modules that need them
 * don't have to depend on each other. No state — `NoteTab[]` /
 * `string[]` in, sorted copy out. */
import type { NoteTab } from "./types";

/** Dated tabs sort earliest-to-latest (plain string comparison works
 * since filenames are strict `YYYY-MM-DD.txt`); scratchpads always sort
 * after every dated tab, keeping their existing relative order (stable
 * sort). A display-order concern only — the `tabs` store itself is never
 * reordered, every insertion function keeps appending as before. Used
 * consistently wherever "visual tab order" matters: the tab bar itself,
 * cycling, and picking which tab activates next after a close. */
function compareTabsForDisplay(a: NoteTab, b: NoteTab): number {
  if (a.isScratchpad && b.isScratchpad) return 0;
  if (a.isScratchpad) return 1;
  if (b.isScratchpad) return -1;
  return a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0;
}

export function sortedTabsForDisplay(list: NoteTab[]): NoteTab[] {
  return [...list].sort(compareTabsForDisplay);
}

/** Opposite direction from `compareTabsForDisplay`: most recent dated tab
 * first, scratchpads still last. Used for the action drawer/search "Open
 * Tabs" grouping order, to match "All Files" mode's most-recent-first
 * ordering (see `sortFilenamesByRecency`) rather than the tab bar's own
 * earliest-first convention. */
export function compareTabsByRecency(a: NoteTab, b: NoteTab): number {
  if (a.isScratchpad && b.isScratchpad) return 0;
  if (a.isScratchpad) return 1;
  if (b.isScratchpad) return -1;
  return a.filename < b.filename ? 1 : a.filename > b.filename ? -1 : 0;
}

/** `YYYY-MM-DD.txt` filenames sort chronologically as plain strings, so
 * ascending-then-reverse gives most-recent-first without parsing dates. */
export function sortFilenamesByRecency(filenames: string[]): string[] {
  return [...filenames].sort().reverse();
}

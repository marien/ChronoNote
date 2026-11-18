// Types for changelog-headings.mjs, imported by src/lib/changelogScripts.test.ts and seen-check.mjs.

export interface RawChangelogEntry {
  num: number;
  title: string;
  lines: string[];
}

/** The entry headings in one changelog file's text, trimmed. */
export function headingsIn(text: string): string[];

/** The headings in `currentTexts` that appear in none of `previousTexts`. */
export function newHeadings(currentTexts: string[], previousTexts: string[]): Set<string>;

/** The numbered entries in one changelog file's text, each with its body lines. */
export function entriesIn(text: string): RawChangelogEntry[];

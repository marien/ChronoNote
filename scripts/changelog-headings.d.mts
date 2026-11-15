// Types for changelog-headings.mjs, imported by src/lib/changelogScripts.test.ts.

/** The entry headings in one changelog file's text, trimmed. */
export function headingsIn(text: string): string[];

/** The headings in `currentTexts` that appear in none of `previousTexts`. */
export function newHeadings(currentTexts: string[], previousTexts: string[]): Set<string>;

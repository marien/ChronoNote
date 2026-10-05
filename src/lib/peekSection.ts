/** Peek mode: which lines of a note belong to the section being shown, and what may be edited there.
 *
 * A section runs from its setext title line to the line before the next section's title (or the end of the
 * note). The trailing blank lines are INCLUDED, so a line typed at the end of the section stays visible while you
 * type it. `titleLine` / `lastLine` are 0-based, inclusive. Matching is the same date-insensitive comparison
 * Section History uses, so "Weekly sync - 2026-10-03" and "... - 2026-10-10" are the same recurring section. */
import { isSetextUnderline, normalizeHeaderTitle, titleForMatching } from "./tokens";

export interface SectionRange {
  titleLine: number;
  lastLine: number;
}

export function findSectionRange(lines: readonly string[], targetHeader: string): SectionRange | null {
  const wanted = targetHeader.toLowerCase();
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!isSetextUnderline(lines[i + 1])) continue;
    if (titleForMatching(normalizeHeaderTitle(lines[i].trim())).toLowerCase() !== wanted) continue;
    let lastLine = lines.length - 1;
    for (let j = i + 2; j + 1 < lines.length; j++) {
      if (isSetextUnderline(lines[j + 1])) {
        lastLine = j - 1;
        break;
      }
    }
    return { titleLine: i, lastLine: Math.max(lastLine, i + 1) };
  }
  return null;
}

/** Empty lines kept between the last filled line of a section and the next section's title. */
export const PEEK_MIN_GAP_LINES = 2;

/** How many empty lines to add at the end of the section so that at least `PEEK_MIN_GAP_LINES` separate its last
 * filled line from the next section's title. 0 for the last section of the note (nothing follows it). A section with
 * no text yet counts its empty lines after the underline. */
export function gapLinesNeeded(lines: readonly string[], range: SectionRange): number {
  if (range.lastLine >= lines.length - 1) return 0;
  let blanks = 0;
  for (let i = range.lastLine; i > range.titleLine + 1 && lines[i].trim() === ""; i--) blanks++;
  return Math.max(0, PEEK_MIN_GAP_LINES - blanks);
}

/** The last line Peek draws and lets the caret reach (0-based): the section's last line without the `PEEK_MIN_GAP_LINES`
 * empty lines that separate it from the next section. Those are kept out of the window, so the caret cannot enter them.
 * Always at least the first body line (a line to type on), and the whole section for the last one of a note. */
export function visibleLastLine(lines: readonly string[], range: SectionRange): number {
  if (range.lastLine >= lines.length - 1) return range.lastLine;
  let trailing = 0;
  for (let i = range.lastLine; i > range.titleLine + 1 && lines[i].trim() === ""; i--) trailing++;
  const firstBody = range.titleLine + 2;
  return Math.max(range.lastLine - Math.min(trailing, PEEK_MIN_GAP_LINES), Math.min(firstBody, range.lastLine));
}

/** Where the caret goes when Peek ends: the line it was on if it is still in the section being shown (same note),
 * else the first body line of the section in the note you end up on. null when that note has no such section. */
export function exitCaretLine(
  lines: readonly string[],
  target: string,
  sameNote: boolean,
  caretLine: number | null,
): number | null {
  const range = findSectionRange(lines, target);
  if (!range) return null;
  const bodyStart = Math.min(range.titleLine + 2, lines.length - 1);
  if (sameNote && caretLine !== null && caretLine >= bodyStart && caretLine <= range.lastLine) return caretLine;
  return bodyStart;
}

/** Number of lines Peek needs for the section: its body without trailing blank lines (the title and underline are
 * not drawn in Peek), plus the line being typed on. For "fit the whole section" sizing. */
export function sectionVisibleLineCount(lines: readonly string[], range: SectionRange): number {
  let end = range.lastLine;
  while (end > range.titleLine + 1 && lines[end].trim() === "") end--;
  return end - range.titleLine; // body lines (end - titleLine - 1) + 1 for the line being typed on
}

/** The section as document offsets (what an editor transaction talks in). */
export interface SectionSpan {
  /** Start of the title line. */
  from: number;
  /** End of the underline line: the title and underline are `[from, headerEnd]`. */
  headerEnd: number;
  /** End of the section's last visible line. */
  to: number;
  /** End of the whole section, including the empty lines kept out of view before the next section. */
  sectionTo?: number;
}

/** Whether one change `[a, b)` -> `inserted` (offsets in the document BEFORE the change) is allowed in Peek.
 * The section's body is editable; nothing else is:
 *  - never text outside the section, including the line breaks that join it to its neighbours (so Backspace at
 *    the start of the section or Delete at its end cannot pull a hidden neighbour in);
 *  - never the title or underline, nor the line break after the underline (that would break the section the view is
 *    built around). The one exception is a new line typed right after the underline, for a section with no body. */
export function editAllowed(span: SectionSpan, a: number, b: number, inserted: string): boolean {
  // Peek itself tops up the empty lines before the next section, out of view: only line breaks, only there.
  if (a === b && span.sectionTo !== undefined && a >= span.to && a <= span.sectionTo && inserted.length > 0 && inserted.split("\n").every((part) => part === "")) return true;
  if (a < span.from || b > span.to) return false;
  if (a === b) {
    if (a < span.headerEnd) return false;
    if (a === span.headerEnd) return inserted.startsWith("\n");
    return true;
  }
  return a > span.headerEnd;
}

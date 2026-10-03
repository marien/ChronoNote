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
}

/** Whether one change `[a, b)` -> `inserted` (offsets in the document BEFORE the change) is allowed in Peek.
 * The section's body is editable; nothing else is:
 *  - never text outside the section, including the line breaks that join it to its neighbours (so Backspace at
 *    the start of the section or Delete at its end cannot pull a hidden neighbour in);
 *  - never the title or underline, nor the line break after the underline (that would break the section the view is
 *    built around). The one exception is a new line typed right after the underline, for a section with no body. */
export function editAllowed(span: SectionSpan, a: number, b: number, inserted: string): boolean {
  if (a < span.from || b > span.to) return false;
  if (a === b) {
    if (a < span.headerEnd) return false;
    if (a === span.headerEnd) return inserted.startsWith("\n");
    return true;
  }
  return a > span.headerEnd;
}

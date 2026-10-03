/** Peek mode: which lines of a note belong to the section being shown.
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

/** Number of lines the section occupies, without trailing blank lines (but never less than title + underline +
 * one body line), for "fit the whole section" sizing. */
export function sectionVisibleLineCount(lines: readonly string[], range: SectionRange): number {
  let end = range.lastLine;
  while (end > range.titleLine + 1 && lines[end].trim() === "") end--;
  return end - range.titleLine + 2; // +1 inclusive, +1 for the line being typed on
}

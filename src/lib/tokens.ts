/** Token semantics from spec section 2.2/2.3: parsing helpers shared by the
 * editor's glyph rendering, the action drawer, and section history. */

export function countActions(text: string): { open: number; closed: number; forwarded: number } {
  const openMatches = text.match(/^#\s/gm) || [];
  const closedMatches = text.match(/^v\s/gm) || [];
  const forwardedMatches = text.match(/^>\s/gm) || [];
  return { open: openMatches.length, closed: closedMatches.length, forwarded: forwardedMatches.length };
}

export function isSetextUnderline(line: string): boolean {
  return /^={3,}$/.test(line.trim());
}

export function getSectionHeaderForLine(lines: string[], lineIdx: number): string {
  if (lineIdx < 0 || lineIdx >= lines.length) return "";
  if (lineIdx + 1 < lines.length && isSetextUnderline(lines[lineIdx + 1])) {
    return lines[lineIdx].trim();
  }
  if (isSetextUnderline(lines[lineIdx]) && lineIdx > 0) {
    return lines[lineIdx - 1].trim();
  }
  for (let i = lineIdx; i >= 1; i--) {
    if (isSetextUnderline(lines[i])) {
      return lines[i - 1].trim();
    }
  }
  return "";
}

export function normalizeHeaderTitle(rawHeader: string): string {
  return rawHeader
    .replace(/^\[\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\]\s*/, "")
    .replace(/^\[CANCELED\]\s*/, "")
    .trim();
}

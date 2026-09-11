/** Cross-Tab Search's result rows (§127, finding B) used to show the raw
 * line — literal `#`/`=>` tokens — while the Action Drawer and Section
 * History rows both glyph-render via `parseGlyphLine`. This renders a
 * result line the same glyph-rendered way, then splits the parts further
 * wherever the search query appears (case-insensitively, first match per
 * part — matches `parseGlyphLine`'s own per-part granularity) so the
 * existing `<mark>` highlight still works on top of it. */
import { parseGlyphLine, type GlyphPart } from "../editor/glyphLine";

export interface RenderedPart extends GlyphPart {
  hit?: boolean;
}

export function renderResultLine(line: string, query = ""): RenderedPart[] {
  const parts = parseGlyphLine(line);
  const q = query.trim().toLowerCase();
  if (!q) return parts;

  const out: RenderedPart[] = [];
  for (const part of parts) {
    const idx = part.text.toLowerCase().indexOf(q);
    if (idx === -1) {
      out.push(part);
      continue;
    }
    if (idx > 0) out.push({ text: part.text.slice(0, idx), cls: part.cls });
    out.push({ text: part.text.slice(idx, idx + q.length), cls: part.cls, hit: true });
    if (idx + q.length < part.text.length) out.push({ text: part.text.slice(idx + q.length), cls: part.cls });
  }
  return out;
}

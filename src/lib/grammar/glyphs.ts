/** The one symbol -> glyph table (docs/design/line-tokenizer-design.md). The
 * editor (`editor/glyphs.ts`) still has its own private copy until the editor
 * is switched to the tokenizer; the read-only views use this one. */
export interface GlyphSpec {
  char: string;
  cls: string;
}

export const GLYPHS: Record<string, GlyphSpec> = {
  "#": { char: "☐", cls: "glyph-open" },
  v: { char: "☑", cls: "glyph-done" },
  ">": { char: "☐", cls: "glyph-progress" },
  x: { char: "☒", cls: "glyph-cancelled" },
  o: { char: "○", cls: "glyph-topic-open" },
  ".": { char: "◉", cls: "glyph-topic-done" },
  ",": { char: "◌", cls: "glyph-topic-skipped" },
  bullet: { char: "•", cls: "glyph-bullet" },
};

/** The `=> ` arrow of a follow-up, delegation or consequence-action. */
export const ARROW_GLYPH: GlyphSpec = { char: "➔", cls: "glyph-followup" };

/** The glyph for a line-start or consequence symbol; any unknown symbol gets
 * the open-action glyph, as `glyphForSymbol` always did. `-` and `*` are the
 * bullet only through `bullet`, never through this lookup. */
export function glyphSpecForSymbol(sym: string): GlyphSpec {
  return sym !== "bullet" && Object.prototype.hasOwnProperty.call(GLYPHS, sym) ? GLYPHS[sym] : GLYPHS["#"];
}

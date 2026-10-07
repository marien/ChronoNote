import { ARROW_GLYPH, GLYPHS, glyphSpecForSymbol } from "../grammar/glyphs";
import { tokenizeLine } from "../grammar/tokenize";

/** One rendered piece of a line: `text` is what to show; `cls` (a
 * `.glyph-*` class) is set when it's a glyph or a styled span, absent for
 * plain text. */
export interface GlyphPart {
  text: string;
  cls?: string;
}

/** Exported for `ActionDrawerModal` (§127, finding B) — its row icon used
 * to duplicate this mapping as a private `--glyph-*` inline-style lookup;
 * sharing it means both places agree on colour/weight through one map,
 * not two kept in sync by hand. The map itself is `GLYPHS` in `grammar/`. */
export function glyphForSymbol(sym: string): GlyphPart {
  const g = glyphSpecForSymbol(sym);
  return { text: g.char, cls: g.cls };
}

/** Turn one plain-text line into the sequence of styled parts a read-only
 * viewer (Section History's occurrence body, #33) should
 * render — the same tokens the editor's glyph decorations come from
 * (`grammar/tokenize.ts`), but as plain spans instead of CodeMirror
 * decorations, and with the token's trailing space folded into a literal
 * gap after the glyph so columns still line up without the editor's
 * fixed-width CSS.
 *
 * Also applies the inline highlights: every `@name` on *any* line (not one
 * glued to a word, so emails are left alone), a parenthesised `(@name)` or
 * list `(@a, @b, @c)` (#126), and a `(topic)` tag immediately after the
 * action symbol (#36/#39). Text between tokens is emitted verbatim, one
 * part per gap. */
export function parseGlyphLine(line: string): GlyphPart[] {
  const tokens = tokenizeLine(line);
  // `! ` — bold the whole line, token and all (matches glyphs.ts: the
  // `!` stays visible, it isn't replaced). Nothing else is rendered.
  if (tokens[0]?.kind === "emphasis") return [{ text: line, cls: "glyph-emphasis-line" }];

  const parts: GlyphPart[] = [];
  let at = 0; // chars of `line` already emitted
  const gap = (to: number) => {
    if (to > at) parts.push({ text: line.slice(at, to) });
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    gap(t.from);
    switch (t.kind) {
      case "action":
      case "topic":
      case "consequence":
        parts.push(glyphForSymbol(t.symbol!), { text: " " });
        break;
      case "bullet":
        parts.push({ text: GLYPHS.bullet.char, cls: GLYPHS.bullet.cls }, { text: " " });
        break;
      case "arrow":
        parts.push({ text: ARROW_GLYPH.char, cls: ARROW_GLYPH.cls }, { text: " " });
        break;
      case "assignee":
        parts.push({ text: line.slice(t.from, t.to), cls: "glyph-assignee" });
        break;
      case "assigneeList":
        // Every name is its own badge; the parens and separators stay plain.
        parts.push({ text: "(" });
        at = t.from + 1;
        while (tokens[i + 1]?.kind === "assignee" && tokens[i + 1].to <= t.to) {
          const c = tokens[++i];
          gap(c.from);
          parts.push({ text: line.slice(c.from, c.to), cls: "glyph-assignee" });
          at = c.to;
        }
        parts.push({ text: ")" });
        break;
      case "topicTag":
        parts.push({ text: line.slice(t.from, t.to), cls: "glyph-topic" });
        break;
      default: // "paren": ordinary text, but its own part
        parts.push({ text: line.slice(t.from, t.to) });
    }
    at = t.to;
  }
  if (at < line.length) parts.push({ text: line.slice(at) });

  return parts.length > 0 ? parts : [{ text: "" }];
}

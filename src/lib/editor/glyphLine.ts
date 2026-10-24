import { ARROW_GLYPH, GLYPHS, glyphSpecForSymbol } from "../grammar/glyphs";
import { getLineActionParts, tokenizeLine } from "../grammar/tokenize";
import { dueStatus } from "../tokens";
import { todayISO } from "../date";
import { dueTooltip } from "../dueTooltip";

/** One rendered piece of a line: `text` is what to show; `cls` (a
 * `.glyph-*` or `.cm-due*` class) is set when it's a glyph or a styled span, absent for
 * plain text. Nested `parts` represent inner structure (e.g. flag + date inside a due pill). */
export interface GlyphPart {
  text: string;
  cls?: string;
  title?: string;
  parts?: GlyphPart[];
}

export interface ParseGlyphLineOpts {
  today?: string;
  from?: number;
  to?: number;
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
 * list `(@a, @b, @c)` (#126), a `(topic)` tag immediately after the
 * action symbol (#36/#39), and due dates (§426). Text between tokens is emitted verbatim,
 * one part per gap. */
export function parseGlyphLine(line: string, opts?: ParseGlyphLineOpts): GlyphPart[] {
  const rangeFrom = opts?.from ?? 0;
  const rangeTo = opts?.to ?? line.length;
  if (rangeFrom >= rangeTo) return [{ text: "" }];

  const today = opts?.today ?? todayISO();
  const tokens = tokenizeLine(line);
  const actionParts = getLineActionParts(line, tokens);

  const parts: GlyphPart[] = [];
  let at = rangeFrom; // chars of `line` already emitted

  const gap = (toIdx: number) => {
    const start = Math.max(at, rangeFrom);
    const end = Math.min(toIdx, rangeTo);
    if (end > start) parts.push({ text: line.slice(start, end) });
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.to <= rangeFrom) continue;
    if (t.from >= rangeTo) break;

    // Straddles rangeFrom
    if (t.from < rangeFrom) {
      const end = Math.min(t.to, rangeTo);
      parts.push({ text: line.slice(rangeFrom, end) });
      at = end;
      continue;
    }

    // Gap before token
    gap(t.from);

    // Straddles rangeTo
    if (t.to > rangeTo) {
      parts.push({ text: line.slice(t.from, rangeTo) });
      at = rangeTo;
      break;
    }

    // Completely within [rangeFrom, rangeTo)
    switch (t.kind) {
      case "emphasis":
        parts.push({ text: line.slice(t.from, rangeTo), cls: "glyph-emphasis-line" });
        return parts;
      case "action":
      case "topic":
      case "consequence":
      case "consequenceTopic":
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
      case "topicTag":
        // As in the editor when the caret is elsewhere: the parentheses stay as text, transparent (§426).
        parts.push({
          text: line.slice(t.from, t.to),
          cls: "glyph-topic",
          parts: [
            { text: "(", cls: "glyph-topic-paren" },
            { text: line.slice(t.from + 1, t.to - 1) },
            { text: ")", cls: "glyph-topic-paren" },
          ],
        });
        break;
      case "due": {
        const part = actionParts.find((p) => t.from >= p.from && t.from < p.to);
        const resolved = part?.state === "v" || part?.state === ">" || part?.state === "x";
        const status = resolved ? "resolved" : dueStatus(t.date!, today);
        const title = dueTooltip(t.date!, dueStatus(t.date!, today), today);
        parts.push({
          text: line.slice(t.from, t.to),
          cls: `cm-due cm-due-${status}`,
          title,
          parts: [
            { text: line.slice(t.from, t.from + 3), cls: "cm-due-flag" },
            { text: line.slice(t.from + 3, t.to) },
          ],
        });
        break;
      }
      default: // "dueWord", "paren": ordinary text, but its own part
        parts.push({ text: line.slice(t.from, t.to) });
    }
    at = t.to;
  }

  if (at < rangeTo) parts.push({ text: line.slice(at, rangeTo) });

  return parts.length > 0 ? parts : [{ text: "" }];
}

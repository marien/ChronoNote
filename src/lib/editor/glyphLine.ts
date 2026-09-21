import { isActionLikeLine, leadingTopicTag } from "../tokens";

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
 * not two kept in sync by hand. */
export function glyphForSymbol(sym: string): GlyphPart {
  switch (sym) {
    case "v":
      return { text: "☑", cls: "glyph-done" };
    case ">":
      return { text: "»", cls: "glyph-progress" };
    case "x":
      return { text: "☒", cls: "glyph-cancelled" };
    default:
      return { text: "☐", cls: "glyph-open" }; // "#"
  }
}

/** Turn one plain-text line into the sequence of styled parts a read-only
 * viewer (the Section History "Previous occurrence" pane, #33) should
 * render — the same token → glyph mapping the editor's `glyphs.ts` does,
 * but as plain spans instead of CodeMirror decorations, and with the
 * token's trailing space folded into a literal gap after the glyph so
 * columns still line up without the editor's fixed-width CSS.
 *
 * Also applies the inline highlights: every `@name` (or parenthesised
 * `(@name)`, #126) on a `=> ` line (#35), and a `(topic)` tag immediately
 * after the action symbol (#36/#39). */
export function parseGlyphLine(line: string): GlyphPart[] {
  // `! ` — bold the whole line, token and all (matches glyphs.ts: the
  // `!` stays visible, it isn't replaced).
  if (/^!\s/.test(line)) return [{ text: line, cls: "glyph-emphasis-line" }];

  const parts: GlyphPart[] = [];
  let rest = line;
  let consumed = 0; // chars of `line` consumed by the lead strip, so
  // match offsets in `rest` can be mapped back onto `line`.

  const lead = rest.match(/^(\s*)([#vx>]|[-*])\s/);
  if (lead) {
    const [full, indent, sym] = lead;
    if (indent) parts.push({ text: indent });
    parts.push(sym === "-" || sym === "*" ? { text: "•", cls: "glyph-bullet" } : glyphForSymbol(sym));
    parts.push({ text: " " });
    rest = rest.slice(full.length);
    consumed = full.length;
  }

  const delegation = /=>\s/.test(line);
  const actionLike = isActionLikeLine(line);
  const topic = leadingTopicTag(line);

  // One scan for every inline token: a Delegate arrow in any of its forms,
  // a bare `@name`, a parenthesised `(@name)` delegate (#126), or a
  // `(topic)` tag. Text between matches is emitted verbatim.
  const re = /=>\s@([\w-]+)|=>\s([#vx>])\s|=>\s|\(@([\w-]+(?:[\s,]+@[\w-]+)*)\)|@([\w-]+)|\(([^\s()]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    if (m.index > last) parts.push({ text: rest.slice(last, m.index) });
    if (m[1] !== undefined) {
      parts.push({ text: "➔", cls: "glyph-followup" }, { text: " " }, { text: "@" + m[1], cls: "glyph-assignee" });
    } else if (m[2] !== undefined) {
      parts.push({ text: "➔", cls: "glyph-followup" }, { text: " " }, glyphForSymbol(m[2]), { text: " " });
    } else if (m[0].startsWith("=>")) {
      parts.push({ text: "➔", cls: "glyph-followup" }, { text: " " });
    } else if (m[3] !== undefined) {
      // `(@name)` or a list `(@a, @b)`: every name is its own badge, separators stay plain.
      parts.push({ text: "(" });
      let at = 0;
      const inner = "@" + m[3];
      for (const n of inner.matchAll(/@[\w-]+/g)) {
        if (n.index! > at) parts.push({ text: inner.slice(at, n.index) });
        parts.push(actionLike ? { text: n[0], cls: "glyph-assignee" } : { text: n[0] });
        at = n.index! + n[0].length;
      }
      parts.push({ text: ")" });
    } else if (m[4] !== undefined) {
      parts.push(delegation ? { text: "@" + m[4], cls: "glyph-assignee" } : { text: "@" + m[4] });
    } else if (m[5] !== undefined) {
      const isTag = topic !== null && consumed + m.index === topic.from;
      parts.push(isTag ? { text: "(" + m[5] + ")", cls: "glyph-topic" } : { text: "(" + m[5] + ")" });
    }
    last = re.lastIndex;
  }
  if (last < rest.length) parts.push({ text: rest.slice(last) });

  return parts.length > 0 ? parts : [{ text: "" }];
}

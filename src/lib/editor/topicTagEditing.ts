import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { tokenizeLine } from "../grammar/tokenize";

/** §422: a `(topic)` pill shows its parentheses only while it is being edited: when a selection end (the caret) is
 * inside the pill or right next to it, on either side. Hovering or merely being on the line no longer shows them
 * (before: the whole line, `cm-line-touched`), so the pill looks the same as long as you are not working in it, like
 * the due-date flag (§421). Marks the pill with `glyph-topic-editing`; CSS reveals its parentheses. */
const EDITING = Decoration.mark({ class: "glyph-topic-editing" });

function build(view: EditorView): DecorationSet {
  const marks: { from: number; to: number }[] = [];
  for (const r of view.state.selection.ranges) {
    for (const pos of r.empty ? [r.head] : [r.anchor, r.head]) {
      const line = view.state.doc.lineAt(pos);
      const tag = tokenizeLine(line.text).find((t) => t.kind === "topicTag");
      if (!tag) continue;
      const from = line.from + tag.from;
      const to = line.from + tag.to;
      // "Right next to it": the caret just before `(` or just after `)` counts.
      if (pos >= from && pos <= to && !marks.some((m) => m.from === from)) marks.push({ from, to });
    }
  }
  marks.sort((a, b) => a.from - b.from);
  const b = new RangeSetBuilder<Decoration>();
  for (const m of marks) b.add(m.from, m.to, EDITING);
  return b.finish();
}

export const topicTagEditingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

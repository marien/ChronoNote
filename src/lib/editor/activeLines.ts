import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/** Marks every line the selection touches (caret line, or every line a range crosses) with
 * `cm-line-touched`, so CSS can reveal what is normally hidden on the line being edited: the
 * parentheses of a `(topic)` pill. Only lines in view are visited, so a huge selection stays cheap. */
function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  let last = -1;
  for (const r of view.state.selection.ranges) {
    for (const vr of view.visibleRanges) {
      const from = Math.max(r.from, vr.from);
      const to = Math.min(r.to, vr.to);
      if (from > to) continue;
      let pos = from;
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos);
        if (line.from > last) {
          b.add(line.from, line.from, Decoration.line({ class: "cm-line-touched" }));
          last = line.from;
        }
        pos = line.to + 1;
      }
    }
  }
  return b.finish();
}

export const activeLinesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

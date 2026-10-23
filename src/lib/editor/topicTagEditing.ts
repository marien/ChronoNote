import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { tokenizeLine } from "../grammar/tokenize";

/** §422: a `(topic)` pill shows its parentheses only while it is being edited: when the caret is inside the pill or
 * right next to it, on either side, or when a selection covers (part of) it. Hovering or merely being on the line no
 * longer shows them (before: the whole line, `cm-line-touched`), so the pill looks the same as long as you are not
 * working in it, like the due-date flag (§421). Marks the pill with `glyph-topic-editing`; CSS reveals its
 * parentheses. (A line has at most one pill: the grammar reads only the first `(topic)` after an action symbol.) */
const EDITING = Decoration.mark({ class: "glyph-topic-editing" });

function build(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const marks = new Map<number, number>(); // from -> to
  const visit = (lineNumber: number, touches: (from: number, to: number) => boolean) => {
    const line = doc.line(lineNumber);
    for (const tag of tokenizeLine(line.text)) {
      if (tag.kind !== "topicTag") continue;
      const from = line.from + tag.from;
      const to = line.from + tag.to;
      if (touches(from, to)) marks.set(from, to);
    }
  };

  for (const r of view.state.selection.ranges) {
    if (r.empty) {
      // The caret inside the pill, or just before `(` / just after `)`.
      visit(doc.lineAt(r.head).number, (from, to) => r.head >= from && r.head <= to);
      continue;
    }
    // A selection: every pill it covers, even partly, on every line it spans (only the lines in view, so a select-all
    // on a long note stays cheap).
    for (const vr of view.visibleRanges) {
      const start = Math.max(r.from, vr.from);
      const end = Math.min(r.to, vr.to);
      if (start > end) continue;
      for (let n = doc.lineAt(start).number; n <= doc.lineAt(end).number; n++) {
        visit(n, (from, to) => from < r.to && to > r.from);
      }
    }
  }

  const b = new RangeSetBuilder<Decoration>();
  for (const from of [...marks.keys()].sort((a, c) => a - c)) b.add(from, marks.get(from)!, EDITING);
  return b.finish();
}

export const topicTagEditingPlugin = ViewPlugin.fromClass(
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

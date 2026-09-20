import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { innermostActionSymbol, isSetextUnderline } from "../tokens";

/** Returns true if the line at 1-based lineNumber is a section header title line
 * directly followed by a setext `====` underline. */
function isHeaderLine(view: EditorView, lineNumber: number): boolean {
  return lineNumber < view.state.doc.lines && isSetextUnderline(view.state.doc.line(lineNumber + 1).text);
}

export function buildResolvedLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (!isHeaderLine(view, line.number)) {
        const sym = innermostActionSymbol(line.text);
        if (sym === "v" || sym === "x") {
          builder.add(line.from, line.from, Decoration.line({ class: "cm-line-resolved" }));
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const resolvedLinesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildResolvedLineDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildResolvedLineDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

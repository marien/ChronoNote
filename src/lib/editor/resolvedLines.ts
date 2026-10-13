import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { isSetextUnderline } from "../tokens";
import { tokenizeLine } from "../grammar/tokenize";

const RESOLVED = new Set(["v", "x", ">", ".", ","]);

/** Which parts of a line read as dealt with. Every `=> ` starts a new part; a part is resolved when its own symbol
 * (the leading action/topic, or the action/topic right after its arrow) is done, deferred, won't do, discussed or not
 * discussed. A follow-up part without a symbol of its own (`=> he agreed`, `=> @dana`) belongs to the part before it.
 * A first part without a symbol is never resolved. "all" when every part is resolved, else the resolved ranges. */
export function resolvedParts(line: string): "all" | { from: number; to: number }[] {
  const tokens = tokenizeLine(line);
  const parts: { from: number; to: number; resolved: boolean }[] = [];
  const lead = tokens[0]?.kind === "action" || tokens[0]?.kind === "topic" ? tokens[0].symbol! : null;
  parts.push({ from: 0, to: line.length, resolved: lead !== null && RESOLVED.has(lead) });
  tokens.forEach((t, i) => {
    if (t.kind !== "arrow") return;
    const next = tokens[i + 1];
    const own = next && next.from === t.to && (next.kind === "consequence" || next.kind === "consequenceTopic") ? next.symbol! : null;
    parts[parts.length - 1].to = t.from;
    parts.push({ from: t.from, to: line.length, resolved: own !== null ? RESOLVED.has(own) : parts[parts.length - 1].resolved });
  });
  // The indentation before a line that starts with `=> ` is not a part of its own.
  const real = parts.filter((p) => line.slice(p.from, p.to).trim() !== "");
  if (real.length > 0 && real.every((p) => p.resolved)) return "all";
  return real.filter((p) => p.resolved).map(({ from, to }) => ({ from, to }));
}

/** Returns true if the line at 1-based lineNumber is a section header title line
 * directly followed by a setext `====` underline. */
function isHeaderLine(view: EditorView, lineNumber: number): boolean {
  return lineNumber < view.state.doc.lines && isSetextUnderline(view.state.doc.line(lineNumber + 1).text);
}

function isLineTouchedBySelection(view: EditorView, lineFrom: number, lineTo: number): boolean {
  for (const range of view.state.selection.ranges) {
    if (range.from <= lineTo && range.to >= lineFrom) {
      return true;
    }
  }
  return false;
}

export function buildResolvedLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (!isHeaderLine(view, line.number)) {
        const parts = resolvedParts(line.text);
        const isTouched = isLineTouchedBySelection(view, line.from, line.to);
        const active = isTouched ? " cm-line-resolved-active" : "";
        if (parts === "all") {
          builder.add(line.from, line.from, Decoration.line({ class: `cm-line-resolved${active}` }));
        } else if (parts.length > 0) {
          // Only the dealt-with parts are muted, so an open action or topic on the same line keeps full strength.
          builder.add(line.from, line.from, Decoration.line({ class: `cm-line-resolved-partial${active}` }));
          // inclusiveStart: the glyph widget at a part's first character is drawn inside the span, so it dims too.
          for (const p of parts) builder.add(line.from + p.from, line.from + p.to, Decoration.mark({ class: "cm-resolved-part", inclusiveStart: true }));
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
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
        this.decorations = buildResolvedLineDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

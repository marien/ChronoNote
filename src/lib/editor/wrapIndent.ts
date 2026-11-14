import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  BlockType,
  Decoration,
  type DecorationSet,
  Direction,
  type EditorView,
  layer,
  type LayerMarker,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { columnOf, isTitleLine, isTitleUnderline, tokenizeLine } from "../grammar/tokenize";
import { parseNumberedItem } from "../tokens";

/** Character offset in `lineText` right after any leading ChronoNote marker (`- `, `# `, `# ! - `, `o 1. `, `=> # `, etc.), or `null` when the line starts with plain/indented text. */
export function leadingMarkerCharEnd(lineText: string): number | null {
  const [first, second, third] = tokenizeLine(lineText);
  if (first?.kind === "arrow" && lineText.slice(0, first.from).trim() === "") {
    if (second && (second.kind === "consequence" || second.kind === "consequenceTopic") && second.from === first.to) {
      return second.to;
    }
    return first.to;
  }
  if (first && (first.kind === "action" || first.kind === "topic")) {
    if (second?.kind === "bullet" && second.from === first.to) {
      return second.to;
    }
    if (second?.kind === "emphasis" && second.from === first.to) {
      if (third?.kind === "bullet" && third.from === second.from + 2) {
        return third.to;
      }
      return second.from + 2;
    }
    const sub = parseNumberedItem(lineText.slice(first.to));
    if (sub && sub.indent === "") {
      return first.to + sub.markerEnd + 1;
    }
    return first.to;
  }
  if (first?.kind === "bullet") {
    return first.to;
  }
  if (first?.kind === "emphasis") {
    const emEnd = first.from + 2;
    return second?.kind === "bullet" && second.from === emEnd ? second.to : emEnd;
  }
  const numbered = parseNumberedItem(lineText);
  return numbered ? numbered.markerEnd + 1 : null;
}

/** Display column (with tabs expanded to 2 spaces) where text starts after any leading marker, or `null` when the line has no leading marker. */
export function leadingMarkerTextColumn(lineText: string): number | null {
  const charEnd = leadingMarkerCharEnd(lineText);
  if (charEnd === null) return null;
  return columnOf(lineText.slice(0, charEnd));
}

/**
 * Calculates the continuation indentation in characters (columns) for a line of text.
 * When soft word-wrap breaks a line into multiple visual lines, continuation lines
 * align with the text of the line (e.g. past action/topic/bullet/number markers),
 * matching ChronoNote's Shift+Enter continuation conventions.
 */
export function getLineWrapIndent(lineText: string): number {
  if (lineText.trim() === "") return 0;

  const markerCol = leadingMarkerTextColumn(lineText);
  if (markerCol !== null) return markerCol;

  // Plain indented text: e.g. "  text", "    text"
  const leading = lineText.match(/^(\s+)\S/);
  if (leading) {
    return columnOf(leading[1]);
  }

  return 0;
}

/** Returns true if the line at 1-based lineNumber is a non-blank title line
 * directly followed by a `===` or `---` underline. */
function isHeaderLine(view: EditorView, lineNumber: number): boolean {
  if (lineNumber >= view.state.doc.lines) return false;
  return isTitleLine(view.state.doc.line(lineNumber).text, view.state.doc.line(lineNumber + 1).text);
}

/** Builds line decorations applying hanging indentation to wrapped lines. */
export function buildWrapIndentDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (!isHeaderLine(view, line.number) && !isTitleUnderline(line.text)) {
        const indent = getLineWrapIndent(line.text);
        if (indent > 0) {
          builder.add(
            line.from,
            line.from,
            Decoration.line({
              attributes: {
                style: `--line-indent: ${indent}ch;`,
              },
              class: "cm-line-wrap-indent",
            }),
          );
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

/** ViewPlugin keeping wrap-indent line decorations in sync with document & viewport changes. */
export const wrapIndentPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildWrapIndentDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildWrapIndentDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Custom LayerMarker drawing the subtle curved return arrow at the break of a visual line. */
export class WrapArrowMarker implements LayerMarker {
  constructor(
    readonly left: number,
    readonly top: number,
    readonly height: number,
  ) {}

  draw(): HTMLElement {
    const elt = document.createElement("div");
    elt.className = "cm-wrap-indicator";
    elt.setAttribute("aria-hidden", "true");
    elt.innerHTML = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v4a3 3 0 0 1-3 3H3m3-3l-3 3 3 3"/></svg>`;
    this.adjust(elt);
    return elt;
  }

  update(elt: HTMLElement, prev: LayerMarker): boolean {
    if (!(prev instanceof WrapArrowMarker)) return false;
    this.adjust(elt);
    return true;
  }

  adjust(elt: HTMLElement) {
    elt.style.left = `${this.left}px`;
    elt.style.top = `${this.top}px`;
  }

  eq(other: LayerMarker): boolean {
    return (
      other instanceof WrapArrowMarker &&
      this.left === other.left &&
      this.top === other.top &&
      this.height === other.height
    );
  }
}

function getScrollBase(view: EditorView) {
  const rect = view.scrollDOM.getBoundingClientRect();
  const scaleX = view.scaleX || 1;
  const scaleY = view.scaleY || 1;
  const left =
    view.textDirection === Direction.LTR
      ? rect.left
      : rect.right - view.scrollDOM.clientWidth * scaleX;
  return {
    left: left - view.scrollDOM.scrollLeft * scaleX,
    top: rect.top - view.scrollDOM.scrollTop * scaleY,
  };
}

/** Layer extension rendering the curved return arrow at the end of each broken visual line. */
export const wrapArrowLayer = layer({
  above: true,
  class: "cm-wrap-layer",
  markers(view: EditorView): readonly LayerMarker[] {
    if (!view.lineWrapping) return [];
    if (typeof document === "undefined" || !document.createRange) return [];

    const base = getScrollBase(view);
    const markers: LayerMarker[] = [];
    const minHeight = (view.defaultLineHeight || 20) * 1.25;

    for (const block of view.viewportLineBlocks) {
      if (block.type !== BlockType.Text) continue;
      // An unwrapped line's block height is exactly defaultLineHeight
      if (block.height <= minHeight) continue;

      let lineDom: Node | null = null;
      try {
        lineDom = view.domAtPos(block.from).node;
      } catch {
        continue;
      }
      const lineElt = (
        lineDom.nodeType === 1 ? (lineDom as HTMLElement) : lineDom.parentElement
      )?.closest(".cm-line") as HTMLElement | null;
      if (!lineElt) continue;

      const range = document.createRange();
      range.selectNodeContents(lineElt);
      const clientRects = Array.from(range.getClientRects());
      if (clientRects.length <= 1) continue;

      const visualLines: { top: number; bottom: number; right: number }[] = [];
      const threshold = (view.defaultLineHeight || 20) * 0.5;

      // #215: the rects are not in visual order. An inline element that wraps (a link's mark span) lists its own
      // boxes for each visual line before the text inside it, so a rect can belong to any earlier visual line, not
      // only the last one; matching only the last one made extra "lines" and an arrow where the link ended.
      for (const rect of clientRects) {
        if (rect.width === 0 && rect.height === 0) continue;
        const same = visualLines.find((vl) => Math.abs(rect.top - vl.top) <= threshold);
        if (!same) {
          visualLines.push({
            top: rect.top,
            bottom: rect.bottom,
            right: rect.right,
          });
        } else {
          same.right = Math.max(same.right, rect.right);
          same.bottom = Math.max(same.bottom, rect.bottom);
          same.top = Math.min(same.top, rect.top);
        }
      }
      visualLines.sort((a, b) => a.top - b.top);

      // If only 1 visual line was detected, the line did not actually wrap
      if (visualLines.length <= 1) continue;

      const contentRect = view.contentDOM.getBoundingClientRect();
      const maxLeft = contentRect.right - base.left - 14;
      const arrowH = 12;

      // Broken visual lines are all visual lines except the last one (which finishes the paragraph)
      for (let i = 0; i < visualLines.length - 1; i++) {
        const vl = visualLines[i];
        const lineH = vl.bottom - vl.top;
        const top = Math.round(vl.top - base.top + Math.max(0, (lineH - arrowH) / 2));
        const left = Math.round(Math.min(vl.right - base.left + 4, maxLeft));
        markers.push(new WrapArrowMarker(left, top, arrowH));
      }
    }

    return markers;
  },
  update(update: ViewUpdate) {
    return (
      update.docChanged ||
      update.viewportChanged ||
      update.geometryChanged
    );
  },
});

/** Returns the combined wrap extensions (indentation decorations + curved arrow layer). */
export function wrapIndentExtension(): Extension {
  return [wrapIndentPlugin, wrapArrowLayer];
}

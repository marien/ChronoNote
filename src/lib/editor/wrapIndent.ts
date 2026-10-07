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
import {
  isSetextUnderline,
  isTopicLikeLine,
  numberedContinuationIndent,
  topicContinuationIndent,
} from "../tokens";
import { tokenizeLine } from "../grammar/tokenize";

/**
 * Calculates the continuation indentation in characters (columns) for a line of text.
 * When soft word-wrap breaks a line into multiple visual lines, continuation lines
 * align with the text of the line (e.g. past action/topic/bullet/number markers),
 * matching ChronoNote's Shift+Enter continuation conventions.
 */
export function getLineWrapIndent(lineText: string): number {
  if (lineText.trim() === "") return 0;

  // 1. Follow-up / Consequence line: e.g. "=> text" or "=> # text" or indented
  const [first, second] = tokenizeLine(lineText);
  if (first?.kind === "arrow" && lineText.slice(0, first.from).trim() === "") {
    const expanded = lineText.slice(0, first.from).replace(/\t/g, "  ");
    return expanded.length + 3 + (second?.kind === "consequence" ? 2 : 0);
  }

  // 2. Action line: e.g. "# text", "  v text", "> deferred", "x cancelled"
  if (first?.kind === "action") {
    const expanded = lineText.slice(0, first.from).replace(/\t/g, "  ");
    return expanded.length + 2;
  }

  // 3. Agenda topic line: e.g. "o text", "o - text", "o 1. text"
  if (isTopicLikeLine(lineText)) {
    const pad = topicContinuationIndent(lineText);
    if (pad !== null) {
      return pad.replace(/\t/g, "  ").length;
    }
  }

  // 4. Numbered list item: e.g. "1. text", "  2) text", "10. text"
  const numberedPad = numberedContinuationIndent(lineText);
  if (numberedPad !== null) {
    return numberedPad.replace(/\t/g, "  ").length;
  }

  // 5. Bullet or emphasis list item: e.g. "- text", "* text", "! important"
  const bullet = lineText.match(/^(\s*)([-*!])\s/);
  if (bullet) {
    const expanded = bullet[1].replace(/\t/g, "  ");
    return expanded.length + 2;
  }

  // 6. Plain indented text: e.g. "  text", "    text"
  const leading = lineText.match(/^(\s+)\S/);
  if (leading) {
    const expanded = leading[1].replace(/\t/g, "  ");
    return expanded.length;
  }

  return 0;
}

/** Returns true if the line at 1-based lineNumber is a section header title line
 * directly followed by a setext `====` underline. */
function isHeaderLine(view: EditorView, lineNumber: number): boolean {
  return (
    lineNumber < view.state.doc.lines &&
    isSetextUnderline(view.state.doc.line(lineNumber + 1).text)
  );
}

/** Builds line decorations applying hanging indentation to wrapped lines. */
export function buildWrapIndentDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (!isHeaderLine(view, line.number) && !isSetextUnderline(line.text)) {
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

      for (const rect of clientRects) {
        if (rect.width === 0 && rect.height === 0) continue;
        const last = visualLines[visualLines.length - 1];
        if (!last || Math.abs(rect.top - last.top) > threshold) {
          visualLines.push({
            top: rect.top,
            bottom: rect.bottom,
            right: rect.right,
          });
        } else {
          last.right = Math.max(last.right, rect.right);
          last.bottom = Math.max(last.bottom, rect.bottom);
          last.top = Math.min(last.top, rect.top);
        }
      }

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

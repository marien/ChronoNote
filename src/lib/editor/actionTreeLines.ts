import { StateField, type Extension } from "@codemirror/state";
import {
  Direction,
  type EditorView,
  layer,
  type LayerMarker,
  type ViewUpdate,
} from "@codemirror/view";
import { actionTree, type ActionNode } from "../actionGroups";

export interface TreeConnector {
  parentLineIdx: number;
  parentCol: number; // parent's lineStart
  children: { lineIdx: number; col: number }[]; // the parent's direct children of kind "line" (steps are left out), col = child's lineStart
  resolved: boolean; // parent and every descendant line/step with a state are v, x or > (delegated parts ignored)
}

/** Center of the action glyph within its character cell (the glyph box sits in the first of its two cells). */
const GLYPH_CENTER_CH = 0.5;

function isNodeResolved(node: ActionNode): boolean {
  if (node.state !== null && node.state !== "v" && node.state !== "x" && node.state !== ">") {
    return false;
  }
  for (const child of node.children) {
    if (!isNodeResolved(child)) return false;
  }
  return true;
}

/** Extracts connectors joining an action line to its direct child lines. */
export function treeConnectors(roots: ActionNode[]): TreeConnector[] {
  const connectors: TreeConnector[] = [];

  function visit(node: ActionNode) {
    const lineChildren = node.children.filter((c) => c.kind === "line");
    if (lineChildren.length > 0) {
      connectors.push({
        parentLineIdx: node.lineIdx,
        parentCol: node.lineStart,
        children: lineChildren.map((c) => ({ lineIdx: c.lineIdx, col: c.lineStart })),
        resolved: isNodeResolved(node),
      });
    }
    for (const child of lineChildren) {
      visit(child);
    }
  }

  for (const root of roots) {
    visit(root);
  }

  connectors.sort((a, b) => a.parentLineIdx - b.parentLineIdx);
  return connectors;
}

/** Recomputed from `actionTree(doc lines)` only when the document changes. */
export const actionTreeLinesField = StateField.define<TreeConnector[]>({
  create(state) {
    const lines: string[] = [];
    for (let i = 1; i <= state.doc.lines; i++) {
      lines.push(state.doc.line(i).text);
    }
    return treeConnectors(actionTree(lines));
  },
  update(value, tr) {
    if (!tr.docChanged) return value;
    const lines: string[] = [];
    for (let i = 1; i <= tr.state.doc.lines; i++) {
      lines.push(tr.state.doc.line(i).text);
    }
    return treeConnectors(actionTree(lines));
  },
});

export class TreeLineMarker implements LayerMarker {
  constructor(
    readonly left: number,
    readonly top: number,
    readonly width: number,
    readonly height: number,
    readonly className: string,
  ) {}

  draw(): HTMLElement {
    const elt = document.createElement("div");
    elt.className = this.className;
    elt.setAttribute("aria-hidden", "true");
    this.adjust(elt);
    return elt;
  }

  update(elt: HTMLElement, prev: LayerMarker): boolean {
    if (!(prev instanceof TreeLineMarker)) return false;
    if (elt.className !== this.className) {
      elt.className = this.className;
    }
    this.adjust(elt);
    return true;
  }

  adjust(elt: HTMLElement) {
    elt.style.left = `${this.left}px`;
    elt.style.top = `${this.top}px`;
    elt.style.width = `${this.width}px`;
    elt.style.height = `${this.height}px`;
  }

  eq(other: LayerMarker): boolean {
    return (
      other instanceof TreeLineMarker &&
      this.left === other.left &&
      this.top === other.top &&
      this.width === other.width &&
      this.height === other.height &&
      this.className === other.className
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

export const actionTreeLinesLayer = layer({
  // Above the text: below it, the selection background covered the lines. They sit in the indentation, never on text.
  above: true,
  class: "cm-action-tree-layer",
  markers(view: EditorView): readonly LayerMarker[] {
    if (typeof document === "undefined") return [];
    const connectors = view.state.field(actionTreeLinesField, false);
    if (!connectors || connectors.length === 0) return [];

    const base = getScrollBase(view);
    const cw = view.defaultCharacterWidth || 8;

    let col0 = base.left;
    const vpLine = view.state.doc.lineAt(view.viewport.from);
    const coords = view.coordsAtPos(vpLine.from);
    if (coords) {
      col0 = coords.left;
    } else {
      for (const block of view.viewportLineBlocks) {
        const c = view.coordsAtPos(block.from);
        if (c) {
          col0 = c.left;
          break;
        }
      }
    }

    const docBaseY = view.documentTop - base.top;
    const lh = view.defaultLineHeight;
    const head = view.state.selection.main.head;
    const headLineIdx = view.state.doc.lineAt(head).number - 1;
    const markers: LayerMarker[] = [];

    for (const connector of connectors) {
      if (connector.children.length === 0) continue;
      const lastChild = connector.children[connector.children.length - 1];
      const parentLineNum = connector.parentLineIdx + 1;
      const lastChildLineNum = lastChild.lineIdx + 1;
      if (
        parentLineNum < 1 ||
        lastChildLineNum < 1 ||
        parentLineNum > view.state.doc.lines ||
        lastChildLineNum > view.state.doc.lines
      ) {
        continue;
      }

      const parentLine = view.state.doc.line(parentLineNum);
      const lastChildLine = view.state.doc.line(lastChildLineNum);
      if (parentLine.from > view.viewport.to || lastChildLine.to < view.viewport.from) {
        continue;
      }

      const isHeadOnConnector =
        headLineIdx === connector.parentLineIdx ||
        connector.children.some((c) => c.lineIdx === headLineIdx);
      const isResolved = connector.resolved && !isHeadOnConnector;

      const x = Math.round(col0 - base.left + (connector.parentCol + GLYPH_CENTER_CH) * cw);

      const parentBlock = view.lineBlockAt(parentLine.from);
      const parentTop = parentBlock.top + docBaseY;
      const parentBottom = parentTop + lh;

      const lastChildBlock = view.lineBlockAt(lastChildLine.from);
      const lastChildTop = lastChildBlock.top + docBaseY;
      const lastChildMiddle = lastChildTop + lh / 2;

      const vertTop = Math.round(parentBottom);
      const vertBottom = Math.round(lastChildMiddle);
      const vertHeight = Math.max(0, vertBottom - vertTop);

      let vertClass = "cm-action-tree-line is-vertical";
      if (isResolved) vertClass += " is-resolved";
      markers.push(new TreeLineMarker(x, vertTop, 0, vertHeight, vertClass));

      for (const child of connector.children) {
        const childLineNum = child.lineIdx + 1;
        if (childLineNum < 1 || childLineNum > view.state.doc.lines) continue;
        const childLine = view.state.doc.line(childLineNum);
        const childBlock = view.lineBlockAt(childLine.from);
        const childTop = childBlock.top + docBaseY;
        const childMiddleY = Math.round(childTop + lh / 2);

        const childX2 = Math.round(col0 - base.left + child.col * cw) - 2;
        if (childX2 - x >= 3) {
          const horizWidth = childX2 - x;
          let horizClass = "cm-action-tree-line is-horizontal";
          if (isResolved) horizClass += " is-resolved";
          markers.push(new TreeLineMarker(x, childMiddleY, horizWidth, 0, horizClass));
        }
      }
    }

    return markers;
  },
  update(update: ViewUpdate) {
    return (
      update.docChanged ||
      update.viewportChanged ||
      update.geometryChanged ||
      update.selectionSet
    );
  },
});

export function actionTreeLinesExtension(): Extension {
  return [actionTreeLinesField, actionTreeLinesLayer];
}

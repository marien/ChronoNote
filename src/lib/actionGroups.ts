import { getLineActionParts, tokenizeLine } from "./grammar/tokenize";
import { isSetextUnderline } from "./tokens";

export type ActionState = "#" | "v" | ">" | "x";

export interface ActionNode {
  /** 0-based line index in the note. */
  lineIdx: number;
  /** "line": a line's own part; "step": a later `=> <symbol>` / `=> @name` part on the same line as its parent. */
  kind: "line" | "step";
  /** Span of this node's own part in the line (from inclusive, to exclusive). A whole node spans the whole line. */
  from: number;
  to: number;
  /** Index in the line of this node's own state symbol character, or null (a delegated part, or a whole node). */
  symbolCol: number | null;
  /** The node's own state; null for a delegated part. For a whole node: the state `innermostActionSymbol` gives
   *  (first consequence symbol, else the leading action symbol), or null. */
  state: ActionState | null;
  delegated: boolean;
  /** Index of the line's first non-blank character. */
  lineStart: number;
  /** 0 for a root; a child or step is its parent's depth + 1. */
  depth: number;
  /** 1-based position among its parent line's steps; steps only. */
  stepIndex?: number;
  /** A line that has action parts but is not a group line (see below): one node for the whole line, never split,
   *  never a parent or child. */
  whole: boolean;
  /** Steps first (left to right), then child lines (top to bottom). */
  children: ActionNode[];
}

interface StackEntry {
  node: ActionNode;
  indent: number;
  isActionLine: boolean;
  isArrowLine: boolean;
}

/** Setext underline: === (H1) or --- (H2 / hr). */
function isUnderline(line: string): boolean {
  return isSetextUnderline(line) || /^-{3,}$/.test(line.trim());
}

/** Width of leading whitespace, tabs count as 2 spaces. */
function computeIndent(line: string): number {
  let indent = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === " ") {
      indent += 1;
    } else if (ch === "\t") {
      indent += 2;
    } else {
      break;
    }
  }
  return indent;
}

/** Every action in the note as a forest, roots in line order. Lines without action parts give no node. */
export function actionTree(lines: string[]): ActionNode[] {
  const roots: ActionNode[] = [];
  const stack: StackEntry[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const tokens = tokenizeLine(line);
    const actionParts = getLineActionParts(line, tokens);

    const nextLine = lineIdx + 1 < lines.length ? lines[lineIdx + 1] : undefined;
    const isSectionTitle = nextLine !== undefined && isUnderline(nextLine);

    const lineStart = line.search(/\S/);

    let isGroupLine = false;
    let isActionLine = false;
    let isArrowLine = false;

    if (!isSectionTitle && lineStart !== -1) {
      if (tokens[0]?.kind === "action") {
        isGroupLine = true;
        isActionLine = true;
      } else if (
        tokens[0]?.kind === "arrow" &&
        tokens[0].from === lineStart &&
        tokens[1] !== undefined &&
        tokens[1].from === tokens[0].to &&
        (tokens[1].kind === "consequence" || tokens[1].kind === "assignee")
      ) {
        isGroupLine = true;
        isArrowLine = true;
      }
    }

    if (!isGroupLine) {
      // Non-group lines break any active run. If they hold actions (e.g. topic lines), they form a whole node.
      stack.length = 0;
      if (actionParts.length > 0) {
        const sym =
          ((tokens.find((t) => t.kind === "consequence") ?? tokens.find((t) => t.kind === "action"))
            ?.symbol as ActionState | undefined) ?? null;
        const delegated = actionParts.every((p) => p.delegated) && sym === null;

        roots.push({
          lineIdx,
          kind: "line",
          from: 0,
          to: line.length,
          symbolCol: null,
          state: sym,
          delegated,
          lineStart: lineStart === -1 ? 0 : lineStart,
          depth: 0,
          whole: true,
          children: [],
        });
      }
      continue;
    }

    const indent = computeIndent(line);

    // Pop deeper levels, and siblings unless an arrow child immediately follows an action parent.
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.indent > indent) {
        stack.pop();
      } else if (top.indent === indent) {
        if (isArrowLine && top.isActionLine) {
          break;
        }
        stack.pop();
      } else {
        break;
      }
    }

    const ownPart = actionParts[0];
    let symbolCol: number | null = null;
    if (isActionLine) {
      symbolCol = tokens[0].from;
    } else if (isArrowLine && tokens[1]?.kind === "consequence") {
      symbolCol = tokens[1].from;
    }

    const lineNode: ActionNode = {
      lineIdx,
      kind: "line",
      from: ownPart.from,
      to: ownPart.to,
      symbolCol,
      state: ownPart.state,
      delegated: ownPart.delegated,
      lineStart,
      depth: 0,
      whole: false,
      children: [],
    };

    const steps: ActionNode[] = [];
    for (let sIdx = 1; sIdx < actionParts.length; sIdx++) {
      const stepPart = actionParts[sIdx];
      const arrowTok = tokens.find((t) => t.kind === "arrow" && t.from === stepPart.from);
      const nextTok = arrowTok ? tokens.find((t) => t.from === arrowTok.to) : undefined;
      const stepSymbolCol = nextTok?.kind === "consequence" ? nextTok.from : null;

      steps.push({
        lineIdx,
        kind: "step",
        from: stepPart.from,
        to: stepPart.to,
        symbolCol: stepSymbolCol,
        state: stepPart.state,
        delegated: stepPart.delegated,
        lineStart,
        depth: 0, // Assigned below relative to lineNode.depth
        stepIndex: sIdx,
        whole: false,
        children: [],
      });
    }

    lineNode.children = steps;

    if (stack.length > 0) {
      const parent = stack[stack.length - 1].node;
      lineNode.depth = parent.depth + 1;
      for (const step of steps) {
        step.depth = lineNode.depth + 1;
      }
      parent.children.push(lineNode);
      stack.push({ node: lineNode, indent, isActionLine, isArrowLine });
    } else {
      lineNode.depth = 0;
      for (const step of steps) {
        step.depth = 1;
      }
      roots.push(lineNode);
      if (isActionLine) {
        stack.push({ node: lineNode, indent, isActionLine: true, isArrowLine: false });
      } else {
        // Arrow line without parent cannot accept child lines.
        stack.length = 0;
      }
    }
  }

  return roots;
}

/** All nodes, depth-first pre-order (a node, then its children in order). */
export function flattenActionTree(roots: ActionNode[]): ActionNode[] {
  const result: ActionNode[] = [];
  function traverse(node: ActionNode) {
    result.push(node);
    for (const child of node.children) {
      traverse(child);
    }
  }
  for (const root of roots) {
    traverse(root);
  }
  return result;
}

/** Over all descendants of `node` (not the node itself) that have a state: how many there are and how many are no
 *  longer open (`v`, `x` or `>`). Delegated parts (state null) are not counted. */
export function groupProgress(node: ActionNode): { resolved: number; total: number } {
  let resolved = 0;
  let total = 0;

  function countDescendants(current: ActionNode) {
    for (const child of current.children) {
      if (child.state !== null) {
        total++;
        if (child.state === "v" || child.state === "x" || child.state === ">") {
          resolved++;
        }
      }
      countDescendants(child);
    }
  }

  countDescendants(node);
  return { resolved, total };
}

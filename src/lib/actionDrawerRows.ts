/** The Action Drawer's row model (§423): turns the snapshot's tree items into the rows the drawer shows — nesting,
 *  context rows, collapse, group progress and the due view by group. Pure, so it can be unit-tested. */
import type { ActionSnapshotItem } from "./types";
import { groupByDue, itemDueDate, type DueGroupKey } from "./dueOverview";
import { dueItems, innermostActionSymbol, stripLeadingToken } from "./tokens";

export interface DrawerRow<T extends ActionSnapshotItem = ActionSnapshotItem> {
  item: T;
  depth: number; // item.depth ?? 0
  hasChildren: boolean; // it has at least one descendant that the current filters would show
  expanded: boolean; // false only when collapsed (and no text filter is active)
  progress?: { resolved: number; total: number }; // only on rows that have descendants with a state (total > 0)
  contextOnly: boolean; // shown only because a descendant is shown
}

type State = "#" | "v" | ">" | "x";
const STATE_SYMBOLS = "#v>x";

/** An item without tree fields behaves like a whole line (today's behaviour). */
function isWhole(item: ActionSnapshotItem): boolean {
  return item.kind === undefined || item.whole === true;
}

/** The node's live state: `line[symbolCol]` when symbolCol is a number and that character is # v > x; null for a
 *  delegated node; for a whole node or an item without tree fields, `innermostActionSymbol(line)`. */
export function nodeState(item: ActionSnapshotItem): State | null {
  if (isWhole(item)) return innermostActionSymbol(item.line);
  if (item.delegated) return null;
  const col = item.symbolCol;
  if (typeof col !== "number") return null;
  const ch = item.line[col];
  return ch !== undefined && STATE_SYMBOLS.includes(ch) ? (ch as State) : null;
}

/** The text a row shows. Whole node / no tree fields: `stripLeadingToken(line)` (today). Otherwise the node's own
 *  part `line.slice(partFrom, partTo)` without its leading token: a line node's leading action symbol (+ space) or
 *  `=> <symbol> ` / `=> `; a step's `=> <symbol> ` or `=> ` (a delegated part keeps its `@name`). Leading indentation
 *  and trailing whitespace removed. */
export function nodeText(item: ActionSnapshotItem): string {
  if (isWhole(item)) return stripLeadingToken(item.line).trim();
  const part = item.line.slice(item.partFrom ?? 0, item.partTo ?? item.line.length).trim();
  if (part.startsWith("=>")) return part.replace(/^=>\s+(?:[#v>x](?:\s+|$))?/, "");
  return part.replace(/^[#v>x](?:\s+|$)/, "");
}

/** The character range [from, to) within `item.line` corresponding to `nodeText(item)`,
 *  such that `item.line.slice(from, to) === nodeText(item)`. */
export function nodeTextRange(item: ActionSnapshotItem): { from: number; to: number } {
  const isWholeNode = isWhole(item);
  const partFrom = isWholeNode ? 0 : (item.partFrom ?? 0);
  const partTo = isWholeNode ? item.line.length : (item.partTo ?? item.line.length);
  const rawPart = item.line.slice(partFrom, partTo);

  const leadWs = rawPart.match(/^\s*/)?.[0].length ?? 0;
  const trimmedStart = rawPart.slice(leadWs);

  let prefixLen = 0;
  if (trimmedStart.startsWith("=>")) {
    const m = trimmedStart.match(/^=>\s+(?:[#v>x](?:\s+|$))?/);
    prefixLen = m ? m[0].length : 0;
  } else {
    const m = trimmedStart.match(/^[#v>x](?:\s+|$)/);
    prefixLen = m ? m[0].length : 0;
  }

  const from = partFrom + leadWs + prefixLen;
  const trailWs = rawPart.length - rawPart.trimEnd().length;
  const to = Math.max(from, partTo - trailWs);
  return { from, to };
}

/** Session key for a collapsed group: note + parent text. */
export function collapseKey(item: ActionSnapshotItem): string {
  return `${item.filename}\u0000${nodeText(item)}`;
}

export interface DrawerFilter {
  onlyOpen: boolean; // the "Only open" toggle
  showDelegated: boolean; // the text filter contains "@"
  text: string; // the text filter (case-insensitive substring)
  collapsed: ReadonlySet<string>;
}

interface Index<T extends ActionSnapshotItem> {
  roots: T[];
  kids: Map<string, T[]>;
}

/** Roots and children lists, both in snapshot order. An item whose parent is not in the list counts as a root. */
function indexItems<T extends ActionSnapshotItem>(items: T[]): Index<T> {
  const ids = new Set(items.map((i) => i.id));
  const roots: T[] = [];
  const kids = new Map<string, T[]>();
  for (const item of items) {
    if (item.parentId !== undefined && ids.has(item.parentId)) {
      const list = kids.get(item.parentId);
      if (list) list.push(item);
      else kids.set(item.parentId, [item]);
    } else {
      roots.push(item);
    }
  }
  return { roots, kids };
}

/** Over ALL descendants (shown or not) that have a live state, like `groupProgress`. */
function progressOf<T extends ActionSnapshotItem>(
  item: T,
  kids: Map<string, T[]>,
): { resolved: number; total: number } | undefined {
  let total = 0;
  let resolved = 0;
  const visit = (parent: T) => {
    for (const child of kids.get(parent.id) ?? []) {
      const state = nodeState(child);
      if (state !== null) {
        total++;
        if (state !== "#") resolved++;
      }
      visit(child);
    }
  };
  visit(item);
  return total > 0 ? { resolved, total } : undefined;
}

/** Does the node's own text (or, for a whole node, its full line) contain the lower-cased needle. */
function ownTextMatches(item: ActionSnapshotItem, needle: string): boolean {
  return (isWhole(item) ? item.line : nodeText(item)).toLowerCase().includes(needle);
}

/** Normal view's state rule (a): "Only open", and delegated parts only with `@` in the filter. */
function passesState(item: ActionSnapshotItem, f: { onlyOpen: boolean; showDelegated: boolean }): boolean {
  if (!isWhole(item) && item.delegated) return f.showDelegated; // no state of its own: "Only open" does not hide it
  if (f.onlyOpen && nodeState(item) !== "#") return false;
  if (isWhole(item) && item.line.includes("=> @") && !f.showDelegated) return false;
  return true;
}

interface WalkCtx<T extends ActionSnapshotItem, U extends T> {
  kids: Map<string, T[]>;
  needle: string; // lower-cased text filter, "" for none
  collapsed: ReadonlySet<string>;
  /** The state part of "passes" (the text part is applied by the walk). */
  accept: (item: T, isRoot: boolean) => boolean;
  /** A group root is listed even when it does not pass (no text filter only). */
  rootAlways: boolean;
  decorate: (item: T) => U;
}

/** The rows of one node and its subtree: the node first, then its shown descendants (unless collapsed). */
function walk<T extends ActionSnapshotItem, U extends T>(
  item: T,
  isRoot: boolean,
  ancestorMatch: boolean,
  ctx: WalkCtx<T, U>,
): DrawerRow<U>[] {
  // A match on a node's own text, or on one of its ancestors', makes the node's text part pass.
  const textOk = ctx.needle === "" || ancestorMatch || ownTextMatches(item, ctx.needle);
  const childRows: DrawerRow<U>[] = [];
  for (const child of ctx.kids.get(item.id) ?? []) childRows.push(...walk(child, false, textOk, ctx));
  const passes = textOk && ctx.accept(item, isRoot);
  const hasChildren = childRows.length > 0;
  if (!passes && !hasChildren && !(isRoot && ctx.rootAlways && ctx.needle === "")) return [];
  const collapsed = hasChildren && ctx.needle === "" && ctx.collapsed.has(collapseKey(item));
  const row: DrawerRow<U> = {
    item: ctx.decorate(item),
    depth: item.depth ?? 0,
    hasChildren,
    expanded: !collapsed,
    contextOnly: !passes,
  };
  const progress = progressOf(item, ctx.kids);
  if (progress) row.progress = progress;
  return collapsed ? [row] : [row, ...childRows];
}

/** Normal view. `items` in snapshot order (several notes, each note's nodes depth-first). Returns the visible rows
 *  in the same order. */
export function buildDrawerRows<T extends ActionSnapshotItem>(items: T[], f: DrawerFilter): DrawerRow<T>[] {
  const { roots, kids } = indexItems(items);
  const ctx: WalkCtx<T, T> = {
    kids,
    needle: f.text.toLowerCase(),
    collapsed: f.collapsed,
    accept: (item) => passesState(item, f),
    rootAlways: false,
    decorate: (item) => item,
  };
  const rows: DrawerRow<T>[] = [];
  for (const root of roots) rows.push(...walk(root, true, false, ctx));
  return rows;
}

/** One tree line a row draws at `level` (under the glyph of its ancestor at that depth): "tee" joins the row to that
 *  ancestor and continues to a later sibling, "end" joins it as the last one, "through" passes by to a later child. */
export interface TreeGuide {
  level: number;
  kind: "tee" | "end" | "through";
}

/** The drawer's tree lines, drawn as in the editor: from below a parent's glyph down to its last child, with an
 *  elbow to each child. Steps get them too (§427: a one-line sequence looks like numbered lines under the action), so
 *  only the depth matters. `rows` in display order with their shown depth. `stub`: the row's own line starts below
 *  its glyph. */
export function drawerTreeGuides(rows: { depth: number }[]): { guides: TreeGuide[]; stub: boolean }[] {
  // Is there a child of the depth-k node above row i further down, before that node's subtree ends.
  const laterChild = (i: number, k: number): boolean => {
    for (let j = i + 1; j < rows.length && rows[j].depth > k; j++) {
      if (rows[j].depth === k + 1) return true;
    }
    return false;
  };
  return rows.map((r, i) => {
    const guides: TreeGuide[] = [];
    for (let k = 0; k < r.depth; k++) {
      const more = laterChild(i, k);
      if (k === r.depth - 1) guides.push({ level: k, kind: more ? "tee" : "end" });
      else if (more) guides.push({ level: k, kind: "through" });
    }
    return { guides, stub: laterChild(i, r.depth) };
  });
}

/** A node's own due date:the earliest date of the due tokens inside its own part, counted only when the node is
 *  open own or, with `showDelegated`, delegated. A whole node: `itemDueDate`, as today. */
function ownDueDate(item: ActionSnapshotItem, showDelegated: boolean): string | null {
  if (isWhole(item)) return itemDueDate(item.line, showDelegated);
  const counts = (nodeState(item) === "#" && !item.delegated) || (showDelegated && item.delegated === true);
  if (!counts) return null;
  const from = item.partFrom ?? 0;
  const to = item.partTo ?? item.line.length;
  let best: string | null = null;
  for (const d of dueItems(item.line)) {
    if (d.date && d.from >= from && d.from < to && (best === null || d.date < best)) best = d.date;
  }
  return best;
}

/** Due view: groups placed in Overdue / Today / This week / Later, by the earliest own due date inside the group. */
export function buildDueDrawerRows<T extends ActionSnapshotItem>(
  items: T[],
  todayISO: string,
  f: Omit<DrawerFilter, "onlyOpen">,
): { key: DueGroupKey; rows: DrawerRow<T & { dueDate?: string }>[] }[] {
  const { roots, kids } = indexItems(items);
  const dueCache = new Map<string, string | null>();
  const dueOf = (item: T): string | null => {
    let due = dueCache.get(item.id);
    if (due === undefined) {
      due = ownDueDate(item, f.showDelegated);
      dueCache.set(item.id, due);
    }
    return due;
  };

  const groupDue = (root: T): string | null => {
    let best = dueOf(root);
    for (const child of kids.get(root.id) ?? []) {
      const d = groupDue(child);
      if (d !== null && (best === null || d < best)) best = d;
    }
    return best;
  };

  const candidates: { filename: string; lineIdx: number; dueDate: string; root: T }[] = [];
  for (const root of roots) {
    const dueDate = groupDue(root);
    if (dueDate !== null) candidates.push({ filename: root.filename, lineIdx: root.lineIdx, dueDate, root });
  }

  // A dated root brings its open descendants; a group listed only because of a dated child shows its root (and any
  // line between) as context and just the dated lines, so undated siblings do not crowd the due view.
  let rootDated = false;
  const ctx: WalkCtx<T, T & { dueDate?: string }> = {
    kids,
    needle: f.text.toLowerCase(),
    collapsed: f.collapsed,
    accept: (item, isRoot) => {
      // Resolved descendants are hidden (they only count in `progress`).
      if (isRoot) return rootDated;
      if (!rootDated) return dueOf(item) !== null;
      if (nodeState(item) === "#") return true;
      return f.showDelegated && !isWhole(item) && item.delegated === true;
    },
    rootAlways: true,
    decorate: (item) => {
      const dueDate = dueOf(item);
      return dueDate === null ? item : { ...item, dueDate };
    },
  };

  const result: { key: DueGroupKey; rows: DrawerRow<T & { dueDate?: string }>[] }[] = [];
  for (const group of groupByDue(candidates, todayISO)) {
    const rows: DrawerRow<T & { dueDate?: string }>[] = [];
    for (const c of group.items) {
      rootDated = dueOf(c.root) !== null;
      rows.push(...walk(c.root, true, false, ctx));
    }
    if (rows.length > 0) result.push({ key: group.key, rows });
  }
  return result;
}

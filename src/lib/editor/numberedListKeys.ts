import { isolateHistory } from "@codemirror/commands";
import { Annotation, EditorState, Prec, Transaction, type ChangeSpec, type Text, type TransactionSpec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  backspaceContinuation,
  backspaceMarker,
  continuationStops,
  emptySubItemEnter,
  findParentInBlock,
  findParentInRun,
  getBlockForLine,
  getGroupsInBlock,
  getTouchedRuns,
  indentLen,
  listGroups,
  matchGroupStarts,
  parseBulletItem,
  parseListItem,
  refreshRunsForLine,
  renumberEdited,
  renumberLists,
  renumberPrepared,
  shiftTabIndentTarget,
  tabIndentTarget,
  tabIndentTargetInRun,
  type ListBlock,
  type NumberedGroup,
} from "../numberedLists";
import { tokenizeLine } from "../grammar/tokenize";
import { parseNumberedItem, shiftLineIndent } from "../tokens";

/** Marks a transaction whose numbering is already done, so the renumber filter leaves it alone. */
export const renumbered = Annotation.define<boolean>();

function lineChanges(doc: Text, offset: number, before: string[], after: string[]): ChangeSpec[] {
  const out: ChangeSpec[] = [];
  if (after.length === 0) return out;
  let lineFrom = doc.line(offset + 1).from;
  const sepLen = offset + 1 < doc.lines ? doc.line(offset + 2).from - doc.line(offset + 1).to : 1;
  for (let i = 0; i < after.length; i++) {
    const old = before[i];
    const text = after[i];
    if (old !== text) {
      let p = 0;
      while (p < old.length && p < text.length && old[p] === text[p]) p++;
      let s = 0;
      while (s < old.length - p && s < text.length - p && old[old.length - 1 - s] === text[text.length - 1 - s]) s++;
      out.push({ from: lineFrom + p, to: lineFrom + old.length - s, insert: text.slice(p, text.length - s) });
    }
    lineFrom += old.length + sepLen;
  }
  return out;
}

/** Read only the run(s) of non-blank lines covering `[minIdx, maxIdx]` (0-based), so edits never split the whole note
 * (rule 15). */
function readRunSlice(doc: Text, minIdx: number, maxIdx: number): { offset: number; lines: string[] } {
  const clampedMin = Math.max(0, minIdx);
  const clampedMax = Math.min(doc.lines - 1, maxIdx);
  let start = clampedMin;
  const head: string[] = [];
  if (doc.line(start + 1).text.trim() !== "") {
    while (start > 0) {
      const t = doc.line(start).text;
      if (t.trim() === "") break;
      head.push(t);
      start--;
    }
    if (head.length > 1) head.reverse();
  }
  const mid: string[] = [];
  const midIter = doc.iterLines(clampedMin + 1, clampedMax + 2);
  while (!midIter.next().done) mid.push(midIter.value);
  if (clampedMax < doc.lines - 1 && mid.length > 0 && mid[mid.length - 1].trim() !== "") {
    const endIter = doc.iterLines(clampedMax + 2, doc.lines + 1);
    while (!endIter.next().done) {
      if (endIter.value.trim() === "") break;
      mid.push(endIter.value);
    }
  }
  return { offset: start, lines: head.length > 0 ? [...head, ...mid] : mid };
}

/** Build a list-edit TransactionSpec for `state` without dispatching it, so callers with a non-empty selection can compose both changes into one undo step. */
function listEditSpec(
  state: EditorState,
  after: string[],
  userEvent: string,
  anchor?: number,
  offset = 0,
  before?: string[],
): TransactionSpec {
  const prev = before ?? Array.from({ length: after.length }, (_, i) => state.doc.line(offset + i + 1).text);
  const cs = state.changes(lineChanges(state.doc, offset, prev, after));
  return {
    changes: cs,
    selection: anchor !== undefined ? { anchor } : state.selection.map(cs),
    userEvent,
    annotations: [renumbered.of(true), isolateHistory.of("full")],
    scrollIntoView: true,
  };
}

/** Dispatch a list edit given as the slice's lines after it (same line count), in one undo step. The selection
 * is mapped through the change unless `anchor` (a position in the new document) is given. */
export function applyListEdit(
  view: EditorView,
  after: string[],
  userEvent: string,
  anchor?: number,
  offset = 0,
  before?: string[],
): boolean {
  view.dispatch(listEditSpec(view.state, after, userEvent, anchor, offset, before));
  return true;
}

/** `working` with its touched lists renumbered (rule 5); group starts carried over from `before`, the lines having
 * the same indices on both sides. `extraStarts` overrides them. */
function withRenumbering(
  before: string[],
  working: string[],
  touched: number[],
  extraStarts?: Map<number, number>,
  skipWidthShift?: Set<number>,
): string[] {
  const out = [...working];
  for (const e of renumberEdited(before, working, touched, extraStarts, skipWidthShift)) out[e.line] = e.text;
  return out;
}

/** `line` with its leading whitespace replaced by `indent`; a numbered marker can be swapped in at the same time. */
function reindent(line: string, indent: string, marker?: string): string {
  const num = parseNumberedItem(line);
  if (num) return indent + (marker ?? num.marker) + line.slice(num.markerEnd);
  return indent + line.replace(/^\s*/, "");
}

/** The selected line range (0-based) and the first list line among them, reading only the run around the selection. */
function selectedLines(
  state: EditorState,
): { offset: number; lines: string[]; first: number; last: number; firstList: number } | null {
  if (state.selection.ranges.length > 1) return null;
  const sel = state.selection.main;
  const firstDoc = state.doc.lineAt(sel.from).number - 1;
  // A selection ending at the very start of a line (Shift+Down) does not take that line along, as in CodeMirror's own
  // indent commands.
  const endAt = !sel.empty && state.doc.lineAt(sel.to).from === sel.to ? sel.to - 1 : sel.to;
  const lastDoc = Math.max(firstDoc, state.doc.lineAt(endAt).number - 1);
  let firstListDoc = -1;
  for (let i = firstDoc; i <= lastDoc; i++) {
    if (parseListItem(state.doc.line(i + 1).text) !== null) {
      firstListDoc = i;
      break;
    }
  }
  if (firstListDoc === -1) return null;
  const { offset, lines } = readRunSlice(state.doc, firstDoc, lastDoc);
  return {
    offset,
    lines,
    first: firstDoc - offset,
    last: lastDoc - offset,
    firstList: firstListDoc - offset,
  };
}

function groupsOf(lines: string[], idx: number): { first: number; indent: number; delimiter: "." | ")"; parent: number | null; size: number }[] {
  const block = getBlockForLine(lines, idx);
  return block ? getGroupsInBlock(lines, block).map((g) => ({ ...g, size: g.items.length })) : [];
}

/** §462 / rule 14: the marker for line `idx` as the first item of a new group under a numbered parent, when its list
 * already numbers sub-items in the dotted style (`1.1.`): counts only dotted items whose parent is numbered and whose
 * delimiter matches. */
function dottedFirstMarker(lines: string[], idx: number, delimiter: "." | ")"): string | null {
  const block = getBlockForLine(lines, idx);
  if (!block) return null;
  const parent = findParentInBlock(lines, block, idx);
  if (!parent || parent.item.kind !== "numbered") return null;
  const parentStack: { kind: "numbered" | "bullet"; indent: number }[] = [];
  for (let i = block.start; i <= block.end; i++) {
    const item = parseListItem(lines[i]);
    if (!item) continue;
    const ind = indentLen(item.indent);
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].indent >= ind) parentStack.pop();
    const itemParent = parentStack[parentStack.length - 1];
    parentStack.push({ kind: item.kind, indent: ind });
    if (i === idx) continue;
    if (
      item.kind === "numbered" &&
      item.delimiter === delimiter &&
      item.numbers.length > 1 &&
      itemParent?.kind === "numbered"
    ) {
      return [...parent.item.numbers, 1].join(".") + delimiter;
    }
  }
  return null;
}

/** Shift every selected line's indent by `delta` columns (never below 0). */
function shiftLines(lines: string[], first: number, last: number, delta: number): string[] {
  const out = [...lines];
  for (let i = first; i <= last; i++) {
    out[i] = shiftLineIndent(lines[i], delta);
  }
  return out;
}

/** If a bullet sits right above `idx` at the same indent within its parent, return the shift needed to reach its text
 * column (rule 1). */
function bulletAboveDelta(lines: string[], idx: number): number | null {
  const item = parseListItem(lines[idx]);
  if (!item) return null;
  const block = getBlockForLine(lines, idx);
  if (!block) return null;
  const myIndent = indentLen(item.indent);
  for (let i = idx - 1; i >= block.start; i--) {
    const prev = parseListItem(lines[i]);
    if (!prev) continue;
    const prevIndent = indentLen(prev.indent);
    if (prevIndent < myIndent) return null;
    if (prevIndent === myIndent) {
      return prev.kind === "bullet" ? prevIndent + prev.marker.length + 1 - myIndent : null;
    }
  }
  return null;
}

/** Shift an entire numbered group and all of its subtrees (deeper lines after each item) by `delta` columns (rule 1). */
function shiftGroupWithSubtrees(lines: string[], block: ListBlock, group: NumberedGroup, delta: number): string[] {
  const out = [...lines];
  for (const item of group.items) {
    out[item.line] = shiftLineIndent(lines[item.line], delta);
    for (let j = item.line + 1; j <= block.end; j++) {
      if (indentLen(lines[j].match(/^\s*/)![0]) <= group.indent) break;
      out[j] = shiftLineIndent(lines[j], delta);
    }
  }
  return out;
}

/** Tab / Shift+Tab on a line under a list item that is not one itself: to the next (or previous) of the list's
 * columns, so it lines up with the items' text or indent; the lists around it are renumbered, since an indented line
 * can join two of them. */
function continuationIndent(view: EditorView, forward: boolean): boolean {
  const state = view.state;
  if (state.selection.ranges.length > 1) return false;
  const sel = state.selection.main;
  const line = state.doc.lineAt(sel.from);
  if (state.doc.lineAt(sel.to).number !== line.number) return false;
  const idx = line.number - 1;
  const minIdx = Math.max(0, idx - 1);
  const maxIdx = Math.min(state.doc.lines - 1, idx + 1);
  const { offset, lines } = readRunSlice(state.doc, minIdx, maxIdx);
  const localIdx = idx - offset;
  const stops = continuationStops(lines, localIdx);
  const lead = line.text.match(/^\s*/)![0];
  const cur = indentLen(lead);
  const target = forward ? stops.find((s) => s > cur) : [...stops].reverse().find((s) => s < cur);
  if (target === undefined) return false;
  const working = [...lines];
  working[localIdx] = " ".repeat(target) + line.text.slice(lead.length);
  const touched = [localIdx - 1, localIdx, localIdx + 1].filter((i) => i >= 0 && i < lines.length);
  // A caret in the indent (or on an empty line) goes to where the text starts.
  const anchor = sel.empty && sel.head - line.from <= lead.length ? line.from + target : undefined;
  return applyListEdit(view, withRenumbering(lines, working, touched), "input.indent", anchor, offset, lines);
}

/** Rules 1, 2, 14: Tab moves a list line under the text of the numbered item before it at the same indent, or moves
 * the whole group +2 (or under a bullet right above) when it is the first item of its group. */
export function tabCommand(view: EditorView): boolean {
  if (continuationIndent(view, true)) return true;
  const s = selectedLines(view.state);
  if (!s) return false;
  const { offset, lines, first, last, firstList } = s;

  if (first === last) {
    const beforeRun = getTouchedRuns(lines, [first])[0];
    if (!beforeRun) return false;
    const target = tabIndentTargetInRun(beforeRun, first);
    const parsedItem = beforeRun.parsed[first - beforeRun.runStart];
    const num = parsedItem?.kind === "numbered" ? parsedItem : null;

    if (target === null) {
      if (!num) return false;
      const group = getGroupsInBlock(lines, beforeRun.block, beforeRun.runStart, beforeRun.parsed).find(
        (g) => g.first === first,
      );
      const delta = bulletAboveDelta(lines, first) ?? 2;
      if (group) {
        const working = shiftGroupWithSubtrees(lines, beforeRun.block, group, delta);
        return applyListEdit(view, withRenumbering(lines, working, [first]), "input.indent", undefined, offset, lines);
      }
      // Non-first item with a bullet right above it: move this line under the bullet and start a new sub-group.
      const working = [...lines];
      working[first] = shiftLineIndent(lines[first], delta);
      const extra = new Map<number, number>([[first, 1]]);
      return applyListEdit(
        view,
        withRenumbering(lines, working, [first], extra, new Set([first])),
        "input.indent",
        undefined,
        offset,
        lines,
      );
    }

    const working = [...lines];
    working[first] = reindent(lines[first], target);
    const extra = new Map<number, number>();
    let refreshed = refreshRunsForLine(working, beforeRun, first, first);
    if (!refreshed) return false;
    if (num) {
      // Rule 2: first (or alone) in the group under its new parent, it starts again at 1; plain style takes the
      // list's dotted style if any, even when putting this item in front of an existing dotted sub-group (rule 14).
      const parent = findParentInRun(refreshed.run, first);
      const parentIdx = parent?.index ?? null;
      const group = refreshed.groups.find(
        (g) => g.indent === indentLen(target) && g.delimiter === num.delimiter && g.parent === parentIdx,
      );
      if (group && group.first === first) {
        if (num.numbers.length === 1) {
          const runRef = refreshed.run;
          const hasDotted =
            parent?.item.kind === "numbered" &&
            refreshed.groups.some(
              (g) =>
                g.delimiter === num.delimiter &&
                g.parent !== null &&
                runRef.parsed[g.parent - runRef.runStart]?.kind === "numbered" &&
                g.items.some((it) => it.line !== first && it.item.numbers.length > 1),
            );
          const prevLine = working[first];
          if (hasDotted && parent?.item.kind === "numbered") {
            working[first] = reindent(lines[first], target, [...parent.item.numbers, 1].join(".") + num.delimiter);
          } else if (group.items.length === 1) {
            working[first] = reindent(lines[first], target, `1${num.delimiter}`);
          }
          if (working[first] !== prevLine) {
            refreshed = refreshRunsForLine(working, beforeRun, first, first) ?? refreshed;
          }
        }
        extra.set(first, 1);
      }
    }
    const edits = renumberPrepared(lines, beforeRun, working, refreshed.run, refreshed.groups, extra, new Set([first]));
    const after = [...working];
    for (const e of edits) after[e.line] = e.text;
    return applyListEdit(view, after, "input.indent", undefined, offset, lines);
  }

  const target = tabIndentTarget(lines, firstList);

  const curIndent = indentLen(lines[firstList].match(/^\s*/)![0]);
  const delta =
    target !== null ? indentLen(target) - curIndent : (bulletAboveDelta(lines, firstList) ?? 2);
  if (delta <= 0) return false;
  const touched = Array.from({ length: last - first + 1 }, (_, k) => first + k);
  const oldFirsts = new Set(listGroups(lines, touched).map((g) => g.first));
  const working = shiftLines(lines, first, last, delta);
  const extra = new Map<number, number>();
  for (const g of listGroups(working, touched)) {
    if (g.first >= first && g.first <= last) {
      if (target !== null || !oldFirsts.has(g.first)) {
        extra.set(g.first, 1);
        const num = parseNumberedItem(working[g.first]);
        const dotted = num && num.numbers.length === 1 ? dottedFirstMarker(working, g.first, g.delimiter) : null;
        if (dotted) working[g.first] = reindent(working[g.first], working[g.first].match(/^\s*/)![0], dotted);
      }
    } else if (g.first > last && !oldFirsts.has(g.first)) {
      // Rule 1: a group that now starts right after the selection starts again at 1.
      extra.set(g.first, 1);
    }
  }
  return applyListEdit(
    view,
    withRenumbering(lines, working, touched, extra, new Set(touched)),
    "input.indent",
    undefined,
    offset,
    lines,
  );
}

/** Rules 1, 3, 9: Shift+Tab moves a list line out to its parent's indent (or back by 2 for an indented top-level
 * group); the outer list continues and sub-items left behind start at 1. */
export function shiftTabCommand(view: EditorView): boolean {
  if (continuationIndent(view, false)) return true;
  const s = selectedLines(view.state);
  if (!s) return false;
  const { offset, lines, first, last, firstList } = s;
  const target = shiftTabIndentTarget(lines, firstList);

  if (first === last) {
    if (target === null) {
      const num = parseNumberedItem(lines[first]);
      if (!num) return false;
      const myIndent = indentLen(num.indent);
      if (myIndent === 0) return false;
      const block = getBlockForLine(lines, first);
      const group = block ? getGroupsInBlock(lines, block).find((g) => g.first === first && g.parent === null) : undefined;
      if (!block || !group) return false;
      const working = shiftGroupWithSubtrees(lines, block, group, -Math.min(2, myIndent));
      return applyListEdit(view, withRenumbering(lines, working, [first]), "input.indent", undefined, offset, lines);
    }

    const working = [...lines];
    working[first] = reindent(lines[first], target);
    // Rule 3: the items that followed it in its old group are now its children, numbered from 1.
    const extra = new Map<number, number>();
    for (const g of listGroups(working, [first])) if (g.parent === first) extra.set(g.first, 1);
    return applyListEdit(
      view,
      withRenumbering(lines, working, [first], extra, new Set([first])),
      "input.indent",
      undefined,
      offset,
      lines,
    );
  }

  const curIndent = indentLen(lines[firstList].match(/^\s*/)![0]);
  const delta = target !== null ? indentLen(target) - curIndent : -Math.min(2, curIndent);
  if (delta >= 0) return false;
  const touched = Array.from({ length: last - first + 1 }, (_, k) => first + k);
  const oldFirsts = new Set(listGroups(lines, touched).map((g) => g.first));
  const working = shiftLines(lines, first, last, delta);
  const extra = new Map<number, number>();
  for (const g of listGroups(working, touched)) {
    // Rule 9: sub-items (or trailing siblings) left behind that now start a group start again at 1.
    if (g.first > last && !oldFirsts.has(g.first)) extra.set(g.first, 1);
  }
  return applyListEdit(
    view,
    withRenumbering(lines, working, touched, extra, new Set(touched)),
    "input.indent",
    undefined,
    offset,
    lines,
  );
}

/** Pure spec builder for moving an empty sub-item out as the parent list's next item (rules 7 and 8). */
export function moveEmptySubItemOutSpec(
  state: EditorState,
  lineFrom: number,
  lineIdx: number,
  userEvent: string,
): TransactionSpec | null {
  const { offset, lines } = readRunSlice(state.doc, lineIdx, lineIdx);
  const localIdx = lineIdx - offset;
  const subReplacement = emptySubItemEnter(lines, localIdx);
  if (subReplacement === null) return null;

  const working = [...lines];
  working[localIdx] = subReplacement;
  const extra = new Map<number, number>();
  for (const g of listGroups(working, [localIdx])) if (g.parent === localIdx) extra.set(g.first, 1);
  return listEditSpec(
    state,
    withRenumbering(lines, working, [localIdx], extra),
    userEvent,
    lineFrom + subReplacement.length,
    offset,
    lines,
  );
}

/** Shared helper for moving an empty sub-item out as the parent list's next item (rules 7 and 8). */
export function moveEmptySubItemOut(view: EditorView, lineFrom: number, lineIdx: number, userEvent: string): boolean {
  const spec = moveEmptySubItemOutSpec(view.state, lineFrom, lineIdx, userEvent);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}

/** Pure spec builder for exiting a numbered list on an empty item (rule 4). */
export function exitNumberedListSpec(state: EditorState, lineFrom: number, lineIdx: number): TransactionSpec {
  const minIdx = Math.max(0, lineIdx - 1);
  const maxIdx = Math.min(state.doc.lines - 1, lineIdx + 1);
  const { offset, lines } = readRunSlice(state.doc, minIdx, maxIdx);
  const localIdx = lineIdx - offset;
  const working = [...lines];
  working[localIdx] = "";
  const touched = [localIdx - 1, localIdx, localIdx + 1].filter((i) => i >= 0 && i < lines.length);
  return listEditSpec(state, withRenumbering(lines, working, touched), "input", lineFrom, offset, lines);
}

/** Exit a numbered list on an empty item in the middle (or end) of a list, renumbering any split-off tail (rule 4). */
export function exitNumberedList(view: EditorView, lineFrom: number, lineIdx: number): boolean {
  view.dispatch(exitNumberedListSpec(view.state, lineFrom, lineIdx));
  return true;
}

/** Rules 6 and 7, and §457: Backspace on an empty sub-item with a numbered parent moves it out; Backspace at a
 * numbered item's text start removes the marker; a second one removes the continuation indent and renumbers. */
function backspaceCommand(view: EditorView): boolean {
  const state = view.state;
  const sel = state.selection.main;
  if (state.selection.ranges.length > 1 || !sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const idx = line.number - 1;
  const col = sel.head - line.from;

  // Rule 7: Backspace on an empty sub-item (caret after marker) moves it out like Enter does.
  const num = parseNumberedItem(line.text);
  const bullet = num ? null : parseBulletItem(line.text);
  if (
    ((num && num.text === "" && col > num.markerEnd) ||
      (bullet && bullet.text === "" && col > bullet.indent.length + bullet.marker.length)) &&
    col === line.text.length &&
    moveEmptySubItemOut(view, line.from, idx, "delete.backward")
  ) {
    return true;
  }

  const minIdx = Math.max(0, idx - 1);
  const maxIdx = Math.min(state.doc.lines - 1, idx + 1);
  const { offset, lines } = readRunSlice(state.doc, minIdx, maxIdx);
  const localIdx = idx - offset;
  const touched = [localIdx - 1, localIdx, localIdx + 1].filter((i) => i >= 0 && i < lines.length);

  const withoutMarker = backspaceMarker(lines, localIdx, col);
  if (withoutMarker !== null) {
    const working = [...lines];
    working[localIdx] = withoutMarker;
    const anchor = line.from + withoutMarker.match(/^\s*/)![0].length;
    return applyListEdit(view, withRenumbering(lines, working, touched), "delete.backward", anchor, offset, lines);
  }
  const outdented = backspaceContinuation(lines, localIdx, col);
  if (outdented !== null) {
    const working = [...lines];
    working[localIdx] = outdented;
    const anchor = line.from + outdented.match(/^\s*/)![0].length;
    return applyListEdit(view, withRenumbering(lines, working, touched), "delete.backward", anchor, offset, lines);
  }
  return false;
}

export const numberedListKeymap = Prec.high(
  keymap.of([
    { key: "Tab", run: tabCommand },
    { key: "Shift-Tab", run: shiftTabCommand },
    { key: "Backspace", run: backspaceCommand },
  ]),
);

function hasLeadingStatePrefix(line: string): boolean {
  const [first] = tokenizeLine(line);
  return first?.kind === "action" || first?.kind === "topic";
}

/** Rule 4, 5, 12, 15: deleting, cutting, moving or pasting lines in a list renumbers it, and so does typing or
 * deleting that turns a line from blank into text or back (joining or splitting lists), or adding/removing a state
 * symbol on a numbered item. Typing a number or deleting a digit (including on a blank line between lists) never
 * renumbers anything. */
export const numberedListRenumberFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.annotation(renumbered)) return tr;
  const ev = tr.annotation(Transaction.userEvent);
  if (!ev) return tr;
  const typing = ev === "input" || ev.startsWith("input.type") || ev.startsWith("input.complete");
  const isDelete = ev.startsWith("delete");
  const isPasteOrDrop = ev === "input.paste" || ev === "input.drop";
  if (!(typing || isDelete || ev === "move.line" || isPasteOrDrop)) return tr;

  const oldDoc = tr.startState.doc;
  const newDoc = tr.newDoc;
  let lineBreaks = false;
  let blankChanged = false;
  let stateChanged = false;
  let digitEdit = false;
  let listPaste = false;
  const oldTouched: number[] = [];
  const newTouched: number[] = [];
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    const a0 = oldDoc.lineAt(fromA).number - 1;
    const a1 = oldDoc.lineAt(toA).number - 1;
    const b0 = newDoc.lineAt(fromB).number - 1;
    const b1 = newDoc.lineAt(toB).number - 1;
    if (inserted.lines > 1 || a1 !== a0) {
      lineBreaks = true;
      if (typing && a0 === a1 && fromA === toA) {
        const lineObj = oldDoc.line(a0 + 1);
        const oldItem = parseNumberedItem(lineObj.text);
        const col = fromA - lineObj.from;
        if (oldItem && col > oldItem.indent.length && col < oldItem.markerEnd) digitEdit = true;
      }
    } else {
      const oldLine = oldDoc.line(a0 + 1).text;
      const newLine = newDoc.line(b0 + 1).text;
      if ((oldLine.trim() === "") !== (newLine.trim() === "")) blankChanged = true;
      if (
        (parseNumberedItem(oldLine) !== null) !== (parseNumberedItem(newLine) !== null) &&
        hasLeadingStatePrefix(oldLine) !== hasLeadingStatePrefix(newLine)
      ) {
        stateChanged = true;
      }
      if (typing && /^\s*\d/.test(newLine)) digitEdit = true;
      if (isDelete && /^\s*\d/.test(oldLine) && parseNumberedItem(oldLine) === null) digitEdit = true;
      if (isPasteOrDrop && (parseNumberedItem(oldLine) !== null || parseNumberedItem(newLine) !== null)) listPaste = true;
    }
    for (let i = a0; i <= a1; i++) oldTouched.push(i);
    for (let i = b0; i <= b1; i++) newTouched.push(i);
  });
  if (digitEdit) return tr;
  if (typing ? !(lineBreaks || blankChanged || stateChanged) : !(lineBreaks || blankChanged || listPaste || stateChanged)) {
    return tr;
  }

  // Include neighbors around every changed line so a pasted blank line or moved non-list line splits both sides.
  const around = (list: number[], max: number) =>
    [...new Set(list.flatMap((i) => [i - 1, i, i + 1]))].filter((i) => i >= 0 && i < max);
  const touchedOld = around(oldTouched, oldDoc.lines);
  const touchedNew = around(newTouched, newDoc.lines);
  if (touchedNew.length === 0) return tr;

  // A loop, not Math.min(...list): a select-all delete of a very long note would overflow the argument stack.
  const span = (list: number[]) => list.reduce((r, i) => [Math.min(r[0], i), Math.max(r[1], i)], [Infinity, -Infinity]);
  const [newMin, newMax] = span(touchedNew);
  const { offset: newOffset, lines: newLines } = readRunSlice(newDoc, newMin, newMax);
  const localNewTouched = touchedNew.map((t) => t - newOffset);
  const newGroups = listGroups(newLines, localNewTouched);
  if (newGroups.length === 0) return tr;

  const [oldMin, oldMax] = touchedOld.length > 0 ? span(touchedOld) : [0, 0];
  const { offset: oldOffset, lines: oldLines } =
    touchedOld.length > 0 ? readRunSlice(oldDoc, oldMin, oldMax) : { offset: 0, lines: [] as string[] };
  const localOldTouched = touchedOld.map((t) => t - oldOffset);

  const starts = matchGroupStarts(listGroups(oldLines, localOldTouched), newGroups, (oldLocalFirst) => {
    // Backwards: a change that starts at the list's first line (a line moved, the first item deleted) must not
    // carry the old first line past it, or the old start is lost.
    const mapped = tr.changes.mapPos(oldDoc.line(oldOffset + oldLocalFirst + 1).from, -1);
    return newDoc.lineAt(mapped).number - 1 - newOffset;
  });
  const after = [...newLines];
  for (const e of renumberLists(newLines, localNewTouched, starts)) after[e.line] = e.text;
  const changes = lineChanges(newDoc, newOffset, newLines, after);
  if (changes.length === 0) return tr;
  return [tr, { changes, sequential: true, annotations: renumbered.of(true) }];
});

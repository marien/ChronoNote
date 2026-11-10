import { Annotation, EditorState, Prec, Transaction, type ChangeSpec, type Text } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  backspaceContinuation,
  backspaceMarker,
  findParentInBlock,
  continuationStops,
  getBlockForLine,
  getGroupsInBlock,
  indentLen,
  listGroups,
  matchGroupStarts,
  parseListItem,
  renumberLists,
  shiftTabIndentTarget,
  tabIndentTarget,
} from "../numberedLists";
import { parseNumberedItem } from "../tokens";

/** Marks a transaction whose numbering is already done, so the renumber filter leaves it alone. */
export const renumbered = Annotation.define<boolean>();

/** Only the part of a line that differs (common prefix and suffix kept), so a caret in the untouched text keeps its
 * place when the selection is mapped through the change. */
function lineChange(doc: Text, idx: number, text: string): ChangeSpec | null {
  const l = doc.line(idx + 1);
  const old = l.text;
  if (old === text) return null;
  let p = 0;
  while (p < old.length && p < text.length && old[p] === text[p]) p++;
  let s = 0;
  while (s < old.length - p && s < text.length - p && old[old.length - 1 - s] === text[text.length - 1 - s]) s++;
  return { from: l.from + p, to: l.to - s, insert: text.slice(p, text.length - s) };
}

function lineChanges(doc: Text, before: string[], after: string[]): ChangeSpec[] {
  const out: ChangeSpec[] = [];
  for (let i = 0; i < after.length; i++) {
    if (after[i] === before[i]) continue;
    const c = lineChange(doc, i, after[i]);
    if (c) out.push(c);
  }
  return out;
}

/** Dispatch a list edit given as the document's lines after it (same line count), in one undo step. The selection
 * is mapped through the change unless `anchor` (a position in the new document) is given. */
export function applyListEdit(view: EditorView, after: string[], userEvent: string, anchor?: number): boolean {
  const state = view.state;
  const before = state.doc.toString().split("\n");
  const cs = state.changes(lineChanges(state.doc, before, after));
  view.dispatch({
    changes: cs,
    selection: anchor !== undefined ? { anchor } : state.selection.map(cs),
    userEvent,
    annotations: renumbered.of(true),
    scrollIntoView: true,
  });
  return true;
}

/** `working` with its touched lists renumbered (rule 5); group starts carried over from `before`, the lines having
 * the same indices on both sides. `extraStarts` overrides them. */
function withRenumbering(before: string[], working: string[], touched: number[], extraStarts?: Map<number, number>): string[] {
  const starts = matchGroupStarts(listGroups(before, touched), listGroups(working, touched), (first) => first);
  for (const [k, v] of extraStarts ?? []) starts.set(k, v);
  const out = [...working];
  for (const e of renumberLists(working, touched, starts)) out[e.line] = e.text;
  return out;
}

/** `line` with its leading whitespace replaced by `indent`; a numbered marker can be swapped in at the same time. */
function reindent(line: string, indent: string, marker?: string): string {
  const num = parseNumberedItem(line);
  if (num) return indent + (marker ?? num.marker) + line.slice(num.markerEnd);
  return indent + line.replace(/^\s*/, "");
}

/** The selected lines (0-based) and the first list line among them; null when the command should not apply. */
function selectedLines(state: EditorState): { lines: string[]; first: number; last: number; firstList: number } | null {
  if (state.selection.ranges.length > 1) return null;
  const sel = state.selection.main;
  const first = state.doc.lineAt(sel.from).number - 1;
  // A selection ending at the very start of a line (Shift+Down) does not take that line along, as in CodeMirror's own
  // indent commands.
  const endAt = !sel.empty && state.doc.lineAt(sel.to).from === sel.to ? sel.to - 1 : sel.to;
  const last = Math.max(first, state.doc.lineAt(endAt).number - 1);
  const lines = state.doc.toString().split("\n");
  for (let i = first; i <= last; i++) if (parseListItem(lines[i]) !== null) return { lines, first, last, firstList: i };
  return null;
}

function groupsOf(lines: string[], idx: number): { first: number; indent: number; delimiter: "." | ")"; parent: number | null; size: number }[] {
  const block = getBlockForLine(lines, idx);
  return block ? getGroupsInBlock(lines, block).map((g) => ({ ...g, size: g.items.length })) : [];
}

/** Shift every selected line's indent by `delta` columns (never below 0). */
function shiftLines(lines: string[], first: number, last: number, delta: number): string[] {
  const out = [...lines];
  for (let i = first; i <= last; i++) {
    const cur = indentLen(lines[i].match(/^\s*/)![0]);
    out[i] = " ".repeat(Math.max(0, cur + delta)) + lines[i].replace(/^\s*/, "");
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
  const lines = state.doc.toString().split("\n");
  const stops = continuationStops(lines, idx);
  const lead = line.text.match(/^\s*/)![0];
  const cur = indentLen(lead);
  const target = forward ? stops.find((s) => s > cur) : [...stops].reverse().find((s) => s < cur);
  if (target === undefined) return false;
  const working = [...lines];
  working[idx] = " ".repeat(target) + line.text.slice(lead.length);
  const touched = [idx - 1, idx, idx + 1].filter((i) => i >= 0 && i < lines.length);
  // A caret in the indent (or on an empty line) goes to where the text starts.
  const anchor = sel.empty && sel.head - line.from <= lead.length ? line.from + target : undefined;
  return applyListEdit(view, withRenumbering(lines, working, touched), "input.indent", anchor);
}

/** Rules 1 and 2: Tab moves a list line under the text of the numbered item before it at the same indent. */
function tabCommand(view: EditorView): boolean {
  if (continuationIndent(view, true)) return true;
  const s = selectedLines(view.state);
  if (!s) return false;
  const { lines, first, last, firstList } = s;
  const target = tabIndentTarget(lines, firstList);
  if (target === null) return false;

  if (first === last) {
    const num = parseNumberedItem(lines[first]);
    const working = [...lines];
    working[first] = reindent(lines[first], target);
    const extra = new Map<number, number>();
    if (num) {
      // Rule 2: first (or alone) in the group under its new parent, it starts again at 1; alone, also plain style.
      const block = getBlockForLine(working, first);
      const parent = block ? findParentInBlock(working, block, first)?.index ?? null : null;
      const group = groupsOf(working, first).find(
        (g) => g.indent === indentLen(target) && g.delimiter === num.delimiter && g.parent === parent,
      );
      if (group && group.first === first) {
        if (group.size === 1) working[first] = reindent(lines[first], target, `1${num.delimiter}`);
        extra.set(first, 1);
      }
    }
    return applyListEdit(view, withRenumbering(lines, working, [first], extra), "input.indent");
  }

  const delta = indentLen(target) - indentLen(lines[firstList].match(/^\s*/)![0]);
  if (delta <= 0) return false;
  const touched = Array.from({ length: last - first + 1 }, (_, k) => first + k);
  const working = shiftLines(lines, first, last, delta);
  // Rule 2 for a selection: a group that now starts at a moved line starts again at 1.
  const extra = new Map<number, number>();
  for (const g of listGroups(working, touched)) if (g.first >= first && g.first <= last) extra.set(g.first, 1);
  return applyListEdit(view, withRenumbering(lines, working, touched, extra), "input.indent");
}

/** Rules 1 and 3: Shift+Tab moves a list line out to its parent's indent; the outer list continues. */
function shiftTabCommand(view: EditorView): boolean {
  if (continuationIndent(view, false)) return true;
  const s = selectedLines(view.state);
  if (!s) return false;
  const { lines, first, last, firstList } = s;
  const target = shiftTabIndentTarget(lines, firstList);
  if (target === null) return false;

  if (first === last) {
    const working = [...lines];
    working[first] = reindent(lines[first], target);
    // Rule 3: the items that followed it in its old group are now its children, numbered from 1.
    const extra = new Map<number, number>();
    for (const g of listGroups(working, [first])) if (g.parent === first) extra.set(g.first, 1);
    return applyListEdit(view, withRenumbering(lines, working, [first], extra), "input.indent");
  }

  const delta = indentLen(target) - indentLen(lines[firstList].match(/^\s*/)![0]);
  if (delta >= 0) return false;
  const touched = Array.from({ length: last - first + 1 }, (_, k) => first + k);
  return applyListEdit(view, withRenumbering(lines, shiftLines(lines, first, last, delta), touched), "input.indent");
}

/** Rule 4: Backspace at a numbered item's text start removes the marker; a second one removes the continuation
 * indent. Anywhere else it is the ordinary Backspace. */
function backspaceCommand(view: EditorView): boolean {
  const state = view.state;
  const sel = state.selection.main;
  if (state.selection.ranges.length > 1 || !sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const idx = line.number - 1;
  const col = sel.head - line.from;
  const lines = state.doc.toString().split("\n");

  const withoutMarker = backspaceMarker(lines, idx, col);
  if (withoutMarker !== null) {
    const working = [...lines];
    working[idx] = withoutMarker;
    const anchor = line.from + withoutMarker.match(/^\s*/)![0].length;
    // The next line too: without its marker the first item's text ends the list block, and the rest of the
    // list is a block of its own.
    const touched = idx + 1 < lines.length ? [idx, idx + 1] : [idx];
    return applyListEdit(view, withRenumbering(lines, working, touched), "delete.backward", anchor);
  }
  const outdented = backspaceContinuation(lines, idx, col);
  if (outdented !== null) {
    const working = [...lines];
    working[idx] = outdented;
    return applyListEdit(view, working, "delete.backward", line.from + outdented.match(/^\s*/)![0].length);
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

/** Rule 5: deleting, cutting, moving or pasting lines in a list renumbers it (user edits that add or remove a line
 * break), and so does typing or deleting that turns a line from blank (only spaces) into text or back, since that
 * joins two lists or splits one: a line whose number was removed rejoins the list once you type on it. Typing a
 * number by hand, or deleting a digit, never renumbers anything. */
export const numberedListRenumberFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.annotation(renumbered)) return tr;
  const ev = tr.annotation(Transaction.userEvent);
  if (!ev) return tr;
  const typing = ev === "input" || ev.startsWith("input.type") || ev.startsWith("input.complete");
  if (!(typing || ev.startsWith("delete") || ev === "move.line" || ev === "input.paste" || ev === "input.drop")) return tr;

  const oldDoc = tr.startState.doc;
  const newDoc = tr.newDoc;
  let lineBreaks = false;
  let blankChanged = false;
  const oldTouched: number[] = [];
  const newTouched: number[] = [];
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    const a0 = oldDoc.lineAt(fromA).number - 1;
    const a1 = oldDoc.lineAt(toA).number - 1;
    if (inserted.lines > 1 || a1 !== a0) lineBreaks = true;
    else if ((oldDoc.line(a0 + 1).text.trim() === "") !== (newDoc.lineAt(fromB).text.trim() === "")) blankChanged = true;
    for (let i = a0; i <= a1; i++) oldTouched.push(i);
    for (let i = newDoc.lineAt(fromB).number - 1; i <= newDoc.lineAt(toB).number - 1; i++) newTouched.push(i);
  });
  if (lineBreaks ? typing : !blankChanged) return tr;
  // A line that joined or split lists: the lists on both sides of it.
  const around = (list: number[], max: number) =>
    [...new Set(list.flatMap((i) => (lineBreaks ? [i] : [i - 1, i, i + 1])))].filter((i) => i >= 0 && i < max);
  const touchedOld = around(oldTouched, oldDoc.lines);
  const touchedNew = around(newTouched, newDoc.lines);

  const oldLines = oldDoc.toString().split("\n");
  const newLines = newDoc.toString().split("\n");
  const newGroups = listGroups(newLines, touchedNew);
  if (newGroups.length === 0) return tr;
  const starts = matchGroupStarts(listGroups(oldLines, touchedOld), newGroups, (oldFirst) => {
    // Backwards: a change that starts at the list's first line (a line moved, the first item deleted) must not
    // carry the old first line past it, or the old start is lost.
    const mapped = tr.changes.mapPos(oldDoc.line(oldFirst + 1).from, -1);
    return newDoc.lineAt(mapped).number - 1;
  });
  const after = [...newLines];
  for (const e of renumberLists(newLines, touchedNew, starts)) after[e.line] = e.text;
  const changes = lineChanges(newDoc, newLines, after);
  if (changes.length === 0) return tr;
  return [tr, { changes, sequential: true, annotations: renumbered.of(true) }];
});

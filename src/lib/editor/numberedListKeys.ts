import {
  Annotation,
  EditorSelection,
  EditorState,
  Prec,
  Transaction,
  type ChangeSpec,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  backspaceContinuation,
  backspaceMarker,
  findParentInBlock,
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

export const renumbered = Annotation.define<boolean>();

function tabCommand(view: EditorView): boolean {
  const state = view.state;
  if (state.selection.ranges.length > 1) return false;
  const sel = state.selection.main;
  const doc = state.doc;
  const lines = doc.toString().split(/\r?\n/);

  const startLine = doc.lineAt(sel.from);
  const endLine = doc.lineAt(sel.to);

  // Single line selection (or empty)
  if (startLine.number === endLine.number) {
    const idx = startLine.number - 1;
    const target = tabIndentTarget(lines, idx);
    if (target === null) return false;

    const oldLineText = lines[idx];
    const parsedNum = parseNumberedItem(oldLineText);

    let newLineText: string;
    let explicitStart: number | undefined;

    if (parsedNum) {
      // Provisional line with new indent
      const provLine = target + oldLineText.slice(parsedNum.indent.length);
      const testLines = [...lines];
      testLines[idx] = provLine;

      const block = getBlockForLine(testLines, idx);
      const parent = block ? findParentInBlock(testLines, block, idx) : null;
      const parentIdx = parent ? parent.index : null;
      const myIndent = indentLen(target);

      // Check if group under parent with this indent and delimiter already has other items
      let otherItem: { line: number; item: typeof parsedNum } | null = null;
      if (block) {
        for (let i = block.start; i <= block.end; i++) {
          if (i === idx) continue;
          const otherNum = parseNumberedItem(testLines[i]);
          if (otherNum && indentLen(otherNum.indent) === myIndent && otherNum.delimiter === parsedNum.delimiter) {
            const op = findParentInBlock(testLines, block, i);
            if ((op ? op.index : null) === parentIdx) {
              otherItem = { line: i, item: otherNum };
              break;
            }
          }
        }
      }

      if (!otherItem) {
        // L is the group's only item: its number becomes 1 (plain style, L's own delimiter)
        const rest = oldLineText.slice(parsedNum.markerEnd);
        newLineText = `${target}1${parsedNum.delimiter}${rest}`;
        explicitStart = 1;
      } else {
        const rest = oldLineText.slice(parsedNum.markerEnd);
        newLineText = `${target}${parsedNum.marker}${rest}`;
      }
    } else {
      const bulletMatch = oldLineText.match(/^(\s*)((?:! )?[-*].*)$/);
      if (!bulletMatch) return false;
      newLineText = target + bulletMatch[2];
    }

    const oldGroups = listGroups(lines, [idx]);
    const workingLines = [...lines];
    workingLines[idx] = newLineText;

    const newGroups = listGroups(workingLines, [idx]);
    const starts = matchGroupStarts(oldGroups, newGroups, (oldFirst) => oldFirst);
    if (explicitStart !== undefined) {
      starts.set(idx, explicitStart);
    }

    const edits = renumberLists(workingLines, [idx], starts);
    for (const e of edits) {
      workingLines[e.line] = e.text;
    }

    const changes: ChangeSpec[] = [
      { from: startLine.from, to: startLine.to, insert: workingLines[idx] },
    ];
    for (const e of edits) {
      if (e.line !== idx) {
        const l = doc.line(e.line + 1);
        changes.push({ from: l.from, to: l.to, insert: e.text });
      }
    }

    const tr = state.update({
      changes,
      userEvent: "input.indent",
      annotations: renumbered.of(true),
    });
    view.dispatch({
      ...tr,
      selection: sel.map(tr.changes),
      scrollIntoView: true,
    });
    return true;
  }

  // Multi-line selection
  let firstListIdx: number | null = null;
  for (let n = startLine.number; n <= endLine.number; n++) {
    if (parseListItem(lines[n - 1]) !== null) {
      firstListIdx = n - 1;
      break;
    }
  }
  if (firstListIdx === null) return false;

  const target = tabIndentTarget(lines, firstListIdx);
  if (target === null) return false;

  const firstCurrentIndent = lines[firstListIdx].match(/^\s*/)?.[0] ?? "";
  const delta = target.length - firstCurrentIndent.length;
  if (delta <= 0) return false;

  const touched: number[] = [];
  const changes: ChangeSpec[] = [];
  const workingLines = [...lines];

  for (let n = startLine.number; n <= endLine.number; n++) {
    const idx = n - 1;
    touched.push(idx);
    const line = doc.line(n);
    const newLine = " ".repeat(delta) + lines[idx];
    workingLines[idx] = newLine;
    changes.push({ from: line.from, to: line.to, insert: newLine });
  }

  const oldGroups = listGroups(lines, touched);
  const newGroups = listGroups(workingLines, touched);
  const starts = matchGroupStarts(oldGroups, newGroups, (oldFirst) => oldFirst);
  const edits = renumberLists(workingLines, touched, starts);

  for (const e of edits) {
    workingLines[e.line] = e.text;
    const l = doc.line(e.line + 1);
    const existing = changes.findIndex((c: any) => c.from === l.from);
    if (existing >= 0) {
      changes[existing] = { from: l.from, to: l.to, insert: e.text };
    } else {
      changes.push({ from: l.from, to: l.to, insert: e.text });
    }
  }

  const tr = state.update({
    changes,
    userEvent: "input.indent",
    annotations: renumbered.of(true),
  });
  view.dispatch({
    ...tr,
    selection: sel.map(tr.changes),
    scrollIntoView: true,
  });
  return true;
}

function shiftTabCommand(view: EditorView): boolean {
  const state = view.state;
  if (state.selection.ranges.length > 1) return false;
  const sel = state.selection.main;
  const doc = state.doc;
  const lines = doc.toString().split(/\r?\n/);

  const startLine = doc.lineAt(sel.from);
  const endLine = doc.lineAt(sel.to);

  // Single line
  if (startLine.number === endLine.number) {
    const idx = startLine.number - 1;
    const target = shiftTabIndentTarget(lines, idx);
    if (target === null) return false;

    const oldLineText = lines[idx];
    const parsedNum = parseNumberedItem(oldLineText);

    let newLineText: string;
    if (parsedNum) {
      const rest = oldLineText.slice(parsedNum.markerEnd);
      newLineText = `${target}${parsedNum.marker}${rest}`;
    } else {
      const bulletMatch = oldLineText.match(/^(\s*)((?:! )?[-*].*)$/);
      if (!bulletMatch) return false;
      newLineText = target + bulletMatch[2];
    }

    const oldGroups = listGroups(lines, [idx]);
    const workingLines = [...lines];
    workingLines[idx] = newLineText;

    const newGroups = listGroups(workingLines, [idx]);
    const starts = matchGroupStarts(oldGroups, newGroups, (oldFirst) => oldFirst);
    // Rule 3: items that followed L in its old group are now L's children: renumbered from 1
    for (const ng of newGroups) {
      if (ng.parent === idx) {
        starts.set(ng.first, 1);
      }
    }

    const edits = renumberLists(workingLines, [idx], starts);
    for (const e of edits) workingLines[e.line] = e.text;

    const changes: ChangeSpec[] = [
      { from: startLine.from, to: startLine.to, insert: workingLines[idx] },
    ];
    for (const e of edits) {
      if (e.line !== idx) {
        const l = doc.line(e.line + 1);
        changes.push({ from: l.from, to: l.to, insert: e.text });
      }
    }

    const tr = state.update({
      changes,
      userEvent: "input.indent",
      annotations: renumbered.of(true),
    });
    view.dispatch({
      ...tr,
      selection: sel.map(tr.changes),
      scrollIntoView: true,
    });
    return true;
  }

  // Multi-line selection
  let firstListIdx: number | null = null;
  for (let n = startLine.number; n <= endLine.number; n++) {
    if (parseListItem(lines[n - 1]) !== null) {
      firstListIdx = n - 1;
      break;
    }
  }
  if (firstListIdx === null) return false;

  const target = shiftTabIndentTarget(lines, firstListIdx);
  if (target === null) return false;

  const firstCurrentIndent = lines[firstListIdx].match(/^\s*/)?.[0] ?? "";
  const delta = target.length - firstCurrentIndent.length;
  if (delta >= 0) return false;

  const touched: number[] = [];
  const changes: ChangeSpec[] = [];
  const workingLines = [...lines];

  for (let n = startLine.number; n <= endLine.number; n++) {
    const idx = n - 1;
    touched.push(idx);
    const line = doc.line(n);
    const curInd = lines[idx].match(/^\s*/)?.[0].length ?? 0;
    const newIndLen = Math.max(0, curInd + delta);
    const newLine = " ".repeat(newIndLen) + lines[idx].slice(curInd);
    workingLines[idx] = newLine;
    changes.push({ from: line.from, to: line.to, insert: newLine });
  }

  const oldGroups = listGroups(lines, touched);
  const newGroups = listGroups(workingLines, touched);
  const starts = matchGroupStarts(oldGroups, newGroups, (oldFirst) => oldFirst);
  const edits = renumberLists(workingLines, touched, starts);

  for (const e of edits) {
    workingLines[e.line] = e.text;
    const l = doc.line(e.line + 1);
    const existing = changes.findIndex((c: any) => c.from === l.from);
    if (existing >= 0) {
      changes[existing] = { from: l.from, to: l.to, insert: e.text };
    } else {
      changes.push({ from: l.from, to: l.to, insert: e.text });
    }
  }

  const tr = state.update({
    changes,
    userEvent: "input.indent",
    annotations: renumbered.of(true),
  });
  view.dispatch({
    ...tr,
    selection: sel.map(tr.changes),
    scrollIntoView: true,
  });
  return true;
}

function backspaceCommand(view: EditorView): boolean {
  const state = view.state;
  if (!state.selection.main.empty) return false;
  const sel = state.selection.main;
  const doc = state.doc;
  const lines = doc.toString().split(/\r?\n/);
  const line = doc.lineAt(sel.head);
  const idx = line.number - 1;
  const col = sel.head - line.from;

  // Step 1: backspaceMarker
  const markerNewText = backspaceMarker(lines, idx, col);
  if (markerNewText !== null) {
    const oldGroups = listGroups(lines, [idx]);
    const workingLines = [...lines];
    workingLines[idx] = markerNewText;

    const newGroups = listGroups(workingLines, [idx]);
    const starts = matchGroupStarts(oldGroups, newGroups, (oldFirst) => oldFirst);
    const edits = renumberLists(workingLines, [idx], starts);
    for (const e of edits) workingLines[e.line] = e.text;

    const leadingWhitespace = markerNewText.match(/^\s*/)?.[0].length ?? 0;
    const newHead = line.from + leadingWhitespace;

    const changes: ChangeSpec[] = [
      { from: line.from, to: line.to, insert: workingLines[idx] },
    ];
    for (const e of edits) {
      if (e.line !== idx) {
        const l = doc.line(e.line + 1);
        changes.push({ from: l.from, to: l.to, insert: e.text });
      }
    }

    view.dispatch({
      changes,
      selection: { anchor: newHead },
      userEvent: "delete.backward",
      annotations: renumbered.of(true),
      scrollIntoView: true,
    });
    return true;
  }

  // Step 2: backspaceContinuation
  const contNewText = backspaceContinuation(lines, idx, col);
  if (contNewText !== null) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: contNewText },
      selection: { anchor: line.from },
      userEvent: "delete.backward",
      annotations: renumbered.of(true),
      scrollIntoView: true,
    });
    return true;
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

export const numberedListRenumberFilter = EditorState.transactionFilter.of((tr) => {
  if (tr.annotation(renumbered)) return tr;
  if (!tr.docChanged) return tr;

  const userEvent = tr.annotation(Transaction.userEvent);
  if (!userEvent) return tr;
  const isDelete = userEvent.startsWith("delete");
  const isMove = userEvent === "move.line";
  const isPaste = userEvent === "input.paste";
  const isDrop = userEvent === "input.drop";
  if (!isDelete && !isMove && !isPaste && !isDrop) return tr;

  let hasLineBreakChange = false;
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    if (inserted.lines > 1) hasLineBreakChange = true;
    if (tr.startState.doc.lineAt(fromA).number !== tr.startState.doc.lineAt(toA).number) hasLineBreakChange = true;
  });
  if (!hasLineBreakChange) return tr;

  const oldDoc = tr.startState.doc;
  const newDoc = tr.newDoc;
  const oldLines = oldDoc.toString().split(/\r?\n/);
  const newLines = newDoc.toString().split(/\r?\n/);

  const oldTouched: number[] = [];
  const newTouched: number[] = [];

  tr.changes.iterChanges((fromA, toA, fromB, toB) => {
    const lineAStart = oldDoc.lineAt(fromA).number - 1;
    const lineAEnd = oldDoc.lineAt(toA).number - 1;
    for (let i = lineAStart; i <= lineAEnd; i++) oldTouched.push(i);

    const lineBStart = newDoc.lineAt(fromB).number - 1;
    const lineBEnd = newDoc.lineAt(toB).number - 1;
    for (let i = lineBStart; i <= lineBEnd; i++) newTouched.push(i);
  });

  const oldGroups = listGroups(oldLines, oldTouched);
  const newGroups = listGroups(newLines, newTouched);
  if (newGroups.length === 0) return tr;

  const starts = matchGroupStarts(oldGroups, newGroups, (oldFirst) => {
    const oldPos = oldDoc.line(oldFirst + 1).from;
    const mapped = tr.changes.mapPos(oldPos, 1);
    return newDoc.lineAt(mapped).number - 1;
  });

  const edits = renumberLists(newLines, newTouched, starts);
  if (edits.length === 0) return tr;

  const changes: ChangeSpec[] = edits.map((e) => {
    const l = newDoc.line(e.line + 1);
    return { from: l.from, to: l.to, insert: e.text };
  });

  return [tr, { changes, sequential: true, annotations: renumbered.of(true) }];
});

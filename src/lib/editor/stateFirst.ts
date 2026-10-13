import { EditorState } from "@codemirror/state";
import { stateFirst } from "../tokens";

/** Transaction filter that rewrites a line to state-first when the selection head leaves it.
 * Appends a change for the previous line so it forms a single undo step with the movement. */
export const stateFirstFilter = EditorState.transactionFilter.of((tr) => {
  if (tr.startState.selection.ranges.length > 1 || tr.newSelection.ranges.length > 1) {
    return tr;
  }
  const startHead = tr.startState.selection.main.head;
  const startLine = tr.startState.doc.lineAt(startHead);
  const newHead = tr.newSelection.main.head;
  const newLine = tr.newDoc.lineAt(newHead);

  // Map the start line's position through transaction changes
  const mappedPos = tr.changes.mapPos(startLine.from);
  if (mappedPos < 0 || mappedPos > tr.newDoc.length) return tr;
  const prevLineInNew = tr.newDoc.lineAt(mappedPos);

  // If caret is still on the same line, do not touch it (user may still be typing)
  if (prevLineInNew.number === newLine.number) return tr;

  const rewritten = stateFirst(prevLineInNew.text);
  if (!rewritten || rewritten === prevLineInNew.text) return tr;

  return [
    tr,
    {
      changes: { from: prevLineInNew.from, to: prevLineInNew.to, insert: rewritten },
      sequential: true,
    },
  ];
});

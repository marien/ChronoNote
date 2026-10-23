import { EditorState } from "@codemirror/state";
import { get } from "svelte/store";
import { currentDateISO } from "../stores";
import { locale, t } from "../i18n";
import { rewriteDueWords, stateFirst } from "../tokens";
import { dueWordExtra } from "../date";

/** Transaction filter that rewrites a line to state-first and rewrites due words when the selection head leaves it.
 * Appends a change for the previous line so it forms a single undo step with the movement. */
export const stateFirstFilter = EditorState.transactionFilter.of((tr) => {
  // Only the user's own typing and caret moves: a note loaded from disk, a sync or a drawer edit is never rewritten.
  if (!(tr.isUserEvent("input") || tr.isUserEvent("select") || tr.isUserEvent("delete") || tr.isUserEvent("move"))) {
    return tr;
  }
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

  const originalText = prevLineInNew.text;
  const stateFirstResult = stateFirst(originalText);
  const intermediateText = stateFirstResult ?? originalText;

  const today = get(currentDateISO);
  const loc = get(locale);
  const translate = get(t);
  const extra = dueWordExtra(
    translate("dueDate.words.today", undefined) ?? "",
    translate("dueDate.words.tomorrow", undefined) ?? "",
  );

  const dueResult = rewriteDueWords(intermediateText, today, loc, extra);
  const rewritten = dueResult ?? (stateFirstResult !== null ? intermediateText : null);

  if (!rewritten || rewritten === originalText) return tr;

  return [
    tr,
    {
      changes: { from: prevLineInNew.from, to: prevLineInNew.to, insert: rewritten },
      sequential: true,
    },
  ];
});

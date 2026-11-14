import { EditorState, Transaction } from "@codemirror/state";
import { get } from "svelte/store";
import { hasOpenAction } from "../grammar/tokenize";
import { ACTION_CLASS, BULLET_CLASS, TOPIC_CLASS } from "../grammar/symbols";
import { rewriteDueWords, stateFirst } from "../tokens";
import { takePendingPasteFrom, updatePasteDeferPastedBlock, withFromLink } from "../paste";
import { currentDateISO } from "../stores";
import { locale, t } from "../i18n";
import { dueWordExtra } from "../date";

const NUMBERED_MARKER = String.raw`[1-9]\d{0,8}(?:\.[1-9]\d{0,8})*[.)]`;
const MARKER_HEAD = String.raw`(?:=>\s+(?:${ACTION_CLASS}|${TOPIC_CLASS})|=>|(?:${ACTION_CLASS}|${TOPIC_CLASS})\s+(?:!\s+${BULLET_CLASS}|!|${BULLET_CLASS}|${NUMBERED_MARKER})|!\s+${BULLET_CLASS}|${ACTION_CLASS}|${TOPIC_CLASS}|${BULLET_CLASS}|!|${NUMBERED_MARKER})`;
/** A line that so far holds only a leading marker (`# `, `=> `, `# - `, `1. `, etc.), with nothing typed after it. */
const EMPTY_MARKER = new RegExp(String.raw`^(\s*)${MARKER_HEAD}\s+$`);
/** Pasted text whose first line starts with a leading marker of its own. */
const PASTED_MARKER = new RegExp(String.raw`^\s*${MARKER_HEAD}\s`);

/** `fromSuffixes`: one `(<…)` link per pasted line (the paste forwards actions, §371); an open line gets its own,
 * replacing any links it carried. */
export function rewritePasted(text: string, fromSuffixes?: string[]): string {
  const today = get(currentDateISO);
  const loc = get(locale);
  const translate = get(t);
  const extra = dueWordExtra(
    translate("dueDate.words.today", undefined) ?? "",
    translate("dueDate.words.tomorrow", undefined) ?? "",
  );

  const rewritten = text.split("\n").map((line) => {
    let l = stateFirst(line) ?? line;
    return rewriteDueWords(l, today, loc, extra) ?? l;
  });
  return rewritten
    .map((l, i) => {
      const suffix = fromSuffixes?.[i];
      if (suffix && hasOpenAction(l, rewritten[i + 1])) return withFromLink(l, suffix);
      return l;
    })
    .join("\n");
}

/** Pasting `# call Dana` onto an empty `# ` used to give `# # call Dana`. When the line before the caret is only a
 * symbol, nothing follows the caret, and the pasted text brings its own symbol, the empty symbol goes and the pasted
 * line keeps its own (at the line's indentation). Returns where the replacement starts and the text to insert, or null
 * to paste as usual. */
export function mergePasteOverEmptyMarker(
  lineBefore: string,
  lineAfter: string,
  pasted: string,
  fromSuffixes?: string[],
): { deleteBefore: number; insert: string } | null {
  if (lineAfter.trim() !== "") return null;
  const m = EMPTY_MARKER.exec(lineBefore);
  const rewritten = rewritePasted(pasted, fromSuffixes);
  if (!m || !PASTED_MARKER.test(rewritten)) return null;
  const targetIndent = m[1];
  const lines = rewritten.split("\n");
  const baseIndent = lines[0].match(/^[ \t]*/)![0];
  const adjusted = lines.map((line, i) => {
    if (i === 0) return line.slice(baseIndent.length);
    if (line === "") return "";
    const stripped = line.startsWith(baseIndent) ? line.slice(baseIndent.length) : line.replace(/^[ \t]+/, "");
    return targetIndent + stripped;
  });
  return { deleteBefore: lineBefore.length - targetIndent.length, insert: adjusted.join("\n") };
}

export const pasteOverEmptyMarker = EditorState.transactionFilter.of((tr) => {
  const isPasteOrDrop = tr.isUserEvent("input.paste") || tr.isUserEvent("input.drop") || tr.isUserEvent("move.drop");
  if (!isPasteOrDrop || !tr.docChanged) return tr;
  const fromSuffixes = tr.isUserEvent("input.paste") ? (takePendingPasteFrom() ?? undefined) : undefined;
  const doc = tr.startState.doc;
  const hunks: { from: number; to: number; insert: string; isInsert: boolean }[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    hunks.push({ from: fromA, to: toA, insert: inserted.toString(), isInsert: inserted.length > 0 });
  });
  const insertHunks = hunks.filter((h) => h.isInsert);
  if (insertHunks.length !== 1) return tr;
  if (!tr.isUserEvent("move.drop") && hunks.length !== 1) return tr;

  const ins = insertHunks[0]!;
  const line = doc.lineAt(ins.from);
  const delTouchedBeforeOnLine = hunks.some((h) => !h.isInsert && h.to > line.from && h.from < ins.from);
  const merged =
    !delTouchedBeforeOnLine && doc.lineAt(ins.to).number === line.number
      ? mergePasteOverEmptyMarker(doc.sliceString(line.from, ins.from), doc.sliceString(ins.to, line.to), ins.insert, fromSuffixes)
      : null;

  let rewrittenIns: { from: number; to: number; insert: string } | null = null;
  if (merged) {
    rewrittenIns = { from: ins.from - merged.deleteBefore, to: ins.to, insert: merged.insert };
  } else {
    const rewritten = rewritePasted(ins.insert, fromSuffixes);
    if (rewritten !== ins.insert) {
      rewrittenIns = { from: ins.from, to: ins.to, insert: rewritten };
    }
  }
  if (!rewrittenIns) return tr;

  const changes = hunks.map((h) => (h.isInsert ? rewrittenIns! : { from: h.from, to: h.to, insert: h.insert }));
  if (fromSuffixes) updatePasteDeferPastedBlock(rewrittenIns.insert);
  const cs = tr.startState.changes(changes);
  const userEvent = tr.annotation(Transaction.userEvent) ?? "input.paste";
  return { changes, selection: { anchor: cs.mapPos(rewrittenIns.to, 1) }, userEvent, scrollIntoView: true };
});

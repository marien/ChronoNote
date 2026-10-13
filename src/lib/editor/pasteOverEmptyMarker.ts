import { EditorState } from "@codemirror/state";
import { ACTION_CLASS, BULLET_CLASS, TOPIC_CLASS } from "../grammar/symbols";

/** A line that so far holds only a symbol (`# `, `o `, `- `), with nothing typed after it. */
const EMPTY_MARKER = new RegExp(String.raw`^(\s*)(?:${ACTION_CLASS}|${TOPIC_CLASS}|${BULLET_CLASS})\s+$`);
/** Pasted text whose first line starts with a symbol of its own. */
const PASTED_MARKER = new RegExp(String.raw`^\s*(?:${ACTION_CLASS}|${TOPIC_CLASS}|${BULLET_CLASS})\s`);

/** Pasting `# call Dana` onto an empty `# ` used to give `# # call Dana`. When the line before the caret is only a
 * symbol, nothing follows the caret, and the pasted text brings its own symbol, the empty symbol goes and the pasted
 * line keeps its own (at the line's indentation). Returns where the replacement starts and the text to insert, or null
 * to paste as usual. */
export function mergePasteOverEmptyMarker(
  lineBefore: string,
  lineAfter: string,
  pasted: string,
): { deleteBefore: number; insert: string } | null {
  if (lineAfter.trim() !== "") return null;
  const m = EMPTY_MARKER.exec(lineBefore);
  if (!m || !PASTED_MARKER.test(pasted)) return null;
  return { deleteBefore: lineBefore.length - m[1].length, insert: pasted.replace(/^[ \t]+/, "") };
}

export const pasteOverEmptyMarker = EditorState.transactionFilter.of((tr) => {
  if (!tr.isUserEvent("input.paste") || !tr.docChanged) return tr;
  // One entry per change; a paste into several cursors is left alone.
  const specs: ({ from: number; to: number; insert: string } | null)[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const doc = tr.startState.doc;
    const line = doc.lineAt(fromA);
    const merged =
      doc.lineAt(toA).number === line.number
        ? mergePasteOverEmptyMarker(doc.sliceString(line.from, fromA), doc.sliceString(toA, line.to), inserted.toString())
        : null;
    specs.push(merged && { from: fromA - merged.deleteBefore, to: toA, insert: merged.insert });
  });
  const spec = specs.length === 1 ? specs[0] : null;
  if (!spec) return tr;
  const { from, to, insert } = spec;
  return { changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: "input.paste", scrollIntoView: true };
});

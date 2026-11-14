import { EditorState } from "@codemirror/state";
import { get } from "svelte/store";
import { ACTION_CLASS, BULLET_CLASS, TOPIC_CLASS } from "../grammar/symbols";
import { rewriteDueWords, stateFirst } from "../tokens";
import { OPEN_ACTION_LINE, takePendingPasteFrom, updatePasteDeferPastedBlock, withFromLink } from "../paste";
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

  return text
    .split("\n")
    .map((line, i) => {
      let l = stateFirst(line) ?? line;
      l = rewriteDueWords(l, today, loc, extra) ?? l;
      const suffix = fromSuffixes?.[i];
      if (suffix && OPEN_ACTION_LINE.test(l)) l = withFromLink(l, suffix);
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
  if (!tr.isUserEvent("input.paste") || !tr.docChanged) return tr;
  const fromSuffixes = takePendingPasteFrom() ?? undefined;
  // One entry per change; a paste into several cursors is left alone.
  const specs: ({ from: number; to: number; insert: string } | null)[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const doc = tr.startState.doc;
    const line = doc.lineAt(fromA);
    const raw = inserted.toString();
    const merged =
      doc.lineAt(toA).number === line.number
        ? mergePasteOverEmptyMarker(doc.sliceString(line.from, fromA), doc.sliceString(toA, line.to), raw, fromSuffixes)
        : null;
    if (merged) {
      specs.push({ from: fromA - merged.deleteBefore, to: toA, insert: merged.insert });
    } else {
      const rewritten = rewritePasted(raw, fromSuffixes);
      if (rewritten !== raw) {
        specs.push({ from: fromA, to: toA, insert: rewritten });
      } else {
        specs.push(null);
      }
    }
  });
  const spec = specs.length === 1 ? specs[0] : null;
  if (!spec) return tr;
  const { from, to, insert } = spec;
  if (fromSuffixes) updatePasteDeferPastedBlock(insert);
  return { changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: "input.paste", scrollIntoView: true };
});

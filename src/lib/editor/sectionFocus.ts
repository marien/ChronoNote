/** Peek mode's editor extension: shows only one section of the document.
 *
 * Everything before the section's title and after its last line is covered by a block "replace" decoration that
 * draws nothing, so it is the SAME document in the SAME editor (edits, undo, autosave all stay the normal ones) with
 * the other sections folded away. The folded ranges are atomic, and a transaction filter pulls a selection that would
 * land outside the section back inside it. The section is found again after every change, so typing and moving
 * lines keep it in view. If the note has no such section nothing is hidden. */
import { EditorSelection, EditorState, StateField, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { findSectionRange, sectionVisibleLineCount, type SectionRange } from "../peekSection";

function docLines(state: EditorState): string[] {
  const out: string[] = [];
  for (let i = 1; i <= state.doc.lines; i++) out.push(state.doc.line(i).text);
  return out;
}

function hiddenRanges(state: EditorState, range: SectionRange | null): DecorationSet {
  if (!range) return Decoration.none;
  const hide = Decoration.replace({ block: true });
  const ranges: Range<Decoration>[] = [];
  if (range.titleLine > 0) ranges.push(hide.range(0, state.doc.line(range.titleLine).to));
  if (range.lastLine + 2 <= state.doc.lines) ranges.push(hide.range(state.doc.line(range.lastLine + 2).from, state.doc.length));
  return Decoration.set(ranges);
}

/** `onFit` gets the number of lines the section needs (for "fit the whole section" window sizing). */
export function sectionFocus(targetHeader: string, onFit?: (lines: number) => void): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => hiddenRanges(state, findSectionRange(docLines(state), targetHeader)),
    update: (value, tr) =>
      tr.docChanged ? hiddenRanges(tr.state, findSectionRange(docLines(tr.state), targetHeader)) : value,
    provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
  });

  const keepInside = EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged && !tr.selection) return tr;
    const lines = docLines(tr.state);
    const range = findSectionRange(lines, targetHeader);
    if (!range) return tr;
    const from = tr.newDoc.line(range.titleLine + 1).from;
    const to = tr.newDoc.line(Math.min(range.lastLine + 1, tr.newDoc.lines)).to;
    const sel = tr.newSelection;
    if (sel.ranges.every((r) => r.from >= from && r.to <= to)) return tr;
    const clamp = (n: number) => Math.min(Math.max(n, from), to);
    return [
      tr,
      { selection: EditorSelection.create(sel.ranges.map((r) => EditorSelection.range(clamp(r.anchor), clamp(r.head))), sel.mainIndex), sequential: true },
    ];
  });

  const fit = EditorView.updateListener.of((u) => {
    if (!onFit || !(u.docChanged || u.startState.doc.length === 0)) return;
    const lines = docLines(u.state);
    const range = findSectionRange(lines, targetHeader);
    if (range) onFit(sectionVisibleLineCount(lines, range));
  });

  return [field, keepInside, fit];
}

/** Lines the section needs right now, or null when the note has no such section. */
export function sectionFitLines(state: EditorState, targetHeader: string): number | null {
  const lines = docLines(state);
  const range = findSectionRange(lines, targetHeader);
  return range ? sectionVisibleLineCount(lines, range) : null;
}

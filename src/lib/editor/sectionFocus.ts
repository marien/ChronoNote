/** Peek mode's editor extension: shows only one section of the document, and keeps every edit inside it.
 *
 * Everything before the section's body (including its own title and underline, which the header strip shows
 * instead) and after its last line is covered by a block "replace" decoration that draws nothing, so it is the SAME
 * document in the SAME editor (edits, undo, autosave all stay the normal ones) with the other sections folded away.
 * On top of that:
 *  - the folded ranges are atomic, so the caret cannot enter them;
 *  - a transaction filter pulls any selection (select-all, click on the title, shift-arrows) back into the section's
 *    body;
 *  - another filter rejects a USER edit that would touch text outside the section or the title/underline (Backspace
 *    at the start, Delete at the end, ...) — see `editAllowed`. Programmatic changes (drift reloads, copy-forward,
 *    ...) carry no user event and pass untouched;
 *  - undo/redo skip transaction filters (CodeMirror's history opts out), so the undo and redo KEYS are wrapped: if
 *    the step would change anything outside the section (an edit made before Peek, say) it is taken straight back.
 * The section is found again after every change, so typing and moving lines keep it in view. If the note has no such
 * section nothing is hidden (Peek itself then ends — see `peek.ts`). */
import { EditorSelection, EditorState, Prec, StateField, type Extension, type Range, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, keymap, type DecorationSet } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { editAllowed, findSectionRange, gapLinesNeeded, sectionVisibleLineCount, type SectionRange, type SectionSpan } from "../peekSection";

function docLines(state: EditorState): string[] {
  const out: string[] = [];
  for (let i = 1; i <= state.doc.lines; i++) out.push(state.doc.line(i).text);
  return out;
}

function hiddenRanges(state: EditorState, range: SectionRange | null): DecorationSet {
  if (!range) return Decoration.none;
  const hide = Decoration.replace({ block: true });
  const ranges: Range<Decoration>[] = [];
  // Everything up to and including the section's underline: earlier sections, then this section's title lines.
  ranges.push(hide.range(0, state.doc.line(range.titleLine + 2).to));
  if (range.lastLine + 2 <= state.doc.lines) ranges.push(hide.range(state.doc.line(range.lastLine + 2).from, state.doc.length));
  return Decoration.set(ranges);
}

function spanOf(state: EditorState, range: SectionRange): SectionSpan {
  return {
    from: state.doc.line(range.titleLine + 1).from,
    headerEnd: state.doc.line(range.titleLine + 2).to,
    to: state.doc.line(Math.min(range.lastLine + 1, state.doc.lines)).to,
  };
}

/** Typing, deleting, moving text, undo/redo: the ways a person changes the text. */
function isUserEdit(tr: Transaction): boolean {
  return (
    tr.docChanged &&
    (tr.isUserEvent("input") || tr.isUserEvent("delete") || tr.isUserEvent("move") || tr.isUserEvent("undo") || tr.isUserEvent("redo"))
  );
}

/** Everything that must not change in Peek: the text before the section, its title and underline, and the text after
 * it. `null` when the section is gone. */
function outsideSignature(state: EditorState, targetHeader: string): string | null {
  const range = findSectionRange(docLines(state), targetHeader);
  if (!range) return null;
  const span = spanOf(state, range);
  return [state.doc.sliceString(0, span.from), state.doc.sliceString(span.from, span.headerEnd), state.doc.sliceString(span.to)].join("\u0000");
}

/** `onFit` gets the number of lines the section needs (for "fit the whole section" window sizing). */
export function sectionFocus(targetHeader: string, onFit?: (lines: number) => void): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => hiddenRanges(state, findSectionRange(docLines(state), targetHeader)),
    update: (value, tr) =>
      tr.docChanged ? hiddenRanges(tr.state, findSectionRange(docLines(tr.state), targetHeader)) : value,
    provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
  });

  const rejectEditsOutside = EditorState.transactionFilter.of((tr) => {
    if (!isUserEdit(tr)) return tr;
    const range = findSectionRange(docLines(tr.startState), targetHeader);
    if (!range) return tr;
    const span = spanOf(tr.startState, range);
    let allowed = true;
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      if (!editAllowed(span, fromA, toA, inserted.toString())) allowed = false;
    });
    return allowed ? tr : [];
  });

  const keepSelectionInBody = EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged && !tr.selection) return tr;
    const range = findSectionRange(docLines(tr.state), targetHeader);
    if (!range) return tr;
    const doc = tr.newDoc;
    const to = doc.line(Math.min(range.lastLine + 1, doc.lines)).to;
    // The caret lives in the body, never on the title/underline lines (those are not editable here).
    const from = range.titleLine + 3 <= doc.lines ? doc.line(range.titleLine + 3).from : doc.line(range.titleLine + 2).to;
    const sel = tr.newSelection;
    if (sel.ranges.every((r) => r.from >= from && r.to <= to)) return tr;
    const clamp = (n: number) => Math.min(Math.max(n, from), to);
    return [
      tr,
      { selection: EditorSelection.create(sel.ranges.map((r) => EditorSelection.range(clamp(r.anchor), clamp(r.head))), sel.mainIndex), sequential: true },
    ];
  });

  // Run a history step; if it reached outside the section, step back so nothing outside changed.
  const guardedHistory = (step: (v: EditorView) => boolean, stepBack: (v: EditorView) => boolean) => (view: EditorView) => {
    const before = outsideSignature(view.state, targetHeader);
    if (before === null) return step(view);
    const done = step(view);
    if (done && outsideSignature(view.state, targetHeader) !== before) stepBack(view);
    return true;
  };
  const historyKeys = Prec.highest(
    keymap.of([
      { key: "Mod-z", run: guardedHistory(undo, redo), preventDefault: true },
      { key: "Mod-y", run: guardedHistory(redo, undo), preventDefault: true },
      { key: "Mod-Shift-z", run: guardedHistory(redo, undo), preventDefault: true },
    ]),
  );

  const fit = EditorView.updateListener.of((u) => {
    if (!onFit || !(u.docChanged || u.startState.doc.length === 0)) return;
    const lines = docLines(u.state);
    const range = findSectionRange(lines, targetHeader);
    if (range) onFit(sectionVisibleLineCount(lines, range));
  });

  // Two empty lines always separate the last filled line from the next section's title: after a change, top the
  // section's trailing empty lines up to two. The caret stays where it was (it is mapped to before the new lines), and the
  // lines are part of the same undo step as the edit that needed them.
  const keepGap = EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    const lines = docLines(tr.state);
    const range = findSectionRange(lines, targetHeader);
    if (!range) return tr;
    const missing = gapLinesNeeded(lines, range);
    if (missing === 0) return tr;
    const end = tr.newDoc.line(Math.min(range.lastLine + 1, tr.newDoc.lines)).to;
    return [tr, { changes: { from: end, insert: "\n".repeat(missing) }, sequential: true }];
  });

  return [field, rejectEditsOutside, keepSelectionInBody, keepGap, historyKeys, fit];
}

/** Lines the section needs right now, or null when the note has no such section. */
export function sectionFitLines(state: EditorState, targetHeader: string): number | null {
  const lines = docLines(state);
  const range = findSectionRange(lines, targetHeader);
  return range ? sectionVisibleLineCount(lines, range) : null;
}

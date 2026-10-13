/** §81 (retry of §47): render a Setext underline row — a line that is
 * nothing but `=` characters under a section title — as a drawn
 * double-rule, reverting to the literal `=` characters (fully editable)
 * whenever that row is *active*: the cursor is on it, the selection
 * touches it, or the mouse is hovering it.
 *
 * Why this works where §47's attempt didn't: §47 used a
 * `Decoration.replace` widget with invented content, which put the rule
 * outside CodeMirror's normal text-flow / hit-testing model — vertical
 * alignment had to be guessed at against the line-box, and `posAtCoords`
 * wouldn't resolve positions *inside* the opaque widget, so hover/click
 * to edit only worked once. This uses `Decoration.mark` over the real
 * `=` characters instead (§47's own "direction worth trying next time"):
 * the characters stay in the layout, the rule is a `border-bottom` the
 * browser positions by real font metrics, and hit-testing is native.
 *
 * Length: the rule spans exactly the `=` characters that are in the file
 * — no silent auto-editing of the document to match the title. The
 * editor's own "convert line to section" (`Ctrl/Cmd+Shift+S`) and the
 * section-import path already write `max(3, title.length)` `=`, so for
 * anything this app created the rule already matches the title width;
 * a hand-typed short/long underline renders at whatever length it is. */
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { isSetextUnderline } from "../tokens";

/** 1-based line number the mouse is currently over, when that line is a
 * Setext underline; -1 otherwise. */
const setHoveredUnderline = StateEffect.define<number>();

const hoveredUnderlineField = StateField.define<number>({
  create: () => -1,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setHoveredUnderline)) return e.value;
    return value;
  },
});

const ruleMark = Decoration.mark({ class: "cm-setext-rule" });
const subsectionRuleMark = Decoration.mark({ class: "cm-subsection-rule" });

/** A sub-section underline: a line of three or more `-` under a sub-section title, drawn as a single rule the same way
 * a section's `===` is drawn as a double one. Purely visual for now: sections, Section History and Peek ignore it.
 * Never a bullet (a bullet needs a space after its `-`). */
export function isSubsectionUnderline(line: string): boolean {
  return /^-{3,}$/.test(line.trim());
}

function isRuleLine(text: string): boolean {
  return isSetextUnderline(text) || isSubsectionUnderline(text);
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const hovered = view.state.field(hoveredUnderlineField);
  const { ranges } = view.state.selection;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (line.length > 0 && isRuleLine(line.text)) {
        const active =
          line.number === hovered ||
          ranges.some((r) => r.from <= line.to && r.to >= line.from);
        if (!active) {
          // The checks tolerate surrounding whitespace — draw the rule over just the run of `=` or `-`.
          const m = line.text.match(/^(\s*)(=+|-+)/);
          if (m) {
            const start = line.from + m[1].length;
            builder.add(start, start + m[2].length, m[2][0] === "=" ? ruleMark : subsectionRuleMark);
          }
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const setextRulePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.selectionSet ||
        u.viewportChanged ||
        u.startState.field(hoveredUnderlineField) !== u.state.field(hoveredUnderlineField)
      ) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Track hover by coordinate, not by listeners on the mark's own span:
 * once the rule reveals the plain `=` text, the span is gone, so a
 * `mouseleave` on it would fire immediately and flip it back — the classic
 * flicker. `posAtCoords` keeps resolving the same line whether it's
 * currently drawn as the rule or as text, so the row stays revealed as
 * long as the pointer is anywhere on it. */
const setextHoverHandlers = EditorView.domEventHandlers({
  mousemove(event, view) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    let lineNo = -1;
    if (pos !== null) {
      const line = view.state.doc.lineAt(pos);
      if (isRuleLine(line.text)) lineNo = line.number;
    }
    if (view.state.field(hoveredUnderlineField) !== lineNo) {
      view.dispatch({ effects: setHoveredUnderline.of(lineNo) });
    }
  },
  mouseleave(_event, view) {
    if (view.state.field(hoveredUnderlineField) !== -1) {
      view.dispatch({ effects: setHoveredUnderline.of(-1) });
    }
  },
});

export const setextRule = [hoveredUnderlineField, setextRulePlugin, setextHoverHandlers];

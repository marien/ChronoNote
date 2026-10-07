import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { symbolAfterClick, toggleOpenClosedAtIndex } from "../tokens";
import { ARROW_GLYPH, GLYPHS, glyphSpecForSymbol } from "../grammar/glyphs";
import { tokenizeLine } from "../grammar/tokenize";


/** Renders the raw plain-text tokens (spec 2.2) as their visual glyphs
 * without changing a single byte on disk: the underlying document always
 * matches the file, only the on-screen presentation is replaced. Sized via
 * CSS (`display: inline-block; width: Nch`) rather than trusting the
 * glyph's own natural rendered width, since single-Unicode-character
 * symbols don't reliably occupy exactly one monospace cell in every font —
 * without a forced width, text after the glyph wouldn't line up with the
 * same line if it had no glyph at all. */
class InlineGlyphWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly className: string,
    /** §106: the four action-state glyphs (standalone or the inner symbol
     * of a `=> <symbol>` consequence-action) toggle on click between open
     * and closed: `#` becomes `v`, and `v`/`>`/`x` reopen to `#`. The
     * arrow, bullet and assignee glyphs are not clickable. */
    private readonly cyclable = false,
    /** #34: the raw symbol behind a clickable glyph (`#`/`v`/`>`/`x`), so
     * the widget can preview what a click will do on hover before it
     * commits. Only meaningful when `cyclable`. */
    private readonly symbol = "",
  ) {
    super();
  }

  eq(other: InlineGlyphWidget): boolean {
    return (
      other.label === this.label &&
      other.className === this.className &&
      other.cyclable === this.cyclable &&
      other.symbol === this.symbol
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = this.className;
    // #93: the drawn character lives in its own nested span so a shrinking
    // transform (app.css's `.glyph-ink` rule) never touches this outer
    // span's own box — CodeMirror measures THIS node to place the cursor
    // right after the glyph, so its box must stay the full, untransformed
    // cell width.
    const ink = document.createElement("span");
    ink.className = "glyph-ink";
    ink.textContent = this.label;
    span.appendChild(ink);
    if (this.cyclable) {
      span.classList.add("glyph-cyclable");
      const { char: nextChar, cls: nextClass } = glyphSpecForSymbol(symbolAfterClick(this.symbol));
      // #34: on hover, morph into the glyph a click will produce so you can
      // see what it will do; revert on leave. Bypassed on touchscreens.
      span.addEventListener("mouseenter", () => {
        if (window.matchMedia?.("(pointer: coarse)").matches) return;
        ink.textContent = nextChar;
        span.className = `${nextClass} glyph-cyclable glyph-cyclable-preview`;
      });
      span.addEventListener("mouseleave", () => {
        ink.textContent = this.label;
        span.className = `${this.className} glyph-cyclable`;
      });
      const handleCycle = (e: Event) => {
        // Don't let the click place the editor cursor or steal focus.
        e.preventDefault();
        const pos = view.posAtDOM(span);
        const line = view.state.doc.lineAt(pos);
        // Exactly the glyph that was hit: its position in the line is where its symbol sits.
        const updated = toggleOpenClosedAtIndex(line.text, pos - line.from);
        if (updated !== null && updated !== line.text) {
          view.dispatch({ changes: { from: line.from, to: line.to, insert: updated } });
        }
      };
      span.addEventListener("mousedown", handleCycle);
      span.addEventListener("touchend", handleCycle);
    }
    return span;
  }


  // Our own `mousedown` handler above does the work — keep CodeMirror from
  // also treating the click as a cursor placement into the atomic range.
  ignoreEvent(): boolean {
    return true;
  }
}

const MARK_EMPHASIS = Decoration.mark({ class: "glyph-emphasis-line" });
const MARK_ASSIGNEE = Decoration.mark({ class: "glyph-assignee" });
const MARK_TOPIC = Decoration.mark({ class: "glyph-topic" });
// The parentheses of a `(topic)` stay real text (each exactly 1ch) but are drawn transparent, so they act
// as the pill's inner padding: hidden pill = same width as the raw text, zero column shift. CSS shows them
// again on the line being edited or hovered.
const MARK_TOPIC_PAREN = Decoration.mark({ class: "glyph-topic-paren" });
// Only the range of an atomic decoration matters, never its content.
const ATOMIC = Decoration.replace({});

/** Builds the glyph decorations and the atomic ranges for the visible lines from the one line tokenizer
 * (src/lib/grammar/tokenize.ts), in a single pass so no line is tokenized twice. The document always
 * matches the file: replaced tokens are only drawn differently; `@name`, `(topic)` and the `! ` line are
 * marked in place and stay editable. Atomic = exactly the replaced tokens (the arrow and a consequence
 * symbol each their own range, so the cursor can land between them). */
export function buildGlyphDecorations(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
  const deco = new RangeSetBuilder<Decoration>();
  const atomic = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  let doneTo = -1; // end of the last line handled, so touching visible ranges never repeat a line
  for (const { from, to } of view.visibleRanges) {
    let pos = Math.max(from, doneTo + 1);
    while (pos <= to) {
      const line = doc.lineAt(pos);
      doneTo = line.to;
      pos = line.to + 1;
      for (const t of tokenizeLine(line.text)) {
        const a = line.from + t.from;
        const b = line.from + t.to;
        if (t.replaced) atomic.add(a, b, ATOMIC);
        switch (t.kind) {
          case "emphasis":
            deco.add(a, line.to, MARK_EMPHASIS);
            break;
          case "arrow":
            deco.add(a, b, Decoration.replace({ widget: new InlineGlyphWidget(ARROW_GLYPH.char, ARROW_GLYPH.cls) }));
            break;
          case "bullet":
            deco.add(a, b, Decoration.replace({ widget: new InlineGlyphWidget(GLYPHS.bullet.char, GLYPHS.bullet.cls) }));
            break;
          case "action":
          case "topic":
          case "consequence": {
            // Action, agenda-topic and consequence symbols cycle on click; the arrow and bullet do not.
            const g = glyphSpecForSymbol(t.symbol!);
            deco.add(a, b, Decoration.replace({ widget: new InlineGlyphWidget(g.char, g.cls, true, t.symbol) }));
            break;
          }
          case "assignee":
            deco.add(a, b, MARK_ASSIGNEE);
            break;
          case "topicTag":
            // #36/#39: only right after the action symbol; `(word)` elsewhere is ordinary text.
            deco.add(a, b, MARK_TOPIC);
            deco.add(a, a + 1, MARK_TOPIC_PAREN);
            deco.add(b - 1, b, MARK_TOPIC_PAREN);
            break;
          // assigneeList and paren draw nothing in the editor (an assigneeList only through its assignees).
        }
      }
    }
  }
  return { decorations: deco.finish(), atomic: atomic.finish() };
}

export const liveGlyphs = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomicDecorations: DecorationSet;
    constructor(view: EditorView) {
      ({ decorations: this.decorations, atomic: this.atomicDecorations } = buildGlyphDecorations(view));
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        ({ decorations: this.decorations, atomic: this.atomicDecorations } = buildGlyphDecorations(update.view));
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Makes each glyph's underlying raw token (`# `, `v `, `> `, `x `, `- `,
 * `* `, the `=> ` portion of a follow-up/delegation/consequence-action, and
 * a consequence-action's inner symbol) an atomic unit for cursor motion
 * and selection: a selection boundary can never land in the middle of a
 * replaced token. Without this, selecting a line for copy could silently
 * drop half of a token, and the glyph wouldn't visually appear selected
 * even when its text was included. It's also what makes backspace remove
 * a whole `=> ` glyph in one step when the cursor sits right after it. */
export const glyphAtomicRanges = EditorView.atomicRanges.of((view) => {
  return view.plugin(liveGlyphs)?.atomicDecorations ?? Decoration.none;
});

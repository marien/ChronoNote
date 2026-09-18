import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { cycleActionSymbol, isActionLikeLine, leadingTopicTag } from "../tokens";

const CYCLE_ORDER = ["#", "v", ">", "x"];

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
     * of a `=> <symbol>` consequence-action) cycle on click,
     * `# → v → > → x → #` — same order as `Ctrl+Space` (Win/Linux) /
     * `Ctrl/Cmd+Enter`. The
     * arrow, bullet and assignee glyphs are not cyclable. */
    private readonly cyclable = false,
    /** #34: the raw symbol behind a cyclable glyph (`#`/`v`/`>`/`x`), so
     * the widget can preview the *next* state on hover before a click
     * commits it. Only meaningful when `cyclable`. */
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
    span.textContent = this.label;
    span.className = this.className;
    if (this.cyclable) {
      span.classList.add("glyph-cyclable");
      const [nextChar, nextClass] = glyphForSymbol(CYCLE_ORDER[(CYCLE_ORDER.indexOf(this.symbol) + 1) % 4]);
      // #34: on hover, morph into the next state's glyph so you can see
      // what a click will do; revert on leave. Bypassed on touchscreens.
      span.addEventListener("mouseenter", () => {
        if (window.matchMedia?.("(pointer: coarse)").matches) return;
        span.textContent = nextChar;
        span.className = `${nextClass} glyph-cyclable glyph-cyclable-preview`;
      });
      span.addEventListener("mouseleave", () => {
        span.textContent = this.label;
        span.className = `${this.className} glyph-cyclable`;
      });
      const handleCycle = (e: Event) => {
        // Don't let the click place the editor cursor or steal focus.
        e.preventDefault();
        const pos = view.posAtDOM(span);
        const line = view.state.doc.lineAt(pos);
        const updated = cycleActionSymbol(line.text);
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

/** Shared by standalone action lines and the `=> <symbol>` consequence-
 * action form (§41) — one glyph per action state, regardless of whether
 * it's reached directly or through a Delegate arrow. */
function glyphForSymbol(sym: string): [string, string] {
  switch (sym) {
    case "v":
      return ["☑", "glyph-done"];
    case ">":
      return ["»", "glyph-progress"];
    case "x":
      return ["☒", "glyph-cancelled"];
    default:
      return ["☐", "glyph-open"]; // "#"
  }
}

/** Full rendering pass. Uses MatchDecorator's lower-level `decorate`
 * callback (rather than the simple one-decoration-per-match `decoration`
 * callback) because some cases need more than a single fixed-width
 * replacement:
 *  - `! ` marks the *rest of the line* (variable length), not just the
 *    token itself, so the emphasis reads as one visual unit.
 *  - `=> @name` splits into a replaced arrow glyph (`=> `, 3 chars) plus a
 *    `Decoration.mark` over `@name` — real, live, editable text with just
 *    a badge style layered on, rather than one static baked-in widget.
 *  - `=> <symbol>` (§41 — `#`/`v`/`>`/`x` after a Delegate arrow) splits
 *    into the arrow glyph plus a *second* replaced glyph for the action
 *    state; only the text after that second symbol is real/editable —
 *    "only the text after the action symbol is part of the action," per
 *    spec. Deliberately mutually exclusive with `=> @name` — a line is
 *    either delegated-to-a-person or a consequence-action, never both
 *    (confirmed) — so this is a distinct branch, not a further split of
 *    the assignee case.
 *
 * The bullet (`- `/`* `, §51) and action tokens (`# `/`v `/`> `/`x `, §40/
 * §50) all use a lookbehind (`(?<=^\s*)...`) rather than capturing the
 * leading indentation in the match itself: indentation must stay
 * untouched, real, visible whitespace (that's how bullet nesting works —
 * spec: two spaces per level — and actions now tolerate the same
 * indentation without it being "part of" the matched token), and the
 * lookbehind means the match is already just the token to replace, with
 * no indent-length arithmetic needed to find where it starts. */
const renderMatcher = new MatchDecorator({
  regexp:
    /(^!\s)|((?<=^\s*)#\s)|((?<=^\s*)v\s)|((?<=^\s*)>\s)|((?<=^\s*)x\s)|(=>\s@[\w-]+)|(=>\s[#vx>]\s)|(=>\s)|((?<=^\s*)[-*]\s)|(\(@[\w-]+\))|(@[\w-]+)|(\([^\s()]+\))/gm,
  decorate(add, from, to, match, view) {
    const text = match[0];
    if (text.startsWith("! ")) {
      const line = view.state.doc.lineAt(from);
      add(from, line.to, Decoration.mark({ class: "glyph-emphasis-line" }));
      return;
    }
    if (text.startsWith("=> @")) {
      add(from, from + 3, Decoration.replace({ widget: new InlineGlyphWidget("➔", "glyph-followup") }));
      add(from + 3, to, Decoration.mark({ class: "glyph-assignee" }));
      return;
    }
    if (text.startsWith("=>")) {
      add(from, from + 3, Decoration.replace({ widget: new InlineGlyphWidget("➔", "glyph-followup") }));
      if (to > from + 3) {
        // "=> <symbol> " — the consequence-action form (§41). The inner
        // symbol is a real action state, so it cycles on click too.
        const [char, cls] = glyphForSymbol(text[3]);
        add(from + 3, to, Decoration.replace({ widget: new InlineGlyphWidget(char, cls, true, text[3]) }));
      }
      return;
    }
    if (text.startsWith("-") || text.startsWith("*")) {
      add(from, to, Decoration.replace({ widget: new InlineGlyphWidget("•", "glyph-bullet") }));
      return;
    }
    if (text.startsWith("(@")) {
      // #126: `(@name)` — a parenthesised delegate. Badge the `@name`
      // inside; the parens stay plain text. On an action-like line.
      if (isActionLikeLine(view.state.doc.lineAt(from).text)) {
        add(from + 1, to - 1, Decoration.mark({ class: "glyph-assignee" }));
      }
      return;
    }
    if (text.startsWith("@")) {
      // #35: a bare `@name` anywhere on a line that also has a `=> `
      // delegate arrow — the assignee can be mentioned mid-sentence, not
      // just right after the arrow. (A `=> @name` right after the arrow
      // was already caught by the earlier alternative.)
      if (/=>\s/.test(view.state.doc.lineAt(from).text)) {
        add(from, to, Decoration.mark({ class: "glyph-assignee" }));
      }
      return;
    }
    if (text.startsWith("(")) {
      // #36/#39: a `(topic)` tag, but only immediately after the action
      // symbol (`# (topic) …`, or `… => # (topic) …`). `(word)` anywhere
      // else, or in prose, stays ordinary text.
      const line = view.state.doc.lineAt(from);
      const tag = leadingTopicTag(line.text);
      if (tag && line.from + tag.from === from) {
        add(from, to, Decoration.mark({ class: "glyph-topic" }));
      }
      return;
    }
    // Whatever's left is one of the four (optionally indented) action
    // symbols on its own — the lookbehind already excludes any leading
    // indentation from `text`, so `text[0]` is the symbol itself.
    const [char, cls] = glyphForSymbol(text[0]);
    add(from, to, Decoration.replace({ widget: new InlineGlyphWidget(char, cls, true, text[0]) }));
  },
});

/** Atomic-only pass: exactly the ranges that are actually *replaced* above
 * (never the `@name` mark, never the `!`-line mark, never a bullet's or
 * action's leading indentation — those stay ordinary, fully editable
 * text). Kept as a separate matcher rather than filtering `renderMatcher`'s
 * mixed set, since `EditorView.atomicRanges` must never include `@name` —
 * that would make it uneditable again, defeating the whole point of
 * marking it instead of replacing it. The actual Decoration value here is
 * never rendered (only fed to `atomicRanges`), so its content doesn't
 * matter, only its range. The `=> <symbol>` form's arrow and its action
 * glyph are each their own atomic range (`=> ` via the shared `(=>\s)`
 * alternative below, the symbol via its own lookbehind-gated one) rather
 * than one combined 5-character range — so the cursor can land between
 * them, and backspacing/selecting one doesn't take the other with it
 * (turning "=> # text" into "=> text" un-marks it as a consequence-action
 * without touching the delegate arrow, same as deleting `# ` off a plain
 * action line does; deleting just the arrow leaves the bare "# text"
 * action line behind, symmetrically). */
const atomicMatcher = new MatchDecorator({
  regexp:
    /((?<=^\s*)#\s)|((?<=^\s*)v\s)|((?<=^\s*)>\s)|((?<=^\s*)x\s)|((?<==>\s)[#vx>]\s)|(=>\s)|((?<=^\s*)[-*]\s)/gm,
  decoration: () => Decoration.replace({}),
});

export const liveGlyphs = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomicDecorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = renderMatcher.createDeco(view);
      this.atomicDecorations = atomicMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = renderMatcher.updateDeco(update, this.decorations);
      this.atomicDecorations = atomicMatcher.updateDeco(update, this.atomicDecorations);
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

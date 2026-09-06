import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

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
  ) {
    super();
  }

  eq(other: InlineGlyphWidget): boolean {
    return other.label === this.label && other.className === this.className;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = this.label;
    span.className = this.className;
    return span;
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
    /(^!\s)|((?<=^\s*)#\s)|((?<=^\s*)v\s)|((?<=^\s*)>\s)|((?<=^\s*)x\s)|(=>\s@\w+)|(=>\s[#vx>]\s)|(=>\s)|((?<=^\s*)[-*]\s)/gm,
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
        // "=> <symbol> " — the consequence-action form (§41).
        const [char, cls] = glyphForSymbol(text[3]);
        add(from + 3, to, Decoration.replace({ widget: new InlineGlyphWidget(char, cls) }));
      }
      return;
    }
    if (text.startsWith("-") || text.startsWith("*")) {
      add(from, to, Decoration.replace({ widget: new InlineGlyphWidget("•", "glyph-bullet") }));
      return;
    }
    // Whatever's left is one of the four (optionally indented) action
    // symbols on its own — the lookbehind already excludes any leading
    // indentation from `text`, so `text[0]` is the symbol itself.
    const [char, cls] = glyphForSymbol(text[0]);
    add(from, to, Decoration.replace({ widget: new InlineGlyphWidget(char, cls) }));
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

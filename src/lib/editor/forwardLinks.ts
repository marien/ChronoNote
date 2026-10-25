import { Prec, RangeSetBuilder, type EditorSelection } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { get } from "svelte/store";
import { tokenizeLine } from "../grammar/tokenize";
import { openDateLink } from "../dateLinks";
import { isMac } from "../platform";
import { isMobile } from "../controller";

/** §428: a forward link `(>YYYY-MM-DD#Section)` or `(<YYYY-MM-DD#Section)` is drawn as a pill over its own text.
 * Outset 1px box-shadow outline, faint background, quiet text colour. The two cells `(` + `<`/`>` carry an arrow mask,
 * `#` carries a dot, and `)` is transparent padding. When the caret enters or a selection covers the link, all raw
 * characters show in `var(--muted)`. Nothing is replaced: line width, height, and baseline remain byte-for-byte
 * identical to plain text.
 *
 * To avoid splitting the inner `.cm-date-link` element into multiple spans, the outer pill mark runs at Prec.lowest
 * and the inner character marks (dir arrow, sep dot, paren) run at Prec.high. This ensures .cm-date-link remains a
 * single unbroken element containing the .cm-fwd-sep mark inside it. */

const DIR_TO = Decoration.mark({ class: "cm-fwd-dir cm-fwd-dir-to" });
const DIR_FROM = Decoration.mark({ class: "cm-fwd-dir cm-fwd-dir-from" });
const SEP = Decoration.mark({ class: "cm-fwd-sep" });
const PAREN = Decoration.mark({ class: "cm-fwd-paren" });

function isEditing(from: number, to: number, selection: EditorSelection): boolean {
  for (const r of selection.ranges) {
    if (r.empty) {
      if (r.head >= from && r.head <= to) return true;
    } else {
      if (from < r.to && to > r.from) return true;
    }
  }
  return false;
}

function buildOutline(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  let lastLine = -1;

  for (const vr of view.visibleRanges) {
    let pos = vr.from;
    while (pos <= vr.to) {
      const line = view.state.doc.lineAt(pos);
      pos = line.to + 1;
      if (line.number <= lastLine) continue;
      lastLine = line.number;

      const tokens = tokenizeLine(line.text);
      for (const tok of tokens) {
        if (tok.kind !== "forwardLink") continue;
        const from = line.from + tok.from;
        const to = line.from + tok.to;
        const editing = isEditing(from, to, view.state.selection);
        const target = tok.section ? `(${tok.date}#${tok.section})` : `(${tok.date})`;

        b.add(
          from,
          to,
          Decoration.mark({
            class: editing ? "cm-fwd-link cm-fwd-editing" : "cm-fwd-link",
            attributes: { "data-date-target": target },
          }),
        );
      }
    }
  }

  return b.finish();
}

function buildInner(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  let lastLine = -1;

  for (const vr of view.visibleRanges) {
    let pos = vr.from;
    while (pos <= vr.to) {
      const line = view.state.doc.lineAt(pos);
      pos = line.to + 1;
      if (line.number <= lastLine) continue;
      lastLine = line.number;

      const tokens = tokenizeLine(line.text);
      for (const tok of tokens) {
        if (tok.kind !== "forwardLink") continue;
        const from = line.from + tok.from;
        const to = line.from + tok.to;

        // 1. "(>" or "(<" over the first two cells
        b.add(from, from + 2, tok.dir === ">" ? DIR_TO : DIR_FROM);

        // 2. Optional "#" separator dot
        if (tok.section !== undefined) {
          b.add(from + 12, from + 13, SEP);
        }

        // 3. Closing ")"
        b.add(to - 1, to, PAREN);
      }
    }
  }

  return b.finish();
}

const forwardLinksOutlineView = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildOutline(view);
    }

    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildOutline(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(e: MouseEvent, _view: EditorView) {
        const target = (e.target as HTMLElement)?.closest?.(".cm-fwd-link") as HTMLElement | null;
        if (!target || e.button !== 0 || e.shiftKey) return false;
        if (isMac ? e.metaKey : e.ctrlKey) {
          e.preventDefault();
          return true;
        }
        return false;
      },
      click(e: MouseEvent, _view: EditorView) {
        const target = (e.target as HTMLElement)?.closest?.(".cm-fwd-link") as HTMLElement | null;
        if (!target || e.button !== 0 || e.shiftKey) return false;

        const hasModifier = isMac ? e.metaKey : e.ctrlKey;
        const isMobileOrTouch = get(isMobile) || (e as PointerEvent).pointerType === "touch";

        if (hasModifier || isMobileOrTouch) {
          const dateTarget =
            target.getAttribute("data-date-target") ||
            target.querySelector(".cm-date-link")?.getAttribute("data-date-target");
          if (!dateTarget) return false;

          e.preventDefault();
          e.stopPropagation();
          void openDateLink(dateTarget);
          return true;
        }
        return false;
      },
      auxclick(e: MouseEvent, _view: EditorView) {
        if (e.button !== 1) return false;
        const target = (e.target as HTMLElement)?.closest?.(".cm-fwd-link") as HTMLElement | null;
        if (!target) return false;

        const dateTarget =
          target.getAttribute("data-date-target") ||
          target.querySelector(".cm-date-link")?.getAttribute("data-date-target");
        if (!dateTarget) return false;

        e.preventDefault();
        e.stopPropagation();
        void openDateLink(dateTarget);
        return true;
      },
    },
  },
);

const forwardLinksInnerView = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildInner(view);
    }

    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildInner(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export const forwardLinksPlugin = [
  Prec.lowest(forwardLinksOutlineView),
  Prec.high(forwardLinksInnerView),
];

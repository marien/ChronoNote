import {
  Decoration,
  type DecorationSet,
  type EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { isMac } from "../platform";
import { isMobile } from "../controller";
import { get } from "svelte/store";
import { isValidCalendarDate, openDateLink } from "../dateLinks";
import { isSetextUnderline } from "../tokens";
import { locale, t } from "../i18n";

export const DATE_LINK_REGEX =
  /(?<=\([<>]?)\d{4}-\d{2}-\d{2}(?:#[^)\r\n]+)?(?=\))|(?<![a-zA-Z0-9])\d{4}-\d{2}-\d{2}(?![a-zA-Z0-9])/g;

const dateLinkMatcher = new MatchDecorator({
  regexp: DATE_LINK_REGEX,
  decorate(add, from, _to, match, view) {
    const matchedText = match[0];
    const dateStr = matchedText.slice(0, 10);
    const parts = dateStr.split("-").map((p) => parseInt(p, 10));
    if (parts.length !== 3 || !isValidCalendarDate(parts[0], parts[1], parts[2])) {
      return;
    }

    const line = view.state.doc.lineAt(from);
    if (line.number < view.state.doc.lines) {
      const nextLine = view.state.doc.line(line.number + 1);
      if (isSetextUnderline(nextLine.text)) {
        return;
      }
    }

    const title =
      isMac && get(locale) === "en" ? "Cmd+Click to open this day" : get(t)("editor.dateLink.title");

    const prevChar = from > 0 ? view.state.doc.sliceString(from - 1, from) : "";
    const isBracketed = prevChar === "(" || prevChar === "<" || prevChar === ">";
    const dateTarget = isBracketed ? `(${matchedText})` : matchedText;
    // §428: inside a forward link's pill the date is still a link (Ctrl/Cmd+Click), but drawn by the pill: no link
    // colour, underline or hover change (this span wraps the pill's pieces, so the pill cannot undo `.cm-link`).
    const before = from > 1 ? view.state.doc.sliceString(from - 2, from) : "";
    const inPill = before === "(<" || before === "(>";

    add(
      from,
      from + matchedText.length,
      Decoration.mark({
        class: inPill ? "cm-date-link" : "cm-link cm-date-link",
        attributes: {
          "data-date-target": dateTarget,
          title,
        },
      }),
    );
  },
});

export const dateLinksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = dateLinkMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = dateLinkMatcher.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click(e: MouseEvent, _view: EditorView) {
        const target = (e.target as HTMLElement)?.closest?.(".cm-date-link") as HTMLElement | null;
        if (!target) return false;
        const dateTarget = target.getAttribute("data-date-target");
        if (!dateTarget) return false;

        const hasModifier = isMac ? e.metaKey : e.ctrlKey;
        const isMobileOrTouch = get(isMobile) || (e as PointerEvent).pointerType === "touch";

        if (hasModifier || isMobileOrTouch) {
          e.preventDefault();
          e.stopPropagation();
          void openDateLink(dateTarget);
          return true;
        }
        return false;
      },
      auxclick(e: MouseEvent, _view: EditorView) {
        if (e.button !== 1) return false;
        const target = (e.target as HTMLElement)?.closest?.(".cm-date-link") as HTMLElement | null;
        if (!target) return false;
        const dateTarget = target.getAttribute("data-date-target");
        if (!dateTarget) return false;

        e.preventDefault();
        e.stopPropagation();
        void openDateLink(dateTarget);
        return true;
      },
    },
  },
);

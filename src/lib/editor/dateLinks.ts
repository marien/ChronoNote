import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { isMac } from "../platform";
import { isMobile } from "../controller";
import { get } from "svelte/store";
import { isValidCalendarDate, openDateLink } from "../dateLinks";
import { findBalancedParenEnd, isTitleLine } from "../grammar/tokenize";
import { urlRangesInLine } from "./clickableLinks";
import { locale, t } from "../i18n";

const DATE_START_RE = /(?<=\([<>]?)\d{4}-\d{2}-\d{2}|(?<![a-zA-Z0-9])\d{4}-\d{2}-\d{2}(?![a-zA-Z0-9])/g;

export interface DateLinkSpan {
  /** Offset of the first digit of YYYY-MM-DD in the line. */
  from: number;
  /** End offset of the link mark (includes section suffix when bracketed). */
  to: number;
  /** End offset of the 10-character YYYY-MM-DD date itself. */
  dateEnd: number;
  dateTarget: string;
}

/** Find all valid date-link spans in a non-title line, excluding URLs. */
export function dateLinkSpansInLine(text: string): DateLinkSpan[] {
  const spans: DateLinkSpan[] = [];
  const urls = urlRangesInLine(text);
  DATE_START_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DATE_START_RE.exec(text)) !== null) {
    const start = match.index;
    const dateStr = match[0];
    const parts = dateStr.split("-").map((p) => parseInt(p, 10));
    if (parts.length !== 3 || !isValidCalendarDate(parts[0], parts[1], parts[2])) continue;

    const prev1 = start > 0 ? text[start - 1] : "";
    const prev2 = start > 1 ? text[start - 2] : "";
    const openIdx = prev1 === "(" ? start - 1 : (prev1 === "<" || prev1 === ">") && prev2 === "(" ? start - 2 : -1;

    let end = start + 10;
    const dateEnd = end;
    let bracketed = false;
    if (openIdx !== -1) {
      const closeIdx = findBalancedParenEnd(text, openIdx);
      if (closeIdx === end || (closeIdx > end + 1 && text[end] === "#")) {
        end = closeIdx;
        bracketed = true;
      } else if (end < text.length && /[a-zA-Z0-9]/.test(text[end])) {
        continue;
      }
    }

    if (urls.some(([uFrom, uTo]) => start < uTo && end > uFrom)) {
      DATE_START_RE.lastIndex = Math.max(DATE_START_RE.lastIndex, end);
      continue;
    }

    const matchedText = text.slice(start, end);
    const dateTarget = bracketed ? `(${matchedText})` : matchedText;
    spans.push({ from: start, to: end, dateEnd, dateTarget });
    DATE_START_RE.lastIndex = Math.max(DATE_START_RE.lastIndex, end);
  }
  return spans;
}

function buildDateLinkDecorations(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const title = isMac && get(locale) === "en" ? "Cmd+Click to open this day" : get(t)("editor.dateLink.title");
  let lastLine = -1;

  for (const vr of view.visibleRanges) {
    let pos = vr.from;
    while (pos <= vr.to) {
      const line = view.state.doc.lineAt(pos);
      pos = line.to + 1;
      if (line.number <= lastLine) continue;
      lastLine = line.number;

      const text = line.text;
      if (line.number < view.state.doc.lines) {
        const nextLine = view.state.doc.line(line.number + 1);
        if (isTitleLine(text, nextLine.text)) continue;
      }

      for (const span of dateLinkSpansInLine(text)) {
        b.add(
          line.from + span.from,
          line.from + span.to,
          Decoration.mark({
            class: "cm-link cm-date-link",
            attributes: {
              "data-date-target": span.dateTarget,
              title,
            },
          }),
        );
      }
    }
  }
  return b.finish();
}

export const dateLinksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDateLinkDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDateLinkDecorations(update.view);
      }
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

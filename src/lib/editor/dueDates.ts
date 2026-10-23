import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { get } from "svelte/store";
import { currentDateISO, activeTabId, dueDatePending, modal } from "../stores";
import { locale, t } from "../i18n";
import { tokenizeLine, getLineActionParts } from "../grammar/tokenize";
import { dueStatus } from "../tokens";
import { dueLabel, dueWordExtra, longDate, parseDueWord, parseISODateLocal } from "../date";
import { openDateLink } from "../dateLinks";
import { isMac } from "../platform";

const forceRedraw = StateEffect.define<void>();

export class DuePillWidget extends WidgetType {
  constructor(
    readonly date: string,
    readonly status: "overdue" | "today" | "later",
    readonly resolved: boolean,
    readonly locale: string,
    readonly todayISO: string,
    /** The source text's length: the pill is exactly this many `ch` wide (§420, the editor font is monospace). */
    readonly chars: number,
  ) {
    super();
  }

  // No line or part in here: a click finds them from the pill's position, so a pill reused after lines were
  // inserted above it still edits its own line.
  eq(other: DuePillWidget): boolean {
    return (
      this.date === other.date &&
      this.status === other.status &&
      this.resolved === other.resolved &&
      this.locale === other.locale &&
      this.todayISO === other.todayISO &&
      this.chars === other.chars
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-due-pill";
    if (this.resolved) {
      span.classList.add("cm-due-resolved");
    } else {
      span.classList.add(`cm-due-${this.status}`);
    }

    span.dataset.date = this.date;
    // §420: the outer box is the source text's exact footprint (width here, one line tall in CSS); the visible pill
    // is the inner label, so nothing about it can change the line's width or height.
    span.style.width = `${this.chars}ch`;

    const translate = get(t);
    // Half a character of padding on each side: the label gets one character less than the footprint.
    const maxChars = this.chars - 1;
    const todayWord = translate("dueDate.pill.today", undefined);
    const text =
      this.status === "today" && todayWord.length <= maxChars
        ? todayWord
        : dueLabel(this.date, this.todayISO, this.locale, maxChars);
    const label = document.createElement("span");
    label.className = "cm-due-label";
    label.textContent = text;
    span.appendChild(label);

    let detail = longDate(this.locale, this.date);
    if (this.status === "overdue") {
      const dDue = parseISODateLocal(this.date);
      const dToday = parseISODateLocal(this.todayISO);
      const count = Math.max(1, Math.round((dToday.getTime() - dDue.getTime()) / 86400000));
      detail += `, ${translate("dueDate.pill.daysLate", { count })}`;
    } else if (this.status === "today") {
      detail += `, ${translate("dueDate.pill.dueToday", undefined)}`;
    }

    const title = `by:${this.date}\n${detail}`;
    span.title = title;
    span.setAttribute("aria-label", `by:${this.date} ${detail}`);

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const hasModifier = isMac ? e.metaKey : e.ctrlKey;
      if (hasModifier) {
        void openDateLink(this.date);
        return;
      }
      const pos = view.posAtDOM(span);
      const line = view.state.doc.lineAt(pos);
      const offset = pos - line.from;
      const part = getLineActionParts(line.text, tokenizeLine(line.text)).find((p) => offset >= p.from && offset < p.to);
      dueDatePending.set({ tabId: get(activeTabId), lineIdx: line.number - 1, partFrom: part?.from ?? offset });
      modal.set("date");
    };

    span.addEventListener("click", handleClick);
    span.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    return span;
  }

  ignoreEvent(event: Event): boolean {
    if (event.type === "click" || event.type === "mousedown") {
      return false;
    }
    return true;
  }
}

function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const today = get(currentDateISO);
  const loc = get(locale);
  const translate = get(t);
  const extra = dueWordExtra(
    translate("dueDate.words.today", undefined) ?? "",
    translate("dueDate.words.tomorrow", undefined) ?? "",
  );

  const visitedLineNums = new Set<number>();

  for (const vr of view.visibleRanges) {
    let pos = vr.from;
    while (pos <= vr.to) {
      const line = view.state.doc.lineAt(pos);
      if (!visitedLineNums.has(line.number)) {
        visitedLineNums.add(line.number);

        const isTouched = view.state.selection.ranges.some((r) => r.from <= line.to && r.to >= line.from);
        const tokens = tokenizeLine(line.text);
        const actionParts = getLineActionParts(line.text, tokens);

        for (const tok of tokens) {
          if (tok.kind === "due" && tok.date) {
            const tokenFrom = line.from + tok.from;
            const tokenTo = line.from + tok.to;
            if (isTouched) {
              b.add(tokenFrom, tokenTo, Decoration.mark({ class: "cm-due-raw" }));
            } else {
              const part = actionParts.find((p) => tok.from >= p.from && tok.from < p.to);
              const state = part ? part.state : null;
              const resolved = state === "v" || state === ">" || state === "x";
              const status = dueStatus(tok.date, today);
              const widget = new DuePillWidget(tok.date, status, resolved, loc, today, tok.to - tok.from);
              b.add(tokenFrom, tokenTo, Decoration.replace({ widget }));
            }
          } else if (tok.kind === "dueWord" && tok.word !== undefined) {
            if (!isTouched) {
              const parsed = parseDueWord(tok.word, today, loc, extra);
              if (parsed === null) {
                const tokenFrom = line.from + tok.from;
                const tokenTo = line.from + tok.to;
                b.add(
                  tokenFrom,
                  tokenTo,
                  Decoration.mark({
                    class: "cm-due-unknown",
                    attributes: {
                      title: translate("dueDate.pill.notADate", undefined),
                    },
                  }),
                );
              }
            }
          }
        }
      }
      pos = line.to + 1;
    }
  }

  return b.finish();
}

export const dueDatesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private unsub: () => void;

    constructor(view: EditorView) {
      this.decorations = build(view);
      let initial = true;
      this.unsub = currentDateISO.subscribe(() => {
        if (initial) {
          initial = false;
          return;
        }
        view.dispatch({ effects: forceRedraw.of() });
      });
    }

    update(u: ViewUpdate) {
      const storeChanged = u.transactions.some((tr) => tr.effects.some((e) => e.is(forceRedraw)));
      if (u.docChanged || u.selectionSet || u.viewportChanged || storeChanged) {
        this.decorations = build(u.view);
      }
    }

    destroy() {
      this.unsub();
    }
  },
  // Clicks are handled by the pill's own listeners (`toDOM`).
  { decorations: (v) => v.decorations },
);

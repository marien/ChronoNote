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
import { parseDueWord, dueWordExtra, longDate, parseISODateLocal } from "../date";
import { openDateLink } from "../dateLinks";
import { isMac } from "../platform";

const forceRedraw = StateEffect.define<void>();

export class DuePillWidget extends WidgetType {
  constructor(
    readonly date: string,
    readonly status: "overdue" | "today" | "later",
    readonly resolved: boolean,
    readonly locale: string,
    readonly lineIdx: number,
    readonly partFrom: number,
    readonly todayISO: string,
  ) {
    super();
  }

  eq(other: DuePillWidget): boolean {
    return (
      this.date === other.date &&
      this.status === other.status &&
      this.resolved === other.resolved &&
      this.locale === other.locale &&
      // The DOM carries the line and part it edits: a reused widget after lines were inserted above would point
      // at the wrong line.
      this.lineIdx === other.lineIdx &&
      this.partFrom === other.partFrom &&
      this.todayISO === other.todayISO
    );
  }

  toDOM(_view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-due-pill";
    if (this.resolved) {
      span.classList.add("cm-due-resolved");
    } else {
      span.classList.add(`cm-due-${this.status}`);
    }

    span.dataset.date = this.date;
    span.dataset.lineIdx = String(this.lineIdx);
    span.dataset.partFrom = String(this.partFrom);

    const translate = get(t);

    let text = "";
    if (this.status === "today") {
      text = translate("dueDate.pill.today", undefined);
    } else {
      const dateYear = Number(this.date.slice(0, 4));
      const todayYear = Number(this.todayISO.slice(0, 4));
      const opts: Intl.DateTimeFormatOptions = {
        weekday: "short",
        day: "numeric",
        month: "short",
      };
      if (dateYear !== todayYear) {
        opts.year = "numeric";
      }
      text = new Intl.DateTimeFormat(this.locale, opts).format(parseISODateLocal(this.date));
    }
    span.textContent = text;

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
      const tabId = get(activeTabId);
      dueDatePending.set({ tabId, lineIdx: this.lineIdx, partFrom: this.partFrom });
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
              const partFrom = part ? part.from : 0;
              const widget = new DuePillWidget(tok.date, status, resolved, loc, line.number - 1, partFrom, today);
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
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click(e: MouseEvent, _view: EditorView) {
        const pill = (e.target as HTMLElement)?.closest?.(".cm-due-pill") as HTMLElement | null;
        if (!pill) return false;
        e.preventDefault();
        e.stopPropagation();
        const date = pill.dataset.date;
        const hasModifier = isMac ? e.metaKey : e.ctrlKey;
        if (hasModifier && date) {
          void openDateLink(date);
          return true;
        }
        const lineIdx = Number(pill.dataset.lineIdx);
        const partFrom = Number(pill.dataset.partFrom);
        const tabId = get(activeTabId);
        dueDatePending.set({ tabId, lineIdx, partFrom });
        modal.set("date");
        return true;
      },
      mousedown(e: MouseEvent) {
        const pill = (e.target as HTMLElement)?.closest?.(".cm-due-pill");
        if (pill) {
          e.preventDefault();
          e.stopPropagation();
          return true;
        }
        return false;
      },
    },
  },
);

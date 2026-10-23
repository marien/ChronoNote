import { Prec, RangeSetBuilder, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { get } from "svelte/store";
import { currentDateISO, activeTabId, dueDatePending, modal } from "../stores";
import { locale, t } from "../i18n";
import { tokenizeLine, getLineActionParts } from "../grammar/tokenize";
import { dueStatus } from "../tokens";
import { dueWordExtra, longDate, parseDueWord, parseISODateLocal } from "../date";
import { openDateLink } from "../dateLinks";
import { isMac } from "../platform";

/** §421: a due date is drawn on its own text, never replaced. Two marks: `.cm-due` over the whole `by:YYYY-MM-DD`
 * (the outline, coloured by state, drawn like the topic pill so it changes neither width nor height) and
 * `.cm-due-flag` over `by:` (the characters stay, transparent, with a flag drawn over them: three cells, the same
 * width, copy and selection unchanged). The date digits stay plain text on the line's baseline. */

const forceRedraw = StateEffect.define<void>();

const FLAG = Decoration.mark({ class: "cm-due-flag", attributes: { spellcheck: "false" } });

function tooltip(date: string, status: "overdue" | "today" | "later", loc: string, today: string): string {
  const translate = get(t);
  let detail = longDate(loc, date);
  if (status === "overdue") {
    const days = Math.max(1, Math.round((parseISODateLocal(today).getTime() - parseISODateLocal(date).getTime()) / 86400000));
    detail += `, ${translate("dueDate.pill.daysLate", { count: days })}`;
  } else if (status === "today") {
    detail += `, ${translate("dueDate.pill.dueToday", undefined)}`;
  }
  return detail;
}

function build(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
  const b = new RangeSetBuilder<Decoration>();
  const atomic = new RangeSetBuilder<Decoration>();
  const today = get(currentDateISO);
  const loc = get(locale);
  const translate = get(t);
  const extra = dueWordExtra(
    translate("dueDate.words.today", undefined) ?? "",
    translate("dueDate.words.tomorrow", undefined) ?? "",
  );

  let lastLine = -1;
  for (const vr of view.visibleRanges) {
    let pos = vr.from;
    while (pos <= vr.to) {
      const line = view.state.doc.lineAt(pos);
      pos = line.to + 1;
      if (line.number <= lastLine) continue;
      lastLine = line.number;

      const tokens = tokenizeLine(line.text);
      if (!tokens.some((tok) => tok.kind === "due" || tok.kind === "dueWord")) continue;
      const isTouched = view.state.selection.ranges.some((r) => r.from <= line.to && r.to >= line.from);
      const actionParts = getLineActionParts(line.text, tokens);

      for (const tok of tokens) {
        const from = line.from + tok.from;
        const to = line.from + tok.to;
        if (tok.kind === "due" && tok.date) {
          const part = actionParts.find((p) => tok.from >= p.from && tok.from < p.to);
          const resolved = part?.state === "v" || part?.state === ">" || part?.state === "x";
          const status = dueStatus(tok.date, today);
          b.add(
            from,
            to,
            Decoration.mark({
              class: `cm-due ${resolved ? "cm-due-resolved" : `cm-due-${status}`}`,
              attributes: { title: tooltip(tok.date, status, loc, today), "data-due-date": tok.date },
            }),
          );
          b.add(from, from + 3, FLAG);
          // `by:` acts as one glyph: the caret never stops inside it, and Backspace after it removes all three.
          atomic.add(from, from + 3, FLAG);
        } else if (tok.kind === "dueWord" && tok.word !== undefined && !isTouched) {
          if (parseDueWord(tok.word, today, loc, extra) === null) {
            b.add(
              from,
              to,
              Decoration.mark({ class: "cm-due-unknown", attributes: { title: translate("dueDate.pill.notADate", undefined) } }),
            );
          }
        }
      }
    }
  }
  return { decorations: b.finish(), atomic: atomic.finish() };
}

/** The action part a due date belongs to, for the date picker (a click finds it from the element's position). */
function openPickerAt(view: EditorView, el: HTMLElement) {
  const pos = view.posAtDOM(el);
  const line = view.state.doc.lineAt(pos);
  const offset = pos - line.from;
  const part = getLineActionParts(line.text, tokenizeLine(line.text)).find((p) => offset >= p.from && offset < p.to);
  dueDatePending.set({ tabId: get(activeTabId), lineIdx: line.number - 1, partFrom: part?.from ?? offset });
  modal.set("date");
}

const dueDatesView = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;
    private unsub: () => void;

    constructor(view: EditorView) {
      ({ decorations: this.decorations, atomic: this.atomic } = build(view));
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
        ({ decorations: this.decorations, atomic: this.atomic } = build(u.view));
      }
    }

    destroy() {
      this.unsub();
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      // §422: a click anywhere on the due date (flag or digits) opens the date picker: clicking a date with the mouse
      // means changing it with the mouse; the keyboard still reaches the digits. Ctrl/Cmd+Click opens that day (on the
      // digits that is the date link's own handler, so it is left to it). The picker opens on `click`, not
      // `mousedown`: opened on mousedown, the click that follows lands outside it and closes it again.
      mousedown(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (e.button !== 0 || !target?.closest?.(".cm-due")) return false;
        if ((isMac ? e.metaKey : e.ctrlKey) && target.closest(".cm-date-link")) return false;
        e.preventDefault(); // the caret stays where it was
        return true;
      },
      click(e: MouseEvent, view: EditorView) {
        const target = e.target as HTMLElement;
        const due = target?.closest?.(".cm-due") as HTMLElement | null;
        if (!due || e.button !== 0) return false;
        const modifier = isMac ? e.metaKey : e.ctrlKey;
        if (modifier && target.closest(".cm-date-link")) return false;
        e.preventDefault();
        if (modifier && due.dataset.dueDate) void openDateLink(due.dataset.dueDate);
        else openPickerAt(view, due);
        return true;
      },
    },
  },
);

/** Lowest precedence: CodeMirror draws lower-precedence marks OUTSIDE higher ones, so the outline wraps the whole token
 * (and the date link inside it) in one element instead of being split around the link. */
export const dueDatesPlugin = [
  Prec.lowest(dueDatesView),
  EditorView.atomicRanges.of((view) => view.plugin(dueDatesView)?.atomic ?? Decoration.none),
];

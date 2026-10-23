import { type EditorSelection, Prec, RangeSetBuilder, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { get } from "svelte/store";
import { currentDateISO, activeTabId, dueDatePending } from "../stores";
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

/** The last plain mousedown on a due date: where, whether its picker was already open, and the selection before it
 * (see the click handler). */
let press: { x: number; y: number; pickerWasOpen: boolean; selection: EditorSelection } | null = null;

/** The action part a due date belongs to, for the date picker (a click finds it from the element's position). */
function openPickerAt(view: EditorView, el: HTMLElement) {
  const pos = view.posAtDOM(el);
  const line = view.state.doc.lineAt(pos);
  const offset = pos - line.from;
  const part = getLineActionParts(line.text, tokenizeLine(line.text)).find((p) => offset >= p.from && offset < p.to);
  const rect = el.getBoundingClientRect();
  dueDatePending.set({
    tabId: get(activeTabId),
    lineIdx: line.number - 1,
    partFrom: part?.from ?? offset,
    anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
  });
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
      // §422: a single plain click anywhere on the due date (flag or digits) opens the date picker: clicking a date
      // with the mouse means changing it with the mouse. Everything else stays ordinary text handling: a drag selects,
      // a double click selects the word, Shift+Click extends the selection (none of them opens the picker), and a
      // click on the date while its picker is open closes it (the picker's outside-click closes it; this click must not
      // reopen it). Ctrl/Cmd+Click opens that day without adding a second cursor (on the digits the date link's own
      // click handler opens it). The picker opens on `click`, not `mousedown`: opened on mousedown, the click that
      // follows lands outside it and closes it again.
      mousedown(e: MouseEvent, view: EditorView) {
        press = null;
        const target = e.target as HTMLElement;
        if (e.button !== 0 || e.shiftKey || !target?.closest?.(".cm-due")) return false;
        if (isMac ? e.metaKey : e.ctrlKey) {
          e.preventDefault(); // no extra cursor at the date
          return true;
        }
        press = { x: e.clientX, y: e.clientY, pickerWasOpen: get(dueDatePending) !== null, selection: view.state.selection };
        return false; // CodeMirror places the caret / starts a selection as usual
      },
      click(e: MouseEvent, view: EditorView) {
        const target = e.target as HTMLElement;
        const due = target?.closest?.(".cm-due") as HTMLElement | null;
        const p = press;
        press = null;
        if (!due || e.button !== 0 || e.shiftKey) return false;
        if (isMac ? e.metaKey : e.ctrlKey) {
          if (target.closest(".cm-date-link") || !due.dataset.dueDate) return false;
          void openDateLink(due.dataset.dueDate);
          return true;
        }
        const moved = !p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 3;
        if (moved || p.pickerWasOpen || e.detail > 1 || !view.state.selection.main.empty) return false;
        // A plain click that opens the picker leaves the caret where it was before the click (the mousedown let
        // CodeMirror move it, so a drag could start).
        view.dispatch({ selection: p.selection });
        openPickerAt(view, due);
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

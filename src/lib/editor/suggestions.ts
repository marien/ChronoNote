/** Inline autocomplete suggestions for `@name`, `(topic)`, and section titles (F3). */
import { type Extension, Prec, StateEffect, StateField } from "@codemirror/state";
import { EditorView, keymap, showTooltip, type Tooltip, type TooltipView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { parseISODateLocal, todayISO } from "../date";
import { NAME_CHAR } from "../grammar/symbols";
import { isSetextUnderline, isTitleUnderline, tokenizeLine } from "../grammar/tokenize";
import type { Suggestion, SuggestionKind } from "../suggestions";
import { getSectionHeaderForLine } from "../tokens";

export interface SuggestionContext {
  kind: SuggestionKind;
  prefix: string;
  from: number;
  to: number;
}

export interface SuggestionsLabels {
  today: string;
  yesterday: string;
  meetingToday: string;
  invited?: string;
  listLabel: string;
}

export interface SuggestionsOptions {
  labels?: () => SuggestionsLabels;
  locale?: () => string;
  today?: () => string;
  noteDate?: () => string | null;
}

const DEFAULT_LABELS: SuggestionsLabels = {
  today: "today",
  yesterday: "yesterday",
  meetingToday: "today's meeting",
  invited: "invited",
  listLabel: "Suggestions",
};

const NAME_PREFIX_RE = new RegExp(String.raw`(?:^|[\s(,])(@(${NAME_CHAR}+))$`, "u");
const NAME_TAIL_RE = new RegExp(String.raw`^${NAME_CHAR}`, "u");
const TOPIC_PREFIX_RE = /\(([^\s()@][^\s()]*)$/;

export function suggestionContext(
  lineText: string,
  caretCol: number,
  nextLineText: string | null,
): SuggestionContext | null {
  if (caretCol < 0 || caretCol > lineText.length) return null;

  if (
    nextLineText !== null &&
    isSetextUnderline(nextLineText) &&
    !isTitleUnderline(lineText) &&
    lineText.trim() !== ""
  ) {
    const prefix = lineText.slice(0, caretCol).trimStart();
    if (prefix.length > 0) {
      return { kind: "title", prefix, from: 0, to: lineText.length };
    }
    return null;
  }

  const before = lineText.slice(0, caretCol);
  const after = lineText.slice(caretCol);

  if (!NAME_TAIL_RE.test(after)) {
    const nm = NAME_PREFIX_RE.exec(before);
    if (nm) {
      return {
        kind: "name",
        prefix: nm[2],
        from: before.length - nm[1].length,
        to: caretCol,
      };
    }
  }

  if (!/^[^\s()]/.test(after)) {
    const tm = TOPIC_PREFIX_RE.exec(before);
    if (tm) {
      const openIdx = before.length - tm[0].length;
      const tokens = tokenizeLine(before);
      const first = tokens[0];
      const firstMatches = (first?.kind === "action" || first?.kind === "topic") && first.to === openIdx;
      let conseqMatches = false;
      if (!firstMatches) {
        for (let i = tokens.length - 1; i >= 0; i--) {
          const tok = tokens[i];
          if (tok.to <= openIdx) {
            conseqMatches = (tok.kind === "consequence" || tok.kind === "consequenceTopic") && tok.to === openIdx;
            break;
          }
        }
      }
      if (firstMatches || conseqMatches) {
        return {
          kind: "topic",
          prefix: tm[1],
          from: openIdx,
          to: caretCol,
        };
      }
    }
  }

  return null;
}

export function formatSuggestionDate(
  row: Suggestion,
  opts: { today: string; noteDate: string | null; locale: string; labels: SuggestionsLabels },
): string {
  if (row.meetingToday) return opts.labels.meetingToday;
  if (!row.lastUsed) return row.invited ? (opts.labels.invited ?? DEFAULT_LABELS.invited!) : "";

  const diffDays = Math.round(
    (parseISODateLocal(opts.today).getTime() - parseISODateLocal(row.lastUsed).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return opts.labels.today;
  if (diffDays === 1) return opts.labels.yesterday;

  const d = parseISODateLocal(row.lastUsed);
  if (diffDays >= 2 && diffDays <= 6) {
    return new Intl.DateTimeFormat(opts.locale, { weekday: "short" }).format(d);
  }

  const noteYear = (opts.noteDate ?? opts.today).slice(0, 4);
  if (row.lastUsed.slice(0, 4) === noteYear) {
    return new Intl.DateTimeFormat(opts.locale, { day: "numeric", month: "short" }).format(d);
  }
  return new Intl.DateTimeFormat(opts.locale, { day: "numeric", month: "short", year: "numeric" }).format(d);
}

interface SuggestionsFieldState {
  context: SuggestionContext | null;
  rows: Suggestion[];
  selected: number;
  arrowUsed: boolean;
  dismissedKey: string | null;
  tooltip: Tooltip | null;
}

const CLOSED_STATE: SuggestionsFieldState = {
  context: null,
  rows: [],
  selected: -1,
  arrowUsed: false,
  dismissedKey: null,
  tooltip: null,
};

let nextListId = 0;

export const refreshSuggestions = StateEffect.define<void>();

function contextKey(lineNumber: number, ctx: SuggestionContext): string {
  return `${ctx.kind}:${lineNumber}:${ctx.from}`;
}

export function suggestionsExtension(
  source: (kind: SuggestionKind, prefix: string, sectionHeader?: string) => Suggestion[],
  options: SuggestionsOptions = {},
): Extension {
  const listId = `cn-suggest-${++nextListId}`;
  const getLabels = options.labels ?? (() => DEFAULT_LABELS);
  const getLocale = options.locale ?? (() => "en");
  const getToday = options.today ?? todayISO;
  const getNoteDate = options.noteDate ?? (() => null);

  const moveSelectionEffect = StateEffect.define<-1 | 1>();
  const dismissEffect = StateEffect.define<void>();
  const closeEffect = StateEffect.define<void>();
  const acceptEffect = StateEffect.define<void>();

  let destroyed = false;

  function makeTooltip(pos: number): Tooltip {
    return {
      pos,
      above: false,
      create(view: EditorView): TooltipView {
        const dom = document.createElement("div");
        dom.className = "cn-suggest";
        dom.setAttribute("role", "listbox");
        dom.id = listId;

        const render = (state: SuggestionsFieldState) => {
          const labels = getLabels();
          const loc = getLocale();
          const today = getToday();
          const noteDate = getNoteDate();
          dom.setAttribute("aria-label", labels.listLabel);
          dom.replaceChildren();

          state.rows.forEach((row, idx) => {
            const opt = document.createElement("div");
            opt.className = idx === state.selected ? "cn-suggest-row is-selected" : "cn-suggest-row";
            opt.id = `${listId}-opt-${idx}`;
            opt.setAttribute("role", "option");
            opt.setAttribute("aria-selected", idx === state.selected ? "true" : "false");
            opt.dataset.suggestIdx = String(idx);

            const labelSpan = document.createElement("span");
            labelSpan.className = "cn-suggest-label";
            labelSpan.textContent = row.label;
            opt.appendChild(labelSpan);

            const dateText = formatSuggestionDate(row, { today, noteDate, locale: loc, labels });
            if (dateText) {
              const metaSpan = document.createElement("span");
              metaSpan.className = "cn-suggest-date";
              metaSpan.textContent = dateText;
              opt.appendChild(metaSpan);
            }

            dom.appendChild(opt);
          });
        };

        let outsideHandler: ((e: MouseEvent) => void) | null = null;

        dom.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });

        dom.addEventListener("click", (e) => {
          const target = (e.target as HTMLElement | null)?.closest?.("[data-suggest-idx]") as HTMLElement | null;
          if (!target) return;
          const idx = Number(target.dataset.suggestIdx);
          if (!Number.isInteger(idx)) return;
          e.preventDefault();
          e.stopPropagation();
          acceptIndex(view, idx);
        });

        render(view.state.field(field));

        return {
          dom,
          mount() {
            outsideHandler = (e: MouseEvent) => {
              if (destroyed) return;
              const target = e.target as Node | null;
              if (target && dom.contains(target)) return;
              const cur = view.state.field(field, false);
              if (cur && cur.rows.length > 0) {
                view.dispatch({ effects: closeEffect.of() });
              }
            };
            document.addEventListener("mousedown", outsideHandler, true);
          },
          update(u: ViewUpdate) {
            const next = u.state.field(field);
            const prev = u.startState.field(field);
            if (next !== prev) {
              render(next);
            }
          },
          destroy() {
            if (outsideHandler) {
              document.removeEventListener("mousedown", outsideHandler, true);
              outsideHandler = null;
            }
          },
        };
      },
    };
  }

  const field = StateField.define<SuggestionsFieldState>({
    create: () => CLOSED_STATE,
    update(value, tr) {
      let accepted = false;
      let refresh = false;
      for (const e of tr.effects) {
        if (e.is(acceptEffect)) {
          accepted = true;
        } else if (e.is(refreshSuggestions)) {
          refresh = true;
        } else if (e.is(dismissEffect) || e.is(closeEffect)) {
          const head = tr.state.selection.main.head;
          const line = tr.state.doc.lineAt(head);
          const dk = value.context ? contextKey(line.number, value.context) : value.dismissedKey;
          return { ...CLOSED_STATE, dismissedKey: dk };
        } else if (e.is(moveSelectionEffect)) {
          if (value.rows.length === 0) return value;
          const len = value.rows.length;
          const next = (((value.selected + e.value) % len) + len) % len;
          return { ...value, selected: next, arrowUsed: true };
        }
      }

      if (accepted) {
        const sel = tr.state.selection.main;
        const line = tr.state.doc.lineAt(sel.head);
        const col = sel.head - line.from;
        const nextLineText = line.number < tr.state.doc.lines ? tr.state.doc.line(line.number + 1).text : null;
        const ctx = sel.empty ? suggestionContext(line.text, col, nextLineText) : null;
        return { ...CLOSED_STATE, dismissedKey: ctx ? contextKey(line.number, ctx) : null };
      }

      if (!refresh && !tr.docChanged && tr.selection === undefined) {
        return value;
      }

      const sel = tr.state.selection.main;
      if (!sel.empty) {
        return value === CLOSED_STATE ? value : CLOSED_STATE;
      }

      const line = tr.state.doc.lineAt(sel.head);
      const col = sel.head - line.from;
      const nextLineText = line.number < tr.state.doc.lines ? tr.state.doc.line(line.number + 1).text : null;
      const ctx = suggestionContext(line.text, col, nextLineText);
      if (!ctx) {
        return value === CLOSED_STATE ? value : CLOSED_STATE;
      }

      // #252: a section title's list opens only while typing in it. Clicking or moving the caret into a title that is
      // already there leaves it closed (the prefix is only the text before the caret, so other titles would match);
      // a list that is already open for this title stays open while the caret moves within it.
      if (
        ctx.kind === "title" &&
        !(tr.docChanged && (tr.isUserEvent("input") || tr.isUserEvent("delete"))) &&
        !(value.context?.kind === "title" && value.tooltip?.pos === line.from)
      ) {
        return value === CLOSED_STATE ? value : CLOSED_STATE;
      }

      const key = contextKey(line.number, ctx);
      if (!tr.isUserEvent("undo") && key === value.dismissedKey) {
        return value.rows.length === 0 && value.context === null && value.dismissedKey === key
          ? value
          : { ...CLOSED_STATE, dismissedKey: key };
      }

      const sectionHeader =
        ctx.kind === "name"
          ? getSectionHeaderForLine(tr.state.doc.toString().split("\n"), line.number - 1)
          : "";
      // #252: a title suggestion that equals the title already on the line would change nothing; leave it out.
      const current = ctx.kind === "title" ? line.text.slice(ctx.from, ctx.to) : null;
      const rows = source(ctx.kind, ctx.prefix, sectionHeader)
        .filter((row) => row.insert !== current)
        .slice(0, 8);
      if (rows.length === 0) {
        return { ...CLOSED_STATE, context: ctx };
      }

      const anchorPos = line.from + ctx.from;
      const tooltip = value.tooltip && value.tooltip.pos === anchorPos ? value.tooltip : makeTooltip(anchorPos);
      return {
        context: ctx,
        rows,
        selected: 0,
        arrowUsed: false,
        dismissedKey: null,
        tooltip,
      };
    },
    provide: (f) => [
      showTooltip.from(f, (v) => v.tooltip),
      EditorView.contentAttributes.from(f, (v): Record<string, string> =>
        v.rows.length > 0 && v.selected >= 0 ? { "aria-activedescendant": `${listId}-opt-${v.selected}` } : {},
      ),
    ],
  });

  function acceptIndex(view: EditorView, idx: number): boolean {
    const state = view.state.field(field, false);
    if (!state || !state.context || idx < 0 || idx >= state.rows.length) return false;
    const row = state.rows[idx];
    const ctx = state.context;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const fromAbs = line.from + ctx.from;
    let toCol = ctx.to;
    if (ctx.kind === "topic" && line.text[toCol] === ")") {
      toCol++;
    }
    const toAbs = line.from + toCol;
    view.dispatch({
      changes: { from: fromAbs, to: toAbs, insert: row.insert },
      selection: { anchor: fromAbs + row.insert.length },
      effects: acceptEffect.of(),
      userEvent: "input.complete",
      scrollIntoView: true,
    });
    return true;
  }

  const keys = Prec.highest(
    keymap.of([
      {
        key: "Tab",
        run(view) {
          const st = view.state.field(field, false);
          if (!st || st.rows.length === 0 || st.selected < 0) return false;
          return acceptIndex(view, st.selected);
        },
      },
      {
        key: "ArrowDown",
        run(view) {
          const st = view.state.field(field, false);
          if (!st || st.rows.length === 0) return false;
          view.dispatch({ effects: moveSelectionEffect.of(1) });
          return true;
        },
      },
      {
        key: "ArrowUp",
        run(view) {
          const st = view.state.field(field, false);
          if (!st || st.rows.length === 0) return false;
          view.dispatch({ effects: moveSelectionEffect.of(-1) });
          return true;
        },
      },
      {
        key: "Enter",
        run(view) {
          const st = view.state.field(field, false);
          if (!st || st.rows.length === 0 || !st.arrowUsed || st.selected < 0) return false;
          return acceptIndex(view, st.selected);
        },
      },
      {
        key: "Escape",
        run(view) {
          const st = view.state.field(field, false);
          if (!st || st.rows.length === 0) return false;
          view.dispatch({ effects: dismissEffect.of() });
          return true;
        },
      },
    ]),
  );

  const events = EditorView.domEventHandlers({
    blur(_e, view) {
      if (destroyed) return;
      const st = view.state.field(field, false);
      if (st && st.rows.length > 0) {
        view.dispatch({ effects: closeEffect.of() });
      }
    },
  });

  const destroyWatcher = ViewPlugin.fromClass(
    class {
      destroy() {
        destroyed = true;
      }
    },
  );

  return [field, keys, events, destroyWatcher];
}

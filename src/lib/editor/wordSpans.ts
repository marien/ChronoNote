import {
  CharCategory,
  EditorSelection,
  type EditorState,
  type Line,
  type SelectionRange,
  type Text,
  findClusterBreak,
} from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { dateLinkSpansInLine } from "./dateLinks";
import { isTitleLine, tokenizeLine, type TokenKind } from "../grammar/tokenize";
import { parseNumberedItem } from "../tokens";

export interface WordSpan {
  /** Inclusive start column within the line. */
  from: number;
  /** Exclusive end column within the line (includes 1 trailing space for markers). */
  to: number;
  /** Double-click exclusive end column when shorter than `to` (e.g. markers without their trailing space). */
  clickTo?: number;
}

const MARKER_TOKEN_KINDS: ReadonlySet<TokenKind> = new Set([
  "action",
  "topic",
  "bullet",
  "arrow",
  "consequence",
  "consequenceTopic",
]);

const ENTITY_TOKEN_KINDS: ReadonlySet<TokenKind> = new Set([
  "due",
  "dueWord",
  "topicTag",
  "assignee",
]);

export function spanClickEnd(span: WordSpan): number {
  return span.clickTo ?? span.to;
}

/**
 * Compute custom word spans for a single line by reusing the ChronoNote line
 * tokenizer, numbered-item parser, and date-link matcher.
 */
export function lineWordSpans(line: string, nextLine?: string): WordSpan[] {
  if (nextLine !== undefined && isTitleLine(line, nextLine)) return [];

  const raw: WordSpan[] = [];
  for (const t of tokenizeLine(line)) {
    if (MARKER_TOKEN_KINDS.has(t.kind)) {
      // Marker tokens already include their 1 trailing space; double-click selects the symbol itself.
      raw.push({ from: t.from, to: t.to, clickTo: Math.max(t.from + 1, t.to - 1) });
    } else if (t.kind === "emphasis") {
      // `tokenizeLine` spans emphasis through line end; only `! ` is the marker word.
      const to = Math.min(line.length, t.from + 2);
      raw.push({ from: t.from, to, clickTo: Math.min(to, t.from + 1) });
    } else if (ENTITY_TOKEN_KINDS.has(t.kind)) {
      raw.push({ from: t.from, to: t.to });
    }
  }

  const numbered = parseNumberedItem(line);
  if (numbered) {
    const from = numbered.indent.length + numbered.lead.length;
    const to = Math.min(line.length, numbered.markerEnd + 1);
    raw.push({ from, to, clickTo: numbered.markerEnd });
  }

  for (const d of dateLinkSpansInLine(line)) {
    raw.push({ from: d.from, to: d.dateEnd });
  }

  if (raw.length <= 1) return raw;

  // Prefer earlier spans, then longer enclosing spans (e.g. `by:2026-11-20` over inner `2026-11-20`).
  raw.sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
  const merged: WordSpan[] = [];
  for (const span of raw) {
    const prev = merged[merged.length - 1];
    if (!prev || span.from >= prev.to) {
      merged.push(span);
    }
  }
  return merged;
}

/** Compute word spans for a document line, accounting for title underlines on the next line. */
export function docLineWordSpans(doc: Text, line: Line): WordSpan[] {
  const nextLine = line.number < doc.lines ? doc.line(line.number + 1).text : undefined;
  return lineWordSpans(line.text, nextLine);
}

/**
 * Compute the selection range for a double-click at `pos` (with side `bias`),
 * keeping custom word spans intact and falling back to CodeMirror's char
 * categorization clamped to adjacent span boundaries.
 */
export function wordRangeAt(state: EditorState, pos: number, bias = 1): SelectionRange {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  const col = pos - line.from;
  if (text.length === 0) return EditorSelection.cursor(pos);

  let from = col;
  let to = col;
  let side = bias;
  if (col === 0) side = 1;
  else if (col === text.length) side = -1;
  if (side < 0) from = findClusterBreak(text, col, false);
  else to = findClusterBreak(text, col, true);
  if (from === to) return EditorSelection.cursor(pos);

  const spans = docLineWordSpans(state.doc, line);
  const hit = spans.find((s) => from >= s.from && to <= spanClickEnd(s));
  if (hit) {
    return EditorSelection.undirectionalRange(line.from + hit.from, line.from + spanClickEnd(hit));
  }

  // Clamp fallback expansion so adjacent spans (like `@dana` next to `(`) cannot leak in.
  let minLeft = 0;
  let maxRight = text.length;
  for (const s of spans) {
    const end = spanClickEnd(s);
    if (end <= from && end > minLeft) minLeft = end;
    if (s.from >= to && s.from < maxRight) maxRight = s.from;
  }

  const categorize = state.charCategorizer(pos);
  const cat = categorize(text.slice(from, to));
  while (from > minLeft) {
    const prev = findClusterBreak(text, from, false);
    if (prev < minLeft || categorize(text.slice(prev, from)) !== cat) break;
    from = prev;
  }
  while (to < maxRight) {
    const next = findClusterBreak(text, to, true);
    if (next > maxRight || categorize(text.slice(to, next)) !== cat) break;
    to = next;
  }
  return EditorSelection.undirectionalRange(line.from + from, line.from + to);
}

/**
 * Mouse selection style overriding double-click so it selects ChronoNote spans
 * (pills, tags, plain dates, @names, numbered markers without trailing space).
 */
export const wordMouseSelectionStyle = EditorView.mouseSelectionStyle.of((view, event) => {
  if (event.button !== 0 || event.detail !== 2) return null;

  let startSel = view.state.selection;
  const startPos = view.posAndSideAtCoords({ x: event.clientX, y: event.clientY }, false);
  let startRange = wordRangeAt(view.state, startPos.pos, startPos.assoc);

  return {
    update(update: ViewUpdate) {
      if (update.docChanged) {
        startSel = startSel.map(update.changes);
        startRange = EditorSelection.undirectionalRange(
          update.changes.mapPos(startRange.from),
          update.changes.mapPos(startRange.to),
        );
      }
    },
    get(curEvent: MouseEvent, extend: boolean, multiple: boolean) {
      const curPos = view.posAndSideAtCoords({ x: curEvent.clientX, y: curEvent.clientY }, false);
      const curRange = wordRangeAt(view.state, curPos.pos, curPos.assoc);
      const dragged = curRange.from !== startRange.from || curRange.to !== startRange.to;
      let range: SelectionRange;
      if (!dragged && !extend) {
        range = startRange;
      } else {
        const from = Math.min(startRange.from, curRange.from);
        const to = Math.max(startRange.to, curRange.to);
        range = curRange.from < startRange.from ? EditorSelection.range(to, from) : EditorSelection.range(from, to);
        if (extend) {
          const base = startSel.main;
          const mFrom = Math.min(base.from, range.from);
          const mTo = Math.max(base.to, range.to);
          range = range.from < base.from ? EditorSelection.range(mTo, mFrom) : EditorSelection.range(mFrom, mTo);
        }
      }
      if (multiple && !extend) {
        return startSel.addRange(range);
      }
      return EditorSelection.create([range]);
    },
  };
});

import { EditorSelection, type ChangeSpec, type EditorState, type Line, type SelectionRange, type Text, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { cursorLineBoundaryBackward, isolateHistory, selectLineBoundaryBackward } from "@codemirror/commands";
import { lineStateAnnouncement } from "./glyphs";
import { trimmed } from "./editorChanges";
import { exitNumberedListSpec, moveEmptySubItemOutSpec, shiftTabCommand, tabCommand } from "./numberedListKeys";
import { leadingMarkerCharEnd, leadingMarkerTextColumn } from "./wrapIndent";
import { isTitleLine, tokenizeLine } from "../grammar/tokenize";
import { underlineFor } from "../sectionFormat";
import type { EditorApi } from "../stores";
import {
  actionLineEnter,
  adjacentOpenActionLine,
  innermostActionSymbol,
  innermostTopicSymbol,
  isCaretInLeadingSymbol,
  isSetextUnderline,
  isTitleUnderline,
  isTopicLikeLine,
  leadingMarkerIndent,
  leadingTopicTag,
  numberedListEnter,
  parseNumberedItem,
  referenceColumn,
  renumberAfterInsert,
  setActionSymbolTo,
  setTopicSymbolTo,
  topicLineEnter,
  withoutLineMarker,
} from "../tokens";

export type LineToken = Parameters<NonNullable<EditorApi["applyToken"]>>[0];

/** True if `lineNumber` (1-based) is a non-blank title line directly above a `===` or `---` underline. */
export function isHeaderLine(v: EditorView, lineNumber: number): boolean {
  if (lineNumber >= v.state.doc.lines) return false;
  return isTitleLine(v.state.doc.line(lineNumber).text, v.state.doc.line(lineNumber + 1).text);
}

/** Where `before` and `after` start to differ (the length of their common prefix). A caret at or after this
 * point moves with the change, one before it stays: on an empty line `Ctrl+1` inserts `# ` at column 0 and the
 * caret has to end up after it (it used to stay in front, because only a caret past column 0 was moved). */
export function changedFrom(before: string, after: string): number {
  let i = 0;
  while (i < before.length && i < after.length && before[i] === after[i]) i++;
  return i;
}

/** #73: applies `transform` to the current line only — used for
 * Ctrl+Space's close/reopen pair, which (unlike `applyActionStateToSelection`
 * below) never touches more than one line at a time and never promotes
 * a plain line into a new action. Preserves the caret / selection position
 * instead of collapsing to the start of the line. */
export function applyToCurrentLine(v: EditorView, transform: (line: string, col: number) => string | null): boolean {
  const sel = v.state.selection.main;
  const line = v.state.doc.lineAt(sel.head);
  if (isHeaderLine(v, line.number)) return false;
  const col = sel.head - line.from;
  const updated = transform(line.text, col);
  if (updated === null) return false;

  const delta = updated.length - line.text.length;
  const anchorOffset = sel.anchor - line.from;
  const headOffset = sel.head - line.from;
  const at = changedFrom(line.text, updated);
  const newAnchor = line.from + Math.max(0, Math.min(anchorOffset + (anchorOffset >= at ? delta : 0), updated.length));
  const newHead = line.from + Math.max(0, Math.min(headOffset + (headOffset >= at ? delta : 0), updated.length));
  const sym = innermostActionSymbol(updated) ?? innermostTopicSymbol(updated);

  v.dispatch({
    changes: { from: line.from, to: line.to, insert: updated },
    selection: EditorSelection.range(newAnchor, newHead),
    scrollIntoView: true,
    userEvent: "input",
    effects: sym ? [EditorView.announce.of(lineStateAnnouncement(sym))] : [],
  });
  return true;
}

/** #65/#70/#73: `Ctrl/Cmd+Shift+O` (open, via `setActionSymbolOpen`) and
 * `Ctrl/Cmd+1`-`4` (open/done/deferred/won't-do directly, via
 * `setActionSymbolTo`) — every line touched by the selection (the
 * current line alone, if the selection is just a caret) is passed
 * through `transform`. #69: `Ctrl+1`-`4`'s own `transform` promotes a
 * line with no action symbol at all into one — see `setActionSymbolTo`'s
 * own doc comment for exactly which lines that does and doesn't apply
 * to — but `Ctrl+Shift+O`'s `setActionSymbolOpen` deliberately does not
 * (#73: it drifted into sharing `Ctrl+1`'s promotion, which wasn't the
 * point of either shortcut). A section-header title line is always
 * skipped, checked here rather than in `tokens.ts` since only this
 * caller has the document context (the *next* line) to tell. One
 * transaction for the whole span, so it undoes as a single step. A
 * no-op (returns `false`) when nothing in the span changed at all. */
/** Lines covered by `[from, to]`. When a non-empty selection ends at column 0 of a line, that trailing line has no characters selected and is excluded. */
function selectedLineRange(doc: Text, from: number, to: number): { firstLine: Line; lastLine: Line } {
  const firstLine = doc.lineAt(from);
  const rawLast = doc.lineAt(to);
  const lastLine = from < to && to === rawLast.from ? doc.lineAt(to - 1) : rawLast;
  return { firstLine, lastLine };
}

interface LineEdit {
  line: Line;
  orig: string;
  updated: string;
  change: { from: number; to: number; insert: string };
}

function minimalLineEdit(line: Line, updated: string): LineEdit {
  const orig = line.text;
  const diff = trimmed(orig, 0, orig.length, updated);
  return {
    line,
    orig,
    updated,
    change: diff ? { from: line.from + diff.from, to: line.from + diff.to, insert: diff.insert } : { from: line.from, to: line.from, insert: "" },
  };
}

function mapSelectionAcrossLineEdits(
  state: EditorState,
  sel: SelectionRange,
  edits: LineEdit[],
  moveToEditEnd = false,
): SelectionRange {
  const cs = state.changes(edits.map((e) => e.change));
  const byLine = new Map(edits.map((e) => [e.line.number, e]));
  const mapEndpoint = (pos: number): number => {
    const lineNum = state.doc.lineAt(pos).number;
    const edit = byLine.get(lineNum);
    if (!edit) return cs.mapPos(pos, pos === sel.from ? -1 : 1);
    if (moveToEditEnd) return cs.mapPos(edit.change.to, 1);
    const offset = pos - edit.line.from;
    const at = changedFrom(edit.orig, edit.updated);
    const delta = edit.updated.length - edit.orig.length;
    const keepStart = !sel.empty && pos === sel.from && offset === at && delta > 0;
    const newOffset = keepStart ? offset : Math.max(0, Math.min(offset + (offset >= at ? delta : 0), edit.updated.length));
    return cs.mapPos(edit.line.from, -1) + newOffset;
  };
  return EditorSelection.range(mapEndpoint(sel.anchor), mapEndpoint(sel.head));
}

export function applyActionStateToSelection(
  v: EditorView,
  transform: (line: string, col: number) => string | null,
  targetSymbol?: string,
  colOverride?: number,
): boolean {
  const sel = v.state.selection.main;
  const { firstLine, lastLine } = selectedLineRange(v.state.doc, sel.from, sel.to);
  const edits: LineEdit[] = [];
  let firstResult: string | null = null;
  for (let n = firstLine.number; n <= lastLine.number; n++) {
    const docLine = v.state.doc.line(n);
    const updated = isHeaderLine(v, n) ? null : transform(docLine.text, colOverride ?? referenceColumn(sel, docLine));
    if (updated !== null && firstResult === null) firstResult = updated;
    if (updated !== null && updated !== docLine.text) {
      edits.push(minimalLineEdit(docLine, updated));
    }
  }
  if (edits.length === 0) return firstResult !== null;

  const sym =
    targetSymbol ??
    (firstResult !== null
      ? innermostActionSymbol(firstResult) ?? innermostTopicSymbol(firstResult)
      : null);
  const announceEffect = sym ? [EditorView.announce.of(lineStateAnnouncement(sym))] : [];

  v.dispatch({
    changes: edits.map((e) => e.change),
    selection: mapSelectionAcrossLineEdits(v.state, sel, edits),
    scrollIntoView: true,
    userEvent: "input",
    effects: announceEffect,
  });
  return true;
}

/** §78: `Ctrl+J` / `Ctrl+Shift+J` (macOS `Cmd+J` / `Cmd+Shift+J`) — move the cursor to the next / previous open
 * action (`# ` line, indented or not, plus `=> #` consequence-actions)
 * in this note, wrapping at the ends. Lands at the start of the line,
 * same as the Action Drawer's "jump to line". A no-op with a toast when
 * the note has none. (§83: moved off `Ctrl+↓`/`Ctrl+↑`, which now do
 * caret-to-line-start explicitly — see §89 below. Moved off F2 because
 * F2 needs Fn on laptops.) */
/** Moves the caret to `pos` for a jump (Ctrl+J, Actions, History, Search). A line already well inside the view
 * stays where it is; otherwise it is centred. The default `scrollIntoView` scrolls only just far enough, which left
 * every jump on the very last visible line, against the status bar (Marien, 2026-10-10: "the scrollbar does not
 * follow consistently"). */
export function jumpCaretTo(v: EditorView, pos: number) {
  const area = v.scrollDOM.getBoundingClientRect();
  const at = v.coordsAtPos(pos);
  const margin = area.height * 0.15;
  const comfortable = !!at && at.top >= area.top + margin && at.bottom <= area.bottom - margin;
  v.dispatch({
    selection: { anchor: pos },
    effects: comfortable ? [] : [EditorView.scrollIntoView(pos, { y: "center" })],
  });
}

export interface JumpToOpenActionOptions {
  showToast?: (msg: string) => void;
  jumpTo?: (v: EditorView, pos: number) => void;
}

export function jumpToAdjacentOpenAction(
  v: EditorView,
  dir: 1 | -1,
  opts: JumpToOpenActionOptions = {},
): boolean {
  const curLineIdx = v.state.doc.lineAt(v.state.selection.main.head).number - 1;
  const target = adjacentOpenActionLine(v.state.doc.toString(), curLineIdx, dir);
  if (target === null) {
    opts.showToast?.("No open actions in this note");
    return true;
  }
  (opts.jumpTo ?? jumpCaretTo)(v, v.state.doc.line(target + 1).from);
  return true;
}

/** §89 (#20): `Ctrl+↑` / `Ctrl+↓` move the caret to the start of the
 * current line / the start of the next line — the caret motion the
 * browser's contenteditable already did on Windows for these keys
 * (§83), now bound explicitly so it's reliable and consistent. Line
 * here means the *document* line (word-wrap off by default). §90 (#24):
 * when the caret is already at the start of its line, `Ctrl+↑` steps to
 * the start of the line above (a second press keeps climbing), so it's
 * never a dead key. `Shift` extends the selection. Bound `win:`/`linux:`
 * only, so macOS keeps its `defaultKeymap` page-scroll on these keys. */
export function lineStartTarget(v: EditorView): number {
  const head = v.state.selection.main.head;
  const line = v.state.doc.lineAt(head);
  if (head === line.from && line.number > 1) {
    return v.state.doc.line(line.number - 1).from;
  }
  return line.from;
}

export function nextLineStartTarget(v: EditorView): number {
  const line = v.state.doc.lineAt(v.state.selection.main.head);
  return line.number < v.state.doc.lines ? v.state.doc.line(line.number + 1).from : line.to;
}

export function moveCaret(v: EditorView, target: number): boolean {
  v.dispatch({ selection: EditorSelection.cursor(target), scrollIntoView: true, userEvent: "select" });
  return true;
}

export function extendSelection(v: EditorView, target: number): boolean {
  v.dispatch({
    selection: EditorSelection.range(v.state.selection.main.anchor, target),
    scrollIntoView: true,
    userEvent: "select",
  });
  return true;
}

/** Character offset in `lineText` where body text begins after leading markers, whitespace, and any leading `(topic)` tag. */
export function lineTextStartOffset(lineText: string): number {
  const tag = leadingTopicTag(lineText);
  if (tag) return lineText[tag.to] === " " ? tag.to + 1 : tag.to;
  const markerEnd = leadingMarkerCharEnd(lineText);
  if (markerEnd !== null) return markerEnd;
  return lineText.match(/^(\s*)/)![1].length;
}

/** Smart Home / Shift-Home (Decision D2): toggles between the line's text start (after markers/indent/topic tag) and column 0. On wrapped lines past the first visual row, acts on the visual line first. */
export function smartHome(v: EditorView, extend: boolean): boolean {
  const sel = v.state.selection.main;
  const line = v.state.doc.lineAt(sel.head);
  if (v.lineWrapping) {
    const visualStart = v.moveToLineBoundary(EditorSelection.cursor(sel.head, sel.assoc), false, true);
    if (visualStart.head > line.from) {
      return (extend ? selectLineBoundaryBackward : cursorLineBoundaryBackward)(v);
    }
  }
  const textStart = line.from + lineTextStartOffset(line.text);
  const target = sel.head === textStart ? line.from : textStart;
  return extend ? extendSelection(v, target) : moveCaret(v, target);
}

/** Ctrl/Cmd+Shift+S: turns the current line into a section header by
 * inserting a matching-length `=` underline right below it, then a fresh
 * line with the cursor on it so you can start typing the section body
 * immediately. Doesn't try to enforce the two-blank-line spacing rule
 * (spec 2.3) — that's for automated insertions; this is a deliberate
 * single-line action. */
export function convertLineToSection(v: EditorView): boolean {
  const pos = v.state.selection.main.head;
  const line = v.state.doc.lineAt(pos);
  if (isHeaderLine(v, line.number) || isTitleUnderline(line.text)) return false;
  const title = line.text.trim();
  if (!title) return false;
  const insertText = "\n" + underlineFor(title) + "\n";
  v.dispatch({
    changes: { from: line.to, to: line.to, insert: insertText },
    selection: { anchor: line.to + insertText.length },
    scrollIntoView: true,
  });
  return true;
}

/** Enter/Shift+Enter smart continuation for bulleted lines (`- ` or `* `,
 * §51 — optionally indented — nesting is two spaces per level), action
 * lines (`# `/`v `/`> `/`x `, §85/#12) and `=> ` follow-up lines (#34).
 * Enter adds a fresh bullet at the same indentation using the line's own
 * marker; on an action line a fresh **open** action (`# `) regardless of
 * the current symbol, since you're adding a task; on a `=> ` line a
 * fresh `=> # `. On an *empty* such line it removes the marker instead
 * ("press Enter to exit a list"). With the caret before the leading
 * token, Enter is a plain newline (#34). Shift+Enter adds a plain
 * continuation line at the same indentation, no new marker. Off all
 * these line kinds, Enter defers to CodeMirror's own default newline;
 * Shift+Enter isn't bound elsewhere, so it inserts a plain newline. */
function computeBulletContinuationSpec(state: EditorState, pos: number, insertBullet: boolean): TransactionSpec | null {
  const line = state.doc.lineAt(pos);
  const col = pos - line.from;
  const nextLine = line.number < state.doc.lines ? state.doc.line(line.number + 1).text : undefined;
  const plainNewline = (extra = ""): TransactionSpec => {
    const insert = "\n" + extra;
    return {
      changes: { from: pos, to: pos, insert },
      selection: { anchor: pos + insert.length },
      userEvent: "input",
      scrollIntoView: true,
    };
  };

  // Title lines above === or --- always split as a plain newline rather than continuing list markers into the header.
  if (nextLine !== undefined && isTitleUnderline(nextLine)) return plainNewline();

  // Caret before a leading marker (in the indent or at col 0), inside the leading symbol, or before a numbered marker end is always a plain newline for both Enter and Shift+Enter.
  const leadIndent = leadingMarkerIndent(line.text);
  if (leadIndent !== null && col <= leadIndent) return plainNewline();
  if (isCaretInLeadingSymbol(line.text, col)) return plainNewline();
  const numbered = parseNumberedItem(line.text);
  if (numbered && col <= numbered.markerEnd) return plainNewline();

  if (!insertBullet) {
    const first = tokenizeLine(line.text)[0];
    if (first && (first.kind === "action" || first.kind === "topic")) {
      const sub = parseNumberedItem(line.text.slice(first.to));
      if (sub && sub.indent === "" && col <= first.to + sub.markerEnd) {
        return plainNewline();
      }
    }
    const contCol = leadingMarkerTextColumn(line.text);
    return plainNewline(contCol ? " ".repeat(contCol) : "");
  }

  // #208: `! - item` continues as `! - `.
  const bulletMatch = line.text.match(/^(\s*)((?:! )?[-*])\s/);
  if (bulletMatch) {
    const [, indent, marker] = bulletMatch;
    if (line.text.trim() === marker) {
      return (
        moveEmptySubItemOutSpec(state, line.from, line.number - 1, "input") ?? {
          changes: { from: line.from, to: line.to, insert: "" },
          selection: { anchor: line.from },
          userEvent: "input",
          scrollIntoView: true,
        }
      );
    }
    return plainNewline(`${indent}${marker} `);
  }

  if (isTopicLikeLine(line.text)) {
    const step = topicLineEnter(line.text, col, nextLine);
    if (step && "removeSymbol" in step) {
      return {
        changes: { from: line.from, to: line.to, insert: "" },
        selection: { anchor: line.from },
        userEvent: "input",
        scrollIntoView: true,
      };
    }
    if (step && "insert" in step) {
      return {
        changes: { from: pos, to: pos, insert: step.insert },
        selection: { anchor: pos + step.insert.length },
        userEvent: "input",
        scrollIntoView: true,
      };
    }
    return plainNewline();
  }

  if (numbered) {
    const step = numberedListEnter(line.text, col, nextLine);
    if (step && "exit" in step) {
      return (
        moveEmptySubItemOutSpec(state, line.from, line.number - 1, "input") ??
        exitNumberedListSpec(state, line.from, line.number - 1)
      );
    }
    if (step && "insert" in step) {
      // #123: an item inserted in the middle of a list pushes the colliding numbers after it down by one.
      const following: string[] = [];
      for (let n = line.number + 1; n <= state.doc.lines; n++) {
        const text = state.doc.line(n).text;
        if (text.trim() === "") break;
        following.push(text);
      }
      const renumber = renumberAfterInsert(following, numbered).map((r) => {
        const l = state.doc.line(line.number + 1 + r.index);
        return { from: l.from, to: l.to, insert: r.text };
      });
      return {
        changes: [{ from: pos, to: pos, insert: step.insert }, ...renumber],
        selection: { anchor: pos + step.insert.length },
        userEvent: "input",
        annotations: isolateHistory.of("full"),
        scrollIntoView: true,
      };
    }
    return plainNewline();
  }

  // §85 (#12): Enter on an action or consequence line continues it as `# ` / `=> # ` / `=> `.
  const edit = actionLineEnter(line.text, col, nextLine);
  if (edit === null) return null;
  if ("removeSymbol" in edit) {
    return {
      changes: { from: line.from, to: line.to, insert: "" },
      selection: { anchor: line.from },
      userEvent: "input",
      scrollIntoView: true,
    };
  }
  if ("plain" in edit) return plainNewline();
  return {
    changes: { from: pos, to: pos, insert: edit.insert },
    selection: { anchor: pos + edit.insert.length },
    userEvent: "input",
    scrollIntoView: true,
  };
}

export function bulletContinuation(insertBullet: boolean) {
  return (v: EditorView): boolean => {
    const sel = v.state.selection.main;
    if (sel.empty) {
      const spec = computeBulletContinuationSpec(v.state, sel.head, insertBullet);
      if (!spec) return false;
      v.dispatch(spec);
      return true;
    }
    // Non-empty selection: compose deleting the selection and the continuation step into a single undoable transaction.
    const delTr = v.state.update({
      changes: { from: sel.from, to: sel.to, insert: "" },
      selection: { anchor: sel.from },
    });
    const postLine = delTr.state.doc.lineAt(sel.from);
    const plainIndent = postLine.text.slice(0, sel.from - postLine.from).match(/^\s*/)![0];
    const spec = computeBulletContinuationSpec(delTr.state, sel.from, insertBullet) ?? {
      changes: { from: sel.from, to: sel.from, insert: "\n" + plainIndent },
      selection: { anchor: sel.from + 1 + plainIndent.length },
      userEvent: "input",
      scrollIntoView: true,
    };
    const stepTr = delTr.state.update(spec);
    v.dispatch({
      changes: delTr.changes.compose(stepTr.changes),
      selection: stepTr.selection,
      userEvent: "input",
      annotations: spec.annotations,
      scrollIntoView: true,
    });
    return true;
  };
}

/** Indent or dedent all lines touched by the selection (delegating numbered/continuation lines first, otherwise 2 spaces or leading tab/spaces). */
export function indentLines(view: EditorView, dedent = false): boolean {
  if ((dedent ? shiftTabCommand : tabCommand)(view)) return true;
  const sel = view.state.selection.main;
  const { firstLine, lastLine } = selectedLineRange(view.state.doc, sel.from, sel.to);
  const changes: ChangeSpec[] = [];
  for (let l = firstLine.number; l <= lastLine.number; l++) {
    const line = view.state.doc.line(l);
    if (dedent) {
      if (line.text.startsWith("\t")) {
        changes.push({ from: line.from, to: line.from + 1, insert: "" });
      } else if (line.text.startsWith("  ")) {
        changes.push({ from: line.from, to: line.from + 2, insert: "" });
      } else if (line.text.startsWith(" ")) {
        changes.push({ from: line.from, to: line.from + 1, insert: "" });
      }
    } else {
      changes.push({ from: line.from, to: line.from, insert: "  " });
    }
  }
  if (changes.length === 0) return false;
  const cs = view.state.changes(changes);
  view.dispatch({
    changes: cs,
    selection: EditorSelection.range(cs.mapPos(sel.anchor, dedent ? -1 : 1), cs.mapPos(sel.head, dedent ? -1 : 1)),
    userEvent: "input.indent",
    scrollIntoView: true,
  });
  return true;
}

function toggleBulletOrEmphasis(lineText: string, token: "-" | "!"): string {
  const [first, second, third] = tokenizeLine(lineText);
  if (first && (first.kind === "action" || first.kind === "topic")) {
    const head = lineText.slice(0, first.to);
    if (token === "-") {
      if (second?.kind === "bullet" && second.from === first.to) {
        return head + lineText.slice(second.to);
      }
      if (second?.kind === "emphasis" && second.from === first.to) {
        if (third?.kind === "bullet" && third.from === second.from + 2) {
          return lineText.slice(0, third.from) + lineText.slice(third.to);
        }
        return lineText.slice(0, second.from + 2) + "- " + lineText.slice(second.from + 2);
      }
      return head + "- " + lineText.slice(first.to);
    }
    if (second?.kind === "emphasis" && second.from === first.to) {
      return head + lineText.slice(second.from + 2);
    }
    return head + "! " + lineText.slice(first.to);
  }
  if (first?.kind === "bullet") {
    if (token === "-") return lineText.slice(0, first.from) + lineText.slice(first.to);
    return lineText.slice(0, first.from) + "! " + lineText.slice(first.from);
  }
  if (first?.kind === "emphasis") {
    const emEnd = first.from + 2;
    if (token === "-") {
      if (second?.kind === "bullet" && second.from === emEnd) {
        return lineText.slice(0, second.from) + lineText.slice(second.to);
      }
      return lineText.slice(0, emEnd) + "- " + lineText.slice(emEnd);
    }
    return lineText.slice(0, first.from) + lineText.slice(emEnd);
  }
  const indent = lineText.match(/^(\s*)/)?.[1] ?? "";
  const stripped = withoutLineMarker(lineText);
  const rest = stripped === lineText ? lineText.slice(indent.length) : stripped;
  return `${indent}${token} ${rest}`;
}

/** Phone-toolbar token toggle/setter across all lines touched by the selection. */
export function applyLineToken(view: EditorView, token: LineToken): void {
  const sel = view.state.selection.main;
  const { firstLine, lastLine } = selectedLineRange(view.state.doc, sel.from, sel.to);
  const edits: LineEdit[] = [];
  for (let l = firstLine.number; l <= lastLine.number; l++) {
    const line = view.state.doc.line(l);
    if (isHeaderLine(view, l) || isTitleUnderline(line.text)) continue;
    let updated: string | null = null;
    if (token === "#" || token === "v" || token === ">" || token === "x") {
      updated = setActionSymbolTo(line.text, token, referenceColumn(sel, line));
    } else if (token === "-" || token === "!") {
      updated = toggleBulletOrEmphasis(line.text, token);
    } else if (token === "=>") {
      const arrow = tokenizeLine(line.text).find((t) => t.kind === "arrow");
      updated = arrow ? line.text.slice(0, arrow.from) + line.text.slice(arrow.to) : `${line.text} => `;
    } else if (token === "o" || token === "." || token === ",") {
      updated = setTopicSymbolTo(line.text, token, referenceColumn(sel, line));
    }
    if (updated !== null && updated !== line.text) {
      edits.push(minimalLineEdit(line, updated));
    }
  }
  if (edits.length > 0) {
    view.dispatch({
      changes: edits.map((e) => e.change),
      selection: mapSelectionAcrossLineEdits(view.state, sel, edits, token === "=>"),
      userEvent: "input",
      scrollIntoView: true,
    });
  }
}

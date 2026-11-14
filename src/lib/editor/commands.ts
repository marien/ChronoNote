import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { isolateHistory } from "@codemirror/commands";
import { lineStateAnnouncement } from "./glyphs";
import { exitNumberedList, moveEmptySubItemOut } from "./numberedListKeys";
import { underlineFor } from "../sectionFormat";
import type { EditorApi } from "../stores";
import {
  actionLineEnter,
  adjacentOpenActionLine,
  innermostActionSymbol,
  innermostTopicSymbol,
  isCaretInLeadingSymbol,
  isSetextUnderline,
  isTopicLikeLine,
  leadingMarkerIndent,
  numberedContinuationIndent,
  numberedListEnter,
  parseNumberedItem,
  referenceColumn,
  renumberAfterInsert,
  setActionSymbolTo,
  setTopicSymbolTo,
  topicContinuationIndent,
  topicLineEnter,
  withoutLineMarker,
} from "../tokens";

export type LineToken = Parameters<NonNullable<EditorApi["applyToken"]>>[0];

/** True if `lineNumber` (1-based) is a section's title line — the line
 * directly above a setext `====` underline. `cycleActionSymbolOrCreate`
 * and `setActionSymbolTo` have no way to recognize this from a single line
 * in isolation (§69's own doc comment on `replaceActionSymbol`), so
 * every caller here checks it first and skips the line entirely rather
 * than ever promoting a section header into an action line by mistake. */
export function isHeaderLine(v: EditorView, lineNumber: number): boolean {
  return lineNumber < v.state.doc.lines && isSetextUnderline(v.state.doc.line(lineNumber + 1).text);
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
export function applyActionStateToSelection(
  v: EditorView,
  transform: (line: string, col: number) => string | null,
  targetSymbol?: string,
): boolean {
  const sel = v.state.selection.main;
  const { from, to } = sel;
  const firstLine = v.state.doc.lineAt(from);
  const lastLine = v.state.doc.lineAt(to);
  let changed = false;
  const lines: string[] = [];
  for (let n = firstLine.number; n <= lastLine.number; n++) {
    const docLine = v.state.doc.line(n);
    const text = docLine.text;
    const updated = isHeaderLine(v, n) ? null : transform(text, referenceColumn(sel, docLine));
    if (updated !== null) changed = true;
    lines.push(updated ?? text);
  }
  if (!changed) return false;

  const sym =
    targetSymbol ??
    (lines.length > 0
      ? innermostActionSymbol(lines[0]) ?? innermostTopicSymbol(lines[0])
      : null);
  const announceEffect = sym ? [EditorView.announce.of(lineStateAnnouncement(sym))] : [];

  if (firstLine.number === lastLine.number) {
    const origText = firstLine.text;
    const updatedText = lines[0];
    const delta = updatedText.length - origText.length;
    const anchorOffset = sel.anchor - firstLine.from;
    const headOffset = sel.head - firstLine.from;
    const at = changedFrom(origText, updatedText);
    const newAnchor = firstLine.from + Math.max(0, Math.min(anchorOffset + (anchorOffset >= at ? delta : 0), updatedText.length));
    const newHead = firstLine.from + Math.max(0, Math.min(headOffset + (headOffset >= at ? delta : 0), updatedText.length));
    v.dispatch({
      changes: { from: firstLine.from, to: lastLine.to, insert: updatedText },
      selection: EditorSelection.range(newAnchor, newHead),
      scrollIntoView: true,
      userEvent: "input",
      effects: announceEffect,
    });
    return true;
  }

  v.dispatch({
    changes: { from: firstLine.from, to: lastLine.to, insert: lines.join("\n") },
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

/** Ctrl/Cmd+Shift+S: turns the current line into a section header by
 * inserting a matching-length `=` underline right below it, then a fresh
 * line with the cursor on it so you can start typing the section body
 * immediately. Doesn't try to enforce the two-blank-line spacing rule
 * (spec 2.3) — that's for automated insertions; this is a deliberate
 * single-line action. */
export function convertLineToSection(v: EditorView): boolean {
  const pos = v.state.selection.main.head;
  const line = v.state.doc.lineAt(pos);
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
export function bulletContinuation(insertBullet: boolean) {
  return (v: EditorView): boolean => {
    const pos = v.state.selection.main.head;
    const line = v.state.doc.lineAt(pos);
    const col = pos - line.from;
    const plainNewline = (): true => {
      v.dispatch({
        changes: { from: pos, to: pos, insert: "\n" },
        selection: { anchor: pos + 1 },
        scrollIntoView: true,
      });
      return true;
    };
    // #34: Enter with the caret *before* a leading bullet / action / `=> `
    // token (in the indent, or column 0), or right after its symbol before
    // its trailing space (§463), is a plain newline — not a continuation or exit.
    if (insertBullet) {
      const leadIndent = leadingMarkerIndent(line.text);
      if (leadIndent !== null && col <= leadIndent) return plainNewline();
      if (isCaretInLeadingSymbol(line.text, col)) return plainNewline();
    }
    function handleEmptySubItem(lineObj: { from: number; number: number }): boolean {
      return moveEmptySubItemOut(v, lineObj.from, lineObj.number - 1, "input");
    }

    // #208: `! - item` continues as `! - `.
    const match = line.text.match(/^(\s*)((?:! )?[-*])\s/);
    if (!match) {
      if (isTopicLikeLine(line.text)) {
        if (!insertBullet) {
          const pad = topicContinuationIndent(line.text) ?? "  ";
          v.dispatch({
            changes: { from: pos, to: pos, insert: "\n" + pad },
            selection: { anchor: pos + 1 + pad.length },
            scrollIntoView: true,
          });
          return true;
        }
        const nextLine = line.number < v.state.doc.lines ? v.state.doc.line(line.number + 1).text : undefined;
        const step = topicLineEnter(line.text, pos - line.from, nextLine);
        if (step && "removeSymbol" in step) {
          v.dispatch({ changes: { from: line.from, to: line.to, insert: "" }, selection: { anchor: line.from } });
        } else if (step && "plain" in step) {
          v.dispatch({ changes: { from: pos, to: pos, insert: "\n" }, selection: { anchor: pos + 1 }, scrollIntoView: true });
        } else if (step && "insert" in step) {
          v.dispatch({
            changes: { from: pos, to: pos, insert: step.insert },
            selection: { anchor: pos + step.insert.length },
            scrollIntoView: true,
          });
        } else {
          v.dispatch({ changes: { from: pos, to: pos, insert: "\n" }, selection: { anchor: pos + 1 }, scrollIntoView: true });
        }
        return true;
      }
      // Numbered items (`1.`, `2)`, `1.1.`): Enter continues with the next number, an empty item exits, Shift+Enter
      // aligns under the item's text. The marker is the first non-blank character, so this never overlaps a bullet.
      const numbered = parseNumberedItem(line.text);
      if (numbered) {
        if (!insertBullet) {
          const pad = numberedContinuationIndent(line.text)!;
          v.dispatch({
            changes: { from: pos, to: pos, insert: "\n" + pad },
            selection: { anchor: pos + 1 + pad.length },
            scrollIntoView: true,
          });
          return true;
        }
        if (col <= numbered.markerEnd) return plainNewline();
        const nextLine = line.number < v.state.doc.lines ? v.state.doc.line(line.number + 1).text : undefined;
        const step = numberedListEnter(line.text, col, nextLine);
        if (step && "exit" in step) {
          if (handleEmptySubItem(line)) return true;
          exitNumberedList(v, line.from, line.number - 1);
        } else if (step && "insert" in step) {
          // #123: an item inserted in the middle of a list pushes the colliding numbers after it down by one.
          const following: string[] = [];
          for (let n = line.number + 1; n <= v.state.doc.lines; n++) {
            const text = v.state.doc.line(n).text;
            if (text.trim() === "") break;
            following.push(text);
          }
          const renumber = renumberAfterInsert(following, numbered).map((r) => {
            const l = v.state.doc.line(line.number + 1 + r.index);
            return { from: l.from, to: l.to, insert: r.text };
          });
          v.dispatch({
            changes: [{ from: pos, to: pos, insert: step.insert }, ...renumber],
            selection: { anchor: pos + step.insert.length },
            userEvent: "input",
            annotations: isolateHistory.of("full"),
            scrollIntoView: true,
          });
        } else {
          v.dispatch({ changes: { from: pos, to: pos, insert: "\n" }, selection: { anchor: pos + 1 }, scrollIntoView: true });
        }
        return true;
      }
      if (!insertBullet) {
        v.dispatch({ changes: { from: pos, to: pos, insert: "\n" }, selection: { anchor: pos + 1 }, scrollIntoView: true });
        return true;
      }
      // §85 (#12): Enter on an action line continues it as a new open action.
      const nextLine = line.number < v.state.doc.lines ? v.state.doc.line(line.number + 1).text : undefined;
      const edit = actionLineEnter(line.text, pos - line.from, nextLine);
      if (edit === null) return false;
      if ("removeSymbol" in edit) {
        v.dispatch({ changes: { from: line.from, to: line.to, insert: "" }, selection: { anchor: line.from } });
      } else if ("plain" in edit) {
        v.dispatch({ changes: { from: pos, to: pos, insert: "\n" }, selection: { anchor: pos + 1 }, scrollIntoView: true });
      } else {
        v.dispatch({
          changes: { from: pos, to: pos, insert: edit.insert },
          selection: { anchor: pos + edit.insert.length },
          scrollIntoView: true,
          userEvent: "input",
        });
      }
      return true;
    }
    const [, indent, marker] = match;
    if (insertBullet && line.text.trim() === marker) {
      if (handleEmptySubItem(line)) return true;
      v.dispatch({ changes: { from: line.from, to: line.to, insert: "" }, selection: { anchor: line.from } });
      return true;
    }
    // Shift+Enter aligns under the bullet's *text* (past the marker),
    // not just at the bullet's own indentation — two spaces further in.
    const insertText = insertBullet ? `\n${indent}${marker} ` : `\n${indent}${" ".repeat(marker.length + 1)}`;
    v.dispatch({
      changes: { from: pos, to: pos, insert: insertText },
      selection: { anchor: pos + insertText.length },
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  };
}

/** Indent or dedent all lines touched by the selection by two spaces. */
export function indentLines(view: EditorView, dedent = false): void {
  const { from, to } = view.state.selection.main;
  const firstLine = view.state.doc.lineAt(from);
  const lastLine = view.state.doc.lineAt(to);
  const changes = [];
  for (let l = firstLine.number; l <= lastLine.number; l++) {
    const line = view.state.doc.line(l);
    if (dedent) {
      if (line.text.startsWith("  ")) {
        changes.push({ from: line.from, to: line.from + 2, insert: "" });
      } else if (line.text.startsWith(" ")) {
        changes.push({ from: line.from, to: line.from + 1, insert: "" });
      }
    } else {
      changes.push({ from: line.from, to: line.from, insert: "  " });
    }
  }
  if (changes.length) view.dispatch({ changes, scrollIntoView: true });
}

/** Phone-toolbar token toggle/setter across all lines touched by the selection. */
export function applyLineToken(view: EditorView, token: LineToken): void {
  const sel = view.state.selection.main;
  const { from, to } = sel;
  const firstLine = view.state.doc.lineAt(from);
  const lastLine = view.state.doc.lineAt(to);
  const changes: { from: number; to: number; insert: string }[] = [];
  for (let l = firstLine.number; l <= lastLine.number; l++) {
    const line = view.state.doc.line(l);
    let updated: string | null = null;
    if (token === "#" || token === "v" || token === ">" || token === "x") {
      updated = setActionSymbolTo(line.text, token, referenceColumn(sel, line));
    } else if (token === "-") {
      if (/^\s*[-*]\s/.test(line.text)) {
        updated = line.text.replace(/^(\s*)[-*]\s/, "$1");
      } else {
        const indent = line.text.match(/^(\s*)/)?.[1] ?? "";
        const stripped = withoutLineMarker(line.text);
        updated = `${indent}- ${stripped}`;
      }
    } else if (token === "!") {
      if (/^\s*!\s/.test(line.text)) {
        updated = line.text.replace(/^(\s*)!\s/, "$1");
      } else {
        const indent = line.text.match(/^(\s*)/)?.[1] ?? "";
        const stripped = withoutLineMarker(line.text);
        updated = `${indent}! ${stripped}`;
      }
    } else if (token === "=>") {
      if (line.text.includes("=> ")) {
        updated = line.text.replace(/=>\s/, "");
      } else {
        updated = `${line.text} => `;
      }
    } else if (token === "o" || token === "." || token === ",") {
      updated = setTopicSymbolTo(line.text, token, referenceColumn(sel, line));
    }
    if (updated !== null && updated !== line.text) {
      changes.push({ from: line.from, to: line.to, insert: updated });
    }
  }
  if (changes.length) {
    // Replacing a whole line with no explicit selection makes
    // CodeMirror collapse the caret to the line's start, so typing
    // right after tapping e.g. the ☐ button put the text *before*
    // the inserted token (`x#` instead of `# x`). Carry the caret
    // across each edit: prefix edits shift it by the length delta
    // (never before the line start); the `=>` append moves it to
    // the end of the line.
    const mapPos = (pos: number): number => {
      let shift = 0;
      for (const c of changes) {
        const delta = c.insert.length - (c.to - c.from);
        if (pos > c.to) {
          shift += delta;
        } else if (pos >= c.from) {
          const base = c.from + shift;
          if (token === "=>") return base + c.insert.length;
          return base + Math.min(c.insert.length, Math.max(0, pos - c.from + delta));
        } else {
          break;
        }
      }
      return pos + shift;
    };
    const sel = view.state.selection.main;
    view.dispatch({
      changes,
      selection: { anchor: mapPos(sel.anchor), head: mapPos(sel.head) },
      scrollIntoView: true,
    });
  }
}

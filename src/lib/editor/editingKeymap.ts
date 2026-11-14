import type { Extension } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import { redo } from "@codemirror/commands";
import {
  closeOpenAction,
  reopenDoneAction,
  setActionSymbolOpen,
  setActionSymbolTo,
  setTopicSymbolTo,
} from "../tokens";
import {
  applyActionStateToSelection,
  applyToCurrentLine,
  bulletContinuation,
  convertLineToSection,
  extendSelection,
  jumpToAdjacentOpenAction,
  lineStartTarget,
  moveCaret,
  nextLineStartTarget,
} from "./commands";

export interface EditingKeymapDeps {
  /** Called by Alt+ArrowLeft / Alt+ArrowRight; return true when handled (Peek / occurrence navigation). */
  onOccurrenceKey?: (direction: -1 | 1) => boolean;
  /** Called by Mod+J / Mod+Shift+J when the note has no open actions. */
  showToast?: (msg: string) => void;
  /** Optional caret-jump implementation for Mod+J / Mod+Shift+J (defaults to layout-based `jumpCaretTo`). */
  jumpTo?: (view: EditorView, pos: number) => void;
}

/** Editing and caret-navigation key bindings extracted from `EditorPane.svelte`. */
export function editingKeymap(deps: EditingKeymapDeps = {}): Extension {
  return keymap.of([
    // #73: Win/Linux only (see `shortcuts.ts`'s `cycleLineState` entry)
    // — Ctrl+Space collides with macOS's own input-source-switcher
    // shortcut, so it's not offered there at all; Mod-Enter below is
    // the one reliable binding on every platform including Mac. Closes
    // an *open* line only (# → v) — no more cycling through all four
    // states or promoting a plain line, now that Ctrl+1-4 cover every
    // state directly.
    { win: "Ctrl-Space", linux: "Ctrl-Space", run: (v) => applyToCurrentLine(v, closeOpenAction) },
    // §106: Ctrl/Cmd+Enter is the same close action as Ctrl+Space — the
    // combo the UX reviews (and most task apps) reach for.
    { key: "Mod-Enter", run: (v) => applyToCurrentLine(v, closeOpenAction) },
    // §145/#73: the reverse of the two bindings above — reopens a
    // *done* line only (v → #), the mirror of closing. Same Space-
    // avoided-on-Mac reasoning as `cycleLineState` (see `shortcuts.ts`'s
    // `cycleLineStateReverse` entry), so Mac only gets the Enter form.
    { win: "Ctrl-Shift-Space", linux: "Ctrl-Shift-Space", run: (v) => applyToCurrentLine(v, reopenDoneAction) },
    { key: "Mod-Shift-Enter", run: (v) => applyToCurrentLine(v, reopenDoneAction) },
    { key: "Mod-Shift-s", run: (v) => convertLineToSection(v) },
    // #73/#257: Ctrl+Shift+O sets every line in the selection to open (# or o)
    // without #69's plain-line promotion — `setActionSymbolOpen`, not
    // `setActionSymbolTo`, is what keeps it distinct from Ctrl+1 below.
    { key: "Mod-Shift-o", run: (v) => applyActionStateToSelection(v, setActionSymbolOpen, "#") },
    // #70: Ctrl+1-4 set every action in the selection directly to
    // open/done/deferred/won't-do, matching `ACTION_CYCLE_ORDER`
    // (tokens.ts).
    { key: "Mod-1", run: (v) => applyActionStateToSelection(v, (line, col) => setActionSymbolTo(line, "#", col), "#") },
    { key: "Mod-2", run: (v) => applyActionStateToSelection(v, (line, col) => setActionSymbolTo(line, "v", col), "v") },
    { key: "Mod-3", run: (v) => applyActionStateToSelection(v, (line, col) => setActionSymbolTo(line, ">", col), ">") },
    { key: "Mod-4", run: (v) => applyActionStateToSelection(v, (line, col) => setActionSymbolTo(line, "x", col), "x") },
    { key: "Mod-5", run: (v) => applyActionStateToSelection(v, (line, col) => setTopicSymbolTo(line, "o", col), "o") },
    { key: "Mod-6", run: (v) => applyActionStateToSelection(v, (line, col) => setTopicSymbolTo(line, ".", col), ".") },
    { key: "Mod-7", run: (v) => applyActionStateToSelection(v, (line, col) => setTopicSymbolTo(line, ",", col), ",") },
    // Alt+Left / Alt+Right: previous / next occurrence of the section the cursor is in. Taken only when there is
    // one; otherwise the key falls through to the default (syntax-aware caret movement). Not on macOS, where
    // Option+Arrow is word movement - except in Peek, which has always used it there.
    { key: "Alt-ArrowLeft", run: () => deps.onOccurrenceKey?.(-1) ?? false },
    { key: "Alt-ArrowRight", run: () => deps.onOccurrenceKey?.(1) ?? false },
    { key: "Mod-j", run: (v) => jumpToAdjacentOpenAction(v, 1, { showToast: deps.showToast, jumpTo: deps.jumpTo }) },
    { key: "Mod-Shift-j", run: (v) => jumpToAdjacentOpenAction(v, -1, { showToast: deps.showToast, jumpTo: deps.jumpTo }) },
    {
      win: "Ctrl-ArrowUp",
      linux: "Ctrl-ArrowUp",
      run: (v) => moveCaret(v, lineStartTarget(v)),
      shift: (v) => extendSelection(v, lineStartTarget(v)),
    },
    {
      win: "Ctrl-ArrowDown",
      linux: "Ctrl-ArrowDown",
      run: (v) => moveCaret(v, nextLineStartTarget(v)),
      shift: (v) => extendSelection(v, nextLineStartTarget(v)),
    },
    { key: "Enter", run: bulletContinuation(true) },
    { key: "Shift-Enter", run: bulletContinuation(false) },
    // §86 (#9): `historyKeymap` only binds Ctrl+Shift+Z to redo on
    // macOS/Linux (Windows gets Ctrl+Y). Add it everywhere — it's the
    // combo most people reach for, and undo/redo is the whole point of
    // this change. Ctrl+Y still works too (from `historyKeymap`).
    { key: "Mod-Shift-z", run: redo },
  ]);
}

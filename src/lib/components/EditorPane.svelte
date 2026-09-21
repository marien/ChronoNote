<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { get } from "svelte/store";
  import { Compartment, EditorSelection, EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
  import { Decoration, type DecorationSet, drawSelection, EditorView, keymap, ViewPlugin } from "@codemirror/view";
  import { defaultKeymap, history, historyField, historyKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
  import { indentUnit } from "@codemirror/language";
  import { findNext, findPrevious, search, SearchCursor, SearchQuery, setSearchQuery } from "@codemirror/search";
  import { glyphAtomicRanges, liveGlyphs } from "../editor/glyphs";
  import { setextRule } from "../editor/setextRule";
  import { resolvedLinesPlugin } from "../editor/resolvedLines";
  import { activeLinesPlugin } from "../editor/activeLines";
  import { underlineFor } from "../sectionFormat";
  import {
    actionLineEnter,
    adjacentOpenActionLine,
    closeOpenAction,
    isSetextUnderline,
    referenceColumn,
    numberedContinuationIndent,
    numberedListEnter,
    parseNumberedItem,
    reopenDoneAction,
    setActionSymbolOpen,
    setActionSymbolTo,
  } from "../tokens";
  import * as controller from "../controller";
  import { findMatch, findOpen, readableLineLength, wordWrap } from "../controller";

  // `content` is only used as the initial document for this mount. Tab
  // switches are handled by wrapping this component in a {#key} block
  // upstream, so it fully remounts per tab instead of reacting to prop
  // changes on every keystroke (which would otherwise reset the cursor
  // and undo history on every character typed).
  export let content: string;
  // Identifies which tab this mount belongs to, so its cursor/selection
  // and scroll position can be saved on the way out and restored the next
  // time this same tab becomes active — see `saveEditorViewState`/
  // `getEditorViewState` in controller.ts.
  export let tabId: string;

  let container: HTMLDivElement;
  let view: EditorView | null = null;
  let activeTouchLine: number | null = null;

  /** §80: soft word-wrap, toggled live from Settings. A CodeMirror
   * compartment so flipping it reconfigures just this one extension in
   * place — no remount, cursor and undo history untouched. Seeded from
   * the `wordWrap` store's current value at mount, then kept in sync by
   * the subscription set up in `onMount`. */
  const wrapCompartment = new Compartment();
  const wrapExtension = (on: boolean) => (on ? EditorView.lineWrapping : []);
  let unsubscribeWrap: (() => void) | undefined;

  /** §99: cap the text column to a ~720px reading measure, centred. A
   * compartment like `wrapCompartment` so Settings can flip it live with
   * no remount. Deliberately only applied when word-wrap is *also* on —
   * with wrapping off, a narrower `.cm-content` just scrolls wide lines
   * (tables, aligned columns) horizontally inside a smaller box, which is
   * the opposite of what wrap-off is for. */
  const measureCompartment = new Compartment();
  const measureExtension = (on: boolean) =>
    on
      ? EditorView.theme({
          ".cm-content": { maxWidth: "720px", marginInline: "auto", width: "100%" },
        })
      : [];
  const measureActive = (wrap: boolean, readable: boolean) => wrap && readable;
  let unsubscribeMeasure: (() => void) | undefined;

  /** §108: highlight every occurrence of the find query. `@codemirror/
   * search` only paints matches while *its own* panel is open, and we use
   * a custom floating bar instead — so this is our own case-insensitive
   * highlighter, swapped in via a compartment as the query changes. */
  const findHiCompartment = new Compartment();
  const findMatchMark = Decoration.mark({ class: "cm-searchMatch" });
  function findHighlight(query: string) {
    if (!query) return [];
    const norm = (s: string) => s.toLowerCase();
    return ViewPlugin.fromClass(
      class {
        decorations: ReturnType<RangeSetBuilder<Decoration>["finish"]>;
        constructor(v: EditorView) {
          this.decorations = this.build(v);
        }
        update(u: { view: EditorView; docChanged: boolean; viewportChanged: boolean }) {
          if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
        }
        build(v: EditorView) {
          const b = new RangeSetBuilder<Decoration>();
          for (const { from, to } of v.visibleRanges) {
            const cur = new SearchCursor(v.state.doc, query, from, to, norm);
            while (!cur.next().done) b.add(cur.value.from, cur.value.to, findMatchMark);
          }
          return b.finish();
        }
      },
      { decorations: (v) => v.decorations },
    );
  }

  const addPulseEffect = StateEffect.define<number>();
  const clearPulseEffect = StateEffect.define<void>();

  const pulseField = StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(decorations, tr) {
      decorations = decorations.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(clearPulseEffect)) {
          decorations = Decoration.none;
        } else if (effect.is(addPulseEffect)) {
          const lineIdx = effect.value;
          if (lineIdx >= 0 && lineIdx < tr.state.doc.lines) {
            const line = tr.state.doc.line(lineIdx + 1);
            decorations = Decoration.set([
              Decoration.line({ class: "cm-line-hit-pulse" }).range(line.from, line.from),
            ]);
          }
        }
      }
      return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  let pulseTimer: ReturnType<typeof setTimeout> | null = null;
  function triggerLinePulse(lineIdx: number) {
    if (!view) return;
    if (pulseTimer) clearTimeout(pulseTimer);
    view.dispatch({ effects: addPulseEffect.of(lineIdx) });
    pulseTimer = setTimeout(() => {
      view?.dispatch({ effects: clearPulseEffect.of() });
      pulseTimer = null;
    }, 1400);
  }

  // Kept up to date on every scroll rather than captured once at destroy
  // time — by the time `onDestroy` runs (this component is torn down via
  // the `{#key}` in App.svelte switching to a new tab), the scroller's raw
  // `scrollTop`/`scrollLeft` had already been observed reporting 0
  // regardless of where it visually was right beforehand. Capturing a
  // fresh snapshot on every scroll instead means whatever resets the live
  // DOM property by teardown time doesn't matter — the last real one is
  // already in hand. `scrollSnapshot()` (rather than the raw pixel
  // offsets) also anchors to a specific line/block, so it stays correct
  // even if line heights shift slightly between the save and the restore.
  let lastScrollEffect: StateEffect<unknown> | null = null;

  /** §108: mirror "N of M" into the `findMatch` store after every query
   * change or next/prev. Counts case-insensitively, matching the
   * `SearchQuery({ caseSensitive: false })` the bar sets. */
  let lastFindQuery = "";
  function recomputeFindMatch() {
    if (!view || !lastFindQuery) {
      findMatch.set({ current: 0, total: 0 });
      return;
    }
    const doc = view.state.doc;
    const norm = (s: string) => s.toLowerCase();
    const cursor = new SearchCursor(doc, lastFindQuery, 0, doc.length, norm);
    const selFrom = view.state.selection.main.from;
    let total = 0;
    // The match the caret sits on, or the last one before it (so a click
    // between matches still shows a sensible "k of N", never "– of N").
    let atOrBefore = 0;
    while (!cursor.next().done) {
      total++;
      if (cursor.value.from <= selFrom) atOrBefore = total;
    }
    findMatch.set({ current: total === 0 ? 0 : Math.max(1, atOrBefore), total });
  }

  /** True if `lineNumber` (1-based) is a section's title line — the line
   * directly above a setext `====` underline. `cycleActionSymbolOrCreate`
   * and `setActionSymbolTo` have no way to recognize this from a single line
   * in isolation (§69's own doc comment on `replaceActionSymbol`), so
   * every caller here checks it first and skips the line entirely rather
   * than ever promoting a section header into an action line by mistake. */
  function isHeaderLine(v: EditorView, lineNumber: number): boolean {
    return lineNumber < v.state.doc.lines && isSetextUnderline(v.state.doc.line(lineNumber + 1).text);
  }

  /** #73: applies `transform` to the current line only — used for
   * Ctrl+Space's close/reopen pair, which (unlike `applyActionStateToSelection`
   * below) never touches more than one line at a time and never promotes
   * a plain line into a new action. */
  function applyToCurrentLine(v: EditorView, transform: (line: string, col: number) => string | null): boolean {
    const pos = v.state.selection.main.head;
    const line = v.state.doc.lineAt(pos);
    if (isHeaderLine(v, line.number)) return false;
    const updated = transform(line.text, pos - line.from);
    if (updated === null) return false;
    v.dispatch({ changes: { from: line.from, to: line.to, insert: updated } });
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
  function applyActionStateToSelection(v: EditorView, transform: (line: string, col: number) => string | null): boolean {
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
    v.dispatch({ changes: { from: firstLine.from, to: lastLine.to, insert: lines.join("\n") } });
    return true;
  }

  /** §78: `F2` / `Shift+F2` — move the cursor to the next / previous open
   * action (`# ` line, indented or not, plus `=> #` consequence-actions)
   * in this note, wrapping at the ends. Lands at the start of the line,
   * same as the Action Drawer's "jump to line". A no-op with a toast when
   * the note has none. (§83: moved off `Ctrl+↓`/`Ctrl+↑`, which now do
   * caret-to-line-start explicitly — see §89 below.) */
  function jumpToAdjacentOpenAction(v: EditorView, dir: 1 | -1): boolean {
    const curLineIdx = v.state.doc.lineAt(v.state.selection.main.head).number - 1;
    const target = adjacentOpenActionLine(v.state.doc.toString(), curLineIdx, dir);
    if (target === null) {
      controller.showToast("No open actions in this note");
      return true;
    }
    const line = v.state.doc.line(target + 1);
    v.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
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
  function lineStartTarget(v: EditorView): number {
    const head = v.state.selection.main.head;
    const line = v.state.doc.lineAt(head);
    if (head === line.from && line.number > 1) {
      return v.state.doc.line(line.number - 1).from;
    }
    return line.from;
  }
  function nextLineStartTarget(v: EditorView): number {
    const line = v.state.doc.lineAt(v.state.selection.main.head);
    return line.number < v.state.doc.lines ? v.state.doc.line(line.number + 1).from : line.to;
  }
  function moveCaret(v: EditorView, target: number): boolean {
    v.dispatch({ selection: EditorSelection.cursor(target), scrollIntoView: true, userEvent: "select" });
    return true;
  }
  function extendSelection(v: EditorView, target: number): boolean {
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
  function convertLineToSection(v: EditorView): boolean {
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
  function bulletContinuation(insertBullet: boolean) {
    return (v: EditorView): boolean => {
      const pos = v.state.selection.main.head;
      const line = v.state.doc.lineAt(pos);
      // #34: Enter with the caret *before* a leading bullet / action / `=> `
      // token (in the indent, or column 0) is a plain newline — not a list
      // continuation. Otherwise the token got duplicated onto the pushed-
      // down line ("# a" → blank line + "# # a").
      if (insertBullet) {
        const lead = line.text.match(/^(\s*)(?:[-*]\s|[#vx>]\s|=>\s)/);
        if (lead && pos - line.from <= lead[1].length) {
          v.dispatch({
            changes: { from: pos, to: pos, insert: "\n" },
            selection: { anchor: pos + 1 },
            scrollIntoView: true,
          });
          return true;
        }
      }
      const match = line.text.match(/^(\s*)([-*])\s/);
      if (!match) {
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
          const nextLine = line.number < v.state.doc.lines ? v.state.doc.line(line.number + 1).text : undefined;
          const step = numberedListEnter(line.text, pos - line.from, nextLine);
          if (step && "exit" in step) {
            v.dispatch({ changes: { from: line.from, to: line.to, insert: "" }, selection: { anchor: line.from } });
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
        if (!insertBullet) {
          v.dispatch({ changes: { from: pos, to: pos, insert: "\n" }, selection: { anchor: pos + 1 }, scrollIntoView: true });
          return true;
        }
        // §85 (#12): Enter on an action line continues it as a new open action.
        const edit = actionLineEnter(line.text);
        if (edit === null) return false;
        if ("removeSymbol" in edit) {
          v.dispatch({ changes: { from: line.from, to: line.to, insert: "" }, selection: { anchor: line.from } });
        } else {
          v.dispatch({
            changes: { from: pos, to: pos, insert: edit.insert },
            selection: { anchor: pos + edit.insert.length },
            scrollIntoView: true,
          });
        }
        return true;
      }
      const [, indent, marker] = match;
      if (insertBullet && line.text.trim() === marker) {
        v.dispatch({ changes: { from: line.from, to: line.to, insert: "" }, selection: { anchor: line.from } });
        return true;
      }
      // Shift+Enter aligns under the bullet's *text* (past the marker),
      // not just at the bullet's own indentation — two spaces further in.
      const insertText = insertBullet ? `\n${indent}${marker} ` : `\n${indent}  `;
      v.dispatch({
        changes: { from: pos, to: pos, insert: insertText },
        selection: { anchor: pos + insertText.length },
        scrollIntoView: true,
      });
      return true;
    };
  }

  onMount(() => {
    const shortcuts = keymap.of([
      // §108: Ctrl/Cmd+F opens the floating find bar (not CodeMirror's
      // own panel). Escape from inside the bar closes it — handled in
      // FindBar itself.
      {
        key: "Mod-f",
        run: () => {
          findOpen.set(true);
          return true;
        },
      },
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
      // #73: Ctrl+Shift+O sets every line in the selection to open
      // without #69's plain-line promotion — `setActionSymbolOpen`, not
      // `setActionSymbolTo`, is what keeps it distinct from Ctrl+1 below.
      { key: "Mod-Shift-o", run: (v) => applyActionStateToSelection(v, setActionSymbolOpen) },
      // #70: Ctrl+1-4 set every action in the selection directly to
      // open/done/deferred/won't-do, matching `ACTION_CYCLE_ORDER`
      // (tokens.ts).
      { key: "Mod-1", run: (v) => applyActionStateToSelection(v, (line, col) => setActionSymbolTo(line, "#", col)) },
      { key: "Mod-2", run: (v) => applyActionStateToSelection(v, (line, col) => setActionSymbolTo(line, "v", col)) },
      { key: "Mod-3", run: (v) => applyActionStateToSelection(v, (line, col) => setActionSymbolTo(line, ">", col)) },
      { key: "Mod-4", run: (v) => applyActionStateToSelection(v, (line, col) => setActionSymbolTo(line, "x", col)) },
      { key: "F2", run: (v) => jumpToAdjacentOpenAction(v, 1) },
      { key: "Shift-F2", run: (v) => jumpToAdjacentOpenAction(v, -1) },
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

    // Resume where this tab was left off, if it's been visited before this
    // session — the cursor/selection and how far the view had scrolled.
    // Every tab switch fully remounts this component (see the {#key} in
    // App.svelte), which would otherwise always drop you back at (1,1)
    // with no scroll, even mid-thought in a long note. Both go into the
    // initial `EditorState`/`EditorView` config below rather than being
    // applied via a `dispatch()` after construction — CodeMirror's own
    // initial layout pass was observed fighting a post-construction
    // `scrollDOM.scrollTop` assignment (and even a `dispatch`ed selection
    // combined with it) and winning, leaving the view scrolled to the top
    // (or, once a plain `view.focus()`'s native scroll-into-view behavior
    // got involved too, to the bottom) regardless. Setting both up front
    // means there's no "after" for anything else to override.
    const saved = controller.getEditorViewState(tabId);
    let initialSelection: EditorSelection | undefined;
    if (saved) {
      try {
        const restored = EditorSelection.fromJSON(saved.selectionJSON);
        // Clamp to content's length in case it changed while this tab was
        // inactive (e.g. §49's paste-forward marking a `#` line as `>`
        // elsewhere) and a saved position no longer exists — same-length
        // replacements like that one won't actually trigger this, but it
        // costs nothing to be safe against ones that might.
        const docLength = content.length;
        initialSelection = EditorSelection.create(
          restored.ranges.map((r) => EditorSelection.range(Math.min(r.anchor, docLength), Math.min(r.head, docLength))),
          restored.mainIndex,
        );
      } catch {
        // Saved selection doesn't fit this document anymore — fall back
        // to the default start-of-document cursor instead.
      }
    }

    const extensions = [
      history(),
      // Coordinate-based selection/cursor painting instead of native
      // browser DOM-range selection — the latter has known quirks with
      // `display: inline-block` widgets (like the fixed-width glyphs),
      // where the highlight doesn't reliably cover the widget's full
      // box. This is also what the `.cm-cursor-primary`/
      // `.cm-cursor-secondary` caret styling in app.css was already
      // written for.
      drawSelection(),
      indentUnit.of("  "),
      wrapCompartment.of(wrapExtension(get(wordWrap))),
      measureCompartment.of(measureExtension(measureActive(get(wordWrap), get(readableLineLength)))),
      liveGlyphs,
      glyphAtomicRanges,
      setextRule,
      resolvedLinesPlugin,
      activeLinesPlugin,
      pulseField,
      // §108: search state for findNext/findPrevious; its own panel is
      // never opened — the floating `FindBar` is the UI, and
      // `findHiCompartment` does the match highlighting.
      search({ top: true }),
      findHiCompartment.of([]),
      shortcuts,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          controller.updateActiveTabContent(u.state.doc.toString());
          // §86 (#9): if this doc change was an undo/redo of the paste that
          // forwarded actions here, tell the controller so it can flip the
          // source tab's `> `/`# ` to match.
          for (const tr of u.transactions) {
            if (!tr.docChanged) continue;
            if (tr.isUserEvent("undo")) {
              controller.onEditorUndo(tabId, tr.startState.doc.toString(), tr.state.doc.toString());
            } else if (tr.isUserEvent("redo")) {
              controller.onEditorRedo(tabId, tr.startState.doc.toString(), tr.state.doc.toString());
            }
          }
        }
        if (u.selectionSet || u.docChanged) {
          const pos = u.state.selection.main.head;
          const line = u.state.doc.lineAt(pos);
          controller.setStatusPosition(line.number, pos - line.from + 1);
          // #37/#38: how many document lines the selection spans (0 chars
          // selected across every multi-cursor range → nothing selected).
          const selChars = u.state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0);
          if (selChars === 0) {
            controller.setStatusSelection(null);
          } else {
            const main = u.state.selection.main;
            const lines = u.state.doc.lineAt(main.to).number - u.state.doc.lineAt(main.from).number + 1;
            controller.setStatusSelection({ lines });
          }
          // §108: the find bar is non-modal, so the caret can move (click,
          // arrows, an edit) while it's open — keep "N of M" in step.
          if (get(findOpen) && lastFindQuery) recomputeFindMatch();
        }
      }),
      EditorView.domEventHandlers({
        pointerdown: (e: PointerEvent, v: EditorView) => {
          if (!get(controller.isMobile) || e.pointerType === "mouse") return;
          if ((e.target as HTMLElement)?.closest?.(".glyph-cyclable")) return;

          const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos === null) return;
          const lineNum = v.state.doc.lineAt(pos).number;

          if (activeTouchLine === lineNum) {
            // Second tap on the same line: allow keyboard to open
            v.contentDOM.setAttribute("inputmode", "text");
          } else {
            // First tap on this line: position caret, keep keyboard hidden so bottom buttons are usable
            activeTouchLine = lineNum;
            const hadKeyboard = v.contentDOM.getAttribute("inputmode") === "text";
            v.contentDOM.setAttribute("inputmode", "none");
            v.dispatch({ selection: { anchor: pos } });
            if (hadKeyboard) {
              v.contentDOM.blur();
              v.contentDOM.focus();
            }
          }
        },
        pointerup: (_e: PointerEvent, v: EditorView) => {
          if (!get(controller.isMobile)) return;
          // After the first tap settles without keyboard, enable text mode so a subsequent second tap opens keyboard
          if (activeTouchLine !== null) {
            setTimeout(() => {
              v.contentDOM.setAttribute("inputmode", "text");
            }, 50);
          }
        },
        blur: (_e, v) => {
          if (get(controller.isMobile)) {
            v.contentDOM.setAttribute("inputmode", "none");
            activeTouchLine = null;
          }
        },
        copy: (_event, v) => {
          const sel = v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
          controller.recordCopiedAction(sel, controller.getActiveTabId());
        },
        paste: () => {
          controller.handlePasteIntoTab(controller.getActiveTabId());
        },
      }),
    ];

    // §86 (#9): CodeMirror is fully remounted on every tab switch (the
    // `{#key}` in App.svelte), so its undo history would restart empty each
    // time. Restore the serialized history alongside the cursor — but only
    // when the tab's content is byte-for-byte what this editor last saved.
    // If it changed while the tab was inactive (an action-drawer edit, or a
    // paste elsewhere deferring its actions), the saved change offsets no
    // longer line up, so that tab starts with a fresh undo baseline.
    let initialState: EditorState;
    const canRestoreHistory = saved?.historyJSON != null && saved.docAtSave === content;
    if (canRestoreHistory) {
      try {
        initialState = EditorState.fromJSON(
          { doc: content, selection: saved!.selectionJSON, history: saved!.historyJSON },
          { extensions },
          { history: historyField },
        );
      } catch {
        initialState = EditorState.create({ doc: content, selection: initialSelection, extensions });
      }
    } else {
      initialState = EditorState.create({ doc: content, selection: initialSelection, extensions });
    }

    view = new EditorView({
      state: initialState,
      parent: container,
      scrollTo: saved?.scrollEffect as StateEffect<unknown> | undefined,
    });

    if (get(controller.isMobile)) {
      view.contentDOM.setAttribute("inputmode", "none");
    }

    view.scrollDOM.addEventListener("scroll", () => {
      if (view) lastScrollEffect = view.scrollSnapshot();
    });

    // Reconfigure the wrap compartment whenever Settings toggles it. Fires
    // immediately with the current value too, which harmlessly re-applies
    // what the initial state already set. Plain store subscription, not a
    // `$:` block — see TopBar.svelte's long note on why that matters near
    // CodeMirror.
    const reconfigureMeasure = () => {
      view?.dispatch({
        effects: measureCompartment.reconfigure(
          measureExtension(measureActive(get(wordWrap), get(readableLineLength))),
        ),
      });
    };
    let firstWrap = true;
    unsubscribeWrap = wordWrap.subscribe((on) => {
      if (firstWrap) {
        firstWrap = false;
        return;
      }
      view?.dispatch({ effects: wrapCompartment.reconfigure(wrapExtension(on)) });
      // §99: the reading measure only applies with wrap on, so a wrap
      // toggle can turn it on or off too.
      reconfigureMeasure();
    });
    let firstMeasure = true;
    unsubscribeMeasure = readableLineLength.subscribe(() => {
      if (firstMeasure) {
        firstMeasure = false;
        return;
      }
      reconfigureMeasure();
    });

    controller.registerEditorApi({
      getContent: () => view!.state.doc.toString(),
      setContent: (text: string) => {
        if (!view) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      },
      insertAtCursor: (text: string) => {
        if (!view) return;
        const pos = view.state.selection.main.head;
        view.dispatch({ changes: { from: pos, to: pos, insert: text } });
      },
      jumpToLine: (idx: number) => {
        if (!view) return;
        const lineNumber = Math.min(idx + 1, view.state.doc.lines);
        const lineInfo = view.state.doc.line(Math.max(1, lineNumber));
        view.dispatch({ selection: { anchor: lineInfo.from }, scrollIntoView: true });
      },
      getCursorLineIdx: () => {
        if (!view) return 0;
        return view.state.doc.lineAt(view.state.selection.main.head).number - 1;
      },
      getSelection: () => {
        if (!view) return { text: "", fromLine: 0, toLine: 0 };
        const { from, to } = view.state.selection.main;
        const firstLine = view.state.doc.lineAt(from);
        const lastLine = view.state.doc.lineAt(to);
        return {
          text: view.state.doc.sliceString(firstLine.from, lastLine.to),
          fromLine: firstLine.number - 1,
          toLine: lastLine.number - 1,
        };
      },
      getSelectionRange: () => {
        if (!view) return { anchor: 0, head: 0 };
        return { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head };
      },
      setSelectionRange: (range: { anchor: number; head: number }) => {
        if (!view) return;
        const max = view.state.doc.length;
        const anchor = Math.min(Math.max(0, range.anchor), max);
        const head = Math.min(Math.max(0, range.head), max);
        view.dispatch({ selection: { anchor, head }, scrollIntoView: true });
      },
      closeCurrentOpenAction: () => (view ? applyToCurrentLine(view, closeOpenAction) : false),
      reopenCurrentDoneAction: () => (view ? applyToCurrentLine(view, reopenDoneAction) : false),
      convertCurrentLineToSection: () => (view ? convertLineToSection(view) : false),
      setActionStateOnSelection: (symbol: "#" | "v" | ">" | "x") =>
        view ? applyActionStateToSelection(view, (line, col) => setActionSymbolTo(line, symbol, col)) : false,
      jumpAdjacentOpenAction: (direction: 1 | -1) => (view ? jumpToAdjacentOpenAction(view, direction) : false),
      pulseLine: (lineIdx: number) => {
        triggerLinePulse(lineIdx);
      },
      scrollCaretIntoView: () => {
        if (!view) return;
        view.requestMeasure();
        view.dispatch({
          effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest", yMargin: 40 }),
        });
      },
      focus: () => {
        if (!view) return;
        const prevMode = view.contentDOM.getAttribute("inputmode");
        view.focus();
        if (prevMode === "none") {
          view.contentDOM.setAttribute("inputmode", "none");
        }
      },
      find: {
        setQuery: (q: string) => {
          if (!view) return;
          lastFindQuery = q;
          view.dispatch({
            effects: [
              setSearchQuery.of(new SearchQuery({ search: q, caseSensitive: false })),
              findHiCompartment.reconfigure(findHighlight(q)),
            ],
          });
          // Jump to the first match at/after the caret without stealing
          // focus from the find input.
          if (q) findNext(view);
          recomputeFindMatch();
        },
        next: () => {
          if (view) findNext(view);
          recomputeFindMatch();
        },
        prev: () => {
          if (view) findPrevious(view);
          recomputeFindMatch();
        },
        clear: () => {
          lastFindQuery = "";
          if (view) {
            view.dispatch({
              effects: [
                setSearchQuery.of(new SearchQuery({ search: "" })),
                findHiCompartment.reconfigure([]),
              ],
            });
          }
          findMatch.set({ current: 0, total: 0 });
        },
      },
      undo: () => {
        if (view) undo(view);
      },
      redo: () => {
        if (view) redo(view);
      },
      indent: (dedent = false) => {
        if (!view) return;
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
      },
      applyToken: (token) => {
        if (!view) return;
        const sel = view.state.selection.main;
        const { from, to } = sel;
        const firstLine = view.state.doc.lineAt(from);
        const lastLine = view.state.doc.lineAt(to);
        const changes: { from: number; to: number; insert: string }[] = [];
        for (let l = firstLine.number; l <= lastLine.number; l++) {
          const line = view.state.doc.line(l);
          let updated: string | null = null;
          if (token === "#" || token === "v" || token === ">" || token === "x") {
            if (/^\s*[-*!]\s/.test(line.text)) {
              const indent = line.text.match(/^(\s*)/)?.[1] ?? "";
              const stripped = line.text.replace(/^(\s*)([#vx>]|[-*]|!)\s/, "");
              updated = `${indent}${token} ${stripped}`;
            } else {
              updated = setActionSymbolTo(line.text, token, referenceColumn(sel, line));
            }
          } else if (token === "-") {
            if (/^\s*[-*]\s/.test(line.text)) {
              updated = line.text.replace(/^(\s*)[-*]\s/, "$1");
            } else {
              const indent = line.text.match(/^(\s*)/)?.[1] ?? "";
              const stripped = line.text.replace(/^(\s*)([#vx>]|[-*]|!)\s/, "");
              updated = `${indent}- ${stripped}`;
            }
          } else if (token === "!") {
            if (/^\s*!\s/.test(line.text)) {
              updated = line.text.replace(/^(\s*)!\s/, "$1");
            } else {
              const indent = line.text.match(/^(\s*)/)?.[1] ?? "";
              const stripped = line.text.replace(/^(\s*)([#vx>]|[-*]|!)\s/, "");
              updated = `${indent}! ${stripped}`;
            }
          } else if (token === "=>") {
            if (line.text.includes("=> ")) {
              updated = line.text.replace(/=>\s/, "");
            } else {
              updated = `${line.text} => `;
            }
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
      },
    });


    // The `updateListener` above only fires on a `dispatch()`, not on the
    // initial state a view is constructed with — so it never ran for the
    // selection just set (default or restored) above. Set the status bar
    // from it directly instead of assuming (1, 1).
    const initialPos = view.state.selection.main.head;
    const initialLine = view.state.doc.lineAt(initialPos);
    controller.setStatusPosition(initialLine.number, initialPos - initialLine.from + 1);
    const initChars = view.state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0);
    controller.setStatusSelection(
      initChars === 0
        ? null
        : {
            lines:
              view.state.doc.lineAt(view.state.selection.main.to).number -
              view.state.doc.lineAt(view.state.selection.main.from).number +
              1,
          },
    );

    // Plain `view.focus()` (== `contentDOM.focus()` with no options) lets
    // the browser's native "scroll the newly focused element into view"
    // behavior run, which can override the `scrollTo` set above (or, for
    // a fresh/default cursor, is harmless but unnecessary). `preventScroll`
    // stops that so the initial scroll position sticks either way.
    view.contentDOM.focus({ preventScroll: true });
  });

  onDestroy(() => {
    if (pulseTimer) clearTimeout(pulseTimer);
    unsubscribeWrap?.();
    unsubscribeMeasure?.();
    // §108: the find bar belongs to this editor instance — a tab switch
    // (which remounts this component) closes it and drops the query.
    findOpen.set(false);
    findMatch.set({ current: 0, total: 0 });
    controller.setStatusSelection(null);
    if (view) {
      controller.saveEditorViewState(tabId, {
        selectionJSON: view.state.selection.toJSON(),
        scrollEffect: lastScrollEffect ?? view.scrollSnapshot(),
        // §86 (#9): keep this tab's undo/redo stack for when it's next
        // shown. `docAtSave` is the guard the restore path checks against
        // the (possibly since-changed) tab content.
        historyJSON: view.state.toJSON({ history: historyField }).history,
        docAtSave: view.state.doc.toString(),
      });
    }
    view?.destroy();
    controller.registerEditorApi(null);
  });
</script>

<div class="editor-host" bind:this={container}></div>

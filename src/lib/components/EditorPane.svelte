<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { get } from "svelte/store";
  import { Compartment, EditorSelection, EditorState, RangeSetBuilder, type StateEffect } from "@codemirror/state";
  import { Decoration, drawSelection, EditorView, keymap, ViewPlugin } from "@codemirror/view";
  import { defaultKeymap, history, historyField, historyKeymap, indentWithTab, redo } from "@codemirror/commands";
  import { indentUnit } from "@codemirror/language";
  import { findNext, findPrevious, search, SearchCursor, SearchQuery, setSearchQuery } from "@codemirror/search";
  import { glyphAtomicRanges, liveGlyphs } from "../editor/glyphs";
  import { setextRule } from "../editor/setextRule";
  import { underlineFor } from "../sectionImport";
  import { actionLineEnter, adjacentOpenActionLine, cycleActionSymbol } from "../tokens";
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
    let current = 0;
    while (!cursor.next().done) {
      total++;
      if (cursor.value.from === selFrom) current = total;
    }
    findMatch.set({ current, total });
  }

  function cycleLine(v: EditorView): boolean {
    const pos = v.state.selection.main.head;
    const line = v.state.doc.lineAt(pos);
    const updated = cycleActionSymbol(line.text);
    if (updated === null) return false;
    v.dispatch({ changes: { from: line.from, to: line.to, insert: updated } });
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

  /** Ctrl+Shift+S: turns the current line into a section header by
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
   * §51 — optionally indented — nesting is two spaces per level) and, from
   * §85 (#12), action lines (`# `/`v `/`> `/`x `). Enter adds a fresh
   * bullet at the same indentation using the line's own marker — or, on an
   * action line, a fresh **open** action (`# `) regardless of the current
   * symbol, since you're adding a task; on an *empty* bullet or action
   * line it removes the marker instead ("press Enter to exit a list").
   * Shift+Enter adds a plain continuation line at the same indentation, no
   * new marker. Off both kinds of line, Enter defers entirely to
   * CodeMirror's own default newline handling; Shift+Enter isn't bound
   * anywhere else, so it explicitly inserts a plain newline itself. */
  function bulletContinuation(insertBullet: boolean) {
    return (v: EditorView): boolean => {
      const pos = v.state.selection.main.head;
      const line = v.state.doc.lineAt(pos);
      const match = line.text.match(/^(\s*)([-*])\s/);
      if (!match) {
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
      { key: "Ctrl-Space", run: (v) => cycleLine(v) },
      // §106: Ctrl/Cmd+Enter is the same action-state cycle as Ctrl+Space
      // — the combo the UX reviews (and most task apps) reach for.
      { key: "Mod-Enter", run: (v) => cycleLine(v) },
      { key: "Ctrl-Shift-s", run: (v) => convertLineToSection(v) },
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
        }
      }),
      EditorView.domEventHandlers({
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
      focus: () => view?.focus(),
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
    });

    // The `updateListener` above only fires on a `dispatch()`, not on the
    // initial state a view is constructed with — so it never ran for the
    // selection just set (default or restored) above. Set the status bar
    // from it directly instead of assuming (1, 1).
    const initialPos = view.state.selection.main.head;
    const initialLine = view.state.doc.lineAt(initialPos);
    controller.setStatusPosition(initialLine.number, initialPos - initialLine.from + 1);

    // Plain `view.focus()` (== `contentDOM.focus()` with no options) lets
    // the browser's native "scroll the newly focused element into view"
    // behavior run, which can override the `scrollTo` set above (or, for
    // a fresh/default cursor, is harmless but unnecessary). `preventScroll`
    // stops that so the initial scroll position sticks either way.
    view.contentDOM.focus({ preventScroll: true });
  });

  onDestroy(() => {
    unsubscribeWrap?.();
    unsubscribeMeasure?.();
    // §108: the find bar belongs to this editor instance — a tab switch
    // (which remounts this component) closes it and drops the query.
    findOpen.set(false);
    findMatch.set({ current: 0, total: 0 });
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

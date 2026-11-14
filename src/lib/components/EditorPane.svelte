<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { get } from "svelte/store";
  import { Compartment, EditorSelection, EditorState, RangeSetBuilder, StateEffect, StateField, Transaction } from "@codemirror/state";
  import { Decoration, type DecorationSet, drawSelection, EditorView, keymap, ViewPlugin } from "@codemirror/view";
  import { historyField, redo, undo } from "@codemirror/commands";
  import { findNext, findPrevious, replaceNext, replaceAll, search, SearchCursor, SearchQuery, setSearchQuery } from "@codemirror/search";
  import {
    applyActionStateToSelection,
    applyLineToken,
    applyToCurrentLine,
    convertLineToSection,
    indentLines,
    isHeaderLine,
    jumpCaretTo,
    jumpToAdjacentOpenAction,
  } from "../editor/commands";
  import { editingExtensions } from "../editor/editingExtensions";
  import { editorChanges } from "../editor/editorChanges";
  import { overviewRuler } from "../editor/overviewRuler";
  import { wrapIndentExtension } from "../editor/wrapIndent";
  import { sectionFocus } from "../editor/sectionFocus";
  import { occurrenceHintExtension, setOccurrenceInfo } from "../editor/occurrenceHint";
  import { spellcheckExtension, misspelledAt } from "../editor/spellcheck";
  import { isMac } from "../platform";
  import { t } from "../i18n";
  import {
    closeOpenAction,
    isSetextUnderline,
    reopenDoneAction,
    setActionSymbolTo,
    setTopicSymbolTo,
    lineSectionRole,
  } from "../tokens";
  import * as controller from "../controller";
  import { editorContextMenu, findMatch, findOpen, readableLineLength, spellCheck, wordWrap } from "../controller";
  import { currentLineKind, editorFocused } from "../stores";
  import { lineKind } from "../lineKind";
  import { htmlToNoteText, noteTextToHtml } from "../richClipboard";

  interface Props {
    content: string;
    tabId: string;
  }

  // `content` is only used as the initial document for this mount. Tab
  // switches are handled by wrapping this component in a {#key} block
  // upstream, so it fully remounts per tab instead of reacting to prop
  // changes on every keystroke (which would otherwise reset the cursor
  // and undo history on every character typed).
  //
  // `tabId` identifies which tab this mount belongs to, so its cursor/selection
  // and scroll position can be saved on the way out and restored the next
  // time this same tab becomes active — see `saveEditorViewState`/
  // `getEditorViewState` in controller.ts.
  let { content, tabId }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView | null = null;

  /** §80: soft word-wrap, toggled live from Settings. A CodeMirror
   * compartment so flipping it reconfigures just this one extension in
   * place — no remount, cursor and undo history untouched. Seeded from
   * the `wordWrap` store's current value at mount, then kept in sync by
   * the subscription set up in `onMount`. */
  const wrapCompartment = new Compartment();
  const wrapExtension = (on: boolean) => (on ? [EditorView.lineWrapping, wrapIndentExtension()] : []);
  let unsubscribeWrap: (() => void) | undefined;

  /** Spell check (D2). Compartment holds contentAttributes toggled live
   * when the `spellCheck` store changes. Off by default. */
  const spellCompartment = new Compartment();
  const spellExtension = (on: boolean) => {
    if (get(controller.backendKind) === "web") {
      return EditorView.contentAttributes.of({ spellcheck: on ? "true" : "false", autocorrect: "off", autocapitalize: "off" });
    }
    return [
      EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
      ...(on ? spellcheckExtension() : []),
    ];
  };
  let unsubscribeSpell: (() => void) | undefined;

  /** Peek mode (compact note window): only one section of the document is shown. A compartment so entering and
   * leaving Peek reconfigures this one extension in place, with the same document, cursor and undo history. */
  const peekCompartment = new Compartment();
  const peekExtension = (target: string | null) =>
    target ? sectionFocus(target, (lines) => controller.peekFitLines.set(lines)) : [];
  let unsubscribePeek: (() => void) | undefined;
  let unsubscribeOccurrence: (() => void)[] = [];

  /** Alt+Left / Alt+Right in the editor; true = the key was ours. */
  function occurrenceKey(direction: -1 | 1): boolean {
    if (get(controller.peekMode)) {
      void controller.stepPeekOccurrence(direction);
      return true;
    }
    if (isMac || !controller.occurrenceKeyApplies()) return false;
    void controller.stepSectionOccurrence(direction);
    return true;
  }

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
  function findHighlight(query: string, caseSensitive = false, wholeWord = false) {
    if (!query) return [];
    const sq = new SearchQuery({ search: query, caseSensitive, wholeWord });
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
            const cur = sq.getCursor(v.state, from, to);
            for (let res = cur.next(); !res.done; res = cur.next()) {
              b.add(res.value.from, res.value.to, findMatchMark);
            }
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
   * change or next/prev. Respects caseSensitive and wholeWord options. */
  let lastFindQuery = "";
  let lastReplaceText = "";
  let findCaseSensitive = false;
  let findWholeWord = false;

  function recomputeFindMatch() {
    if (!view || !lastFindQuery) {
      findMatch.set({ current: 0, total: 0 });
      return;
    }
    const sq = new SearchQuery({
      search: lastFindQuery,
      caseSensitive: findCaseSensitive,
      wholeWord: findWholeWord,
    });
    const cursor = sq.getCursor(view.state);
    const selFrom = view.state.selection.main.from;
    let total = 0;
    // The match the caret sits on, or the last one before it (so a click
    // between matches still shows a sensible "k of N", never "– of N").
    let atOrBefore = 0;
    for (let res = cursor.next(); !res.done; res = cursor.next()) {
      total++;
      if (res.value.from <= selFrom) atOrBefore = total;
    }
    findMatch.set({ current: total === 0 ? 0 : Math.max(1, atOrBefore), total });
  }

  function applySearchQuery(jump = false) {
    if (!view) return;
    const sq = new SearchQuery({
      search: lastFindQuery,
      replace: lastReplaceText,
      caseSensitive: findCaseSensitive,
      wholeWord: findWholeWord,
    });
    view.dispatch({
      effects: [
        setSearchQuery.of(sq),
        findHiCompartment.reconfigure(findHighlight(lastFindQuery, findCaseSensitive, findWholeWord)),
      ],
    });
    if (lastFindQuery && jump) findNext(view);
    recomputeFindMatch();
  }

  onMount(() => {
    const uiShortcuts = keymap.of([
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
      // Decision 2a / §432: Week review shortcut Ctrl+Shift+K overrides CodeMirror's default deleteLine
      {
        key: "Mod-Shift-k",
        run: () => {
          controller.openWeekReview();
          return true;
        },
      },
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
      // Editing extensions with UI-only extensions interleaved in their original positions
      // (drawSelection after history; compartments after indentUnit; panels/Peek/ruler after
      // transaction filters; UI shortcuts before editingKeymap/defaultKeymap).
      ...editingExtensions(
        {
          onOccurrenceKey: occurrenceKey,
          showToast: (msg) => controller.showToast(msg),
        },
        {
          afterHistory: [
            // Coordinate-based selection/cursor painting instead of native
            // browser DOM-range selection — the latter has known quirks with
            // `display: inline-block` widgets (like the fixed-width glyphs),
            // where the highlight doesn't reliably cover the widget's full
            // box. This is also what the `.cm-cursor-primary`/
            // `.cm-cursor-secondary` caret styling in app.css was already
            // written for.
            drawSelection(),
          ],
          afterIndentUnit: [
            EditorView.contentAttributes.of({ "aria-label": get(t)("editor.ariaLabel", undefined) }),
            wrapCompartment.of(wrapExtension(get(wordWrap))),
            spellCompartment.of(spellExtension(get(spellCheck))),
            measureCompartment.of(measureExtension(measureActive(get(wordWrap), get(readableLineLength)))),
          ],
          afterFilters: [
            overviewRuler({ onJump: (lineIdx) => triggerLinePulse(lineIdx) }),
            pulseField,
            // §108: search state for findNext/findPrevious; its own panel is
            // never opened — the floating `FindBar` is the UI, and
            // `findHiCompartment` does the match highlighting.
            search({ top: true }),
            findHiCompartment.of([]),
            peekCompartment.of(peekExtension(get(controller.peekTarget))),
            occurrenceHintExtension(
              () => ({ prev: get(t)("peek.prev", undefined), next: get(t)("peek.next", undefined), peek: get(t)("occurrence.peek", undefined) }),
              (target, direction) => void controller.stepToOccurrence(target, direction),
              {
                available: () => get(controller.backendKind) === "desktop",
                open: (target) => void controller.enterPeek(target),
              },
            ),
          ],
          beforeEditingKeymap: [uiShortcuts],
        },
      ),
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
          currentLineKind.set(lineKind(line.text));
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
          // The section the caret is in, for the occurrence hint and the docked History pane, which follows the
          // caret (only worked out while one of them needs it).
          if (get(controller.occurrenceHint) || (get(controller.modal) === "history" && get(controller.historyDocked))) {
            const text = u.state.doc.toString();
            controller.cursorSection.set(controller.sectionTargetAt(text, u.state.doc.lineAt(pos).number - 1));
          }
          // §108: the find bar is non-modal, so the caret can move (click,
          // arrows, an edit) while it's open — keep "N of M" in step.
          if (get(findOpen) && lastFindQuery) recomputeFindMatch();
        }
      }),
      EditorView.domEventHandlers({
        contextmenu: (event, v) => {
          if (event.shiftKey && get(spellCheck) && get(controller.backendKind) === "web") return false;
          event.preventDefault();
          const pos = v.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos != null && v.state.selection.main.empty) v.dispatch({ selection: { anchor: pos } });
          const at = v.state.doc.lineAt(v.state.selection.main.head);
          const role = lineSectionRole(v.state.doc.toString().split("\n"), at.number - 1);
          const misspelled = (get(controller.backendKind) !== "web" && pos != null) ? misspelledAt(v.state, pos) : null;
          editorContextMenu.set({ x: event.clientX, y: event.clientY, line: at.text, role, misspelled });
          return true;
        },
        // Deferred: the browser also fires `blur` while Svelte is tearing this
        // component down (tab or folder switch with the editor focused), and a
        // store write at that moment throws `state_unsafe_mutation`, which broke
        // the folder switch.
        focus: () => {
          queueMicrotask(() => editorFocused.set(true));
        },
        blur: () => {
          queueMicrotask(() => editorFocused.set(false));
        },
        copy: (event, v) => {
          const sel = v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
          controller.recordCopiedAction(sel, controller.getActiveTabId(), v.state.selection.main.from);
          // #196: lists also go on the clipboard as HTML lists, for Teams, Outlook and Word. Without clipboardData
          // CodeMirror's own copy runs.
          if (event.clipboardData && v.state.selection.ranges.length === 1 && !v.state.selection.main.empty) {
            const html = noteTextToHtml(sel);
            if (html !== null) {
              event.clipboardData.setData("text/plain", sel);
              event.clipboardData.setData("text/html", html);
              event.preventDefault();
              return true;
            }
          }
          return false;
        },
        cut: (event, v) => {
          // Cutting removes the selection from this note. Clear any pending copy-defer link
          // so cutting text cannot defer a stale previous copy.
          controller.recordCopiedAction("", controller.getActiveTabId());
          if (event.clipboardData && v.state.selection.ranges.length === 1 && !v.state.selection.main.empty) {
            const sel = v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
            const html = noteTextToHtml(sel);
            if (html !== null) {
              event.clipboardData.setData("text/plain", sel);
              event.clipboardData.setData("text/html", html);
              event.preventDefault();
              v.dispatch({ ...v.state.replaceSelection(""), userEvent: "delete.cut", scrollIntoView: true });
              return true;
            }
          }
          return false;
        },
        paste: (event, v) => {
          // #196: a list copied from Teams, a browser, Word or Outlook only keeps its bullets and indentation in the
          // HTML; anything else (and ChronoNote's own copies) pastes text/plain as before.
          const rawHtml = event.clipboardData?.getData("text/html");
          if (rawHtml) {
            const converted = htmlToNoteText(rawHtml);
            if (converted !== null) {
              event.preventDefault();
              const lineIdx = v.state.doc.lineAt(v.state.selection.main.head).number - 1;
              const docText = v.state.doc.toString();
              controller.handlePasteIntoTab(controller.getActiveTabId(), converted, {
                targetLineIdx: lineIdx,
                targetDocText: docText,
              });
              v.dispatch({ ...v.state.replaceSelection(converted), userEvent: "input.paste", scrollIntoView: true });
              return true;
            }
          }
          const lineIdx = v.state.doc.lineAt(v.state.selection.main.head).number - 1;
          const docText = v.state.doc.toString();
          controller.handlePasteIntoTab(controller.getActiveTabId(), event.clipboardData?.getData("text/plain"), {
            targetLineIdx: lineIdx,
            targetDocText: docText,
          });
          return false;
        },
        // The occurrence hint (and its Peek button) also shows for a section whose title line or underline the mouse
        // is over, so it can be used without clicking into the section first.
        mousemove: (event, v) => {
          if (!get(controller.occurrenceHint)) return;
          const pos = v.posAtCoords({ x: event.clientX, y: event.clientY });
          let target: string | null = null;
          // Only when the pointer is really over the line (not in the empty space below the last one).
          const block = pos !== null ? v.lineBlockAt(pos) : null;
          const overLine = !!block && event.clientY >= v.documentTop + block.top && event.clientY <= v.documentTop + block.bottom;
          if (pos !== null && overLine) {
            const line = v.state.doc.lineAt(pos);
            const onTitle = line.text.trim() !== "" && !isSetextUnderline(line.text) && isHeaderLine(v, line.number);
            const onUnderline = isSetextUnderline(line.text) && line.number > 1 && isHeaderLine(v, line.number - 1);
            if (onTitle || onUnderline) target = controller.sectionTargetAt(v.state.doc.toString(), line.number - 1);
          }
          if (get(controller.hoverSection) !== target) controller.hoverSection.set(target);
        },
        mouseleave: () => {
          if (get(controller.hoverSection) !== null) controller.hoverSection.set(null);
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
    // what the initial state already set. Plain store subscription, not an
    // `$effect` — see TopBar.svelte's long note on why that matters near
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
    let firstSpell = true;
    unsubscribeSpell = spellCheck.subscribe((on) => {
      if (firstSpell) {
        firstSpell = false;
        return;
      }
      view?.dispatch({ effects: spellCompartment.reconfigure(spellExtension(on)) });
    });
    let firstPeek = true;
    unsubscribePeek = controller.peekTarget.subscribe((target) => {
      if (firstPeek) {
        firstPeek = false;
        return;
      }
      if (!view) return;
      view.dispatch({ effects: peekCompartment.reconfigure(peekExtension(target)) });
      if (target) {
        // A no-op selection update runs the section's selection filter, which moves a caret that was on the title or
        // outside the section into its body.
        view.dispatch({ selection: view.state.selection });
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "start", yMargin: 0 }) });
      }
    });
    // The occurrence hint: what to show after the section title, pushed into the editor whenever it changes.
    // Not in Peek (the title line is not drawn there).
    const pushOccurrenceInfo = () => {
      if (!view) return;
      const info = get(controller.peekMode) ? null : get(controller.occurrenceInfo);
      view.dispatch({ effects: setOccurrenceInfo.of(info) });
    };
    unsubscribeOccurrence = [
      controller.occurrenceInfo.subscribe(pushOccurrenceInfo),
      controller.peekMode.subscribe(pushOccurrenceInfo),
      controller.occurrenceHint.subscribe((on) => {
        if (on && view) {
          const pos = view.state.selection.main.head;
          controller.cursorSection.set(controller.sectionTargetAt(view.state.doc.toString(), view.state.doc.lineAt(pos).number - 1));
        }
      }),
    ];
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
      setContent: (text: string, options?: { outside?: boolean }) => {
        if (!view) return;
        const changes = editorChanges(view.state.doc.toString(), text);
        if (changes.length) {
          view.dispatch({
            changes,
            ...(options?.outside ? { annotations: Transaction.addToHistory.of(false) } : {}),
          });
        }
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
        jumpCaretTo(view, lineInfo.from);
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
        view ? applyActionStateToSelection(view, (line, col) => setActionSymbolTo(line, symbol, col), symbol) : false,
      setTopicStateOnSelection: (symbol: "o" | "." | ",") =>
        view ? applyActionStateToSelection(view, (line, col) => setTopicSymbolTo(line, symbol, col), symbol) : false,
      jumpAdjacentOpenAction: (direction: 1 | -1) =>
        view ? jumpToAdjacentOpenAction(view, direction, { showToast: (msg) => controller.showToast(msg) }) : false,
      pulseLine: (lineIdx: number) => {
        triggerLinePulse(lineIdx);
      },
      replaceLines: (fromLineIdx: number, toLineIdx: number, text: string) => {
        if (!view) return;
        const lineCount = view.state.doc.lines;
        const fromLine = Math.min(Math.max(1, fromLineIdx + 1), lineCount);
        const toLine = Math.min(Math.max(1, toLineIdx + 1), lineCount);
        const from = view.state.doc.line(fromLine).from;
        const to = view.state.doc.line(toLine).to;
        view.dispatch({
          changes: { from, to, insert: text },
        });
      },
      replaceRange: (from: number, to: number, text: string) => {
        if (!view) return;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          userEvent: "input.replace",
        });
      },
      getView: () => view,
      scrollCaretIntoView: () => {
        if (!view) return;
        view.requestMeasure();
        view.dispatch({
          effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest", yMargin: 40 }),
        });
      },
      focus: () => {
        view?.focus();
      },
      find: {
        setQuery: (q: string) => {
          lastFindQuery = q;
          applySearchQuery(true);
        },
        setReplace: (text: string) => {
          lastReplaceText = text;
          applySearchQuery(false);
        },
        setOptions: (opts: { caseSensitive?: boolean; wholeWord?: boolean }) => {
          if (opts.caseSensitive !== undefined) findCaseSensitive = opts.caseSensitive;
          if (opts.wholeWord !== undefined) findWholeWord = opts.wholeWord;
          applySearchQuery(false);
        },
        next: () => {
          if (view) findNext(view);
          recomputeFindMatch();
        },
        prev: () => {
          if (view) findPrevious(view);
          recomputeFindMatch();
        },
        replace: () => {
          if (view) {
            replaceNext(view);
            recomputeFindMatch();
          }
        },
        replaceAll: () => {
          if (!view || !lastFindQuery) return 0;
          const sq = new SearchQuery({
            search: lastFindQuery,
            replace: lastReplaceText,
            caseSensitive: findCaseSensitive,
            wholeWord: findWholeWord,
          });
          const cur = sq.getCursor(view.state);
          let count = 0;
          for (let res = cur.next(); !res.done; res = cur.next()) count++;
          if (count > 0) {
            replaceAll(view);
            recomputeFindMatch();
          }
          return count;
        },
        clear: () => {
          lastFindQuery = "";
          lastReplaceText = "";
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
        if (view) indentLines(view, dedent);
      },
      applyToken: (token) => {
        if (view) applyLineToken(view, token);
      },
    });


    // The `updateListener` above only fires on a `dispatch()`, not on the
    // initial state a view is constructed with — so it never ran for the
    // selection just set (default or restored) above. Set the status bar
    // from it directly instead of assuming (1, 1).
    const initialPos = view.state.selection.main.head;
    const initialLine = view.state.doc.lineAt(initialPos);
    controller.setStatusPosition(initialLine.number, initialPos - initialLine.from + 1);
    currentLineKind.set(lineKind(initialLine.text));
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
    // Not on a phone: there the editor's focus is what hides the bottom
    // navigation bar (§D3), and a focus without a tap does not bring up the
    // keyboard anyway.
    if (!get(controller.isMobile)) view.contentDOM.focus({ preventScroll: true });
  });

  onDestroy(() => {
    if (pulseTimer) clearTimeout(pulseTimer);
    unsubscribeWrap?.();
    unsubscribeSpell?.();
    unsubscribePeek?.();
    unsubscribeOccurrence.forEach((u) => u());
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

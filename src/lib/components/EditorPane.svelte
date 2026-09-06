<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { drawSelection, EditorView, keymap } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { indentUnit } from "@codemirror/language";
  import { glyphAtomicRanges, liveGlyphs } from "../editor/glyphs";
  import { underlineFor } from "../sectionImport";
  import { cycleActionSymbol } from "../tokens";
  import * as controller from "../controller";

  // `content` is only used as the initial document for this mount. Tab
  // switches are handled by wrapping this component in a {#key} block
  // upstream, so it fully remounts per tab instead of reacting to prop
  // changes on every keystroke (which would otherwise reset the cursor
  // and undo history on every character typed).
  export let content: string;

  let container: HTMLDivElement;
  let view: EditorView | null = null;

  function cycleLine(v: EditorView): boolean {
    const pos = v.state.selection.main.head;
    const line = v.state.doc.lineAt(pos);
    const updated = cycleActionSymbol(line.text);
    if (updated === null) return false;
    v.dispatch({ changes: { from: line.from, to: line.to, insert: updated } });
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
   * §51 — optionally indented — nesting is two spaces per level). Enter
   * adds a fresh bullet at the same indentation, using whichever marker
   * character the current line already uses (or, on an *empty* bullet,
   * removes it instead — the common "press Enter to exit a list" pattern).
   * Shift+Enter adds a plain continuation line at the same indentation,
   * no new bullet. Off a bullet line, Enter defers entirely to
   * CodeMirror's own default newline handling; Shift+Enter isn't bound
   * anywhere else, so it explicitly inserts a plain newline itself. */
  function bulletContinuation(insertBullet: boolean) {
    return (v: EditorView): boolean => {
      const pos = v.state.selection.main.head;
      const line = v.state.doc.lineAt(pos);
      const match = line.text.match(/^(\s*)([-*])\s/);
      if (!match) {
        if (insertBullet) return false;
        v.dispatch({ changes: { from: pos, to: pos, insert: "\n" }, selection: { anchor: pos + 1 }, scrollIntoView: true });
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
      { key: "Ctrl-Space", run: (v) => cycleLine(v) },
      { key: "Ctrl-Shift-s", run: (v) => convertLineToSection(v) },
      { key: "Enter", run: bulletContinuation(true) },
      { key: "Shift-Enter", run: bulletContinuation(false) },
    ]);

    view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
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
          liveGlyphs,
          glyphAtomicRanges,
          shortcuts,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              controller.updateActiveTabContent(u.state.doc.toString());
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
        ],
      }),
      parent: container,
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
    });

    controller.setStatusPosition(1, 1);
    view.focus();
  });

  onDestroy(() => {
    view?.destroy();
    controller.registerEditorApi(null);
  });
</script>

<div class="editor-host" bind:this={container}></div>

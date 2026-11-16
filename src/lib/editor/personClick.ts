/** Ctrl+click (Cmd on Mac) on an `@name` in the editor opens its Person view (F5). */
import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin } from "@codemirror/view";
import { isTitleLine, tokenizeLine, type TokenizeOptions } from "../grammar/tokenize";
import { isMac } from "../platform";

/** Name (without `@`) of the `"assignee"` token covering `col` on `lineText`, or `null`. */
export function assigneeAtCol(lineText: string, col: number, options?: TokenizeOptions): string | null {
  if (!lineText.includes("@")) return null;
  for (const tok of tokenizeLine(lineText, options)) {
    if (tok.kind === "assignee" && col >= tok.from && col <= tok.to) {
      return lineText.slice(tok.from + 1, tok.to);
    }
  }
  return null;
}

/** ViewPlugin that opens `onPersonClick(name)` on Ctrl+mousedown (Cmd+mousedown on Mac) over an `@name`. */
export function personClickPlugin(onPersonClick: (name: string) => void): Extension {
  return ViewPlugin.fromClass(
    class {},
    {
      eventHandlers: {
        mousedown(e: MouseEvent, view: EditorView) {
          const hasModifier = isMac ? e.metaKey : e.ctrlKey;
          if (!hasModifier || e.button !== 0 || e.altKey) return false;
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos === null) return false;
          const line = view.state.doc.lineAt(pos);
          const nextText = line.number < view.state.doc.lines ? view.state.doc.line(line.number + 1).text : undefined;
          const name = assigneeAtCol(line.text, pos - line.from, { title: isTitleLine(line.text, nextText) });
          if (!name) return false;
          e.preventDefault();
          e.stopPropagation();
          onPersonClick(name);
          return true;
        },
      },
    },
  );
}

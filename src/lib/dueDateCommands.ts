import { get } from "svelte/store";
import { activeTabId, dueDatePending, editorApi, showToast, tabs } from "./stores";
import { writeTabContent } from "./persistence";
import { tokenizeLine, getLineActionParts, type ActionPart } from "./grammar/tokenize";
import { pickActionSymbol, withDueDate, type ActionSymbolRef } from "./tokens";
import { t } from "./i18n";

/** Sets the due date of the action part on `lineIdx` in `tabId`.
 * Replaces any existing due/dueWord token with `by:<iso>`, appends ` by:<iso>` before trailing links,
 * or with `null` removes the token and the preceding space. */
export function setDueDateAt(tabId: string, lineIdx: number, partFrom: number, iso: string | null): void {
  const activeId = get(activeTabId);
  const view = editorApi?.getView?.();

  if (tabId === activeId && view) {
    const lineCount = view.state.doc.lines;
    const targetLineNum = Math.min(Math.max(1, lineIdx + 1), lineCount);
    const docLine = view.state.doc.line(targetLineNum);
    const newLineText = withDueDate(docLine.text, partFrom, iso);

    if (newLineText !== docLine.text) {
      const sel = view.state.selection.main;
      const delta = newLineText.length - docLine.text.length;
      let newAnchor = sel.anchor;
      let newHead = sel.head;

      if (sel.anchor >= docLine.from && sel.anchor <= docLine.to) {
        const offset = sel.anchor - docLine.from;
        newAnchor = Math.min(docLine.from + Math.max(0, offset + delta), docLine.from + newLineText.length);
      }
      if (sel.head >= docLine.from && sel.head <= docLine.to) {
        const offset = sel.head - docLine.from;
        newHead = Math.min(docLine.from + Math.max(0, offset + delta), docLine.from + newLineText.length);
      }

      view.dispatch({
        changes: { from: docLine.from, to: docLine.to, insert: newLineText },
        selection: { anchor: newAnchor, head: newHead },
        userEvent: "input.dueDate",
        scrollIntoView: true,
      });
    }
    return;
  }

  if (tabId === activeId && editorApi?.replaceLines) {
    const tab = get(tabs).find((t) => t.id === tabId);
    if (tab) {
      const lines = tab.content.split("\n");
      const currentLine = lines[lineIdx] ?? "";
      const newLineText = withDueDate(currentLine, partFrom, iso);
      if (newLineText !== currentLine) {
        editorApi.replaceLines(lineIdx, lineIdx, newLineText);
      }
    }
    return;
  }

  // Fallback when tab is not currently the active editor
  const tab = get(tabs).find((t) => t.id === tabId);
  if (tab) {
    const lines = tab.content.split("\n");
    if (lineIdx >= 0 && lineIdx < lines.length) {
      const newLineText = withDueDate(lines[lineIdx], partFrom, iso);
      if (newLineText !== lines[lineIdx]) {
        lines[lineIdx] = newLineText;
        const newContent = lines.join("\n");
        tabs.update((list) => writeTabContent(tabId, newContent, list));
      }
    }
  }
}

/** Opens the due date picker for the action part at or nearest left of the caret.
 * If the line has no action parts, shows toast `dueDate.toast.noAction` and does nothing. */
export function openDueDatePicker(): void {
  const tabId = get(activeTabId);
  const tab = get(tabs).find((t) => t.id === tabId);
  if (!tab) return;

  let lineIdx = 0;
  let col = 0;
  let lineText = "";

  const view = editorApi?.getView?.();
  if (view) {
    const sel = view.state.selection.main;
    const docLine = view.state.doc.lineAt(sel.head);
    lineIdx = docLine.number - 1;
    lineText = docLine.text;
    col = sel.head - docLine.from;
  } else if (editorApi) {
    lineIdx = editorApi.getCursorLineIdx();
    const selRange = editorApi.getSelectionRange?.();
    const lines = tab.content.split("\n");
    lineText = lines[lineIdx] ?? "";
    if (selRange) {
      let running = 0;
      for (let i = 0; i < lineIdx; i++) {
        running += (lines[i]?.length ?? 0) + 1;
      }
      col = Math.max(0, Math.min(selRange.head - running, lineText.length));
    }
  } else {
    return;
  }

  const tokens = tokenizeLine(lineText);
  const actionParts = getLineActionParts(lineText, tokens);
  if (actionParts.length === 0) {
    showToast(get(t)("dueDate.toast.noAction", undefined));
    return;
  }

  const symbolRefs: (ActionSymbolRef & { part: ActionPart })[] = [];
  for (const part of actionParts) {
    let symIdx = part.from;
    const actionTok = tokens.find(
      (tok) =>
        (tok.kind === "action" || tok.kind === "consequence" || tok.kind === "assignee") &&
        tok.from >= part.from &&
        tok.from < part.to,
    );
    if (actionTok) {
      symIdx = actionTok.from;
    }
    symbolRefs.push({
      index: symIdx,
      sym: part.state ?? "@",
      part,
    });
  }

  const picked = pickActionSymbol(symbolRefs, col) as (ActionSymbolRef & { part: ActionPart }) | null;
  const targetPart = picked ? picked.part : actionParts[0];
  const targetPartFrom = picked ? picked.index : targetPart.from;

  let anchor = { left: 0, top: 0, bottom: 0 };
  if (view) {
    const lineFrom = view.state.doc.line(lineIdx + 1).from;
    const dueTok = tokens.find(
      (tok) =>
        (tok.kind === "due" || tok.kind === "dueWord") &&
        tok.from >= targetPart.from &&
        tok.from < targetPart.to,
    );
    if (dueTok) {
      const c1 = view.coordsAtPos(lineFrom + dueTok.from);
      const c2 = view.coordsAtPos(lineFrom + dueTok.to);
      if (c1 || c2) {
        anchor = {
          left: (c1 ?? c2)!.left,
          top: Math.min(c1?.top ?? c2!.top, c2?.top ?? c1!.top),
          bottom: Math.max(c1?.bottom ?? c2!.bottom, c2?.bottom ?? c1!.bottom),
        };
      }
    } else {
      const caret = view.coordsAtPos(view.state.selection.main.head);
      if (caret) {
        anchor = { left: caret.left, top: caret.top, bottom: caret.bottom };
      }
    }
  }

  dueDatePending.set({
    tabId,
    lineIdx,
    partFrom: targetPartFrom,
    anchor,
  });
}

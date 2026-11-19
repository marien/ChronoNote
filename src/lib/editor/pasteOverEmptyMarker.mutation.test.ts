import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState, Transaction } from "@codemirror/state";
import { get } from "svelte/store";
import { mergePasteOverEmptyMarker, pasteOverEmptyMarker, rewritePasted } from "./pasteOverEmptyMarker";
import { currentDateISO, languageMode, tabs } from "../stores";
import { _pasteDeferLinkForTest, handlePasteIntoTab, notifyTabClosed, recordCopiedAction } from "../paste";
import type { NoteTab } from "../types";

const initialLanguageMode = get(languageMode);
const initialDateISO = get(currentDateISO);

afterEach(() => {
  languageMode.set(initialLanguageMode);
  currentDateISO.set(initialDateISO);
  tabs.set([]);
  notifyTabClosed("src");
  vi.useRealTimers();
});

function pasteTr(
  doc: string,
  changes: { from: number; to?: number; insert: string } | { from: number; to?: number; insert: string }[],
  caret: number,
  userEvent = "input.paste",
  selectionAfter?: { anchor: number; head?: number },
  scrollIntoView?: boolean,
): Transaction {
  const state = EditorState.create({ doc, selection: { anchor: caret }, extensions: [pasteOverEmptyMarker] });
  return state.update({ changes, selection: selectionAfter, userEvent, scrollIntoView });
}

describe("pasteOverEmptyMarker mutation rules", () => {
  describe("rewritePasted due-word locale and forward-link rules", () => {
    it("rewrites UI-language due words (today and tomorrow) using the active locale", () => {
      currentDateISO.set("2026-10-22");
      languageMode.set("nl");
      expect(rewritePasted("# bel by:vandaag\n# bel by:morgen")).toBe(
        "# bel by:2026-10-22\n# bel by:2026-10-23",
      );
    });

    it("appends forward from-links only to open actions, never to plain or resolved lines", () => {
      expect(
        rewritePasted("plain note\n# open task\nv done task", [
          " (<2026-10-20#S)",
          " (<2026-10-20#S)",
          " (<2026-10-20#S)",
        ]),
      ).toBe("plain note\n# open task (<2026-10-20#S)\nv done task");
    });
  });

  describe("mergePasteOverEmptyMarker single-line, multi-line, and trailing-newline rules", () => {
    it("merges onto an empty marker when only whitespace follows the caret", () => {
      expect(mergePasteOverEmptyMarker("# ", "   ", "# call Dana")).toEqual({
        deleteBefore: 2,
        insert: "# call Dana",
      });
    });

    it("single-line paste replaces empty marker without extra lines", () => {
      const tr = pasteTr("  # ", { from: 4, insert: "# call Dana" }, 4);
      expect(tr.state.doc.toString()).toBe("  # call Dana");
    });

    it("multi-line paste keeps blank lines and trailing newlines empty without adding target indent", () => {
      expect(mergePasteOverEmptyMarker("  # ", "", "# first\n\n# second\n")).toEqual({
        deleteBefore: 2,
        insert: "# first\n\n  # second\n",
      });

      const tr = pasteTr("  # ", { from: 4, insert: "# first\n" }, 4);
      expect(tr.state.doc.toString()).toBe("  # first\n");
    });

    it("preserves deeper relative indentation on child lines and strips all leading indent on shallower lines", () => {
      expect(mergePasteOverEmptyMarker("  # ", "", "    # parent\n      # child\n  # sibling\n# root")).toEqual({
        deleteBefore: 2,
        insert: "# parent\n    # child\n  # sibling\n  # root",
      });
    });
  });

  describe("pasteOverEmptyMarker transaction filter rules", () => {
    it("does not rewrite or merge multi-hunk input.paste transactions that include a deletion", () => {
      currentDateISO.set("2026-10-22");
      const tr = pasteTr(
        "x\n# ",
        [
          { from: 0, to: 1, insert: "" },
          { from: 4, to: 4, insert: "# call by:tomorrow" },
        ],
        4,
        "input.paste",
      );
      expect(tr.state.doc.toString()).toBe("\n# # call by:tomorrow");
    });

    it("on move.drop, blocks merge only when a deletion touches before the drop position on the same line", () => {
      // Deletion ends right at target line start (offset 12): safe to merge
      const safeBeforeLine = pasteTr(
        "# call Dana\n# ",
        [
          { from: 0, to: 12, insert: "" },
          { from: 14, to: 14, insert: "# call Dana" },
        ],
        14,
        "move.drop",
      );
      expect(safeBeforeLine.state.doc.toString()).toBe("# call Dana");

      // Deletion touches before drop position on the same empty-marker line: do not merge
      const touchedBefore = pasteTr(
        "  # ",
        [
          { from: 0, to: 2, insert: "" },
          { from: 4, to: 4, insert: "# x" },
        ],
        4,
        "move.drop",
      );
      expect(touchedBefore.state.doc.toString()).toBe("# # x");

      // Deletion starts at the drop position (replacing rest of empty marker line): safe to merge
      const startsAtDrop = pasteTr(
        "# abc",
        [
          { from: 2, to: 5, insert: "" },
          { from: 2, to: 2, insert: "# x" },
        ],
        2,
        "move.drop",
      );
      expect(startsAtDrop.state.doc.toString()).toBe("# x");

      // Deletion starts after the drop position (on a later line): safe to merge
      const startsAfterDrop = pasteTr(
        "# \nabc",
        [
          { from: 3, to: 6, insert: "" },
          { from: 2, to: 2, insert: "# x" },
        ],
        2,
        "move.drop",
      );
      expect(startsAfterDrop.state.doc.toString()).toBe("# x\n");
    });

    it("does not merge when a paste replaces text spanning into another line", () => {
      const tr = pasteTr("# \nsecond", { from: 2, to: 9, insert: "# repl" }, 2);
      expect(tr.state.doc.toString()).toBe("# # repl");
    });

    it("returns plain unchanged pastes untouched without altering selection or scrollIntoView", () => {
      const tr = pasteTr("hello ", { from: 6, insert: "world" }, 6, "input.paste", { anchor: 0 }, false);
      expect(tr.state.doc.toString()).toBe("hello world");
      expect(tr.state.selection.main.head).toBe(0);
      expect(tr.scrollIntoView).toBe(false);
    });

    it("preserves drop userEvent and enables scrollIntoView when rewriting a paste or drop", () => {
      currentDateISO.set("2026-10-22");
      const dropTr = pasteTr("# ", { from: 2, insert: "# call by:tomorrow" }, 2, "input.drop");
      expect(dropTr.state.doc.toString()).toBe("# call by:2026-10-23");
      expect(dropTr.annotation(Transaction.userEvent)).toBe("input.drop");
      expect(dropTr.scrollIntoView).toBe(true);
    });

    it("only updates the paste-defer link when the transaction itself carried pending forward suffixes", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 22, 12, 0, 0));
      currentDateISO.set("2026-10-22");

      const makeTab = (id: string, filename: string, content: string): NoteTab => ({
        id,
        filename,
        isScratchpad: false,
        content,
      });
      tabs.set([
        makeTab("src", "2026-10-22.txt", "# first task\n"),
        makeTab("dst", "2026-10-23.txt", ""),
      ]);
      recordCopiedAction("# first task", "src", 0);
      handlePasteIntoTab("dst", "# first task", { targetLineIdx: 0, targetDocText: "" });
      pasteTr("", { from: 0, insert: "# first task" }, 0, "input.paste");

      const linkBefore = _pasteDeferLinkForTest()?.pastedBlock;
      expect(linkBefore).toBe("# first task (<2026-10-22)");

      // Subsequent non-forwarding paste with due-word rewrite must not clobber the active paste-defer link
      pasteTr("", { from: 0, insert: "# unrelated by:tomorrow" }, 0, "input.paste");
      expect(_pasteDeferLinkForTest()?.pastedBlock).toBe(linkBefore);
    });
  });
});

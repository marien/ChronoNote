import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

const apiMock = vi.hoisted(() => ({
  writeNote: vi.fn(async () => ({
    exists: true,
    contentHash: null,
    sizeBytes: null,
    modifiedMs: null,
  })),
}));
vi.mock("./tauriApi", () => apiMock);

import {
  _pasteDeferLinkForTest,
  countOpenActionsInText,
  deferOpenActionsInText,
  forwardLink,
  handlePasteIntoTab,
  notifyTabClosed,
  onEditorRedo,
  onEditorUndo,
  recordCopiedAction,
  setPendingPasteFrom,
  takePendingPasteFrom,
  updatePasteDeferPastedBlock,
  withFromLink,
  withToLink,
} from "./paste";
import { currentDateISO, languageMode, tabs, toastMessage } from "./stores";
import type { NoteTab } from "./types";

function tab(id: string, filename: string, content: string, isScratchpad = false): NoteTab {
  return { id, filename, content, isScratchpad };
}

describe("paste link formatting", () => {
  it("forwardLink omits the hash when the section name is empty and includes it otherwise", () => {
    expect(forwardLink(">", "2026-10-15", "")).toBe(" (>2026-10-15)");
    expect(forwardLink("<", "2026-10-15", "Standup")).toBe(" (<2026-10-15#Standup)");
  });

  it("withToLink leaves the line unchanged when the link text is empty", () => {
    expect(withToLink("> task  ", "")).toBe("> task  ");
    expect(withToLink("> task (>2026-10-10#Old)", "")).toBe("> task (>2026-10-10#Old)");
  });

  it("withToLink leaves the line unchanged when the link text is blank", () => {
    expect(withToLink("> task  ", "   ")).toBe("> task  ");
    expect(withToLink("> task  ", " \t \n ")).toBe("> task  ");
  });

  it("withToLink trims trailing spaces from the base while keeping leading indentation", () => {
    expect(withToLink("  > task   ", "(>2026-10-15#Planning)")).toBe("  > task (>2026-10-15#Planning)");
    expect(withToLink("  > task   (>2026-10-10#Old)", " (>2026-10-15#Planning)")).toBe(
      "  > task (>2026-10-15#Planning)",
    );
    expect(withToLink("  > task   (<2026-10-05#Start)   (>2026-10-10#Old)", "(>2026-10-15#Planning)")).toBe(
      "  > task   (<2026-10-05#Start) (>2026-10-15#Planning)",
    );
  });

  it("withFromLink leaves the line unchanged when the link text is empty", () => {
    expect(withFromLink("# task  ", "")).toBe("# task  ");
    expect(withFromLink("# task (<2026-10-01#Old)", "")).toBe("# task (<2026-10-01#Old)");
  });

  it("withFromLink leaves the line unchanged when the link text is blank", () => {
    expect(withFromLink("# task  ", "   ")).toBe("# task  ");
    expect(withFromLink("# task  ", "\t  ")).toBe("# task  ");
  });

  it("withFromLink trims trailing spaces from the base while keeping leading indentation", () => {
    expect(withFromLink("  # task   ", "(<2026-10-05#Start)")).toBe("  # task (<2026-10-05#Start)");
    expect(withFromLink("  # task   (<2026-10-01#Old)", " (<2026-10-05#Start)")).toBe(
      "  # task (<2026-10-05#Start)",
    );
  });
});

describe("deferOpenActionsInText and countOpenActionsInText", () => {
  it("counts and defers consequence open topics (=> o to => ,)", () => {
    const input = "v done => o follow up";
    expect(countOpenActionsInText(input)).toBe(1);
    expect(deferOpenActionsInText(input)).toBe("v done => , follow up");
  });
});

describe("paste-forward state and edge rules", () => {
  beforeEach(() => {
    apiMock.writeNote.mockClear();
    currentDateISO.set("2026-09-15");
    languageMode.set("en");
    toastMessage.set("");
    tabs.set([]);
    setPendingPasteFrom(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
    notifyTabClosed("src");
    notifyTabClosed("today");
    languageMode.set("system");
    toastMessage.set("");
    setPendingPasteFrom(null);
  });

  it("copying plain text with no open actions clears any previously remembered action", () => {
    tabs.set([
      tab("src", "2026-08-01.txt", "# open\nplain line"),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction("# open", "src", 0);
    recordCopiedAction("plain line", "src", 7);

    expect(handlePasteIntoTab("today", "plain line")).toBeNull();
    expect(get(tabs)[0].content).toBe("# open\nplain line");
  });

  it("clears pendingPasteFrom when a paste does not forward-defer", () => {
    tabs.set([
      tab("src", "2026-08-01.txt", "# open"),
      tab("today", "2026-09-15.txt", ""),
      tab("scratch", "Scratchpad 1", "", true),
    ]);

    setPendingPasteFrom([" (<2026-08-01)"]);
    expect(handlePasteIntoTab("today")).toBeNull();
    expect(takePendingPasteFrom()).toBeNull();

    recordCopiedAction("# open", "src", 0);
    setPendingPasteFrom([" (<2026-08-01)"]);
    expect(handlePasteIntoTab("today", "different text")).toBeNull();
    expect(takePendingPasteFrom()).toBeNull();

    recordCopiedAction("# open", "src", 0);
    setPendingPasteFrom([" (<2026-08-01)"]);
    expect(handlePasteIntoTab("scratch", "# open")).toBeNull();
    expect(takePendingPasteFrom()).toBeNull();

    recordCopiedAction("# open", "missing-tab", 0);
    setPendingPasteFrom([" (<2026-08-01)"]);
    expect(handlePasteIntoTab("today", "# open")).toBeNull();
    expect(takePendingPasteFrom()).toBeNull();
  });

  it("clears the paste-defer undo link when the target tab closes, and keeps it when an unrelated tab closes", () => {
    tabs.set([
      tab("src", "2026-08-01.txt", "# task"),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction("# task", "src", 0);
    handlePasteIntoTab("today", "# task");
    expect(_pasteDeferLinkForTest()).not.toBeNull();

    notifyTabClosed("other");
    expect(_pasteDeferLinkForTest()).not.toBeNull();

    notifyTabClosed("today");
    expect(_pasteDeferLinkForTest()).toBeNull();
  });

  it("updatePasteDeferPastedBlock updates the tracked text only while an un-reverted link is active", () => {
    updatePasteDeferPastedBlock("ignored");
    expect(_pasteDeferLinkForTest()).toBeNull();

    tabs.set([
      tab("src", "2026-08-01.txt", "# task"),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction("# task", "src", 0);
    handlePasteIntoTab("today", "# task");

    updatePasteDeferPastedBlock("# task rewritten");
    expect(_pasteDeferLinkForTest()?.pastedBlock).toBe("# task rewritten");

    onEditorUndo("today", "# task rewritten", "");
    expect(_pasteDeferLinkForTest()?.reverted).toBe(true);
    updatePasteDeferPastedBlock("# changed while reverted");
    expect(_pasteDeferLinkForTest()?.pastedBlock).toBe("# task rewritten");
  });

  it("defers a partial-line copy without appending a forward link, and appends one for CRLF-terminated lines", () => {
    tabs.set([
      tab("src", "2026-08-01.txt", "# task and more\n"),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction("# task", "src", 0);
    handlePasteIntoTab("today", "# task");
    expect(get(tabs)[0].content).toBe("> task and more\n");

    tabs.set([
      tab("src", "2026-08-01.txt", "# task\r\nnext"),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction("# task", "src", 0);
    handlePasteIntoTab("today", "# task");
    expect(get(tabs)[0].content).toBe("> task (>2026-09-15)\r\nnext");
  });

  it("falls back to searching the source tab when the recorded offset no longer matches", () => {
    tabs.set([
      tab("src", "2026-08-01.txt", "Standup\n=======\n# task\n"),
      tab("today", "2026-09-15.txt", ""),
    ]);
    const originalOffset = get(tabs)[0].content.indexOf("# task");
    recordCopiedAction("# task", "src", originalOffset);

    // Edit earlier in the source tab so the recorded offset shifts before pasting.
    tabs.set([
      tab("src", "2026-08-01.txt", "Standup\n=======\nprep\n# task\n"),
      tab("today", "2026-09-15.txt", ""),
    ]);
    const fromSuffixes = handlePasteIntoTab("today", "# task");
    expect(fromSuffixes).toEqual([" (<2026-08-01#Standup)"]);
    expect(get(tabs)[0].content).toBe("Standup\n=======\nprep\n> task (>2026-09-15)\n");

    // Shift again before undo and redo to exercise the fallback replacement paths too.
    tabs.set([
      tab("src", "2026-08-01.txt", "Standup\n=======\nmore prep\n> task (>2026-09-15)\n"),
      tab("today", "2026-09-15.txt", ""),
    ]);
    onEditorUndo("today", "# task (<2026-08-01#Standup)", "");
    expect(get(tabs)[0].content).toBe("Standup\n=======\nmore prep\n# task\n");

    onEditorRedo("today", "", "# task (<2026-08-01#Standup)");
    expect(get(tabs)[0].content).toBe("Standup\n=======\nmore prep\n> task (>2026-09-15)\n");
  });

  it("ignores undo and redo when no link exists, when already in that state, in another tab, or on unrelated redos", () => {
    tabs.set([
      tab("other", "2026-08-02.txt", "# unrelated"),
      tab("today", "2026-09-15.txt", ""),
      tab("src", "2026-08-01.txt", "# task"),
    ]);

    // No link yet: neither should throw or change anything.
    onEditorUndo("today", "# task", "");
    onEditorRedo("today", "", "# task");
    expect(get(tabs)[2].content).toBe("# task");

    recordCopiedAction("# task", "src", 0);
    handlePasteIntoTab("today", "# task");
    expect(get(tabs)[2].content).toBe("> task (>2026-09-15)");

    // Not reverted yet: redo is a no-op.
    onEditorRedo("today", "", "# task (<2026-08-01)");
    expect(get(tabs)[2].content).toBe("> task (>2026-09-15)");
    expect(_pasteDeferLinkForTest()?.reverted).toBe(false);

    // Undo finds src even when other tabs precede it in the store.
    onEditorUndo("today", "# task (<2026-08-01)", "");
    expect(get(tabs)[2].content).toBe("# task");
    expect(_pasteDeferLinkForTest()?.reverted).toBe(true);

    // Already reverted: a second undo is a no-op and keeps the link alive.
    toastMessage.set("");
    onEditorUndo("today", "# task (<2026-08-01)", "");
    expect(get(toastMessage)).toBe("");
    expect(_pasteDeferLinkForTest()?.reverted).toBe(true);

    // Redo in a different tab or for an edit where the block was already present or stays absent is ignored.
    onEditorRedo("other", "", "# task (<2026-08-01)");
    onEditorRedo("today", "# task (<2026-08-01)", "# task (<2026-08-01)\nextra");
    onEditorRedo("today", "plain", "still plain");
    expect(get(tabs)[2].content).toBe("# task");
    expect(_pasteDeferLinkForTest()?.reverted).toBe(true);

    // Valid redo finds src even after other tabs, and re-defers it.
    onEditorRedo("today", "", "# task (<2026-08-01)");
    expect(get(tabs)[2].content).toBe("> task (>2026-09-15)");
    expect(_pasteDeferLinkForTest()?.reverted).toBe(false);

    // Undo again, then hand-edit src so openBlock is gone before redo: link is dropped.
    onEditorUndo("today", "# task (<2026-08-01)", "");
    tabs.set([
      tab("other", "2026-08-02.txt", "# unrelated"),
      tab("today", "2026-09-15.txt", ""),
      tab("src", "2026-08-01.txt", "x task"),
    ]);
    onEditorRedo("today", "", "# task (<2026-08-01)");
    expect(get(tabs)[2].content).toBe("x task");
    expect(_pasteDeferLinkForTest()).toBeNull();
  });

  it("uses sourceOffset on undo and redo to disambiguate identical action lines", () => {
    const content = "# task\n# task";
    tabs.set([
      tab("src", "2026-08-01.txt", content),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction("# task", "src", 7);
    handlePasteIntoTab("today", "# task");
    expect(get(tabs)[0].content).toBe("# task\n> task (>2026-09-15)");

    onEditorUndo("today", "# task (<2026-08-01)", "");
    expect(get(tabs)[0].content).toBe("# task\n# task");

    onEditorRedo("today", "", "# task (<2026-08-01)");
    expect(get(tabs)[0].content).toBe("# task\n> task (>2026-09-15)");

    // When an earlier identical deferred line exists, undo flips only the one at sourceOffset.
    const alreadyDeferred = "> task (>2026-09-15)\n# task";
    const secondOffset = alreadyDeferred.indexOf("# task");
    tabs.set([
      tab("src", "2026-08-01.txt", alreadyDeferred),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction("# task", "src", secondOffset);
    handlePasteIntoTab("today", "# task");
    expect(get(tabs)[0].content).toBe("> task (>2026-09-15)\n> task (>2026-09-15)");

    onEditorUndo("today", "# task (<2026-08-01)", "");
    expect(get(tabs)[0].content).toBe("> task (>2026-09-15)\n# task");
  });

  it("shows count/filename toasts and matches multi-line pasted blocks on undo and redo", () => {
    tabs.set([
      tab("src", "2026-08-01.txt", "# one\n# two"),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction("# one\n# two", "src", 0);
    handlePasteIntoTab("today", "# one\n# two");
    expect(get(toastMessage)).toBe("2 original tasks on 2026-08-01.txt marked deferred");
    expect(get(tabs)[0].content).toBe("> one (>2026-09-15)\n> two (>2026-09-15)");

    onEditorUndo("today", "# one (<2026-08-01)\n# two (<2026-08-01)", "");
    expect(get(toastMessage)).toBe("2 deferred tasks on 2026-08-01.txt restored to open");
    expect(get(tabs)[0].content).toBe("# one\n# two");

    onEditorRedo("today", "", "# one (<2026-08-01)\n# two (<2026-08-01)");
    expect(get(toastMessage)).toBe("2 tasks on 2026-08-01.txt deferred again");
    expect(get(tabs)[0].content).toBe("> one (>2026-09-15)\n> two (>2026-09-15)");
  });

  it("uses next-line lookahead (not previous line) when building multi-line pastedBlock", () => {
    const copied = "=========\n# Heading";
    tabs.set([
      tab("src", "2026-08-01.txt", copied),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction(copied, "src", 0);
    handlePasteIntoTab("today", copied);
    expect(_pasteDeferLinkForTest()?.pastedBlock).toBe("=========\n# Heading (<2026-08-01)");
  });

  it("reads source section from effectiveOffset and appends forward link when copy ends with a newline", () => {
    const srcText = "First\n=====\n# other\n\nSecond\n======\n# task\nrest";
    const offset = srcText.indexOf("# task");
    tabs.set([
      tab("src", "2026-08-01.txt", srcText),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction("# task\n", "src", offset);
    const fromSuffixes = handlePasteIntoTab("today", "# task\n");
    expect(fromSuffixes).toEqual([" (<2026-08-01#Second)", ""]);
    expect(get(tabs)[0].content).toBe("First\n=====\n# other\n\nSecond\n======\n> task (>2026-09-15)\nrest");
  });

  it("rewrites locale due-date words (today/tomorrow) in pastedBlock and matches them on redo", () => {
    languageMode.set("nl");
    tabs.set([
      tab("src", "2026-08-01.txt", "# task by:vandaag\n# next by:morgen"),
      tab("today", "2026-09-15.txt", ""),
    ]);
    recordCopiedAction("# task by:vandaag\n# next by:morgen", "src", 0);
    handlePasteIntoTab("today", "# task by:vandaag\n# next by:morgen");
    const expectedPasted = "# task by:2026-09-15 (<2026-08-01)\n# next by:2026-09-16 (<2026-08-01)";
    expect(_pasteDeferLinkForTest()?.pastedBlock).toBe(expectedPasted);

    onEditorUndo("today", expectedPasted, "");
    expect(get(tabs)[0].content).toBe("# task by:vandaag\n# next by:morgen");

    onEditorRedo("today", "", expectedPasted);
    expect(get(tabs)[0].content).toBe("> task by:vandaag (>2026-09-15)\n> next by:morgen (>2026-09-15)");
  });
});

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
import { currentDateISO, tabs } from "./stores";
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
    tabs.set([]);
    setPendingPasteFrom(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
    notifyTabClosed("src");
    notifyTabClosed("today");
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
});

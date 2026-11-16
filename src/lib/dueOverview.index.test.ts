import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { currentDateISO, tabs } from "./stores";
import { clearDiskLayer, seedDiskNotesForTest } from "./notesIndex/diskLayer";
import { _facetRuns } from "./notesIndex/facets";
import { noteClosingWithContent } from "./persistence";
import * as tokens from "./tokens";
import { _dueOverviewRuns, dueSummary, overdueCount } from "./dueOverview";

describe("dueOverview reading notesIndex", () => {
  beforeEach(() => {
    clearDiskLayer();
    tabs.set([]);
    currentDateISO.set("2026-11-08");
  });

  it("counts an overdue action from a disk note", () => {
    seedDiskNotesForTest({
      "2026-11-05.txt": "# send draft by:2026-11-06",
    });

    expect(get(overdueCount)).toBe(1);
    expect(get(dueSummary).overdue).toBe(1);
  });

  it("keystroke in an open tab updates counts to 0 and reuses every other entry", () => {
    seedDiskNotesForTest({
      "2026-11-04.txt": "# future note by:2026-11-20",
      "2026-11-05.txt": "# send draft by:2026-11-06",
    });
    tabs.set([
      {
        id: "tab-1",
        filename: "2026-11-05.txt",
        isScratchpad: false,
        content: "# send draft by:2026-11-06",
      },
    ]);

    const spy = vi.spyOn(tokens, "countOverdue");
    try {
      expect(get(overdueCount)).toBe(1);
      expect(get(dueSummary).overdue).toBe(1);

      spy.mockClear();
      const summarizeBefore = _dueOverviewRuns.summarize;

      tabs.set([
        {
          id: "tab-1",
          filename: "2026-11-05.txt",
          isScratchpad: false,
          content: "v send draft by:2026-11-06",
        },
      ]);

      expect(get(overdueCount)).toBe(0);
      expect(get(dueSummary).overdue).toBe(0);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(_dueOverviewRuns.summarize - summarizeBefore).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("counts a scratchpad tab and uses its display name as item filename", () => {
    tabs.set([
      {
        id: "scratch-1",
        filename: "Scratchpad 1",
        isScratchpad: true,
        content: "# x by:2026-11-07",
      },
    ]);

    expect(get(overdueCount)).toBe(1);
    const summary = get(dueSummary);
    expect(summary.overdue).toBe(1);
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].filename).toBe("Scratchpad 1");
    expect(summary.items[0].text).toBe("x");
  });

  it("closing a tab without a refresh keeps counting the text it closed with — allowed difference (design 8)", () => {
    seedDiskNotesForTest({
      "2026-11-05.txt": "",
    });
    tabs.set([
      {
        id: "tab-1",
        filename: "2026-11-05.txt",
        isScratchpad: false,
        content: "# a by:2026-11-06",
      },
    ]);

    expect(get(overdueCount)).toBe(1);
    expect(get(dueSummary).overdue).toBe(1);

    noteClosingWithContent("2026-11-05.txt", "# a by:2026-11-06");
    tabs.set([]);

    expect(get(overdueCount)).toBe(1);
    const summary = get(dueSummary);
    expect(summary.overdue).toBe(1);
    expect(summary.items.map((i) => i.text)).toEqual(["a"]);
  });

  it("reuse: with three disk notes and one tab, typing twice recomputes only one entry per keystroke", () => {
    seedDiskNotesForTest({
      "2026-11-01.txt": "# disk one by:2026-11-02",
      "2026-11-02.txt": "# disk two by:2026-11-03",
      "2026-11-03.txt": "# disk three by:2026-11-04",
    });
    tabs.set([
      {
        id: "tab-4",
        filename: "2026-11-04.txt",
        isScratchpad: false,
        content: "# tab initial by:2026-11-05",
      },
    ]);

    const spy = vi.spyOn(tokens, "countOverdue");
    let latestCount = 0;
    let latestOverdue = 0;
    const unsubCount = overdueCount.subscribe((n) => (latestCount = n));
    const unsubSummary = dueSummary.subscribe((s) => (latestOverdue = s.overdue));
    try {
      expect(latestCount).toBe(4);
      expect(latestOverdue).toBe(4);

      spy.mockClear();
      let summarizeBefore = _dueOverviewRuns.summarize;

      // Keystroke 1
      tabs.set([
        {
          id: "tab-4",
          filename: "2026-11-04.txt",
          isScratchpad: false,
          content: "# tab edited 1 by:2026-11-05",
        },
      ]);
      expect(latestCount).toBe(4);
      expect(latestOverdue).toBe(4);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(_dueOverviewRuns.summarize - summarizeBefore).toBe(1);

      spy.mockClear();
      summarizeBefore = _dueOverviewRuns.summarize;

      // Keystroke 2
      tabs.set([
        {
          id: "tab-4",
          filename: "2026-11-04.txt",
          isScratchpad: false,
          content: "# tab edited 2 by:2026-11-05\n# extra by:2026-11-06",
        },
      ]);
      expect(latestCount).toBe(5);
      expect(latestOverdue).toBe(5);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(_dueOverviewRuns.summarize - summarizeBefore).toBe(1);
    } finally {
      unsubCount();
      unsubSummary();
      spy.mockRestore();
    }
  });

  it("a day change recomputes every entry once without invalidating dueOf", () => {
    seedDiskNotesForTest({
      "2026-11-01.txt": "# overdue alpha by:2026-11-02",
      "2026-11-08.txt": "# due on nov 8 by:2026-11-08",
    });
    tabs.set([
      {
        id: "tab-1",
        filename: "2026-11-09.txt",
        isScratchpad: false,
        content: "# due on nov 9 by:2026-11-09",
      },
    ]);

    const spy = vi.spyOn(tokens, "countOverdue");
    let latestCount = 0;
    let latestSummary = get(dueSummary);
    const unsubCount = overdueCount.subscribe((n) => (latestCount = n));
    const unsubSummary = dueSummary.subscribe((s) => (latestSummary = s));
    try {
      expect(latestCount).toBe(1);
      expect(latestSummary.overdue).toBe(1);
      expect(latestSummary.dueToday).toBe(1);
      expect(latestSummary.upcoming).toBe(2);

      spy.mockClear();
      const summarizeBefore = _dueOverviewRuns.summarize;
      const dueFacetBefore = _facetRuns.due;

      currentDateISO.set("2026-11-09");

      expect(latestCount).toBe(2);
      expect(latestSummary.overdue).toBe(2);
      expect(latestSummary.dueToday).toBe(1);
      expect(latestSummary.upcoming).toBe(1);
      expect(spy).toHaveBeenCalledTimes(3);
      expect(_dueOverviewRuns.summarize - summarizeBefore).toBe(3);
      expect(_facetRuns.due - dueFacetBefore).toBe(0);
    } finally {
      unsubCount();
      unsubSummary();
      spy.mockRestore();
    }
  });
});

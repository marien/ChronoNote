import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { allNotesCache, currentDateISO, tabs } from "./stores";
import * as tokens from "./tokens";
import {
  _resetMemoForTest,
  dueGroupForDate,
  getSundayOfIsoWeek,
  groupByDue,
  itemDueDate,
  overdueCount,
  overdueCountMemo,
} from "./dueOverview";
import type { NoteTab } from "./types";

describe("overdueCount store", () => {
  beforeEach(() => {
    _resetMemoForTest();
    allNotesCache.set({});
    tabs.set([]);
    currentDateISO.set("2026-10-23");
  });

  it("counts overdue actions across several notes in cache", () => {
    allNotesCache.set({
      "2026-10-20.txt": "# overdue 1 by:2026-10-20\n# overdue 2 by:2026-10-21",
      "2026-10-21.txt": "# overdue 3 by:2026-10-22",
      "2026-10-22.txt": "# not overdue by:2026-10-24",
    });
    expect(get(overdueCount)).toBe(3);
  });

  it("open non-scratchpad tab's live content replaces cached file text", () => {
    allNotesCache.set({
      "2026-10-20.txt": "# task 1 by:2026-10-20\n# task 2 by:2026-10-21",
    });
    expect(get(overdueCount)).toBe(2);

    // Tab opens and user marks task 1 done in place (v)
    tabs.set([
      {
        id: "tab-1",
        filename: "2026-10-20.txt",
        isScratchpad: false,
        content: "v task 1 by:2026-10-20\n# task 2 by:2026-10-21",
      },
    ]);
    expect(get(overdueCount)).toBe(1);
  });

  it("open scratchpad tabs count towards overdue total", () => {
    allNotesCache.set({
      "2026-10-20.txt": "# note action by:2026-10-20",
    });
    const scratchTab: NoteTab = {
      id: "scratch-1",
      filename: "Scratchpad 1",
      isScratchpad: true,
      content: "# scratch action by:2026-10-21\n# later scratch by:2026-10-30",
    };
    tabs.set([scratchTab]);
    expect(get(overdueCount)).toBe(2);

    // Close scratchpad -> drops from count
    tabs.set([]);
    expect(get(overdueCount)).toBe(1);
  });

  it("does not count delegated, done, deferred, won't-do, or due-today actions", () => {
    allNotesCache.set({
      "2026-10-20.txt": [
        "v done action by:2026-10-20",
        "> deferred action by:2026-10-20",
        "x cancelled action by:2026-10-20",
        "=> @dana delegated action by:2026-10-20",
        "# due today action by:2026-10-23", // today is 2026-10-23
        "# due later action by:2026-10-25",
        "# plain action without due date",
      ].join("\n"),
    });
    expect(get(overdueCount)).toBe(0);
  });

  it("changing currentDateISO to the next day makes a due-today action overdue", () => {
    allNotesCache.set({
      "2026-10-23.txt": "# due today by:2026-10-23",
    });
    expect(get(overdueCount)).toBe(0);

    // Midnight rollover: next day
    currentDateISO.set("2026-10-24");
    expect(get(overdueCount)).toBe(1);
  });

  it("memoisation: unchanged notes are not recounted when tabs change", () => {
    allNotesCache.set({
      "2026-10-20.txt": "# note 1 by:2026-10-20",
      "2026-10-21.txt": "# note 2 by:2026-10-21",
    });

    const spy = vi.spyOn(tokens, "countOverdue");
    spy.mockClear();

    // First evaluation: counts both notes
    expect(get(overdueCount)).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockClear();

    // Tab for note 1 changes (keystroke in note 1)
    tabs.set([
      {
        id: "tab-1",
        filename: "2026-10-20.txt",
        isScratchpad: false,
        content: "# note 1 by:2026-10-20\n# another by:2026-10-20",
      },
    ]);

    expect(get(overdueCount)).toBe(3);
    // Only note 1 was recounted, note 2 was read from memo!
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      "# note 1 by:2026-10-20\n# another by:2026-10-20",
      "2026-10-23",
    );

    // Key cleanup: remove note 2 from cache
    allNotesCache.set({
      "2026-10-20.txt": "# note 1 by:2026-10-20",
    });
    expect(overdueCountMemo.has("2026-10-21.txt")).toBe(true);
    get(overdueCount);
    expect(overdueCountMemo.has("2026-10-21.txt")).toBe(false);

    spy.mockRestore();
  });
});

describe("itemDueDate", () => {
  it("extracts earliest open own due date", () => {
    expect(itemDueDate("# task by:2026-10-25")).toBe("2026-10-25");
    expect(itemDueDate("# task by:2026-10-25 => # subtask by:2026-10-20")).toBe("2026-10-20");
    // Closed parts are ignored
    expect(itemDueDate("v done by:2026-10-20 => # open by:2026-10-25")).toBe("2026-10-25");
    expect(itemDueDate("v done by:2026-10-20")).toBeNull();
  });

  it("handles delegated parts only when showDelegated is true", () => {
    const line = "=> @dana send slides by:2026-10-28";
    expect(itemDueDate(line, false)).toBeNull();
    expect(itemDueDate(line, true)).toBe("2026-10-28");
  });
});

describe("getSundayOfIsoWeek", () => {
  it("computes the Sunday for days within the week", () => {
    // 2026-10-19 is Monday -> Sunday is 2026-10-25
    expect(getSundayOfIsoWeek("2026-10-19")).toBe("2026-10-25");
    // 2026-10-23 is Friday -> Sunday is 2026-10-25
    expect(getSundayOfIsoWeek("2026-10-23")).toBe("2026-10-25");
    // 2026-10-25 is Sunday -> Sunday is 2026-10-25
    expect(getSundayOfIsoWeek("2026-10-25")).toBe("2026-10-25");
  });

  it("computes the Sunday across month boundaries", () => {
    // 2026-10-28 is Wednesday -> Sunday is 2026-11-01
    expect(getSundayOfIsoWeek("2026-10-28")).toBe("2026-11-01");
  });
});

describe("groupByDue", () => {
  const today = "2026-10-23"; // Friday, week ends Sunday 2026-10-25

  it("groups items into the four categories: overdue, today, thisWeek, later", () => {
    const items = [
      { filename: "2026-10-20.txt", lineIdx: 0, line: "# task 1 by:2026-10-20" }, // overdue
      { filename: "2026-10-23.txt", lineIdx: 0, line: "# task 2 by:2026-10-23" }, // today
      { filename: "2026-10-23.txt", lineIdx: 1, line: "# task 3 by:2026-10-24" }, // this week (Sat)
      { filename: "2026-10-23.txt", lineIdx: 2, line: "# task 4 by:2026-10-25" }, // this week (Sun)
      { filename: "2026-10-23.txt", lineIdx: 3, line: "# task 5 by:2026-10-26" }, // later (next Mon)
    ];

    const groups = groupByDue(items, today);
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "thisWeek", "later"]);

    expect(groups[0].items.map((i) => i.lineIdx)).toEqual([0]);
    expect(groups[1].items.map((i) => i.lineIdx)).toEqual([0]);
    expect(groups[2].items.map((i) => i.lineIdx)).toEqual([1, 2]);
    expect(groups[3].items.map((i) => i.lineIdx)).toEqual([3]);
  });

  it("omits empty groups", () => {
    const items = [
      { filename: "2026-10-23.txt", lineIdx: 0, line: "# task 1 by:2026-10-23" }, // today
      { filename: "2026-10-23.txt", lineIdx: 1, line: "# task 2 by:2026-10-30" }, // later
    ];

    const groups = groupByDue(items, today);
    expect(groups.map((g) => g.key)).toEqual(["today", "later"]);
  });

  it("handles week boundary on a Monday", () => {
    const monday = "2026-10-19"; // Sunday of this week is 2026-10-25
    const items = [
      { filename: "2026-10-15.txt", lineIdx: 0, line: "# task by:2026-10-18" }, // overdue
      { filename: "2026-10-19.txt", lineIdx: 0, line: "# task by:2026-10-19" }, // today
      { filename: "2026-10-19.txt", lineIdx: 1, line: "# task by:2026-10-20" }, // this week
      { filename: "2026-10-19.txt", lineIdx: 2, line: "# task by:2026-10-25" }, // this week (Sunday)
      { filename: "2026-10-19.txt", lineIdx: 3, line: "# task by:2026-10-26" }, // later (next Monday)
    ];

    const groups = groupByDue(items, monday);
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "thisWeek", "later"]);
    expect(groups.find((g) => g.key === "thisWeek")?.items.length).toBe(2);
  });

  it("handles week boundary on a Sunday", () => {
    const sunday = "2026-10-25"; // Sunday itself!
    const items = [
      { filename: "2026-10-20.txt", lineIdx: 0, line: "# task by:2026-10-24" }, // overdue
      { filename: "2026-10-25.txt", lineIdx: 0, line: "# task by:2026-10-25" }, // today
      { filename: "2026-10-25.txt", lineIdx: 1, line: "# task by:2026-10-26" }, // later (next Monday)
    ];

    const groups = groupByDue(items, sunday);
    // On a Sunday, there are no days left in "this week" after today, so "thisWeek" is omitted
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "later"]);
  });

  it("sorts inside group by due date ascending, then note's date descending, then line index", () => {
    const items = [
      // Same due date 2026-10-20, different note dates and line indices:
      { filename: "2026-10-10.txt", lineIdx: 2, line: "# c by:2026-10-20" },
      { filename: "2026-10-15.txt", lineIdx: 5, line: "# a by:2026-10-20" },
      { filename: "2026-10-15.txt", lineIdx: 1, line: "# b by:2026-10-20" },
      // Earlier due date:
      { filename: "2026-10-12.txt", lineIdx: 0, line: "# first by:2026-10-18" },
      // Later due date in same group:
      { filename: "2026-10-14.txt", lineIdx: 0, line: "# last by:2026-10-22" },
    ];

    const groups = groupByDue(items, today);
    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe("overdue");

    const sortedLines = groups[0].items.map((i) => i.line);
    expect(sortedLines).toEqual([
      "# first by:2026-10-18", // earliest due date (18)
      "# b by:2026-10-20",     // due 20, note 2026-10-15, lineIdx 1
      "# a by:2026-10-20",     // due 20, note 2026-10-15, lineIdx 5
      "# c by:2026-10-20",     // due 20, note 2026-10-10, lineIdx 2
      "# last by:2026-10-22",  // latest due date (22)
    ]);
  });

  it("includes delegated lines only when showDelegated is true", () => {
    const items = [
      { filename: "2026-10-20.txt", lineIdx: 0, line: "=> @dana send slides by:2026-10-20" },
    ];

    expect(groupByDue(items, today, { showDelegated: false })).toEqual([]);
    const withDel = groupByDue(items, today, { showDelegated: true });
    expect(withDel.length).toBe(1);
    expect(withDel[0].key).toBe("overdue");
  });
});

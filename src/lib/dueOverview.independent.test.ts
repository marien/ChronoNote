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

describe("overdueCount store (independent)", () => {
  beforeEach(() => {
    _resetMemoForTest();
    allNotesCache.set({});
    tabs.set([]);
    currentDateISO.set("2026-10-23");
  });

  it("counts overdue actions across all notes in cache, not just active note", () => {
    allNotesCache.set({
      "2026-10-18.txt": "# overdue task A by:2026-10-19",
      "2026-10-19.txt": "# overdue task B by:2026-10-20\n# overdue task C by:2026-10-21",
      "2026-10-20.txt": "# not overdue task by:2026-10-24",
    });
    // Active tab can be anything or empty; all notes are included
    expect(get(overdueCount)).toBe(3);
  });

  it("live unsaved tab content overlays cached file text", () => {
    allNotesCache.set({
      "2026-10-20.txt": "# disk action 1 by:2026-10-20\n# disk action 2 by:2026-10-21",
    });
    expect(get(overdueCount)).toBe(2);

    // Open tab has live edits in memory (unsaved)
    tabs.set([
      {
        id: "tab-1",
        filename: "2026-10-20.txt",
        isScratchpad: false,
        content: "v disk action 1 by:2026-10-20\n# disk action 2 by:2026-10-21\n# live new action by:2026-10-19",
      },
    ]);
    // 1 completed, 2 remaining overdue
    expect(get(overdueCount)).toBe(2);
  });

  it("open scratchpad tabs count towards overdue total and drop when closed", () => {
    allNotesCache.set({
      "2026-10-20.txt": "# note action by:2026-10-20",
    });
    const scratchpad: NoteTab = {
      id: "scratch-101",
      filename: "Scratchpad 1",
      isScratchpad: true,
      content: "# overdue in scratchpad by:2026-10-21\n# future in scratchpad by:2026-10-30",
    };
    tabs.set([scratchpad]);
    expect(get(overdueCount)).toBe(2);

    // Closing the scratchpad removes its actions from the count
    tabs.set([]);
    expect(get(overdueCount)).toBe(1);
  });

  it("deleting a note from cache removes its overdue actions from count", () => {
    allNotesCache.set({
      "2026-10-19.txt": "# overdue in note A by:2026-10-20",
      "2026-10-20.txt": "# overdue in note B by:2026-10-21",
    });
    expect(get(overdueCount)).toBe(2);

    // Delete note A from cache
    allNotesCache.set({
      "2026-10-20.txt": "# overdue in note B by:2026-10-21",
    });
    expect(get(overdueCount)).toBe(1);
    expect(overdueCountMemo.has("2026-10-19.txt")).toBe(false);
  });

  it("excludes non-overdue, resolved, deferred, cancelled, delegated, unparsed, and topic lines", () => {
    allNotesCache.set({
      "2026-10-20.txt": [
        "v completed action by:2026-10-20",
        "> deferred action by:2026-10-20",
        "x cancelled action by:2026-10-20",
        "=> @dana delegated action by:2026-10-20",
        "# due today action by:2026-10-23", // today is 2026-10-23, not overdue
        "# future action by:2026-10-25",
        "# unparsed word by:fri",
        "# unparsed word by:tomorrow",
        "# unparsed word by:notadate",
        "o topic line by:2026-10-20",
        ". discussed topic by:2026-10-20",
        ", skipped topic by:2026-10-20",
        "- bullet item by:2026-10-20",
        "plain prose line by:2026-10-20",
      ].join("\n"),
    });
    expect(get(overdueCount)).toBe(0);
  });

  it("counts several due parts on one line separately", () => {
    allNotesCache.set({
      "2026-10-20.txt": [
        // Two open overdue parts on a single line
        "# part 1 by:2026-10-20 => # part 2 by:2026-10-21",
        // One open overdue and one completed overdue
        "# part 3 by:2026-10-19 => v part 4 by:2026-10-20",
        // One open overdue and one delegated overdue
        "# part 5 by:2026-10-18 => @dana part 6 by:2026-10-20",
      ].join("\n"),
    });
    // line 1 has 2, line 2 has 1, line 3 has 1 -> total 4
    expect(get(overdueCount)).toBe(4);
  });

  it("advancing clock past midnight makes due-today action overdue", () => {
    allNotesCache.set({
      "2026-10-23.txt": "# action due today by:2026-10-23",
    });
    // Today is 2026-10-23: not overdue yet
    expect(get(overdueCount)).toBe(0);

    // Midnight arrives, date flips to 2026-10-24
    currentDateISO.set("2026-10-24");
    expect(get(overdueCount)).toBe(1);
  });

  it("forwarding an action keeps by: on target and source '>' stops counting", () => {
    // Initial state: 1 overdue action in older note
    allNotesCache.set({
      "2026-10-20.txt": "# report numbers by:2026-10-20",
      "2026-10-23.txt": "Top priorities\n==============",
    });
    expect(get(overdueCount)).toBe(1);

    // Forwarded: source note line becomes '>', target note gets '#' with from link, both keeping by:
    allNotesCache.set({
      "2026-10-20.txt": "> report numbers by:2026-10-20 (>2026-10-23)",
      "2026-10-23.txt": "# report numbers by:2026-10-20 (<2026-10-20)\nTop priorities\n==============",
    });
    // Count does not double; source stops counting and target counts -> total remains 1
    expect(get(overdueCount)).toBe(1);
  });

  it("memoisation reuses previous count for unchanged texts", () => {
    allNotesCache.set({
      "2026-10-20.txt": "# task 1 by:2026-10-20",
      "2026-10-21.txt": "# task 2 by:2026-10-21",
    });

    const spy = vi.spyOn(tokens, "countOverdue");
    spy.mockClear();

    expect(get(overdueCount)).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockClear();

    // Tab for 2026-10-20 opens with new action
    tabs.set([
      {
        id: "tab-1",
        filename: "2026-10-20.txt",
        isScratchpad: false,
        content: "# task 1 by:2026-10-20\n# task 3 by:2026-10-20",
      },
    ]);

    expect(get(overdueCount)).toBe(3);
    // Only 2026-10-20 was re-parsed, 2026-10-21 was retrieved from memo
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});

describe("itemDueDate (independent)", () => {
  it("extracts earliest qualifying open own due date", () => {
    expect(itemDueDate("# task by:2026-10-25")).toBe("2026-10-25");
    expect(itemDueDate("# earlier by:2026-10-15 => # later by:2026-10-20")).toBe("2026-10-15");
    expect(itemDueDate("# later by:2026-10-20 => # earlier by:2026-10-15")).toBe("2026-10-15");
  });

  it("ignores resolved, deferred, and cancelled parts", () => {
    expect(itemDueDate("v completed by:2026-10-10")).toBeNull();
    expect(itemDueDate("> deferred by:2026-10-10")).toBeNull();
    expect(itemDueDate("x cancelled by:2026-10-10")).toBeNull();
    expect(itemDueDate("v done by:2026-10-10 => # open by:2026-10-25")).toBe("2026-10-25");
  });

  it("handles delegated parts according to showDelegated flag", () => {
    const line = "=> @dana send slides by:2026-10-28";
    expect(itemDueDate(line, false)).toBeNull();
    expect(itemDueDate(line, true)).toBe("2026-10-28");

    const multi = "# own task by:2026-10-30 => @dana subtask by:2026-10-20";
    expect(itemDueDate(multi, false)).toBe("2026-10-30");
    expect(itemDueDate(multi, true)).toBe("2026-10-20");
  });

  it("returns null for non-action lines or lines without due dates", () => {
    expect(itemDueDate("plain text")).toBeNull();
    expect(itemDueDate("# action without date")).toBeNull();
    expect(itemDueDate("o topic by:2026-10-20")).toBeNull();
    expect(itemDueDate("- bullet by:2026-10-20")).toBeNull();
  });
});

describe("getSundayOfIsoWeek (independent)", () => {
  it("computes the Sunday for each day from Monday to Sunday", () => {
    // 2026-10-19 is Monday, 2026-10-25 is Sunday
    expect(getSundayOfIsoWeek("2026-10-19")).toBe("2026-10-25");
    expect(getSundayOfIsoWeek("2026-10-20")).toBe("2026-10-25");
    expect(getSundayOfIsoWeek("2026-10-21")).toBe("2026-10-25");
    expect(getSundayOfIsoWeek("2026-10-22")).toBe("2026-10-25");
    expect(getSundayOfIsoWeek("2026-10-23")).toBe("2026-10-25");
    expect(getSundayOfIsoWeek("2026-10-24")).toBe("2026-10-25");
    expect(getSundayOfIsoWeek("2026-10-25")).toBe("2026-10-25");
  });

  it("handles month and year boundaries correctly", () => {
    // 2026-10-28 is Wednesday -> Sunday is 2026-11-01
    expect(getSundayOfIsoWeek("2026-10-28")).toBe("2026-11-01");
    // 2026-12-30 is Wednesday -> Sunday is 2027-01-03
    expect(getSundayOfIsoWeek("2026-12-30")).toBe("2027-01-03");
  });
});

describe("dueGroupForDate (independent)", () => {
  const today = "2026-10-23"; // Friday, week ends Sunday 2026-10-25

  it("categorises dates into overdue, today, thisWeek, and later", () => {
    expect(dueGroupForDate("2026-10-22", today)).toBe("overdue");
    expect(dueGroupForDate("2026-10-23", today)).toBe("today");
    expect(dueGroupForDate("2026-10-24", today)).toBe("thisWeek");
    expect(dueGroupForDate("2026-10-25", today)).toBe("thisWeek");
    expect(dueGroupForDate("2026-10-26", today)).toBe("later");
    expect(dueGroupForDate("2026-11-01", today)).toBe("later");
  });

  it("handles Sunday as today: thisWeek has no days, future dates are later", () => {
    const sundayToday = "2026-10-25";
    expect(dueGroupForDate("2026-10-24", sundayToday)).toBe("overdue");
    expect(dueGroupForDate("2026-10-25", sundayToday)).toBe("today");
    expect(dueGroupForDate("2026-10-26", sundayToday)).toBe("later");
  });
});

describe("groupByDue (independent)", () => {
  const today = "2026-10-23"; // Friday

  it("sorts items by due date ascending, then note date descending, then lineIdx", () => {
    const items = [
      { filename: "2026-10-10.txt", lineIdx: 5, line: "# task B by:2026-10-20" },
      { filename: "2026-10-15.txt", lineIdx: 2, line: "# task A by:2026-10-20" },
      { filename: "2026-10-12.txt", lineIdx: 1, line: "# task early by:2026-10-18" },
      { filename: "Scratchpad 1", lineIdx: 0, line: "# task in scratchpad by:2026-10-20" },
      { filename: "2026-10-15.txt", lineIdx: 7, line: "# task C by:2026-10-20" },
    ];

    const groups = groupByDue(items, today);
    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe("overdue");

    const lines = groups[0].items.map((i) => i.line);
    expect(lines).toEqual([
      "# task early by:2026-10-18",        // earliest due date (18)
      "# task A by:2026-10-20",            // due 20, newest dated note (10-15), lineIdx 2
      "# task C by:2026-10-20",            // due 20, newest dated note (10-15), lineIdx 7
      "# task B by:2026-10-20",            // due 20, older dated note (10-10), lineIdx 5
      "# task in scratchpad by:2026-10-20",// due 20, scratchpad sorts after dated notes
    ]);
  });

  it("omits empty groups when no items fall into them", () => {
    const items = [
      { filename: "2026-10-23.txt", lineIdx: 0, line: "# task by:2026-10-23" }, // today
    ];
    const groups = groupByDue(items, today);
    expect(groups.map((g) => g.key)).toEqual(["today"]);
  });

  it("omits undated actions completely", () => {
    const items = [
      { filename: "2026-10-20.txt", lineIdx: 0, line: "# undated task" },
      { filename: "2026-10-20.txt", lineIdx: 1, line: "# dated task by:2026-10-21" },
    ];
    const groups = groupByDue(items, today);
    expect(groups.length).toBe(1);
    expect(groups[0].items.length).toBe(1);
    expect(groups[0].items[0].line).toBe("# dated task by:2026-10-21");
  });

  it("includes delegated lines only when showDelegated is true", () => {
    const items = [
      { filename: "2026-10-20.txt", lineIdx: 0, line: "=> @dana send slides by:2026-10-21" },
    ];
    expect(groupByDue(items, today, { showDelegated: false })).toEqual([]);
    const shown = groupByDue(items, today, { showDelegated: true });
    expect(shown.length).toBe(1);
    expect(shown[0].items[0].line).toBe("=> @dana send slides by:2026-10-21");
  });
});

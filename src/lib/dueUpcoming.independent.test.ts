import { describe, expect, it } from "vitest";
// @ts-ignore countUpcoming is implemented in concurrent branch
import { countUpcoming } from "./tokens";
import { parseSearchQuery, removeChipFromQuery } from "./search";
import { groupByDue } from "./dueOverview";

describe("countUpcoming (src/lib/tokens.ts)", () => {
  const today = "2026-09-07"; // Monday

  it("counts open own action due today", () => {
    const text = `# task due today by:${today}`;
    expect(countUpcoming(text, today)).toBe(1);
  });

  it("counts open own action due on today + 6 (last day of upcoming window)", () => {
    // 2026-09-07 + 6 days = 2026-09-13 (Sunday)
    const text = "# task due Sunday by:2026-09-13";
    expect(countUpcoming(text, today)).toBe(1);
  });

  it("does not count actions due on today + 7 or later", () => {
    // 2026-09-07 + 7 days = 2026-09-14 (next Monday)
    const text = [
      "# task due next Mon by:2026-09-14",
      "# task due in two weeks by:2026-09-21",
      "# task due next month by:2026-10-07",
    ].join("\n");
    expect(countUpcoming(text, today)).toBe(0);
  });

  it("does not count past/yesterday actions (overdue)", () => {
    const text = [
      "# overdue yesterday by:2026-09-06",
      "# overdue last week by:2026-08-31",
    ].join("\n");
    expect(countUpcoming(text, today)).toBe(0);
  });

  it("does not count completed (v), deferred (>), or won't-do (x) actions", () => {
    const text = [
      "v done action by:2026-09-08",
      "> deferred action by:2026-09-08",
      "x cancelled action by:2026-09-08",
    ].join("\n");
    expect(countUpcoming(text, today)).toBe(0);
  });

  it("does not count delegated actions (=> @name)", () => {
    const text = [
      "=> @dana delegated action by:2026-09-08",
      "# own action => @bob handed off by:2026-09-08",
    ].join("\n");
    // Only own open actions count. The second line has # own action without due date,
    // and the delegated tail has the due date, so 0 count.
    expect(countUpcoming(text, today)).toBe(0);
  });

  it("counts two open own dated parts on one line twice", () => {
    const text = "# part 1 by:2026-09-08 => # part 2 by:2026-09-09";
    expect(countUpcoming(text, today)).toBe(2);
  });

  it("counts only the open part when a line has one closed and one open part", () => {
    const text1 = "v done by:2026-09-08 => # open by:2026-09-09";
    expect(countUpcoming(text1, today)).toBe(1);

    const text2 = "# open by:2026-09-08 => v done by:2026-09-09";
    expect(countUpcoming(text2, today)).toBe(1);
  });

  it("does not count an unparsed by:word (like by:fri) without a resolved date", () => {
    const text = [
      "# action with day word by:fri",
      "# action with tomorrow word by:tomorrow",
      "# action with nonsense by:nonsense",
    ].join("\n");
    expect(countUpcoming(text, today)).toBe(0);
  });

  it("does not count actions without due dates", () => {
    const text = [
      "# plain action without due date",
      "Some regular notes paragraph",
      "## Section header",
    ].join("\n");
    expect(countUpcoming(text, today)).toBe(0);
  });

  it("supports custom days parameter (e.g. days = 3)", () => {
    const text = [
      "# due today by:2026-09-07",      // today <= date <= today + 2 -> counts
      "# due tomorrow by:2026-09-08",   // counts
      "# due +2 days by:2026-09-09",    // counts
      "# due +3 days by:2026-09-10",    // today + 3 -> does NOT count when days = 3
      "# due +4 days by:2026-09-11",    // does NOT count
    ].join("\n");

    expect(countUpcoming(text, today, 3)).toBe(3);
    expect(countUpcoming(text, today, 1)).toBe(1); // only today
    expect(countUpcoming(text, today, 7)).toBe(5); // all 5 fall within 7 days
  });

  it("handles month boundaries correctly", () => {
    const endOfMonthToday = "2026-10-28"; // Wednesday; Oct has 31 days
    // 2026-10-28 + 6 = 2026-11-03
    // 2026-10-28 + 7 = 2026-11-04
    const text = [
      "# task Oct 30 by:2026-10-30",
      "# task Oct 31 by:2026-10-31",
      "# task Nov 1 by:2026-11-01",
      "# task Nov 3 by:2026-11-03", // today + 6: counts
      "# task Nov 4 by:2026-11-04", // today + 7: does not count
    ].join("\n");

    expect(countUpcoming(text, endOfMonthToday)).toBe(4);
  });

  it("tolerates indentation on action lines", () => {
    const text = [
      "  # indented action by:2026-09-08",
      "    # deeply indented action by:2026-09-09",
    ].join("\n");
    expect(countUpcoming(text, today)).toBe(2);
  });
});

describe("parseSearchQuery with due: operator (src/lib/search.ts)", () => {
  describe("without second argument", () => {
    it("parses due:YYYY-MM-DD into due operator and chip", () => {
      const res = parseSearchQuery("due:2026-09-10");
      expect(res.term).toBe("");
      expect((res.operators as any).due).toBe("2026-09-10");
      expect(res.chips).toHaveLength(1);
      expect(res.chips[0]).toMatchObject({
        kind: "due",
        value: "2026-09-10",
        label: "due:2026-09-10",
      });
    });

    it("parses due:YYYY-MM-DD alongside free text terms", () => {
      const res = parseSearchQuery("meeting notes due:2026-09-10 urgent");
      expect(res.term).toBe("meeting notes urgent");
      expect((res.operators as any).due).toBe("2026-09-10");
      expect(res.chips).toHaveLength(1);
      expect(res.chips[0].kind).toBe("due");
    });

    it("treats day words like due:tomorrow as plain text when no second argument is provided", () => {
      const res1 = parseSearchQuery("due:tomorrow");
      expect(res1.term).toBe("due:tomorrow");
      expect((res1.operators as any).due).toBeUndefined();
      expect(res1.chips).toHaveLength(0);

      const res2 = parseSearchQuery("due:today");
      expect(res2.term).toBe("due:today");
      expect((res2.operators as any).due).toBeUndefined();
      expect(res2.chips).toHaveLength(0);

      const res3 = parseSearchQuery("due:+3");
      expect(res3.term).toBe("due:+3");
      expect((res3.operators as any).due).toBeUndefined();
      expect(res3.chips).toHaveLength(0);
    });

    it("treats due:nonsense as plain text without producing a chip", () => {
      const res = parseSearchQuery("due:nonsense");
      expect(res.term).toBe("due:nonsense");
      expect((res.operators as any).due).toBeUndefined();
      expect(res.chips).toHaveLength(0);
    });

    it("replaces earlier due: operator when multiple ISO dates appear", () => {
      const res = parseSearchQuery("due:2026-09-08 due:2026-09-10");
      expect((res.operators as any).due).toBe("2026-09-10");
      expect(res.chips).toHaveLength(1);
      expect(res.chips[0].value).toBe("2026-09-10");
    });
  });

  describe("with second argument { todayISO, locale }", () => {
    const opts = { todayISO: "2026-09-07", locale: "en" };

    it("resolves due:today to today's ISO date with chip label showing ISO date", () => {
      // @ts-ignore second argument supported in concurrent branch
      const res = parseSearchQuery("due:today", opts);
      expect(res.term).toBe("");
      expect((res.operators as any).due).toBe("2026-09-07");
      expect(res.chips).toHaveLength(1);
      expect(res.chips[0]).toMatchObject({
        kind: "due",
        value: "2026-09-07",
        label: "due:2026-09-07",
      });
    });

    it("resolves due:tomorrow to the next day's ISO date", () => {
      // @ts-ignore second argument supported in concurrent branch
      const res = parseSearchQuery("due:tomorrow", opts);
      expect(res.term).toBe("");
      expect((res.operators as any).due).toBe("2026-09-08");
      expect(res.chips).toHaveLength(1);
      expect(res.chips[0]).toMatchObject({
        kind: "due",
        value: "2026-09-08",
        label: "due:2026-09-08",
      });
    });

    it("resolves relative offset like due:+3 from todayISO", () => {
      // @ts-ignore second argument supported in concurrent branch
      const res = parseSearchQuery("due:+3", opts);
      expect(res.term).toBe("");
      expect((res.operators as any).due).toBe("2026-09-10");
      expect(res.chips).toHaveLength(1);
      expect(res.chips[0]).toMatchObject({
        kind: "due",
        value: "2026-09-10",
        label: "due:2026-09-10",
      });
    });

    it("still understands explicit ISO dates when second argument is provided", () => {
      // @ts-ignore second argument supported in concurrent branch
      const res = parseSearchQuery("due:2026-09-25", opts);
      expect((res.operators as any).due).toBe("2026-09-25");
      expect(res.chips[0].label).toBe("due:2026-09-25");
    });

    it("treats due:nonsense as plain text even when second argument is provided", () => {
      // @ts-ignore second argument supported in concurrent branch
      const res = parseSearchQuery("due:nonsense", opts);
      expect(res.term).toBe("due:nonsense");
      expect((res.operators as any).due).toBeUndefined();
      expect(res.chips).toHaveLength(0);
    });

    it("replaces earlier due: when day words and later due: are typed", () => {
      // @ts-ignore second argument supported in concurrent branch
      const res = parseSearchQuery("due:today due:tomorrow", opts);
      expect((res.operators as any).due).toBe("2026-09-08");
      expect(res.chips).toHaveLength(1);
      expect(res.chips[0].value).toBe("2026-09-08");
    });
  });

  describe("removeChipFromQuery for due: chip", () => {
    it("removes due: chip from query string", () => {
      const q = "due:2026-09-10 call client";
      const parsed = parseSearchQuery(q);
      const remaining = removeChipFromQuery(q, parsed.chips[0]);
      expect(remaining).toBe("call client");
    });

    it("removes both superseded and active due: tokens when chip is removed", () => {
      const q = "due:2026-09-08 due:2026-09-10 call client";
      const parsed = parseSearchQuery(q);
      const remaining = removeChipFromQuery(q, parsed.chips[0]);
      expect(remaining).toBe("call client");
    });
  });
});

describe("groupByDue (src/lib/dueOverview.ts)", () => {
  const today = "2026-09-07"; // Monday; ISO week ends Sunday 2026-09-13

  const items = [
    { filename: "2026-09-01.txt", lineIdx: 0, line: "# task overdue by:2026-09-05" },
    { filename: "2026-09-07.txt", lineIdx: 0, line: "# task today by:2026-09-07" },
    { filename: "2026-09-07.txt", lineIdx: 1, line: "# task tomorrow by:2026-09-08" },
    { filename: "2026-09-07.txt", lineIdx: 2, line: "# task Wednesday by:2026-09-09" },
    { filename: "2026-09-07.txt", lineIdx: 3, line: "# task Sunday by:2026-09-13" },
    { filename: "2026-09-07.txt", lineIdx: 4, line: "# task next Mon by:2026-09-14" },
    { filename: "2026-09-07.txt", lineIdx: 5, line: "# task future by:2026-09-20" },
  ];

  it("without options: keeps old four groups (overdue, today, thisWeek, later)", () => {
    const groups = groupByDue(items, today);
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "thisWeek", "later"]);

    const overdueGroup = groups.find((g) => g.key === "overdue");
    expect(overdueGroup?.items.map((i) => i.line)).toEqual(["# task overdue by:2026-09-05"]);

    const todayGroup = groups.find((g) => g.key === "today");
    expect(todayGroup?.items.map((i) => i.line)).toEqual(["# task today by:2026-09-07"]);

    const thisWeekGroup = groups.find((g) => g.key === "thisWeek");
    expect(thisWeekGroup?.items.map((i) => i.line)).toEqual([
      "# task tomorrow by:2026-09-08",
      "# task Wednesday by:2026-09-09",
      "# task Sunday by:2026-09-13",
    ]);

    const laterGroup = groups.find((g) => g.key === "later");
    expect(laterGroup?.items.map((i) => i.line)).toEqual([
      "# task next Mon by:2026-09-14",
      "# task future by:2026-09-20",
    ]);
  });

  it("with { days: 7 }: returns overdue, today, day:YYYY-MM-DD per date with items, and later", () => {
    // @ts-ignore days option supported in concurrent branch
    const groups = groupByDue(items, today, { days: 7 });
    expect(groups.map((g) => g.key)).toEqual([
      "overdue",
      "today",
      "day:2026-09-08",
      "day:2026-09-09",
      "day:2026-09-13",
      "later",
    ]);

    // Verify there is NO "thisWeek" group
    expect(groups.some((g) => (g.key as string) === "thisWeek")).toBe(false);

    // Later starts at today + 7 (2026-09-14)
    const laterGroup = groups.find((g) => g.key === "later");
    expect(laterGroup?.items.map((i) => i.line)).toEqual([
      "# task next Mon by:2026-09-14",
      "# task future by:2026-09-20",
    ]);
  });

  it("with { days: 7 }: omits empty groups and days without items", () => {
    const sparseItems = [
      { filename: "2026-09-07.txt", lineIdx: 0, line: "# task Wednesday by:2026-09-09" },
      { filename: "2026-09-07.txt", lineIdx: 1, line: "# task later by:2026-09-20" },
    ];

    // @ts-ignore days option supported in concurrent branch
    const groups = groupByDue(sparseItems, today, { days: 7 });
    // Overdue, Today, and days other than 2026-09-09 have no items, so they are omitted
    expect(groups.map((g) => g.key)).toEqual([
      "day:2026-09-09",
      "later",
    ]);
  });

  it("with { days: 7 }: sorts day keys in ascending date order", () => {
    const mixedItems = [
      { filename: "2026-09-07.txt", lineIdx: 0, line: "# Friday task by:2026-09-11" },
      { filename: "2026-09-07.txt", lineIdx: 1, line: "# Tuesday task by:2026-09-08" },
      { filename: "2026-09-07.txt", lineIdx: 2, line: "# Thursday task by:2026-09-10" },
    ];

    // @ts-ignore days option supported in concurrent branch
    const groups = groupByDue(mixedItems, today, { days: 7 });
    expect(groups.map((g) => g.key)).toEqual([
      "day:2026-09-08",
      "day:2026-09-10",
      "day:2026-09-11",
    ]);
  });

  it("with { days: 7 }: sorts items within each group by due date, note date desc, line index", () => {
    const dayItems = [
      { filename: "2026-09-05.txt", lineIdx: 3, line: "# item older note by:2026-09-08" },
      { filename: "2026-09-07.txt", lineIdx: 2, line: "# item newer note line 2 by:2026-09-08" },
      { filename: "2026-09-07.txt", lineIdx: 1, line: "# item newer note line 1 by:2026-09-08" },
    ];

    // @ts-ignore days option supported in concurrent branch
    const groups = groupByDue(dayItems, today, { days: 7 });
    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe("day:2026-09-08");

    // Newer note (2026-09-07) before older (2026-09-05); within note, line 1 before line 2
    expect(groups[0].items.map((i) => i.line)).toEqual([
      "# item newer note line 1 by:2026-09-08",
      "# item newer note line 2 by:2026-09-08",
      "# item older note by:2026-09-08",
    ]);
  });
});

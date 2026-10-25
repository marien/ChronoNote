import { describe, expect, it } from "vitest";
import {
  buildWeekReview,
  defaultWeekForDate,
  formatWeekRange,
  isoYearAndWeek,
  isLineForwarded,
} from "./weekReview";

describe("weekReview pure model", () => {
  describe("defaultWeekForDate (decision 1b)", () => {
    it("opens previous week on Monday, Saturday, and Sunday; current week otherwise", () => {
      // 2026-10-25 is Sunday (week 43) -> opens previous week 42
      expect(defaultWeekForDate("2026-10-25")).toEqual({ year: 2026, week: 42 });

      // 2026-10-26 is Monday (week 44) -> opens previous week 43
      expect(defaultWeekForDate("2026-10-26")).toEqual({ year: 2026, week: 43 });

      // 2026-10-27 is Tuesday (week 44) -> opens current week 44
      expect(defaultWeekForDate("2026-10-27")).toEqual({ year: 2026, week: 44 });

      // 2026-10-28 is Wednesday (week 44) -> opens current week 44
      expect(defaultWeekForDate("2026-10-28")).toEqual({ year: 2026, week: 44 });

      // 2026-10-29 is Thursday (week 44) -> opens current week 44
      expect(defaultWeekForDate("2026-10-29")).toEqual({ year: 2026, week: 44 });

      // 2026-10-30 is Friday (week 44) -> opens current week 44
      expect(defaultWeekForDate("2026-10-30")).toEqual({ year: 2026, week: 44 });

      // 2026-10-31 is Saturday (week 44) -> opens previous week 43
      expect(defaultWeekForDate("2026-10-31")).toEqual({ year: 2026, week: 43 });

      // 2026-11-01 is Sunday (week 44) -> opens previous week 43
      expect(defaultWeekForDate("2026-11-01")).toEqual({ year: 2026, week: 43 });
    });
  });

  describe("week boundaries including ISO week 1 and 53", () => {
    it("correctly identifies week 1 across year transition", () => {
      // 2024-12-30 (Monday) is Week 1 of 2025
      expect(isoYearAndWeek("2024-12-30")).toEqual({ year: 2025, week: 1 });
      // 2025-01-01 (Wednesday) is Week 1 of 2025
      expect(isoYearAndWeek("2025-01-01")).toEqual({ year: 2025, week: 1 });
    });

    it("correctly handles week 53 years", () => {
      // 2020 has 53 weeks. 2020-12-31 is Thursday of Week 53 of 2020.
      expect(isoYearAndWeek("2020-12-31")).toEqual({ year: 2020, week: 53 });
      // 2021-01-03 is Sunday of Week 53 of 2020.
      expect(isoYearAndWeek("2021-01-03")).toEqual({ year: 2020, week: 53 });
      // 2021-01-04 is Monday of Week 1 of 2021.
      expect(isoYearAndWeek("2021-01-04")).toEqual({ year: 2021, week: 1 });
    });

    it("formats week range across year boundary", () => {
      // Week 1 of 2025: 2024-12-30 to 2025-01-05
      const range = formatWeekRange("en", "2024-12-30", "2025-01-05");
      expect(range).toMatch(/2024.*2025/);
    });
  });

  describe("forwarded lines not open", () => {
    it("recognizes forwarded lines", () => {
      expect(isLineForwarded("# buy milk (>2026-10-30#Errands)")).toBe(true);
      expect(isLineForwarded("> buy milk (>2026-10-30#Errands)")).toBe(true);
      expect(isLineForwarded("# regular open action")).toBe(false);
      expect(isLineForwarded("# regular with from link (<2026-10-20#Standup)")).toBe(false);
    });

    it("excludes forwarded lines from open items and counts", () => {
      const notes = [
        {
          filename: "2026-10-27.txt",
          content: [
            "Weekly Sync",
            "===========",
            "# open action",
            "# forwarded action (>2026-10-30#Standup)",
            "> another forwarded (>2026-10-29)",
          ].join("\n"),
        },
      ];

      const model = buildWeekReview(notes, 2026, 44, "2026-10-28");
      expect(model.counts.openActions).toBe(1);
      const sec = model.days[0].sections[0];
      expect(sec.openItems).toHaveLength(1);
      expect(sec.openItems[0].line).toContain("# open action");
    });
  });

  describe("delegated parts not separate (decision 6a)", () => {
    it("does not emit delegated parts as separate items", () => {
      const notes = [
        {
          filename: "2026-10-27.txt",
          content: [
            "Project Review",
            "==============",
            "# deliver specs => @alex",
            "# review budget => @sam",
          ].join("\n"),
        },
      ];

      const model = buildWeekReview(notes, 2026, 44, "2026-10-28");
      expect(model.counts.openActions).toBe(2);
      const sec = model.days[0].sections[0];
      expect(sec.openItems).toHaveLength(2);
      expect(sec.openItems[0].line).toContain("deliver specs => @alex");
      expect(sec.openItems[1].line).toContain("review budget => @sam");
    });
  });

  describe("action groups and §423 nodes", () => {
    it("preserves nesting and tree relations", () => {
      const notes = [
        {
          filename: "2026-10-27.txt",
          content: [
            "Weekly Sync",
            "===========",
            "# book the venue => # 1. ask finance",
            "  # pick a date",
          ].join("\n"),
        },
      ];

      const model = buildWeekReview(notes, 2026, 44, "2026-10-28");
      expect(model.counts.openActions).toBe(3);
      const sec = model.days[0].sections[0];
      expect(sec.openItems).toHaveLength(3);

      const [parent, step, child] = sec.openItems;
      expect(parent.depth).toBe(0);
      expect(parent.hasChildren).toBe(true);

      expect(step.depth).toBe(1);
      expect(step.itemKind).toBe("step");
      expect(step.stepIndex).toBe(1);
      expect(step.parentId).toBe(parent.id);

      expect(child.depth).toBe(1);
      expect(child.parentId).toBe(parent.id);
    });
  });

  describe("topics o, ., and ,", () => {
    it("counts open (o) and postponed (,) topics as open topics, discussed (.) in done items", () => {
      const notes = [
        {
          filename: "2026-10-27.txt",
          content: [
            "Agenda",
            "======",
            "o hiring plan",
            ", budget discussion",
            ". retro notes",
            "=> decided to launch on Friday",
          ].join("\n"),
        },
      ];

      const model = buildWeekReview(notes, 2026, 44, "2026-10-28");
      expect(model.counts.openTopics).toBe(2); // o + ,
      const sec = model.days[0].sections[0];

      // open items: o hiring plan, , budget discussion
      expect(sec.openItems).toHaveLength(2);
      expect(sec.openItems[0].state).toBe("o");
      expect(sec.openItems[1].state).toBe(",");

      // done items: . retro notes, => decided to launch on Friday
      expect(sec.doneItems).toHaveLength(2);
      expect(sec.doneItems[0].state).toBe(".");
      expect(sec.doneItems[1].itemKind).toBe("decision");
    });
  });

  describe("counts and overdue", () => {
    it("correctly identifies overdue open own actions", () => {
      const today = "2026-10-28";
      const notes = [
        {
          filename: "2026-10-27.txt",
          content: [
            "Weekly Sync",
            "===========",
            "# overdue action by:2026-10-25",
            "# today action by:2026-10-28",
            "# future action by:2026-10-30",
            "v done overdue action by:2026-10-20",
            "# overdue delegated => @dana by:2026-10-20",
          ].join("\n"),
        },
      ];

      const model = buildWeekReview(notes, 2026, 44, today);
      // overdue: only "# overdue action by:2026-10-25" is open, own, and date < today
      expect(model.counts.overdue).toBe(1);
      expect(model.counts.openActions).toBe(4); // overdue action, today action, future action, overdue delegated parent
    });
  });

  describe("earlier-weeks count (decision 3b)", () => {
    it("counts open own actions in dated notes strictly before the week", () => {
      const notes = [
        // Earlier week (week 43)
        {
          filename: "2026-10-20.txt",
          content: "# old open action 1\n# old open action 2\nv done action",
        },
        {
          filename: "2026-10-22.txt",
          content: "# old open action 3\n# forwarded (>2026-10-27)",
        },
        // This week (week 44: Mon 2026-10-27 to Sun 2026-11-02)
        {
          filename: "2026-10-27.txt",
          content: "# this week action",
        },
        // Future week
        {
          filename: "2026-11-05.txt",
          content: "# future action",
        },
      ];

      const model = buildWeekReview(notes, 2026, 44, "2026-10-28");
      // Earlier weeks: 2026-10-20 has 2 open, 2026-10-22 has 1 open (forwarded ignored) = 3 total
      expect(model.earlierWeeksOpenActions).toBe(3);
      expect(model.counts.openActions).toBe(1);
    });
  });

  describe("scratchpads and undated files ignored", () => {
    it("ignores scratchpads and non-YYYY-MM-DD.txt files", () => {
      const notes = [
        {
          filename: "scratchpad-1.txt",
          content: "# scratchpad action",
        },
        {
          filename: "random.txt",
          content: "# random action",
        },
        {
          filename: "2026-10-27.txt",
          content: "# real dated action",
        },
      ];

      const model = buildWeekReview(notes, 2026, 44, "2026-10-28");
      expect(model.counts.openActions).toBe(1);
      expect(model.days).toHaveLength(1);
      expect(model.days[0].filename).toBe("2026-10-27.txt");
    });
  });

  describe("text before first header as untitled section", () => {
    it("creates a section without title for lines before first header", () => {
      const notes = [
        {
          filename: "2026-10-27.txt",
          content: [
            "# standup note",
            "o quick topic",
            "",
            "Weekly Sync",
            "===========",
            "# sync note",
          ].join("\n"),
        },
      ];

      const model = buildWeekReview(notes, 2026, 44, "2026-10-28");
      expect(model.days[0].sections).toHaveLength(2);
      expect(model.days[0].sections[0].title).toBe("");
      expect(model.days[0].sections[0].openItems).toHaveLength(2);
      expect(model.days[0].sections[1].title).toBe("Weekly Sync");
      expect(model.days[0].sections[1].openItems).toHaveLength(1);
    });
  });
});

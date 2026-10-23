import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatISO, todayISO, parseDateQuery, addMonths, monthGrid, parseISODateLocal, addDaysISO, monthName, longDate, weekdayAbbrev, isoWeek, isoWeekToMonday, parseDueWord, dueWordExtra } from "./date";

describe("formatISO", () => {
  it("formats as zero-padded YYYY-MM-DD", () => {
    expect(formatISO(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatISO(new Date(2026, 8, 30))).toBe("2026-09-30");
  });

  it("does not pad the year", () => {
    expect(formatISO(new Date(2100, 11, 31))).toBe("2100-12-31");
  });
});

describe("time-dependent date helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // A fixed Tuesday, safely mid-month so yesterday/tomorrow never cross a
    // month boundary and complicate the expected values.
    vi.setSystemTime(new Date(2026, 8, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("todayISO reflects the current date", () => {
    expect(todayISO()).toBe("2026-09-15");
  });

  it("parseDateQuery resolves 'today'/'t'", () => {
    expect(parseDateQuery("today")).toBe("2026-09-15");
    expect(parseDateQuery("t")).toBe("2026-09-15");
    expect(parseDateQuery("Today")).toBe("2026-09-15");
  });

  it("parseDateQuery resolves 'yesterday'/'y'", () => {
    expect(parseDateQuery("yesterday")).toBe("2026-09-14");
    expect(parseDateQuery("y")).toBe("2026-09-14");
  });

  it("parseDateQuery resolves 'tomorrow'", () => {
    expect(parseDateQuery("tomorrow")).toBe("2026-09-16");
  });

  it("parseDateQuery resolves a relative negative-day offset", () => {
    expect(parseDateQuery("-1")).toBe("2026-09-14");
    expect(parseDateQuery("-7")).toBe("2026-09-08");
  });

  it("parseDateQuery passes through a full ISO date unchanged", () => {
    expect(parseDateQuery("2026-01-01")).toBe("2026-01-01");
  });

  it("parseDateQuery expands a bare MM-DD to the current year", () => {
    expect(parseDateQuery("12-25")).toBe("2026-12-25");
  });

  it("parseDateQuery resolves week queries to the week's Monday", () => {
    // Current fake time is 2026-09-15 (year 2026).
    // ISO week 42 of 2026 starts on Monday 2026-10-12.
    expect(parseDateQuery("wk 42")).toBe("2026-10-12");
    expect(parseDateQuery("w42")).toBe("2026-10-12");
    expect(parseDateQuery("week 42")).toBe("2026-10-12");
    expect(parseDateQuery("wk42")).toBe("2026-10-12");
    expect(parseDateQuery("WK 42")).toBe("2026-10-12");
    expect(parseDateQuery("W42")).toBe("2026-10-12");
    expect(parseDateQuery("WEEK 42")).toBe("2026-10-12");
    // Week 1 of 2026 starts on Monday 2025-12-29.
    expect(parseDateQuery("wk 1")).toBe("2025-12-29");
  });

  it("parseDateQuery trims and lowercases free-text input", () => {
    expect(parseDateQuery("  TODAY  ")).toBe("2026-09-15");
  });

  it("parseDateQuery returns null for unrecognized input", () => {
    expect(parseDateQuery("next tuesday")).toBeNull();
    expect(parseDateQuery("")).toBeNull();
    expect(parseDateQuery("wk 0")).toBeNull();
    expect(parseDateQuery("wk 54")).toBeNull();
    expect(parseDateQuery("2026-13-01")).toBe("2026-13-01"); // shape-only check, not calendar-valid — documents current behavior
  });
});

describe("isoWeek", () => {
  it("computes ISO 8601 week numbers per spec", () => {
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2025-12-29")).toBe(1);
    expect(isoWeek("2026-12-31")).toBe(53);
    expect(isoWeek("2027-01-03")).toBe(53);
    expect(isoWeek("2027-01-04")).toBe(1);
    expect(isoWeek("2021-01-03")).toBe(53);
  });
});

describe("parseISODateLocal / addDaysISO (§110 — no UTC drift)", () => {
  it("parses YYYY-MM-DD at local midnight, round-tripping through formatISO", () => {
    for (const iso of ["2026-01-01", "2026-09-10", "2026-12-31", "2024-02-29"]) {
      expect(formatISO(parseISODateLocal(iso))).toBe(iso);
    }
    const d = parseISODateLocal("2026-09-10");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 10]);
    expect(d.getHours()).toBe(0); // local midnight, not shifted by a UTC parse
  });

  it("addDaysISO steps by whole days across month and year boundaries", () => {
    expect(addDaysISO("2026-09-10", 1)).toBe("2026-09-11");
    expect(addDaysISO("2026-09-10", -1)).toBe("2026-09-09");
    expect(addDaysISO("2026-09-10", 7)).toBe("2026-09-17");
    expect(addDaysISO("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
    // the bug this fixes: repeated +1 must always advance, never stall
    let cur = "2026-03-01";
    for (let i = 0; i < 40; i++) cur = addDaysISO(cur, 1);
    expect(cur).toBe("2026-04-10");
  });
});

describe("addMonths", () => {
  it("shifts within a year", () => {
    expect(addMonths(2026, 8, 1)).toEqual({ year: 2026, month: 9 });
    expect(addMonths(2026, 8, -2)).toEqual({ year: 2026, month: 6 });
  });
  it("rolls across year boundaries", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths(2026, 5, 12)).toEqual({ year: 2027, month: 5 });
  });
});

describe("monthGrid", () => {
  it("is Monday-first, whole weeks, with adjacent-month edges", () => {
    // September 2026: the 1st is a Tuesday.
    const grid = monthGrid(2026, 8);
    expect(grid.length % 7).toBe(0);
    expect(grid[0]).toEqual({ iso: "2026-08-31", day: 31, inMonth: false }); // Monday before
    expect(grid[1]).toEqual({ iso: "2026-09-01", day: 1, inMonth: true });
    const sept = grid.filter((c) => c.inMonth);
    expect(sept).toHaveLength(30);
    expect(sept[29].iso).toBe("2026-09-30");
    expect(grid[grid.length - 1].inMonth).toBe(false); // trailing October day
  });

  it("handles a month that starts on a Monday without a blank leading week", () => {
    // June 2026 starts on a Monday.
    const grid = monthGrid(2026, 5);
    expect(grid[0]).toEqual({ iso: "2026-06-01", day: 1, inMonth: true });
  });

  it("always returns whole weeks covering exactly the month's days", () => {
    for (let m = 0; m < 12; m++) {
      const grid = monthGrid(2026, m);
      expect(grid.length % 7).toBe(0);
      expect(grid.length).toBeGreaterThanOrEqual(28);
      expect(grid.length).toBeLessThanOrEqual(42);
      const inMonth = grid.filter((c) => c.inMonth).map((c) => c.day);
      expect(inMonth[0]).toBe(1);
      expect(inMonth).toEqual([...inMonth].sort((a, b) => a - b)); // contiguous, ascending
    }
  });
});

// i18n roadmap: locale-aware month/weekday names via Intl.DateTimeFormat,
// replacing the old hand-translated MONTH_NAMES array.
describe("monthName / weekdayAbbrev (i18n roadmap)", () => {
  it("longDate writes the date out with the day number as a word of its own", () => {
    expect(longDate("en", "2026-09-08")).toBe("September 8, 2026");
    expect(longDate("nl", "2026-09-08")).toBe("8 september 2026");
    expect(longDate("en", "2026-01-31")).toBe("January 31, 2026");
  });

  it("returns the full month name in the given locale", () => {
    expect(monthName("en", 0)).toBe("January");
    expect(monthName("en", 11)).toBe("December");
    expect(monthName("nl", 8)).toBe("september");
    expect(monthName("de", 8)).toBe("September");
  });

  it("returns a short weekday abbreviation, Monday-first (index 0), in the given locale", () => {
    // 2024-01-01 (the fixed reference date) is a real Monday.
    expect(weekdayAbbrev("en", 0)).toMatch(/mon/i);
    expect(weekdayAbbrev("en", 6)).toMatch(/sun/i);
    expect(weekdayAbbrev("nl", 0)).toMatch(/ma/i);
    expect(weekdayAbbrev("de", 0)).toMatch(/mo/i);
  });
});


describe("parseDueWord (Section 3 date words)", () => {
  const today = "2026-10-22"; // Thursday

  it("resolves today / t", () => {
    expect(parseDueWord("today", today, "en")).toBe("2026-10-22");
    expect(parseDueWord("t", today, "en")).toBe("2026-10-22");
    expect(parseDueWord("Today", today, "en")).toBe("2026-10-22");
    expect(parseDueWord("  T  ", today, "en")).toBe("2026-10-22");
  });

  it("resolves tomorrow / tm", () => {
    expect(parseDueWord("tomorrow", today, "en")).toBe("2026-10-23");
    expect(parseDueWord("tm", today, "en")).toBe("2026-10-23");
    expect(parseDueWord("Tomorrow", today, "en")).toBe("2026-10-23");
  });

  it("resolves English weekday names mon..sun, monday..sunday to next strictly after today", () => {
    expect(parseDueWord("fri", today, "en")).toBe("2026-10-23");
    expect(parseDueWord("friday", today, "en")).toBe("2026-10-23");
    expect(parseDueWord("sat", today, "en")).toBe("2026-10-24");
    expect(parseDueWord("saturday", today, "en")).toBe("2026-10-24");
    expect(parseDueWord("sun", today, "en")).toBe("2026-10-25");
    expect(parseDueWord("sunday", today, "en")).toBe("2026-10-25");
    expect(parseDueWord("mon", today, "en")).toBe("2026-10-26");
    expect(parseDueWord("monday", today, "en")).toBe("2026-10-26");
    expect(parseDueWord("tue", today, "en")).toBe("2026-10-27");
    expect(parseDueWord("tuesday", today, "en")).toBe("2026-10-27");
    expect(parseDueWord("wed", today, "en")).toBe("2026-10-28");
    expect(parseDueWord("wednesday", today, "en")).toBe("2026-10-28");
    expect(parseDueWord("thu", today, "en")).toBe("2026-10-29");
    expect(parseDueWord("thursday", today, "en")).toBe("2026-10-29");
  });

  it("resolves locale weekdays: Dutch vr and do, German fr, French ven", () => {
    expect(parseDueWord("vr", today, "nl")).toBe("2026-10-23");
    expect(parseDueWord("vrijdag", today, "nl")).toBe("2026-10-23");
    expect(parseDueWord("do", today, "nl")).toBe("2026-10-29");
    expect(parseDueWord("donderdag", today, "nl")).toBe("2026-10-29");

    expect(parseDueWord("fr", today, "de")).toBe("2026-10-23");
    expect(parseDueWord("freitag", today, "de")).toBe("2026-10-23");

    expect(parseDueWord("ven", today, "fr")).toBe("2026-10-23");
    expect(parseDueWord("vendredi", today, "fr")).toBe("2026-10-23");
  });

  it("resolves any word in extra.today / extra.tomorrow", () => {
    const nlExtra = dueWordExtra("vandaag", "morgen");
    expect(parseDueWord("vandaag", today, "nl", nlExtra)).toBe("2026-10-22");
    expect(parseDueWord("morgen", today, "nl", nlExtra)).toBe("2026-10-23");

    const frExtra = dueWordExtra("aujourdhui,auj", "demain");
    expect(parseDueWord("aujourdhui", today, "fr", frExtra)).toBe("2026-10-22");
    expect(parseDueWord("auj", today, "fr", frExtra)).toBe("2026-10-22");
    expect(parseDueWord("demain", today, "fr", frExtra)).toBe("2026-10-23");
  });

  it("resolves +N (N = 1..999)", () => {
    expect(parseDueWord("+1", today, "en")).toBe("2026-10-23");
    expect(parseDueWord("+3", today, "en")).toBe("2026-10-25");
    expect(parseDueWord("+999", today, "en")).toBe(addDaysISO(today, 999));
  });

  it("resolves wkN, wN, weekN (also with space, N = 1..53) to Friday of that week", () => {
    // Week 44 of 2026 Friday is 2026-10-30
    expect(parseDueWord("wk44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("w44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("week44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("wk 44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("w 44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("week 44", today, "en")).toBe("2026-10-30");

    // Invalid week 53 in a 52-week year gives null
    expect(parseDueWord("wk53", "2025-10-22", "en")).toBeNull();
    expect(parseDueWord("wk 53", "2025-10-22", "en")).toBeNull();
  });

  it("resolves MM-DD to that date this year or next year if past; invalid gives null", () => {
    expect(parseDueWord("10-30", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("10-22", today, "en")).toBe("2026-10-22");
    expect(parseDueWord("10-20", today, "en")).toBe("2027-10-20");
    expect(parseDueWord("02-30", today, "en")).toBeNull();
    expect(parseDueWord("13-01", today, "en")).toBeNull();
  });

  it("resolves valid YYYY-MM-DD to itself", () => {
    expect(parseDueWord("2026-10-30", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("2027-05-15", today, "en")).toBe("2027-05-15");
  });

  it("returns null for anything else", () => {
    expect(parseDueWord("friday-ish", today, "en")).toBeNull();
    expect(parseDueWord("0", today, "en")).toBeNull();
    expect(parseDueWord("+0", today, "en")).toBeNull();
    expect(parseDueWord("-3", today, "en")).toBeNull();
    expect(parseDueWord("2026-02-30", today, "en")).toBeNull();
    expect(parseDueWord("", today, "en")).toBeNull();
    expect(parseDueWord("   ", today, "en")).toBeNull();
  });

  it("English words always win over a locale word spelled the same", () => {
    expect(parseDueWord("t", today, "nl")).toBe("2026-10-22");
    expect(parseDueWord("today", today, "nl")).toBe("2026-10-22");
    expect(parseDueWord("mon", today, "fr")).toBe("2026-10-26");
  });

  it("special test cases from brief: on a Friday fri gives next week's Friday", () => {
    expect(parseDueWord("fri", "2026-10-23", "en")).toBe("2026-10-30");
  });

  it("special test cases from brief: on 2026-12-30 01-05 gives 2027-01-05 and wk1 gives Friday of week 1 of 2027", () => {
    expect(parseDueWord("01-05", "2026-12-30", "en")).toBe("2027-01-05");
    // Friday of week 1 of 2027 is 2027-01-08
    expect(parseDueWord("wk1", "2026-12-30", "en")).toBe("2027-01-08");
  });
});

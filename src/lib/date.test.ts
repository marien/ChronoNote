import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatISO, todayISO, parseDateQuery, addMonths, monthGrid, parseISODateLocal, addDaysISO } from "./date";

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

  it("parseDateQuery trims and lowercases free-text input", () => {
    expect(parseDateQuery("  TODAY  ")).toBe("2026-09-15");
  });

  it("parseDateQuery returns null for unrecognized input", () => {
    expect(parseDateQuery("next tuesday")).toBeNull();
    expect(parseDateQuery("")).toBeNull();
    expect(parseDateQuery("2026-13-01")).toBe("2026-13-01"); // shape-only check, not calendar-valid — documents current behavior
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

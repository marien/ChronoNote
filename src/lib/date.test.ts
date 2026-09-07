import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatISO, todayISO, parseDateQuery } from "./date";

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

import { describe, expect, it } from "vitest";
import { adjacentNoteDate, relativeDay } from "./phoneNav";

describe("adjacentNoteDate", () => {
  it("returns null when dates list is empty", () => {
    expect(adjacentNoteDate("2026-10-09", [], 1)).toBeNull();
    expect(adjacentNoteDate("2026-10-09", [], -1)).toBeNull();
  });

  it("finds the nearest date strictly before and after among unordered dates", () => {
    const dates = ["2026-10-05", "2026-10-12", "2026-10-08", "2026-10-15", "2026-10-01"];
    expect(adjacentNoteDate("2026-10-09", dates, -1)).toBe("2026-10-08");
    expect(adjacentNoteDate("2026-10-09", dates, 1)).toBe("2026-10-12");
  });

  it("ignores the current date itself (strictly before / strictly after)", () => {
    const dates = ["2026-10-08", "2026-10-09", "2026-10-10"];
    expect(adjacentNoteDate("2026-10-09", dates, -1)).toBe("2026-10-08");
    expect(adjacentNoteDate("2026-10-09", dates, 1)).toBe("2026-10-10");
  });

  it("returns null if no date exists in the requested direction", () => {
    const dates = ["2026-10-01", "2026-10-05"];
    expect(adjacentNoteDate("2026-10-01", dates, -1)).toBeNull();
    expect(adjacentNoteDate("2026-10-08", dates, 1)).toBeNull();
  });

  it("handles duplicate dates gracefully", () => {
    const dates = ["2026-10-05", "2026-10-05", "2026-10-12", "2026-10-12"];
    expect(adjacentNoteDate("2026-10-08", dates, -1)).toBe("2026-10-05");
    expect(adjacentNoteDate("2026-10-08", dates, 1)).toBe("2026-10-12");
  });
});

describe("relativeDay", () => {
  const today = "2026-10-09";

  it("identifies today", () => {
    expect(relativeDay("2026-10-09", today)).toBe("today");
  });

  it("identifies yesterday", () => {
    expect(relativeDay("2026-10-08", today)).toBe("yesterday");
  });

  it("identifies tomorrow", () => {
    expect(relativeDay("2026-10-10", today)).toBe("tomorrow");
  });

  it("returns null for dates further away", () => {
    expect(relativeDay("2026-10-07", today)).toBeNull();
    expect(relativeDay("2026-10-11", today)).toBeNull();
    expect(relativeDay("2025-10-09", today)).toBeNull();
  });

  it("correctly handles month boundaries", () => {
    const firstOfMonth = "2026-11-01";
    expect(relativeDay("2026-10-31", firstOfMonth)).toBe("yesterday");
    expect(relativeDay("2026-11-02", firstOfMonth)).toBe("tomorrow");
  });

  it("correctly handles year boundaries", () => {
    const newYear = "2027-01-01";
    expect(relativeDay("2026-12-31", newYear)).toBe("yesterday");
    expect(relativeDay("2027-01-02", newYear)).toBe("tomorrow");
  });
});

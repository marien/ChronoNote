import { describe, expect, it } from "vitest";
import { DuePillWidget } from "./dueDates";

describe("DuePillWidget", () => {
  const pill = (lineIdx: number, partFrom = 0) =>
    new DuePillWidget("2026-10-30", "later", false, "en", lineIdx, partFrom, "2026-10-22");

  it("is reused only for the same line and part, so a click never edits another line", () => {
    expect(pill(3).eq(pill(3))).toBe(true);
    // A line inserted above moves the action from line 3 to 4: its pill must be redrawn with the new line.
    expect(pill(3).eq(pill(4))).toBe(false);
    expect(pill(3, 0).eq(pill(3, 12))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { DuePillWidget } from "./dueDates";

describe("DuePillWidget", () => {
  const pill = (date = "2026-10-30", status: "overdue" | "today" | "later" = "later") =>
    new DuePillWidget(date, status, false, "en", "2026-10-22", 13);

  it("is reused while it looks the same, wherever its line moved (a click finds the line itself)", () => {
    expect(pill().eq(pill())).toBe(true);
    expect(pill().eq(pill("2026-10-31"))).toBe(false);
    expect(pill().eq(pill("2026-10-30", "today"))).toBe(false);
  });
});

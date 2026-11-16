import { describe, expect, it } from "vitest";
import { hasActiveFilter, nodeMatchesQuery } from "./actionDrawerRows";
import { parseSearchQuery } from "./search";
import type { ActionSnapshotItem } from "./types";

function makeItem(overrides: Partial<ActionSnapshotItem> = {}): ActionSnapshotItem {
  return {
    id: "2026-11-16.txt-1",
    filename: "2026-11-16.txt",
    lineIdx: 1,
    line: "# call Sam",
    header: "Design review",
    ...overrides,
  };
}

describe("nodeMatchesQuery with section: and new is: words", () => {
  it("matches section:review against item.header", () => {
    const parsed = parseSearchQuery("section:review");
    expect(nodeMatchesQuery(makeItem({ header: "Design review" }), parsed)).toBe(true);
    expect(nodeMatchesQuery(makeItem({ header: "Weekly sync" }), parsed)).toBe(false);
  });

  it("matches is:decision, is:topic, and is:emphasis against item.line", () => {
    expect(
      nodeMatchesQuery(makeItem({ line: "# call Sam => yes" }), parseSearchQuery("is:decision")),
    ).toBe(true);
    expect(
      nodeMatchesQuery(makeItem({ line: "# call Sam" }), parseSearchQuery("is:decision")),
    ).toBe(false);

    expect(
      nodeMatchesQuery(makeItem({ line: "# call => o follow-up topic" }), parseSearchQuery("is:topic")),
    ).toBe(true);
    expect(
      nodeMatchesQuery(makeItem({ line: "# call Sam" }), parseSearchQuery("is:topic")),
    ).toBe(false);

    expect(
      nodeMatchesQuery(makeItem({ line: "! the hall is booked" }), parseSearchQuery("is:emphasis")),
    ).toBe(true);
    expect(
      nodeMatchesQuery(makeItem({ line: "# call Sam" }), parseSearchQuery("is:emphasis")),
    ).toBe(false);
  });
});

describe("hasActiveFilter for the new search words", () => {
  it.each([
    "is:decision",
    "is:topic",
    "is:emphasis",
    "section:review",
    'section:"design review"',
  ])("returns true for %j alone", (query) => {
    expect(hasActiveFilter(parseSearchQuery(query))).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  SEEN_START_SECTION,
  checkSeen,
  parseChangelogEntries,
  parseOpenChecks,
  sectionsInCell,
} from "../../scripts/seen-check.mjs";

describe("sectionsInCell (scripts/seen-check.mjs)", () => {
  it.each([
    ["§481-§486", [481, 482, 483, 484, 485, 486]],
    ["§493, §495", [493, 495]],
    ["§485", [485]],
    ["§499", [499]],
    ["none", []],
  ])("expands %s -> %j", (cell, expected) => {
    expect(sectionsInCell(cell)).toEqual(expected);
  });
});

describe("checkSeen (scripts/seen-check.mjs)", () => {
  it("reports a released entry >= 479 without a Seen line or open-checks row as missing", () => {
    const res = checkSeen(
      [{ num: 500, title: "Feature", released: true, seen: false }],
      [],
    );
    expect(res.missing.map((e) => e.num)).toEqual([500]);
    expect(res.stale).toEqual([]);
  });

  it("does not report a released unseen entry when an open-checks range row covers it", () => {
    const res = checkSeen(
      [{ num: 500, title: "Feature", released: true, seen: false }],
      [{ what: "Check range", section: "§499-§501" }],
    );
    expect(res).toEqual({ missing: [], stale: [] });
  });

  it("reports an open-checks row as stale when its only entry is seen", () => {
    const row = { what: "Check §500", section: "§500" };
    const res = checkSeen(
      [{ num: 500, title: "Feature", released: true, seen: true }],
      [row],
    );
    expect(res.missing).toEqual([]);
    expect(res.stale).toEqual([row]);
  });

  it("keeps a multi-entry row when at least one entry is not seen", () => {
    const res = checkSeen(
      [
        { num: 499, title: "A", released: true, seen: true },
        { num: 500, title: "B", released: true, seen: false },
      ],
      [{ what: "Check both", section: "§499, §500" }],
    );
    expect(res).toEqual({ missing: [], stale: [] });
  });

  it("ignores an unreleased entry with no open-checks row", () => {
    const res = checkSeen(
      [{ num: 501, title: "Unreleased", released: false, seen: false }],
      [],
    );
    expect(res).toEqual({ missing: [], stale: [] });
  });

  it("ignores a released unseen entry below SEEN_START_SECTION", () => {
    expect(SEEN_START_SECTION).toBe(479);
    const res = checkSeen(
      [{ num: 470, title: "Older", released: true, seen: false }],
      [],
    );
    expect(res).toEqual({ missing: [], stale: [] });
  });
});

describe("parseChangelogEntries Seen line parsing", () => {
  it("counts both date+where and not-needed forms after Status, and ignores unbolded or pre-Status lines", () => {
    const md = [
      "## 490. Date and where",
      "",
      "**Status: released in beta 0.39.0-1 (early channel only).**",
      "",
      "**Seen by Marien:** 2026-11-18, beta 0.39.0-1.",
      "",
      "## 491. Not needed",
      "",
      "**Status: released in beta 0.39.0-1 (early channel only).**",
      "",
      "**Seen by Marien:** not needed (tests and tooling only).",
      "",
      "## 492. Missing bold",
      "",
      "**Status: released in beta 0.39.0-1 (early channel only).**",
      "",
      "Seen by Marien: 2026-11-18, beta 0.39.0-1.",
      "",
      "## 493. Seen before Status",
      "",
      "**Seen by Marien:** 2026-11-18, beta 0.39.0-1.",
      "",
      "**Status: released in beta 0.39.0-1 (early channel only).**",
      "",
    ].join("\r\n");

    const parsed = parseChangelogEntries(md);
    expect(parsed.map((e) => ({ num: e.num, released: e.released, seen: e.seen }))).toEqual([
      { num: 490, released: true, seen: true },
      { num: 491, released: true, seen: true },
      { num: 492, released: true, seen: false },
      { num: 493, released: true, seen: false },
    ]);
  });

  it("parses open-checks table rows and expands their sections", () => {
    const md = [
      "# Open checks",
      "",
      "| Since | What to check | Where / how | Section |",
      "|---|---|---|---|",
      "| 2026-11-16 | Person view | dev build | §496 |",
      "| 2026-11-16 | Search words | dev build | §493, §495 |",
    ].join("\n");

    expect(parseOpenChecks(md)).toEqual([
      { since: "2026-11-16", what: "Person view", where: "dev build", section: "§496", sections: [496] },
      { since: "2026-11-16", what: "Search words", where: "dev build", section: "§493, §495", sections: [493, 495] },
    ]);
  });
});

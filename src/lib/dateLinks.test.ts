import { describe, expect, it } from "vitest";
import { findSectionLine, parseDateLink } from "./dateLinks";

describe("parseDateLink", () => {
  it("parses bare date", () => {
    expect(parseDateLink("2026-10-03")).toEqual({ date: "2026-10-03" });
  });

  it("parses date with section", () => {
    expect(parseDateLink("2026-10-03#Standup")).toEqual({
      date: "2026-10-03",
      section: "Standup",
    });
  });

  it("parses (to YYYY-MM-DD#Section) form", () => {
    expect(parseDateLink("(to 2026-10-14#Weekly Sync)")).toEqual({
      date: "2026-10-14",
      section: "Weekly Sync",
    });
  });

  it("parses (from YYYY-MM-DD) form", () => {
    expect(parseDateLink("(from 2026-10-13)")).toEqual({
      date: "2026-10-13",
    });
  });

  it("rejects numbers with more than 4 year digits", () => {
    expect(parseDateLink("12026-10-03")).toBeNull();
  });

  it("rejects invalid calendar dates", () => {
    expect(parseDateLink("2026-13-40")).toBeNull();
  });
});

describe("findSectionLine", () => {
  it("matches a dated section title with #Section", () => {
    const content = [
      "Top Notes",
      "=========",
      "Weekly Sync - 2026-10-14",
      "========================",
      "# action item",
    ].join("\n");

    const line = findSectionLine(content, "#Weekly Sync");
    expect(line).toBe(2);
  });

  it("matches section title without #", () => {
    const content = [
      "Weekly Sync - 2026-10-14",
      "========================",
    ].join("\n");

    const line = findSectionLine(content, "Weekly Sync");
    expect(line).toBe(0);
  });

  it("returns null when section is not found", () => {
    const content = [
      "Daily Standup",
      "=============",
    ].join("\n");

    const line = findSectionLine(content, "#Other");
    expect(line).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { findSectionLine, parseDateLink } from "./dateLinks";

describe("parseDateLink", () => {
  it("parses bare date", () => {
    expect(parseDateLink("2026-10-03")).toEqual({ date: "2026-10-03" });
  });

  it("parses bare date with section as date only (no section link without brackets)", () => {
    expect(parseDateLink("2026-10-03#Standup")).toEqual({
      date: "2026-10-03",
    });
  });

  it("parses (YYYY-MM-DD#Section) bracketed form", () => {
    expect(parseDateLink("(2026-10-03#Standup)")).toEqual({
      date: "2026-10-03",
      section: "Standup",
    });
  });

  it("parses (>YYYY-MM-DD#Section) form", () => {
    expect(parseDateLink("(>2026-10-14#Weekly Sync)")).toEqual({
      date: "2026-10-14",
      section: "Weekly Sync",
    });
  });

  it("parses (<YYYY-MM-DD#Section) form", () => {
    expect(parseDateLink("(<2026-10-13#Standup)")).toEqual({
      date: "2026-10-13",
      section: "Standup",
    });
  });

  it("parses (<YYYY-MM-DD) form", () => {
    expect(parseDateLink("(<2026-10-13)")).toEqual({
      date: "2026-10-13",
    });
  });

  it("parses (YYYY-MM-DD) bracketed date without section", () => {
    expect(parseDateLink("(2026-10-03)")).toEqual({
      date: "2026-10-03",
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

describe("backStack and forwardStack navigation", () => {
  it("navigates back and forward, pushing places onto the opposite stack", async () => {
    const { get } = await import("svelte/store");
    const { backStack, forwardStack, tabs, activeTabId } = await import("./stores");
    const { navigateBack, navigateForward, openDateLink } = await import("./dateLinks");

    tabs.set([
      { id: "t1", filename: "2026-10-01.txt", content: "Day 1", isScratchpad: false },
      { id: "t2", filename: "2026-10-02.txt", content: "Day 2", isScratchpad: false },
    ]);
    activeTabId.set("t1");
    backStack.set([]);
    forwardStack.set([]);

    // Jump from t1 to 2026-10-02
    await openDateLink("2026-10-02");
    expect(get(backStack)).toEqual([{ filename: "2026-10-01.txt", lineIdx: 0 }]);
    expect(get(forwardStack)).toEqual([]);

    // Back: returns to 2026-10-01, pushing 2026-10-02 to forwardStack
    await navigateBack();
    expect(get(activeTabId)).toBe("t1");
    expect(get(forwardStack)).toEqual([{ filename: "2026-10-02.txt", lineIdx: 0 }]);
    expect(get(backStack)).toEqual([]);

    // Forward: returns to 2026-10-02, pushing 2026-10-01 to backStack
    await navigateForward();
    expect(get(activeTabId)).toBe("t2");
    expect(get(backStack)).toEqual([{ filename: "2026-10-01.txt", lineIdx: 0 }]);
    expect(get(forwardStack)).toEqual([]);
  });

  it("a new link jump clears forwardStack", async () => {
    const { get } = await import("svelte/store");
    const { backStack, forwardStack, tabs, activeTabId } = await import("./stores");
    const { navigateBack, openDateLink } = await import("./dateLinks");

    tabs.set([
      { id: "t1", filename: "2026-10-01.txt", content: "Day 1", isScratchpad: false },
      { id: "t2", filename: "2026-10-02.txt", content: "Day 2", isScratchpad: false },
      { id: "t3", filename: "2026-10-03.txt", content: "Day 3", isScratchpad: false },
    ]);
    activeTabId.set("t1");
    backStack.set([]);
    forwardStack.set([]);

    await openDateLink("2026-10-02");
    await navigateBack();
    expect(get(forwardStack).length).toBe(1);

    // New jump to 2026-10-03 clears forwardStack
    await openDateLink("2026-10-03");
    expect(get(forwardStack)).toEqual([]);
  });
});

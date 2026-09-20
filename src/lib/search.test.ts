import { describe, expect, it, beforeEach } from "vitest";
import { parseSearchQuery, runSearch } from "./search";
import { allNotesCache, searchResultsStore, tabs } from "./stores";
import type { NoteTab } from "./types";

describe("parseSearchQuery operator parser (Decision 7 / Area 8.2)", () => {
  it("parses empty query and plain search term", () => {
    const res1 = parseSearchQuery("");
    expect(res1.term).toBe("");
    expect(res1.chips).toEqual([]);
    expect(res1.operators).toEqual({});

    const res2 = parseSearchQuery("plain search query");
    expect(res2.term).toBe("plain search query");
    expect(res2.chips).toEqual([]);
  });

  it("parses 'is:open' and 'is:done' operators", () => {
    const res1 = parseSearchQuery("is:open project");
    expect(res1.term).toBe("project");
    expect(res1.operators.isOpen).toBe(true);
    expect(res1.chips).toHaveLength(1);
    expect(res1.chips[0]).toEqual({
      id: "op-is-open",
      raw: "is:open",
      label: "is:open",
      kind: "is",
      value: "open",
    });

    const res2 = parseSearchQuery("review is:done");
    expect(res2.term).toBe("review");
    expect(res2.operators.isDone).toBe(true);
    expect(res2.chips[0].label).toBe("is:done");
  });

  it("parses 'tag:' operator", () => {
    const res = parseSearchQuery("tag:ui bug fix");
    expect(res.term).toBe("bug fix");
    expect(res.operators.tag).toBe("ui");
    expect(res.chips[0]).toEqual({
      id: "op-tag-ui",
      raw: "tag:ui",
      label: "tag:ui",
      kind: "tag",
      value: "ui",
    });
  });

  it("parses 'has:@' and 'has:' operator", () => {
    const res1 = parseSearchQuery("has:@marien deploy");
    expect(res1.term).toBe("deploy");
    expect(res1.operators.hasAssignee).toBe("marien");
    expect(res1.chips[0].label).toBe("has:@marien");

    const res2 = parseSearchQuery("has:alice meeting");
    expect(res2.term).toBe("meeting");
    expect(res2.operators.hasAssignee).toBe("alice");
    expect(res2.chips[0].label).toBe("has:@alice");
  });

  it("parses 'since:' and 'before:' date operators", () => {
    const res = parseSearchQuery("since:2026-09-01 before:2026-09-20 roadmap");
    expect(res.term).toBe("roadmap");
    expect(res.operators.since).toBe("2026-09-01");
    expect(res.operators.before).toBe("2026-09-20");
    expect(res.chips).toHaveLength(2);
  });
});

describe("runSearch 3-line context extraction and operator filtering", () => {
  beforeEach(() => {
    const note1 = [
      "Header line 1",
      "# (ui) Implement command palette @marien",
      "Context line after task",
      "v (backend) Finished migration",
      "End of note",
    ].join("\n");

    const note2 = [
      "First line",
      "# Another open task",
      "Last line",
    ].join("\n");

    tabs.set([
      {
        id: "tab-1",
        filename: "2026-09-15.txt",
        content: note1,
        isScratchpad: false,
        isDirty: false,
      } as NoteTab,
      {
        id: "tab-2",
        filename: "2026-09-25.txt",
        content: note2,
        isScratchpad: false,
        isDirty: false,
      } as NoteTab,
    ]);

    allNotesCache.set({
      "2026-09-15.txt": note1,
      "2026-09-25.txt": note2,
    });
  });

  it("extracts 3-line context (contextBefore, matched line, contextAfter)", () => {
    runSearch("palette", "open");
    let results: any[] = [];
    searchResultsStore.subscribe((r) => (results = r))();

    expect(results).toHaveLength(1);
    expect(results[0].line).toBe("# (ui) Implement command palette @marien");
    expect(results[0].lineIdx).toBe(1);
    expect(results[0].contextBefore).toBe("Header line 1");
    expect(results[0].contextAfter).toBe("Context line after task");
  });

  it("handles boundary lines without crashing (top of file has no contextBefore, bottom has no contextAfter)", () => {
    runSearch("Header line 1", "open");
    let results: any[] = [];
    searchResultsStore.subscribe((r) => (results = r))();

    expect(results).toHaveLength(1);
    expect(results[0].contextBefore).toBeUndefined();
    expect(results[0].contextAfter).toBe("# (ui) Implement command palette @marien");
  });

  it("filters with 'is:open' operator", () => {
    runSearch("is:open", "open");
    let results: any[] = [];
    searchResultsStore.subscribe((r) => (results = r))();

    expect(results).toHaveLength(2);
    const lines = results.map((r) => r.line);
    expect(lines.some((l) => l.includes("palette"))).toBe(true);
    expect(lines.some((l) => l.includes("Another open task"))).toBe(true);
  });

  it("filters with 'tag:' and 'has:@' operators", () => {
    runSearch("tag:ui has:@marien", "open");
    let results: any[] = [];
    searchResultsStore.subscribe((r) => (results = r))();

    expect(results).toHaveLength(1);
    expect(results[0].line).toBe("# (ui) Implement command palette @marien");
  });

  it("filters with 'since:' and 'before:' date operators", () => {
    runSearch("before:2026-09-20", "open");
    let results: any[] = [];
    searchResultsStore.subscribe((r) => (results = r))();

    // Only note from 2026-09-15 should match
    expect(results.every((r) => r.tabFilename === "2026-09-15.txt")).toBe(true);
  });
});

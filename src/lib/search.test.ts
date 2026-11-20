import { describe, expect, it, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
  escapeRegExp,
  isDecisionLine,
  isEmphasisLine,
  isTopicLine,
  parseSearchQuery,
  pickContextBefore,
  removeChipFromQuery,
  runSearch,
  splitQuery,
} from "./search";
import { clearDiskLayer, seedDiskNotesForTest } from "./notesIndex/diskLayer";
import { _facetRuns } from "./notesIndex/facets";
import { searchResultsStore, tabs } from "./stores";
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
    expect(res1.chips[0]).toMatchObject({
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
    expect(res.chips[0]).toMatchObject({
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

  it("parses 'due:' operator with ISO date or relative word", () => {
    // ISO date
    const res1 = parseSearchQuery("due:2026-10-25 invoice");
    expect(res1.term).toBe("invoice");
    expect(res1.operators.due).toBe("2026-10-25");
    expect(res1.chips).toHaveLength(1);
    expect(res1.chips[0]).toMatchObject({
      id: "op-due-2026-10-25",
      raw: "due:2026-10-25",
      label: "due:2026-10-25",
      kind: "due",
      value: "2026-10-25",
    });

    // Relative word with search context
    const ctx = { todayISO: "2026-10-24", weekStartsOn: "monday" as const, locale: "en" };
    const res2 = parseSearchQuery("due:tomorrow deploy", ctx);
    expect(res2.term).toBe("deploy");
    expect(res2.operators.due).toBe("2026-10-25");
    expect(res2.chips[0].label).toBe("due:2026-10-25");

    // Unrecognized due word remains in term
    const res3 = parseSearchQuery("due:notaword deploy", ctx);
    expect(res3.term).toBe("due:notaword deploy");
    expect(res3.operators.due).toBeUndefined();
    expect(res3.chips).toHaveLength(0);
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

    clearDiskLayer();
    seedDiskNotesForTest({
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

  it("pickContextBefore shows section title instead of setext underline (=== or ---) and keeps prose otherwise", () => {
    const lines = [
      "Top priorities",
      "==============",
      "# ask @Dana about the release checklist",
      "- today: prep slides",
      "# book user-testing",
      "Sub section",
      "-----------",
      "# nested hit",
      "",
      "====",
      "# orphan underline hit",
    ];
    expect(pickContextBefore(lines, 0)).toBeUndefined();
    expect(pickContextBefore(lines, 2)).toBe("Top priorities");
    expect(pickContextBefore(lines, 4)).toBe("- today: prep slides");
    expect(pickContextBefore(lines, 7)).toBe("Sub section");
    expect(pickContextBefore(lines, 10)).toBe("====");
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

  it("filters with 'due:' operator", () => {
    tabs.set([
      {
        id: "tab-due",
        filename: "due.txt",
        content: "# task due on date by:2026-09-30\n# task due other by:2026-10-05\nplain line",
        isScratchpad: false,
        isDirty: false,
      } as NoteTab,
    ]);
    runSearch("due:2026-09-30", "open");
    let results: any[] = [];
    searchResultsStore.subscribe((r) => (results = r))();
    expect(results).toHaveLength(1);
    expect(results[0].line).toBe("# task due on date by:2026-09-30");
  });

  it("handles repeated identical operators without crashing or producing duplicate chips", () => {
    const parsed = parseSearchQuery("is:open is:open tag:ui tag:ui");
    expect(parsed.chips).toHaveLength(2);
    expect(parsed.chips.map((c) => c.label)).toEqual(["is:open", "tag:ui"]);
    expect(parsed.operators.isOpen).toBe(true);
    expect(parsed.operators.tags).toEqual(["ui"]);
  });

  it("resolves conflicting single-valued operators where last one wins (is:open is:done, two since:)", () => {
    const parsed = parseSearchQuery("is:open is:done since:2026-09-01 since:2026-09-10");
    // is:done overrides is:open, second since overrides first
    expect(parsed.operators.isOpen).toBeUndefined();
    expect(parsed.operators.isDone).toBe(true);
    expect(parsed.operators.since).toBe("2026-09-10");
    expect(parsed.chips).toHaveLength(2);
    expect(parsed.chips.find((c) => c.kind === "is")?.value).toBe("done");
    expect(parsed.chips.find((c) => c.kind === "since")?.value).toBe("2026-09-10");
  });

  it("handles two different tag: operators by matching all of them", () => {
    const parsed = parseSearchQuery("tag:ui tag:backend");
    expect(parsed.operators.tags).toEqual(["ui", "backend"]);
    expect(parsed.chips).toHaveLength(2);
    expect(parsed.chips[0].label).toBe("tag:ui");
    expect(parsed.chips[1].label).toBe("tag:backend");
  });

  it("records exact token start/end indices on chips for precise removal", () => {
    const q = "is:open palette tag:ui";
    const parsed = parseSearchQuery(q);
    const chip = parsed.chips.find((c) => c.label === "tag:ui");
    expect(chip?.startIndex).toBe(16);
    expect(chip?.endIndex).toBe(22);
    const removed = (q.slice(0, chip!.startIndex) + " " + q.slice(chip!.endIndex))
      .replace(/\s{2,}/g, " ")
      .trim();
    expect(removed).toBe("is:open palette");
  });
});

describe("regex-safe operators and chip removal", () => {
  it("escapeRegExp neutralises every metacharacter", () => {
    const raw = "a(b)[c].*+?^$|{}\\";
    expect(new RegExp(escapeRegExp(raw)).test(raw)).toBe(true);
  });

  it("an assignee value with regex metacharacters never throws", () => {
    expect(() => runSearch("has:@a(b", "open")).not.toThrow();
    expect(() => runSearch("has:@a.b*", "open")).not.toThrow();
  });

  it("removing a chip drops every occurrence of that operator", () => {
    const q = "is:open deploy is:open";
    expect(removeChipFromQuery(q, parseSearchQuery(q).chips[0])).toBe("deploy");
  });

  it("removing an is: chip also drops a superseded is: token", () => {
    const q = "is:open is:done x";
    expect(removeChipFromQuery(q, parseSearchQuery(q).chips[0])).toBe("x");
  });

  it("removing a tag chip only drops that tag", () => {
    const q = "tag:ui tag:api foo";
    const chip = parseSearchQuery(q).chips.find((c) => c.value === "ui")!;
    expect(removeChipFromQuery(q, chip)).toBe("tag:api foo");
  });

  it("removing a due chip drops the due operator", () => {
    const q = "due:2026-10-25 deploy";
    const chip = parseSearchQuery(q).chips.find((c) => c.kind === "due")!;
    expect(removeChipFromQuery(q, chip)).toBe("deploy");
  });

  it("removing a quoted section: chip drops it whole", () => {
    const q = 'section:"design review" budget';
    const chip = parseSearchQuery(q).chips.find((c) => c.kind === "section")!;
    expect(removeChipFromQuery(q, chip)).toBe("budget");
  });
});

describe("splitQuery and new search words (F7a)", () => {
  it("splitQuery handles quoted section: values and tracks start/end", () => {
    expect(splitQuery('section:"design review" is:open budget')).toEqual([
      { token: 'section:"design review"', start: 0, end: 23 },
      { token: "is:open", start: 24, end: 31 },
      { token: "budget", start: 32, end: 38 },
    ]);
    expect(splitQuery('section:"design review')).toEqual([
      { token: 'section:"design review', start: 0, end: 22 },
    ]);
  });

  it("parseSearchQuery parses is:decision, is:topic, is:emphasis, section:, and empty section:", () => {
    const dec = parseSearchQuery("IS:DECISION");
    expect(dec.operators.isDecision).toBe(true);
    expect(dec.chips[0]).toMatchObject({ kind: "is", label: "is:decision", value: "decision" });

    const top = parseSearchQuery("is:topic");
    expect(top.operators.isTopic).toBe(true);
    expect(top.chips[0]).toMatchObject({ kind: "is", label: "is:topic", value: "topic" });

    const emp = parseSearchQuery("is:emphasis");
    expect(emp.operators.isEmphasis).toBe(true);
    expect(emp.chips[0]).toMatchObject({ kind: "is", label: "is:emphasis", value: "emphasis" });

    const sec = parseSearchQuery("section:review");
    expect(sec.operators.section).toBe("review");
    expect(sec.chips[0]).toMatchObject({ kind: "section", label: "section:review", value: "review" });

    const quoted = parseSearchQuery('SECTION:"design review"');
    expect(quoted.operators.section).toBe("design review");
    expect(quoted.chips[0]).toMatchObject({
      kind: "section",
      label: 'section:"design review"',
      value: "design review",
    });

    const empty1 = parseSearchQuery("section:");
    expect(empty1.operators).toEqual({});
    expect(empty1.chips).toEqual([]);
    expect(empty1.term).toBe("section:");

    const empty2 = parseSearchQuery('section:""');
    expect(empty2.operators).toEqual({});
    expect(empty2.chips).toEqual([]);
    expect(empty2.term).toBe('section:""');
  });

  it("is: words share one slot and replace earlier ones", () => {
    const r1 = parseSearchQuery("is:open is:decision");
    expect(r1.operators).toEqual({ isDecision: true });
    expect(r1.chips).toHaveLength(1);
    expect(r1.chips[0].label).toBe("is:decision");

    const r2 = parseSearchQuery("is:decision is:done");
    expect(r2.operators).toEqual({ isDone: true });
    expect(r2.chips).toHaveLength(1);
    expect(r2.chips[0].label).toBe("is:done");

    const r3 = parseSearchQuery("is:topic is:emphasis");
    expect(r3.operators).toEqual({ isEmphasis: true });
    expect(r3.chips).toHaveLength(1);
    expect(r3.chips[0].label).toBe("is:emphasis");

    const secReplace = parseSearchQuery('section:board section:"design review"');
    expect(secReplace.operators.section).toBe("design review");
    expect(secReplace.chips).toHaveLength(1);
    expect(secReplace.chips[0].label).toBe('section:"design review"');
  });

  it("isDecisionLine classifies lines from tokenizeLine", () => {
    expect(isDecisionLine(". budget => we keep the Q1 numbers")).toBe(true);
    expect(isDecisionLine("=> moved to March")).toBe(true);
    expect(isDecisionLine("# ask Sam => yes, approved")).toBe(true);

    expect(isDecisionLine("=> # call Sam")).toBe(false);
    expect(isDecisionLine("=> o next week")).toBe(false);
    expect(isDecisionLine("=> @dana prepare")).toBe(false);
    expect(isDecisionLine("# ask Sam")).toBe(false);
    expect(isDecisionLine("=> ")).toBe(false);
  });

  it("isTopicLine classifies lines via innermostTopicSymbol", () => {
    expect(isTopicLine("o coffee rota (@Ruth, @Ben)")).toBe(true);
    expect(isTopicLine(". budget")).toBe(true);
    expect(isTopicLine(", parked item")).toBe(true);
    expect(isTopicLine("# call => o follow-up topic")).toBe(true);

    expect(isTopicLine("# call Sam")).toBe(false);
    expect(isTopicLine("- bullet")).toBe(false);
    expect(isTopicLine("plain text")).toBe(false);
  });

  it("isEmphasisLine classifies lines via emphasis token", () => {
    expect(isEmphasisLine("! the hall is booked until 22:00")).toBe(true);
    expect(isEmphasisLine("  ! - indented emphasis")).toBe(true);

    expect(isEmphasisLine("a ! in the middle")).toBe(false);
    expect(isEmphasisLine("# call!")).toBe(false);
  });

  it("runSearch filters by section:, is:decision, is:topic, is:emphasis and skips blank lines", () => {
    const note = [
      "above the first section => not in a section",
      "Board meeting",
      "===",
      ". budget => we keep the Q1 numbers",
      "# call Sam => yes",
      "=> # follow up",
      "! the hall is booked",
      "",
      "Design review",
      "===",
      "=> moved to March",
    ].join("\n");

    tabs.set([
      {
        id: "tab-f7a",
        filename: "2026-11-16.txt",
        content: note,
        isScratchpad: false,
        isDirty: false,
      } as NoteTab,
    ]);
    clearDiskLayer();
    seedDiskNotesForTest({ "2026-11-16.txt": note });

    const lineIdxs = (q: string, scope: "open" | "all" = "open") => {
      runSearch(q, scope);
      return get(searchResultsStore).map((r) => r.lineIdx);
    };

    for (const scope of ["open", "all"] as const) {
      expect(lineIdxs("section:board is:decision", scope)).toEqual([3, 4]);
      expect(lineIdxs("section:board is:decision budget", scope)).toEqual([3]);
      expect(lineIdxs("is:decision", scope)).toEqual([0, 3, 4, 10]);
      expect(lineIdxs("section:review", scope)).toEqual([10]);
      expect(lineIdxs("section:board", scope)).toEqual([3, 4, 5, 6]);
      expect(lineIdxs("is:topic", scope)).toEqual([3]);
      expect(lineIdxs("is:emphasis", scope)).toEqual([6]);
    }
  });

  it("section: normalizes titles, strips dates, and avoids computing sections when unused", () => {
    const note = [
      "[10:00 - 10:30] Design review",
      "===",
      "line in design review",
      "Board meeting - 2026-11-03",
      "===",
      "line in board 2026",
      "[CANCELED] Board meeting",
      "===",
      "line in canceled board",
      "Weekly sync",
      "===",
      "line in weekly sync",
    ].join("\n");

    clearDiskLayer();
    tabs.set([]);
    seedDiskNotesForTest({ "2026-11-16.txt": note });

    const beforeSections = _facetRuns.sections;
    runSearch("is:decision", "all");
    expect(_facetRuns.sections).toBe(beforeSections);

    const linesFor = (q: string) => {
      runSearch(q, "all");
      return get(searchResultsStore).map((r) => r.line);
    };
    expect(linesFor("section:review")).toEqual(["line in design review"]);
    expect(linesFor('section:"design review"')).toEqual(["line in design review"]);
    expect(linesFor("section:2026")).toEqual([]);
    expect(linesFor("section:board")).toEqual(["line in board 2026", "line in canceled board"]);
  });
});

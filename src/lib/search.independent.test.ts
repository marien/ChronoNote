import { beforeEach, describe, expect, it } from "vitest";
import {
  isDecisionLine,
  isEmphasisLine,
  isTopicLine,
  parseSearchQuery,
  removeChipFromQuery,
  runSearch,
  splitQuery,
} from "./search";
import { searchResultsStore, tabs } from "./stores";
import type { NoteTab, SearchResultItem } from "./types";

const REFERENCE_NOTE = [
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

function readResults(): SearchResultItem[] {
  let results: SearchResultItem[] = [];
  searchResultsStore.subscribe((r) => {
    results = r;
  })();
  return results;
}

describe("splitQuery", () => {
  it("keeps quoted section:\"design review\" as one token with exact offsets", () => {
    expect(splitQuery('section:"design review" is:open budget')).toEqual([
      { token: 'section:"design review"', start: 0, end: 23 },
      { token: "is:open", start: 24, end: 31 },
      { token: "budget", start: 32, end: 38 },
    ]);
  });

  it("lets an unclosed quote run to the end of the query", () => {
    expect(splitQuery('foo section:"design review')).toEqual([
      { token: "foo", start: 0, end: 3 },
      { token: 'section:"design review', start: 4, end: 26 },
    ]);
  });
});

describe("parseSearchQuery for decision, topic, emphasis, and section", () => {
  it("parses is:decision, is:topic, and is:emphasis", () => {
    const dec = parseSearchQuery("is:decision");
    expect(dec.term).toBe("");
    expect(dec.operators.isDecision).toBe(true);
    expect(dec.chips).toHaveLength(1);
    expect(dec.chips[0]).toMatchObject({ kind: "is", label: "is:decision" });

    const top = parseSearchQuery("is:topic");
    expect(top.term).toBe("");
    expect(top.operators.isTopic).toBe(true);
    expect(top.chips).toHaveLength(1);
    expect(top.chips[0]).toMatchObject({ kind: "is", label: "is:topic" });

    const emp = parseSearchQuery("is:emphasis");
    expect(emp.term).toBe("");
    expect(emp.operators.isEmphasis).toBe(true);
    expect(emp.chips).toHaveLength(1);
    expect(emp.chips[0]).toMatchObject({ kind: "is", label: "is:emphasis" });
  });

  it("parses section: unquoted and quoted, and leaves empty section: in term", () => {
    const unquoted = parseSearchQuery("section:review");
    expect(unquoted.term).toBe("");
    expect(unquoted.operators.section).toBe("review");
    expect(unquoted.chips).toHaveLength(1);
    expect(unquoted.chips[0]).toMatchObject({ kind: "section", label: "section:review" });

    const quoted = parseSearchQuery('section:"design review"');
    expect(quoted.term).toBe("");
    expect(quoted.operators.section).toBe("design review");
    expect(quoted.chips).toHaveLength(1);
    expect(quoted.chips[0]).toMatchObject({ kind: "section", label: 'section:"design review"' });

    const empty1 = parseSearchQuery("section:");
    expect(empty1.operators.section).toBeUndefined();
    expect(empty1.chips).toHaveLength(0);
    expect(empty1.term).toBe("section:");

    const empty2 = parseSearchQuery('section:""');
    expect(empty2.operators.section).toBeUndefined();
    expect(empty2.chips).toHaveLength(0);
    expect(empty2.term).toBe('section:""');
  });

  it("matches all four new words case-insensitively", () => {
    expect(parseSearchQuery("IS:DECISION").operators.isDecision).toBe(true);
    expect(parseSearchQuery("Is:Topic").operators.isTopic).toBe(true);
    expect(parseSearchQuery("iS:eMpHaSiS").operators.isEmphasis).toBe(true);
    expect(parseSearchQuery("SECTION:review").operators.section).toBe("review");
    expect(parseSearchQuery('Section:"design review"').operators.section).toBe("design review");
  });

  it("shares one chip slot across all is: words so the last one wins", () => {
    const r1 = parseSearchQuery("is:open is:decision");
    expect(r1.operators.isDecision).toBe(true);
    expect(r1.operators.isOpen).toBeUndefined();
    expect(r1.chips).toHaveLength(1);
    expect(r1.chips[0]).toMatchObject({ kind: "is", label: "is:decision" });

    const r2 = parseSearchQuery("is:decision is:done");
    expect(r2.operators.isDone).toBe(true);
    expect(r2.operators.isDecision).toBeUndefined();
    expect(r2.chips).toHaveLength(1);
    expect(r2.chips[0]).toMatchObject({ kind: "is", label: "is:done" });

    const r3 = parseSearchQuery("is:topic is:emphasis");
    expect(r3.operators.isEmphasis).toBe(true);
    expect(r3.operators.isTopic).toBeUndefined();
    expect(r3.chips).toHaveLength(1);
    expect(r3.chips[0]).toMatchObject({ kind: "is", label: "is:emphasis" });
  });

  it("replaces an earlier section: chip with a later section:", () => {
    const res = parseSearchQuery('section:board section:"design review"');
    expect(res.operators.section).toBe("design review");
    expect(res.chips).toHaveLength(1);
    expect(res.chips[0]).toMatchObject({ kind: "section", label: 'section:"design review"' });
  });
});

describe("removeChipFromQuery with quoted section", () => {
  it('removes section:"design review" whole from query', () => {
    const q = 'section:"design review" budget';
    const chip = parseSearchQuery(q).chips[0];
    expect(removeChipFromQuery(q, chip)).toBe("budget");
  });
});

describe("line classification helpers", () => {
  it.each([
    [". budget => we keep the Q1 numbers", true],
    ["=> moved to March", true],
    ["# ask Sam => yes, approved", true],
    ["=> # call Sam", false],
    ["=> o next week", false],
    ["=> @dana prepare", false],
    ["# ask Sam", false],
    ["=> ", false],
  ])("isDecisionLine(%j) === %s", (line, expected) => {
    expect(isDecisionLine(line)).toBe(expected);
  });

  it.each([
    ["o coffee rota (@Ruth, @Ben)", true],
    [". budget", true],
    [", parked item", true],
    ["# call => o follow-up topic", true],
    ["# call Sam", false],
    ["- bullet", false],
    ["plain text", false],
  ])("isTopicLine(%j) === %s", (line, expected) => {
    expect(isTopicLine(line)).toBe(expected);
  });

  it.each([
    ["! the hall is booked until 22:00", true],
    ["  ! - indented emphasis", true],
    ["a ! in the middle", false],
    ["# call!", false],
  ])("isEmphasisLine(%j) === %s", (line, expected) => {
    expect(isEmphasisLine(line)).toBe(expected);
  });
});

describe("section title matching in runSearch", () => {
  it.each([
    ["[10:00 - 10:30] Design review", "section:review", true],
    ["[10:00 - 10:30] Design review", 'section:"design review"', true],
    ["Board meeting - 2026-11-03", "section:2026", false],
    ["[CANCELED] Board meeting", "section:board", true],
    ["Weekly sync", "section:review", false],
  ])("title %j with query %j matches=%s", (title, query, shouldMatch) => {
    tabs.set([
      {
        id: "tab-title",
        filename: "2026-11-16.txt",
        content: `${title}\n===\nbody line`,
        isScratchpad: false,
      } as NoteTab,
    ]);
    runSearch(query, "open");
    const results = readResults();
    if (shouldMatch) {
      expect(results.map((r) => r.lineIdx)).toEqual([2]);
    } else {
      expect(results).toEqual([]);
    }
  });
});

describe("runSearch on the reference note", () => {
  beforeEach(() => {
    tabs.set([
      {
        id: "tab-ref",
        filename: "2026-11-16.txt",
        content: REFERENCE_NOTE,
        isScratchpad: false,
      } as NoteTab,
    ]);
  });

  it.each([
    ["section:board is:decision", [3, 4]],
    ["section:board is:decision budget", [3]],
    ["is:decision", [0, 3, 4, 10]],
    ["section:review", [10]],
    ["section:board", [3, 4, 5, 6]],
    ["is:topic", [3]],
    ["is:emphasis", [6]],
  ])("query %j returns lines %j", (query, expectedLines) => {
    runSearch(query, "open");
    expect(readResults().map((r) => r.lineIdx)).toEqual(expectedLines);
  });

  it("never lists a blank line", () => {
    tabs.set([
      {
        id: "tab-blank",
        filename: "2026-11-16.txt",
        content: "Title\n===\nfirst\n\nsecond",
        isScratchpad: false,
      } as NoteTab,
    ]);
    runSearch("section:title", "open");
    expect(readResults().map((r) => r.lineIdx)).toEqual([2, 4]);
  });
});

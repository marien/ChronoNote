import { describe, it, expect } from "vitest";
import { actionTree, flattenActionTree } from "../actionGroups";
import { dueItems, listSections, normalizeHeaderTitle } from "../tokens";
import type { NoteEntry } from "./index";
import { _facetRuns, actionsOf, dueOf, linesOf, namesOf, sectionsOf, topicTagsOf } from "./facets";

const TEXT = [
  "Weekly Sync",
  "===========",
  "# call the bank by:2026-11-20",
  "  # second step",
  "=> @anna send the form by:2026-11-22",
  "",
  "[10:00 - 11:00] Planning",
  "========================",
  "v done thing",
  "# open thing",
  "",
].join("\n");

const entry = (text: string, key = "2026-11-09.txt"): NoteEntry => ({
  key,
  filename: key,
  dateISO: "2026-11-09",
  text,
  source: "disk",
});

describe("facets give what the reused function gives", () => {
  it("linesOf is the text split on newlines", () => {
    expect(linesOf(entry(TEXT))).toEqual(TEXT.split("\n"));
  });

  it("sectionsOf is listSections plus the normalised title", () => {
    const sections = sectionsOf(entry(TEXT));
    const expected = listSections(TEXT);
    expect(expected.length).toBe(2); // the fixture really has two sections
    expect(sections.map(({ title, lineIdx, open }) => ({ title, lineIdx, open }))).toEqual(expected);
    expect(sections.map((s) => s.normalized)).toEqual(expected.map((s) => normalizeHeaderTitle(s.title)));
    expect(sections[1].normalized).toBe("Planning");
  });

  it("actionsOf is the action tree and its flattening", () => {
    const facet = actionsOf(entry(TEXT));
    const roots = actionTree(TEXT.split("\n"));
    expect(roots.length).toBeGreaterThan(0);
    expect(facet.roots).toEqual(roots);
    expect(facet.flat).toEqual(flattenActionTree(roots));
  });

  it("dueOf is dueItems", () => {
    const items = dueOf(entry(TEXT));
    expect(items.length).toBeGreaterThan(0);
    expect(items).toEqual(dueItems(TEXT));
  });

  it("every facet of an empty note is empty", () => {
    const e = entry("");
    expect(linesOf(e)).toEqual([""]);
    expect(sectionsOf(e)).toEqual([]);
    expect(actionsOf(e).roots).toEqual([]);
    expect(dueOf(e)).toEqual([]);
  });
});

describe("facets are remembered per entry", () => {
  it("asked twice for the same entry: one run per facet, and the same object back", () => {
    const e = entry(TEXT + "# remembered\n");
    const before = { ..._facetRuns };
    expect(linesOf(e)).toBe(linesOf(e));
    expect(sectionsOf(e)).toBe(sectionsOf(e));
    expect(actionsOf(e)).toBe(actionsOf(e));
    expect(dueOf(e)).toBe(dueOf(e));
    expect(_facetRuns.sections - before.sections).toBe(1);
    expect(_facetRuns.actions - before.actions).toBe(1);
    expect(_facetRuns.due - before.due).toBe(1);
    // actionsOf builds on linesOf: the lines were split once for both
    expect(_facetRuns.lines - before.lines).toBe(1);
  });

  it("a new entry with equal text computes again", () => {
    const text = TEXT + "# equal text\n";
    const a = entry(text);
    const b = entry(text);
    dueOf(a);
    const before = _facetRuns.due;
    dueOf(a);
    expect(_facetRuns.due).toBe(before);
    dueOf(b);
    expect(_facetRuns.due).toBe(before + 1);
    const sectionsBefore = _facetRuns.sections;
    sectionsOf(a);
    sectionsOf(b);
    expect(_facetRuns.sections).toBe(sectionsBefore + 2);
  });

  it("a facet nobody asked for is not computed", () => {
    const e = entry(TEXT + "# lazy\n");
    const before = { ..._facetRuns };
    linesOf(e);
    expect(_facetRuns.sections).toBe(before.sections);
    expect(_facetRuns.actions).toBe(before.actions);
    expect(_facetRuns.due).toBe(before.due);
    expect(_facetRuns.names).toBe(before.names);
    expect(_facetRuns.topicTags).toBe(before.topicTags);
  });
});

describe("namesOf and topicTagsOf facets", () => {
  it("counts assignee and topicTag occurrences by lower-cased key and spelling", () => {
    const e = entry("# ask @Ruth (@Ben, @ruth) => @Dana x\n# (budget) y\n");
    const names = namesOf(e);
    expect(names.get("ruth")).toEqual(
      new Map([
        ["Ruth", 1],
        ["ruth", 1],
      ]),
    );
    expect(names.get("ben")).toEqual(new Map([["Ben", 1]]));
    expect(names.get("dana")).toEqual(new Map([["Dana", 1]]));
    expect(names.size).toBe(3);

    const topics = topicTagsOf(e);
    expect(topics.get("budget")).toEqual(new Map([["budget", 1]]));
    expect(topics.size).toBe(1);
  });

  it("memoises namesOf and topicTagsOf per entry", () => {
    const e = entry("# ask @Ruth (@Ben, @ruth) => @Dana x\n# (budget) y\n");
    const beforeNames = _facetRuns.names;
    const beforeTopics = _facetRuns.topicTags;
    const n1 = namesOf(e);
    const n2 = namesOf(e);
    const t1 = topicTagsOf(e);
    const t2 = topicTagsOf(e);
    expect(n1).toBe(n2);
    expect(t1).toBe(t2);
    expect(_facetRuns.names).toBe(beforeNames + 1);
    expect(_facetRuns.topicTags).toBe(beforeTopics + 1);
  });
});

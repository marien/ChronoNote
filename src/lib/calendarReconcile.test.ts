import { describe, it, expect } from "vitest";
import { computeCalendarSync, flagRemovedSection, appendRemovedSectionTo } from "./calendarReconcile";

describe("computeCalendarSync", () => {
  it("reproduces the design doc's own worked example (§2.4)", () => {
    const content = "Weekly Standup\n==============\n# ship the migration guide\n\n1:1 with Priya\n==============\n";
    const result = computeCalendarSync(content, ["Weekly Standup", "Design Review"]);

    expect(result.content).toBe(
      "Weekly Standup\n==============\n# ship the migration guide\n\n\nDesign Review\n=============\n",
    );
    expect(result.newTitles).toEqual(["Design Review"]);
    expect(result.reorderedTitles).toEqual([]);
    expect(result.removedEmpty).toEqual(["1:1 with Priya"]);
    expect(result.removedWithContent).toEqual([]);
  });

  it("very first sync for a day: no existing block, appends every agenda item at the end", () => {
    const content = "Personal Notes\n==============\nsome unrelated text";
    const result = computeCalendarSync(content, ["Weekly Standup", "Design Review"]);

    expect(result.content).toBe(
      "Personal Notes\n==============\nsome unrelated text\n\n\nWeekly Standup\n==============\n\n\nDesign Review\n=============\n",
    );
    expect(result.newTitles).toEqual(["Weekly Standup", "Design Review"]);
    expect(result.reorderedTitles).toEqual([]);
    expect(result.removedEmpty).toEqual([]);
    expect(result.removedWithContent).toEqual([]);
  });

  it("very first sync on an empty note", () => {
    const result = computeCalendarSync("", ["Standup"]);
    expect(result.content).toBe("Standup\n=======\n");
    expect(result.newTitles).toEqual(["Standup"]);
  });

  it("pure reorder: both sections kept, content untouched, physically swapped", () => {
    const content = "Alpha\n=====\nnotes on alpha\n\nBeta\n====\nnotes on beta\n";
    const result = computeCalendarSync(content, ["Beta", "Alpha"]);

    expect(result.content).toBe("Beta\n====\nnotes on beta\n\n\nAlpha\n=====\nnotes on alpha\n");
    expect(result.newTitles).toEqual([]);
    expect(result.removedEmpty).toEqual([]);
    expect(result.removedWithContent).toEqual([]);
    expect(result.reorderedTitles.sort()).toEqual(["Alpha", "Beta"]);
  });

  it("new title inserted mid-block: unrelated sections' relative order is untouched", () => {
    const content = "Alpha\n=====\nnotes on alpha\n\nGamma\n=====\nnotes on gamma\n";
    const result = computeCalendarSync(content, ["Alpha", "Beta", "Gamma"]);

    expect(result.content).toBe(
      "Alpha\n=====\nnotes on alpha\n\n\nBeta\n====\n\n\nGamma\n=====\nnotes on gamma\n",
    );
    expect(result.newTitles).toEqual(["Beta"]);
    expect(result.reorderedTitles).toEqual([]);
  });

  it("empty removed section is dropped silently, no review entry", () => {
    const content = "Standup\n=======\nnotes\n\nEmpty Meeting\n=============\n";
    const result = computeCalendarSync(content, ["Standup"]);

    expect(result.content).toBe("Standup\n=======\nnotes\n");
    expect(result.removedEmpty).toEqual(["Empty Meeting"]);
    expect(result.removedWithContent).toEqual([]);
  });

  it("non-empty removed section is surfaced for review, not auto-resolved", () => {
    const content = "Standup\n=======\nnotes\n\n1:1 with Priya\n==============\nAsked about the roadmap\n";
    const result = computeCalendarSync(content, ["Standup"]);

    expect(result.content).toBe("Standup\n=======\nnotes\n");
    expect(result.removedEmpty).toEqual([]);
    expect(result.removedWithContent).toEqual([
      { header: "1:1 with Priya", lines: ["Asked about the roadmap"] },
    ]);
  });

  it("matching is case-insensitive and trims whitespace, same rule as Section History", () => {
    const content = "Weekly Standup\n==============\nnotes\n";
    const result = computeCalendarSync(content, ["  weekly standup  "]);
    expect(result.newTitles).toEqual([]);
    expect(result.content).toBe(content);
  });

  it("same title twice on the agenda (documented limitation): the existing section is claimed once, the duplicate becomes a new empty section, no crash", () => {
    const content = "Standup\n=======\nnotes\n";
    const result = computeCalendarSync(content, ["Standup", "Standup"]);

    expect(result.content).toBe("Standup\n=======\nnotes\n\n\nStandup\n=======\n");
    expect(result.newTitles).toEqual(["Standup"]);
    expect(result.removedEmpty).toEqual([]);
    expect(result.removedWithContent).toEqual([]);
  });

  it("sections before the first match are left untouched", () => {
    const content = "Morning journal\n================\nfeeling good\n\nStandup\n=======\n";
    const result = computeCalendarSync(content, ["Standup"]);
    expect(result.content).toBe("Morning journal\n================\nfeeling good\n\n\nStandup\n=======\n");
  });
});

describe("flagRemovedSection", () => {
  it("appends the section back with a [CANCELED] prefix", () => {
    const result = flagRemovedSection("Standup\n=======\nnotes\n", {
      header: "1:1 with Priya",
      lines: ["Asked about the roadmap"],
    });
    expect(result).toBe(
      "Standup\n=======\nnotes\n\n\n[CANCELED] 1:1 with Priya\n=========================\nAsked about the roadmap\n",
    );
  });
});

describe("appendRemovedSectionTo", () => {
  it("appends the section, unprefixed, onto another day's content", () => {
    const result = appendRemovedSectionTo("Tomorrow's notes\n=================\n", {
      header: "1:1 with Priya",
      lines: ["Asked about the roadmap"],
    });
    expect(result).toBe(
      "Tomorrow's notes\n=================\n\n\n1:1 with Priya\n==============\nAsked about the roadmap\n",
    );
  });

  it("works when the target day's note is empty", () => {
    const result = appendRemovedSectionTo("", { header: "1:1 with Priya", lines: [] });
    expect(result).toBe("1:1 with Priya\n==============\n");
  });
});

describe("removed meetings (#78)", () => {
  const note = (...parts: string[]) => parts.join("\n");

  it("a section for a cancelled meeting is reported as removed even above the calendar block", () => {
    const content = note("Old sync", "========", "some notes", "", "", "Budget review", "=============", "");
    const r = computeCalendarSync(content, ["Budget review"], ["Old sync"]);
    expect(r.removedWithContent.map((x) => x.header)).toEqual(["Old sync"]);
    expect(r.removedWithContent[0].lines.join("\n")).toContain("some notes");
    expect(r.content).not.toContain("Old sync");
    expect(r.content).toContain("Budget review");
  });

  it("an empty section for a cancelled meeting is just noted as removed", () => {
    const content = note("Old sync", "========", "", "Budget review", "=============", "");
    const r = computeCalendarSync(content, ["Budget review"], ["Old sync"]);
    expect(r.removedEmpty).toEqual(["Old sync"]);
    expect(r.removedWithContent).toEqual([]);
  });

  it("a live meeting with the same title keeps its section (the live one wins)", () => {
    const content = note("Standup", "=======", "notes", "");
    const r = computeCalendarSync(content, ["Standup"], ["Standup"]);
    expect(r.removedWithContent).toEqual([]);
    expect(r.removedEmpty).toEqual([]);
    expect(r.content).toContain("notes");
  });

  it("a section already flagged [CANCELED] is left alone, so a sync never flags it twice", () => {
    const content = note("[CANCELED] Old sync", "===================", "kept notes", "", "", "Budget review", "=============", "");
    const r = computeCalendarSync(content, ["Budget review"], ["Old sync"]);
    expect(r.removedWithContent).toEqual([]);
    expect(r.removedEmpty).toEqual([]);
    expect(r.content).toContain("[CANCELED] Old sync");
  });

  it("with nothing live on the day, cancelled meetings are still reported", () => {
    const content = note("Old sync", "========", "notes", "");
    const r = computeCalendarSync(content, [], ["Old sync"]);
    expect(r.removedWithContent.map((x) => x.header)).toEqual(["Old sync"]);
  });

  it("matches titles the way section titles are matched (case-insensitive)", () => {
    const content = note("old SYNC", "=========", "notes", "");
    const r = computeCalendarSync(content, [], ["Old sync"]);
    expect(r.removedWithContent.length + r.removedEmpty.length).toBe(1);
  });
});

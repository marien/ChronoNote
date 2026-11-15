import { describe, it, expect } from "vitest";
import { computeAutoSync, meetingMatchKey } from "./calendarReconcile";

// F1: `computeAutoSync` rows, from the brief's table. Agenda for the day unless a row says otherwise.
const AGENDA = ["Standup", "Design review", "1:1 Dana"];
const STARTS = { Standup: "09:00", "Design review": "14:00", "1:1 Dana": "15:00" };

const STANDUP = "Standup\n=======\n";
const DESIGN = "Design review\n=============\n";
const DANA = "1:1 Dana\n========\n";
// Each part above ends in "\n"; sections are two blank lines apart, so `sep + "\n"` adds the two blank lines.
const sep = "\n";

describe("computeAutoSync", () => {
  it("a new meeting is added in agenda order, existing text untouched", () => {
    const content = STANDUP + "notes on standup\n" + sep + DANA;
    const r = computeAutoSync(content, AGENDA, [], STARTS, []);
    expect(r.apply).toBe(true);
    expect(r.added).toEqual(["Design review"]);
    expect(r.removed).toEqual([]);
    expect(r.needsReview).toBe(false);
    expect(r.offer).toEqual([]);
    expect(r.content).toBe(STANDUP + "notes on standup\n" + sep + "\n" + DESIGN + sep + "\n" + DANA);
    expect(r.content.indexOf("Standup")).toBeLessThan(r.content.indexOf("Design review"));
    expect(r.content.indexOf("Design review")).toBeLessThan(r.content.indexOf("1:1 Dana"));
  });

  it("an empty section whose meeting left the agenda is removed", () => {
    const content = STANDUP + "notes\n" + sep + "\n" + DESIGN + sep + "\n" + DANA;
    const r = computeAutoSync(content, ["Standup", "Design review"], [], STARTS, []);
    expect(r.apply).toBe(true);
    expect(r.removed).toEqual(["1:1 Dana"]);
    expect(r.added).toEqual([]);
    expect(r.needsReview).toBe(false);
    expect(r.content).toBe(STANDUP + "notes\n" + sep + "\n" + DESIGN);
  });

  it("a section with text whose meeting left the agenda needs review", () => {
    const content = STANDUP + sep + "\n" + DESIGN + sep + "\n" + "1:1 Dana\n========\nagreed on the plan\n";
    const r = computeAutoSync(content, ["Standup", "Design review"], [], STARTS, []);
    expect(r.apply).toBe(false);
    expect(r.needsReview).toBe(true);
    expect(r.content).toBe(content);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
  });

  it("sections in another order than the agenda need review", () => {
    const content = "1:1 Dana\n========\ntext a\n" + sep + "\n" + "Standup\n=======\ntext b\n";
    const r = computeAutoSync(content, ["Standup", "1:1 Dana"], [], STARTS, []);
    expect(r.apply).toBe(false);
    expect(r.needsReview).toBe(true);
    expect(r.content).toBe(content);
  });

  it("a reorder together with a new meeting still needs review, nothing is applied", () => {
    const content = "1:1 Dana\n========\ntext a\n" + sep + "\n" + "Standup\n=======\ntext b\n";
    const r = computeAutoSync(content, AGENDA, [], STARTS, []);
    expect(r.apply).toBe(false);
    expect(r.needsReview).toBe(true);
    expect(r.content).toBe(content);
    expect(r.added).toEqual([]);
  });

  it("a meeting added earlier whose section the user deleted is offered, not added again", () => {
    const content = STANDUP + sep + "\n" + DANA;
    const r = computeAutoSync(content, AGENDA, [], STARTS, ["Design review"]);
    expect(r.apply).toBe(false);
    expect(r.offer).toEqual(["Design review"]);
    expect(r.needsReview).toBe(false);
    expect(r.content).toBe(content);
    expect(r.added).toEqual([]);
  });

  it("an earlier automatic add is matched by title key, not by exact spelling", () => {
    const content = STANDUP + sep + "\n" + DANA;
    const r = computeAutoSync(content, AGENDA, [], STARTS, ["  DESIGN REVIEW "]);
    expect(r.offer).toEqual(["Design review"]);
    expect(r.apply).toBe(false);
  });

  it("an ad-hoc call stays where it is; the new meeting goes after it by time", () => {
    const content = STANDUP + sep + "\n'Call 13:50\n===========\n" + sep + "\n" + DANA;
    const r = computeAutoSync(content, AGENDA, [], STARTS, []);
    expect(r.apply).toBe(true);
    expect(r.added).toEqual(["Design review"]);
    expect(r.needsReview).toBe(false);
    expect(r.content).toBe(STANDUP + sep + "\n'Call 13:50\n===========\n" + sep + "\n" + DESIGN + sep + "\n" + DANA);
  });

  it("nothing differs: nothing is applied, added or offered", () => {
    const content = STANDUP + sep + "\n" + DESIGN + sep + "\n" + DANA;
    const r = computeAutoSync(content, AGENDA, [], STARTS, []);
    expect(r.apply).toBe(false);
    expect(r.needsReview).toBe(false);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(r.offer).toEqual([]);
    expect(r.content).toBe(content);
  });
});

describe("meetingMatchKey", () => {
  it("ignores case and surrounding spaces", () => {
    expect(meetingMatchKey("  Design Review ")).toBe(meetingMatchKey("design review"));
  });
});

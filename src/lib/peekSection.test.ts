import { describe, expect, it } from "vitest";
import { findSectionRange, sectionVisibleLineCount } from "./peekSection";

const note = [
  "Standup",
  "=======",
  "# one",
  "",
  "Weekly sync - 2026-10-03",
  "========================",
  "o budget",
  "- note",
  "",
  "",
  "Other",
  "=====",
  "x",
];

describe("findSectionRange", () => {
  it("runs from the title to the line before the next title, blanks included", () => {
    expect(findSectionRange(note, "weekly sync")).toEqual({ titleLine: 4, lastLine: 9 });
  });
  it("runs to the end of the note for the last section", () => {
    expect(findSectionRange(note, "other")).toEqual({ titleLine: 10, lastLine: 12 });
  });
  it("returns null when the section is missing", () => {
    expect(findSectionRange(note, "nope")).toBeNull();
  });
  it("counts visible lines without trailing blanks, plus one to type on", () => {
    const r = findSectionRange(note, "weekly sync")!;
    expect(sectionVisibleLineCount(note, r)).toBe(5);
  });
});

import { describe, expect, it } from "vitest";
import { editAllowed, findSectionRange, sectionVisibleLineCount, type SectionSpan } from "./peekSection";

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

// "AA\nWeekly\n======\nbody one\nbody two\nZZ": the section starts at offset 3, the underline ends at 16 and the
// last visible line ends at 33.
const span: SectionSpan = { from: 3, headerEnd: 16, to: 33 };

describe("editAllowed", () => {
  it("allows typing, replacing and deleting inside the body", () => {
    expect(editAllowed(span, 20, 20, "x")).toBe(true);
    expect(editAllowed(span, 17, 33, "")).toBe(true); // the whole body
    expect(editAllowed(span, 20, 22, "ab")).toBe(true);
  });

  it("allows a new line at the very end of the section", () => {
    expect(editAllowed(span, 33, 33, "\n")).toBe(true);
  });

  it("rejects anything that touches text outside the section, including the line breaks joining its neighbours", () => {
    expect(editAllowed(span, 2, 3, "")).toBe(false); // Backspace at the start of the title
    expect(editAllowed(span, 33, 34, "")).toBe(false); // Delete at the end of the last line
    expect(editAllowed(span, 0, 1, "")).toBe(false);
    expect(editAllowed(span, 40, 40, "x")).toBe(false);
    expect(editAllowed(span, 0, 40, "")).toBe(false); // a select-all that was not clamped
  });

  it("rejects edits to the title and underline, and to the line break after the underline", () => {
    expect(editAllowed(span, 3, 3, "x")).toBe(false);
    expect(editAllowed(span, 10, 10, "x")).toBe(false);
    expect(editAllowed(span, 5, 8, "")).toBe(false);
    expect(editAllowed(span, 16, 17, "")).toBe(false); // Backspace at the start of the first body line
  });

  it("allows a new line right after the underline (a section with no body yet), but not other text there", () => {
    expect(editAllowed(span, 16, 16, "\n")).toBe(true);
    expect(editAllowed(span, 16, 16, "x")).toBe(false);
  });
});

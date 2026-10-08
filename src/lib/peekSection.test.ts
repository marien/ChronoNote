import { describe, expect, it } from "vitest";
import {
  adhocSubjectRange,
  editAllowed,
  exitCaretLine,
  findSectionRange,
  gapLinesNeeded,
  retitleSection,
  sectionVisibleLineCount,
  visibleLastLine,
  type SectionSpan,
} from "./peekSection";

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
  it("counts body lines without trailing blanks (title and underline are not drawn), plus one to type on", () => {
    const r = findSectionRange(note, "weekly sync")!;
    expect(sectionVisibleLineCount(note, r)).toBe(3);
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

describe("gapLinesNeeded", () => {
  const range = (lines: string[], t: string) => findSectionRange(lines, t)!;
  it("is 0 when two empty lines already separate the next section", () => {
    expect(gapLinesNeeded(note, range(note, "weekly sync"))).toBe(0);
  });
  it("asks for the missing lines when there is one or none", () => {
    const one = ["A", "===", "text", "", "B", "===", "x"];
    expect(gapLinesNeeded(one, range(one, "a"))).toBe(1);
    const none = ["A", "===", "text", "B", "===", "x"];
    // "text" directly followed by B: the section's last line is the text itself
    expect(gapLinesNeeded(none, range(none, "a"))).toBe(2);
  });
  it("counts an empty section's own empty lines too", () => {
    const empty = ["A", "===", "", "B", "===", "x"];
    expect(gapLinesNeeded(empty, range(empty, "a"))).toBe(1);
  });
  it("asks for nothing at the end of the note", () => {
    expect(gapLinesNeeded(note, range(note, "other"))).toBe(0);
  });
});

describe("exitCaretLine", () => {
  it("keeps the caret line when it is in the section of the same note", () => {
    expect(exitCaretLine(note, "weekly sync", true, 7)).toBe(7);
  });
  it("goes to the first body line when the note changed or the caret is elsewhere", () => {
    expect(exitCaretLine(note, "weekly sync", false, 7)).toBe(6);
    expect(exitCaretLine(note, "weekly sync", true, 0)).toBe(6);
    expect(exitCaretLine(note, "weekly sync", true, 11)).toBe(6);
  });
  it("is null when the note has no such section", () => {
    expect(exitCaretLine(note, "nope", true, 1)).toBeNull();
  });
});

describe("visibleLastLine", () => {
  const range = (lines: string[], t: string) => findSectionRange(lines, t)!;
  it("leaves the two gap lines before the next section out of view", () => {
    // "weekly sync" runs to line 9 (two empty lines 8 and 9): the last drawn line is the last filled one, 7
    expect(visibleLastLine(note, range(note, "weekly sync"))).toBe(7);
  });
  it("shows an extra empty line beyond the two as a line to type on", () => {
    const three = ["A", "===", "text", "", "", "", "B", "===", "x"];
    expect(visibleLastLine(three, range(three, "a"))).toBe(3);
  });
  it("always keeps the first body line, even when the body is empty", () => {
    const empty = ["A", "===", "", "", "B", "===", "x"];
    expect(visibleLastLine(empty, range(empty, "a"))).toBe(2);
    const none = ["A", "===", "B", "===", "x"];
    expect(visibleLastLine(none, range(none, "a"))).toBe(1);
  });
  it("shows the whole last section of a note", () => {
    expect(visibleLastLine(note, range(note, "other"))).toBe(12);
  });
});

describe("retitleSection", () => {
  it("rewrites the title line and underline with matching length", () => {
    const lines = ["Standup", "=======", "body"];
    const range = { titleLine: 0, lastLine: 2 };
    const result = retitleSection(lines, range, "'Call 14:05");
    expect(result[0]).toBe("'Call 14:05");
    expect(result[1]).toBe("===========");
    expect(result[2]).toBe("body");
  });
});

describe("adhocSubjectRange", () => {
  it("selects only the subject part before the last HH:MM", () => {
    expect(adhocSubjectRange("Call 14:05")).toEqual([0, 4]);
    expect(adhocSubjectRange("Weekly Sync 09:30")).toEqual([0, 11]);
  });

  it("selects trimmed subject before time with extra spaces", () => {
    expect(adhocSubjectRange("  Quick call   10:00")).toEqual([2, 12]);
  });

  it("selects everything if there is no HH:MM time", () => {
    expect(adhocSubjectRange("Quick call")).toEqual([0, 10]);
  });

  it("handles multiple times by taking the last HH:MM", () => {
    expect(adhocSubjectRange("Call 09:00 to 10:00")).toEqual([0, 13]);
  });
});

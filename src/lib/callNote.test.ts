import { describe, expect, it } from "vitest";
import { adhocMinutes, insertSection, listSections, pickMeeting, sectionMinutes, type AgendaEntry } from "./callNote";

const at = (h: number, m = 0) => h * 60 + m;
const day: AgendaEntry[] = [
  { start: "09:00", end: "09:30", title: "Standup" },
  { start: "10:00", end: "11:00", title: "Design review" },
  { start: "10:30", end: "11:30", title: "Budget" },
  { start: "14:00", end: "15:00", title: "Weekly sync" },
];

describe("pickMeeting", () => {
  it("the meeting that is going on", () => {
    expect(pickMeeting(day, at(9, 10))?.title).toBe("Standup");
    expect(pickMeeting(day, at(14, 59))?.title).toBe("Weekly sync");
  });

  it("a meeting starts at its start minute and is over at its end minute", () => {
    expect(pickMeeting(day, at(9, 0))?.title).toBe("Standup");
    expect(pickMeeting(day, at(9, 30))).toBeNull();
  });

  it("with overlapping meetings it takes the one that started last", () => {
    expect(pickMeeting(day, at(10, 45))?.title).toBe("Budget");
    expect(pickMeeting(day, at(10, 15))?.title).toBe("Design review");
  });

  it("pressing the shortcut a little early counts as the next meeting, but not too early", () => {
    expect(pickMeeting(day, at(13, 55))?.title).toBe("Weekly sync");
    expect(pickMeeting(day, at(13, 50))?.title).toBe("Weekly sync"); // exactly 10 minutes ahead
    expect(pickMeeting(day, at(13, 49))).toBeNull();
  });

  it("right after a meeting ended it is not that meeting", () => {
    expect(pickMeeting(day, at(9, 35))).toBeNull();
    expect(pickMeeting(day, at(11, 40))).toBeNull();
  });

  it("no meetings, or unreadable times, give nothing", () => {
    expect(pickMeeting([], at(9))).toBeNull();
    expect(pickMeeting([{ start: "soon", end: "later", title: "x" }], at(9))).toBeNull();
  });
});

describe("adhocMinutes / sectionMinutes", () => {
  it("an ad-hoc call carries its start time in the title", () => {
    expect(adhocMinutes("'Call 14:05")).toBe(at(14, 5));
    expect(adhocMinutes("’Gesprek 9:30")).toBe(at(9, 30));
    expect(adhocMinutes("'Call with Dave 10:15")).toBe(at(10, 15));
  });

  it("only an apostrophe title is an ad-hoc call", () => {
    expect(adhocMinutes("Call 14:05")).toBeNull();
    expect(adhocMinutes("'Quick call")).toBeNull(); // no time
  });

  it("a meeting section is timed by its start in the agenda, ignoring case and a date in the title", () => {
    expect(sectionMinutes("design review", day)).toBe(at(10));
    expect(sectionMinutes("Weekly sync - 2026-10-05", [{ start: "14:00", end: "15:00", title: "Weekly sync" }])).toBe(at(14));
    expect(sectionMinutes("Something else", day)).toBeNull();
  });
});

describe("listSections", () => {
  it("lists every Setext section with its title line", () => {
    const lines = ["Standup", "=======", "o a", "", "Other", "=====", "x b"];
    expect(listSections(lines)).toEqual([
      { titleLine: 0, title: "Standup" },
      { titleLine: 4, title: "Other" },
    ]);
  });
});

describe("insertSection: a new section goes where it belongs in time", () => {
  const note = ["Standup", "=======", "o prepare", "", "Design review", "=============", "- notes", "", "Weekly sync", "===========", "o budget"].join("\n");
  const titles = (content: string) => listSections(content.split("\n")).map((s) => s.title);

  it("between two meetings", () => {
    const out = insertSection(note, "'Call 09:45", at(9, 45), day);
    expect(titles(out)).toEqual(["Standup", "'Call 09:45", "Design review", "Weekly sync"]);
  });

  it("the new section has an empty body line to type on and keeps a blank line around it", () => {
    const out = insertSection(note, "'Call 09:45", at(9, 45), day);
    expect(out).toContain("o prepare\n\n'Call 09:45\n===========\n\n\nDesign review\n");
  });

  it("before the first meeting, after the last, and in an empty note", () => {
    expect(titles(insertSection(note, "'Call 08:00", at(8), day))).toEqual(["'Call 08:00", "Standup", "Design review", "Weekly sync"]);
    expect(titles(insertSection(note, "'Call 16:30", at(16, 30), day))).toEqual(["Standup", "Design review", "Weekly sync", "'Call 16:30"]);
    expect(insertSection("", "'Call 09:00", at(9), day)).toBe("'Call 09:00\n===========\n");
  });

  it("at the minute a meeting starts it goes after that meeting", () => {
    expect(titles(insertSection(note, "'Call 10:00", at(10), day))).toEqual(["Standup", "Design review", "'Call 10:00", "Weekly sync"]);
  });

  it("several calls in a day stay in order, by the time in their titles", () => {
    let content = insertSection(note, "'Call 09:45", at(9, 45), day);
    content = insertSection(content, "'Call 13:10", at(13, 10), day);
    content = insertSection(content, "'Call 09:50", at(9, 50), day);
    expect(titles(content)).toEqual(["Standup", "'Call 09:45", "'Call 09:50", "Design review", "'Call 13:10", "Weekly sync"]);
  });

  it("a section that is neither a meeting nor a call does not take part in the ordering", () => {
    const withNotes = ["Standup", "=======", "o a", "", "Loose notes", "===========", "- x", "", "Weekly sync", "===========", "o b"].join("\n");
    expect(titles(insertSection(withNotes, "'Call 10:00", at(10), day))).toEqual(["Standup", "Loose notes", "'Call 10:00", "Weekly sync"]);
  });

  it("a meeting that has no section yet is added at its own place in time", () => {
    const out = insertSection(note, "Budget", at(10, 30), day);
    expect(titles(out)).toEqual(["Standup", "Design review", "Budget", "Weekly sync"]);
  });

  it("the text before the first section, and the rest of the note, are left alone", () => {
    const withIntro = `Intro line\n\n${note}`;
    const out = insertSection(withIntro, "'Call 09:45", at(9, 45), day);
    expect(out.startsWith("Intro line\n\nStandup\n")).toBe(true);
    expect(out.endsWith("o budget")).toBe(true);
  });
});

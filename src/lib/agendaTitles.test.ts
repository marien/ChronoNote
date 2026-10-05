import { describe, expect, it } from "vitest";
import { activeAgendaDates, activeTitlesAfterDate, activeTitlesForDate, classifyTitle, removedTitlesForDate, toLocalMeetings } from "./agendaTitles";

const m = (title: string, start = "09:00", date = "2026-09-14") => ({ date, start, end: "10:00", title });

describe("classifyTitle (#78)", () => {
  it("cancelled, declined and forwarded prefixes mark a removed meeting and keep the rest as its title", () => {
    for (const p of ["Canceled:", "Cancelled:", "Declined:", "Followed:", "Following:"]) {
      expect(classifyTitle(p + " 1:1 with Sam")).toEqual({ title: "1:1 with Sam", removed: true });
    }
  });

  it("Placeholder / Confirmed are stripped after :, - or --", () => {
    expect(classifyTitle("Placeholder: Budget")).toEqual({ title: "Budget", removed: false });
    expect(classifyTitle("Confirmed - Design sync")).toEqual({ title: "Design sync", removed: false });
    expect(classifyTitle("Placeholder -- Offsite")).toEqual({ title: "Offsite", removed: false });
    expect(classifyTitle("Confirmed:Budget")).toEqual({ title: "Budget", removed: false });
  });

  it("without a separator, or with nothing after it, the word stays part of the title", () => {
    expect(classifyTitle("Confirmed attendees review")?.title).toBe("Confirmed attendees review");
    expect(classifyTitle("Placeholder")?.title).toBe("Placeholder");
    expect(classifyTitle("Confirmed:")?.title).toBe("Confirmed:");
  });

  it("a removed meeting can carry a status word too; an empty removed marker is ignored", () => {
    expect(classifyTitle("Canceled: Placeholder - Offsite")).toEqual({ title: "Offsite", removed: true });
    expect(classifyTitle("Declined:   ")).toBeNull();
  });

  it("only a prefix at the very start counts, and case matters", () => {
    expect(classifyTitle("Re: Declined: 1:1")?.removed).toBe(false);
    expect(classifyTitle("declined: 1:1")?.removed).toBe(false);
  });
});

describe("agenda title lists (#78)", () => {
  const meetings = [m("Standup"), m("Canceled: 1:1", "10:00"), m("Confirmed: Design sync", "11:00"), m("Followed: Offsite", "12:00"), m("Other day", "09:00", "2026-09-15")];

  it("the day's live titles are stripped, sorted and exclude removed meetings", () => {
    expect(activeTitlesForDate(meetings, "2026-09-14")).toEqual(["Standup", "Design sync"]);
  });

  it("the day's removed titles are the real titles", () => {
    expect(removedTitlesForDate(meetings, "2026-09-14")).toEqual(["1:1", "Offsite"]);
  });

  it("later days: live only, stripped", () => {
    expect(activeTitlesAfterDate([m("Placeholder: X", "09:00", "2026-09-16"), m("Canceled: Y", "10:00", "2026-09-16")], "2026-09-15")).toEqual([["2026-09-16", "X"]]);
  });

  it("a status-stamped and a plain entry at the same time are one meeting", () => {
    expect(activeTitlesForDate([m("Placeholder: Budget"), m("Budget")], "2026-09-14")).toEqual(["Budget"]);
  });

  it("activeAgendaDates returns sorted distinct dates with live meetings", () => {
    const list = [
      m("Confirmed: Standup", "09:00", "2026-10-14"),
      m("1:1 with Alice", "11:00", "2026-10-14"),
      m("Canceled: Team Retrospective", "10:00", "2026-10-21"),
      m("Planning", "14:00", "2026-10-07"),
    ];
    expect(activeAgendaDates(list)).toEqual(["2026-10-07", "2026-10-14"]);
  });
});

describe("toLocalMeetings", () => {
  const m = (date: string, start: string, end: string) => ({ date, start, end, title: "A" });
  const ams = "Europe/Amsterdam";
  it("converts GMT with daylight saving", () => {
    expect(toLocalMeetings([m("2026-10-05", "09:00", "09:30")], "GMT", ams)).toEqual([m("2026-10-05", "11:00", "11:30")]);
    expect(toLocalMeetings([m("2026-12-05", "09:00", "09:30")], "UTC", ams)).toEqual([m("2026-12-05", "10:00", "10:30")]);
  });
  it("moves the date and caps an end past local midnight at 24:00", () => {
    expect(toLocalMeetings([m("2026-10-05", "23:30", "23:59")], "GMT", ams)).toEqual([m("2026-10-06", "01:30", "01:59")]);
    expect(toLocalMeetings([m("2026-10-05", "21:30", "22:30")], "GMT", ams)).toEqual([m("2026-10-05", "23:30", "24:00")]);
  });
  it("understands another zone, Z, and unpadded hours; leaves a non-time alone; rejects an unknown zone", () => {
    expect(toLocalMeetings([m("2026-10-05", "09:00", "10:00")], "America/New_York", ams)).toEqual([m("2026-10-05", "15:00", "16:00")]);
    expect(toLocalMeetings([m("2026-10-05", "9:00", "9:30")], "Z", ams)).toEqual([m("2026-10-05", "11:00", "11:30")]);
    expect(toLocalMeetings([m("2026-10-05", "soon", "later")], "GMT", ams)).toEqual([m("2026-10-05", "soon", "later")]);
    expect(() => toLocalMeetings([m("2026-10-05", "09:00", "10:00")], "Mars/Olympus", ams)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  CALL_LOOKAHEAD_MIN,
  CALL_RECENT_MIN,
  sectionsOnNow,
  uniqueSectionTitle,
  type AgendaEntry,
  type NowItem,
} from "./callNote";

const at = (h: number, m = 0) => h * 60 + m;

const makeNote = (...titles: string[]) =>
  titles.map((t) => `${t}\n${"=".repeat(Math.max(t.length, 3))}\nbody`).join("\n\n");

describe("CALL_RECENT_MIN", () => {
  it("is 60 minutes", () => {
    expect(CALL_RECENT_MIN).toBe(60);
  });
});

describe("sectionsOnNow", () => {
  it("empty agenda and empty note return an empty list", () => {
    expect(sectionsOnNow([], "", at(9, 0))).toEqual([]);
  });

  describe("running vs starting in 10 vs 11 minutes", () => {
    const agenda: AgendaEntry[] = [
      { start: "09:00", end: "10:00", title: "Running Meeting" },
      { start: "09:10", end: "09:45", title: "Starts In 10 Min" },
      { start: "09:11", end: "10:00", title: "Starts In 11 Min" },
    ];

    it("includes running meetings and meetings starting within CALL_LOOKAHEAD_MIN (10 min), excludes starting in 11 min", () => {
      const result = sectionsOnNow(agenda, "", at(9, 0));
      const titles = result.map((r: NowItem) => r.title);
      expect(titles).toContain("Running Meeting");
      expect(titles).toContain("Starts In 10 Min");
      expect(titles).not.toContain("Starts In 11 Min");
    });

    it("includes a meeting right at its start minute (start <= now < end)", () => {
      const result = sectionsOnNow([{ start: "09:30", end: "10:00", title: "Just Started" }], "", at(9, 30));
      expect(result).toEqual([
        { title: "Just Started", kind: "meeting", minutes: at(9, 30) },
      ]);
    });

    it("includes a meeting starting in 5 minutes", () => {
      const result = sectionsOnNow([{ start: "09:05", end: "09:45", title: "Soon" }], "", at(9, 0));
      expect(result).toEqual([
        { title: "Soon", kind: "meeting", minutes: at(9, 5) },
      ]);
    });
  });

  describe("end is exclusive", () => {
    const meeting: AgendaEntry = { start: "09:00", end: "09:30", title: "Standup" };

    it("meeting is included one minute before end", () => {
      const result = sectionsOnNow([meeting], "", at(9, 29));
      expect(result.map((r: NowItem) => r.title)).toEqual(["Standup"]);
    });

    it("meeting is excluded exactly at its end minute", () => {
      const result = sectionsOnNow([meeting], "", at(9, 30));
      expect(result).toEqual([]);
    });

    it("meeting is excluded after its end minute", () => {
      const result = sectionsOnNow([meeting], "", at(9, 31));
      expect(result).toEqual([]);
    });
  });

  describe("overlapping meetings both listed and sorted", () => {
    it("lists all overlapping running meetings sorted by start minutes", () => {
      const agenda: AgendaEntry[] = [
        { start: "09:15", end: "10:15", title: "Budget" },
        { start: "08:30", end: "09:30", title: "Standup" },
        { start: "09:00", end: "10:00", title: "Design Review" },
      ];
      const result = sectionsOnNow(agenda, "", at(9, 20));
      expect(result).toEqual([
        { title: "Standup", kind: "meeting", minutes: at(8, 30) },
        { title: "Design Review", kind: "meeting", minutes: at(9, 0) },
        { title: "Budget", kind: "meeting", minutes: at(9, 15) },
      ]);
    });
  });

  describe("duplicate titles once (earliest)", () => {
    it("keeps only the earliest occurrence of duplicate title", () => {
      const agenda: AgendaEntry[] = [
        { start: "09:15", end: "10:00", title: "Weekly Sync" },
        { start: "09:00", end: "09:45", title: "Weekly Sync" },
      ];
      const result = sectionsOnNow(agenda, "", at(9, 20));
      expect(result).toEqual([
        { title: "Weekly Sync", kind: "meeting", minutes: at(9, 0) },
      ]);
    });

    it("ignores case when deduplicating titles", () => {
      const agenda: AgendaEntry[] = [
        { start: "09:00", end: "09:45", title: "weekly sync" },
        { start: "09:15", end: "10:00", title: "Weekly Sync" },
      ];
      const result = sectionsOnNow(agenda, "", at(9, 20));
      expect(result).toEqual([
        { title: "weekly sync", kind: "meeting", minutes: at(9, 0) },
      ]);
    });

    it("ignores dates in titles when deduplicating", () => {
      const agenda: AgendaEntry[] = [
        { start: "09:00", end: "09:45", title: "Weekly Sync - 2026-09-07" },
        { start: "09:15", end: "10:00", title: "Weekly Sync" },
      ];
      const result = sectionsOnNow(agenda, "", at(9, 20));
      expect(result).toEqual([
        { title: "Weekly Sync - 2026-09-07", kind: "meeting", minutes: at(9, 0) },
      ]);
    });
  });

  describe("bad times skipped", () => {
    it("omits entries with unparseable start or end times", () => {
      const agenda: AgendaEntry[] = [
        { start: "invalid", end: "10:00", title: "Bad Start" },
        { start: "09:00", end: "invalid", title: "Bad End" },
        { start: "25:00", end: "10:00", title: "Invalid Hour" },
        { start: "09:00", end: "10:00", title: "Valid Meeting" },
      ];
      const result = sectionsOnNow(agenda, "", at(9, 30));
      expect(result).toEqual([
        { title: "Valid Meeting", kind: "meeting", minutes: at(9, 0) },
      ]);
    });
  });

  describe("ad-hoc calls at now, now-60 (in), now-61 (out) and future (out)", () => {
    const now = at(10, 0); // 10:00

    it("includes ad-hoc calls in [now - 60, now] and excludes now - 61 or future", () => {
      const note = makeNote(
        "'Call 10:00", // at now -> in
        "'Call 09:00", // at now - 60 -> in
        "'Call 09:30", // between -> in
        "'Call 08:59", // at now - 61 -> out
        "'Call 10:01", // in future -> out
        "'Call 11:00", // far future -> out
        "'Call 07:30", // far past -> out
        "Loose Notes",  // regular section -> out
      );

      const result = sectionsOnNow([], note, now);
      const titles = result.map((r: NowItem) => r.title);
      expect(titles).toContain("'Call 10:00");
      expect(titles).toContain("'Call 09:00");
      expect(titles).toContain("'Call 09:30");
      expect(titles).not.toContain("'Call 08:59");
      expect(titles).not.toContain("'Call 10:01");
      expect(titles).not.toContain("'Call 11:00");
      expect(titles).not.toContain("'Call 07:30");
      expect(titles).not.toContain("Loose Notes");
    });

    it("preserves title as written with apostrophe or curly apostrophe", () => {
      const note = makeNote("’Gesprek 09:45");
      const result = sectionsOnNow([], note, now);
      expect(result).toEqual([
        { title: "’Gesprek 09:45", kind: "call", minutes: at(9, 45) },
      ]);
    });
  });

  describe("meeting and call at the same minute: meeting first", () => {
    it("sorts meeting before call when both occur at the same minute", () => {
      const agenda: AgendaEntry[] = [{ start: "09:15", end: "10:00", title: "Project Sync" }];
      const note = makeNote("'Call 09:15");
      const result = sectionsOnNow(agenda, note, at(9, 20));
      expect(result).toEqual([
        { title: "Project Sync", kind: "meeting", minutes: at(9, 15) },
        { title: "'Call 09:15", kind: "call", minutes: at(9, 15) },
      ]);
    });

    it("sorts items by minutes, then meetings before calls, then title", () => {
      const agenda: AgendaEntry[] = [
        { start: "09:00", end: "10:00", title: "Beta Meeting" },
        { start: "09:00", end: "10:00", title: "Alpha Meeting" },
      ];
      const note = makeNote("'Call 08:30", "'Call 09:00");
      const result = sectionsOnNow(agenda, note, at(9, 10));
      expect(result).toEqual([
        { title: "'Call 08:30", kind: "call", minutes: at(8, 30) },
        { title: "Alpha Meeting", kind: "meeting", minutes: at(9, 0) },
        { title: "Beta Meeting", kind: "meeting", minutes: at(9, 0) },
        { title: "'Call 09:00", kind: "call", minutes: at(9, 0) },
      ]);
    });
  });

  describe("meetings do not require sections in content", () => {
    it("lists an agenda meeting even if content has no section for it", () => {
      const agenda: AgendaEntry[] = [{ start: "09:00", end: "10:00", title: "Standup" }];
      const result = sectionsOnNow(agenda, "", at(9, 15));
      expect(result).toEqual([
        { title: "Standup", kind: "meeting", minutes: at(9, 0) },
      ]);
    });

    it("lists an agenda meeting when content already has that section", () => {
      const agenda: AgendaEntry[] = [{ start: "09:00", end: "10:00", title: "Standup" }];
      const note = makeNote("Standup");
      const result = sectionsOnNow(agenda, note, at(9, 15));
      expect(result).toEqual([
        { title: "Standup", kind: "meeting", minutes: at(9, 0) },
      ]);
    });
  });
});

describe("uniqueSectionTitle", () => {
  it("returns title unchanged when free in empty content", () => {
    expect(uniqueSectionTitle("", "Standup")).toBe("Standup");
  });

  it("returns title unchanged when free among other section titles", () => {
    const note = makeNote("Planning", "Retro", "Loose Notes");
    expect(uniqueSectionTitle(note, "Standup")).toBe("Standup");
  });

  it("appends (2) when title is taken once", () => {
    const note = makeNote("Standup");
    expect(uniqueSectionTitle(note, "Standup")).toBe("Standup (2)");
  });

  it("appends (3) when title and (2) are already taken", () => {
    const note = makeNote("Standup", "Standup (2)");
    expect(uniqueSectionTitle(note, "Standup")).toBe("Standup (3)");
  });

  it("appends (4) when title, (2), and (3) are already taken", () => {
    const note = makeNote("Standup", "Standup (2)", "Standup (3)");
    expect(uniqueSectionTitle(note, "Standup")).toBe("Standup (4)");
  });

  it("is case-insensitive when checking taken titles", () => {
    const note = makeNote("standup");
    expect(uniqueSectionTitle(note, "Standup")).toBe("Standup (2)");

    const note2 = makeNote("STANDUP", "standup (2)");
    expect(uniqueSectionTitle(note2, "Standup")).toBe("Standup (3)");
  });

  it("picks the first free number when there is a gap", () => {
    const note = makeNote("Standup", "Standup (3)");
    expect(uniqueSectionTitle(note, "Standup")).toBe("Standup (2)");
  });

  it("handles ad-hoc call titles correctly", () => {
    const note = makeNote("'Call 09:00");
    expect(uniqueSectionTitle(note, "'Call 09:00")).toBe("'Call 09:00 (2)");

    const note2 = makeNote("'Call 09:00", "'Call 09:00 (2)");
    expect(uniqueSectionTitle(note2, "'Call 09:00")).toBe("'Call 09:00 (3)");
  });

  it("ignores non-section text that happens to match title", () => {
    const note = ["Header", "======", "This is Standup in body text", "Standup (2) in body text"].join("\n");
    expect(uniqueSectionTitle(note, "Standup")).toBe("Standup");
  });
});

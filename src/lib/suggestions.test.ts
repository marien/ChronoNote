import { describe, expect, it } from "vitest";
import type { NoteEntry } from "./notesIndex";
import { dateISOOfFilename } from "./notesIndex/entries";
import { scenario } from "./testing/scenarios";
import { buildSuggestions } from "./suggestions";
import { attendeeNames } from "./attendeeNames";

function entriesOf(notes: Record<string, string>): Map<string, NoteEntry> {
  const map = new Map<string, NoteEntry>();
  for (const [key, text] of Object.entries(notes)) {
    const dateISO = key.startsWith("scratchpad:") ? null : dateISOOfFilename(key);
    map.set(key, { key, filename: key, dateISO, text, source: "disk" });
  }
  return map;
}

describe("buildSuggestions", () => {
  it("ranks names by lastUsed and breaks spelling ties by latest note", () => {
    const entries = entriesOf({
      "2026-11-12.txt": "# ask @Ruth",
      "2026-11-03.txt": "# ask @Robin",
      "2026-10-12.txt": "o x (@Rosa)",
      "2026-11-14.txt": "# @ruth call",
      "2026-11-16.txt": "# ask @R",
    });

    const rows = buildSuggestions("name", "R", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows).toEqual([
      { insert: "@ruth", label: "@ruth", lastUsed: "2026-11-14" },
      { insert: "@Robin", label: "@Robin", lastUsed: "2026-11-03" },
      { insert: "@Rosa", label: "@Rosa", lastUsed: "2026-10-12" },
    ]);
  });

  it("picks the most frequent spelling across notes when counts differ", () => {
    const entries = entriesOf({
      "2026-11-12.txt": "# ask @Ruth\n# ping @Ruth",
      "2026-11-14.txt": "# @ruth call",
    });

    const rows = buildSuggestions("name", "R", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows).toEqual([{ insert: "@Ruth", label: "@Ruth", lastUsed: "2026-11-14" }]);
  });

  it("does not suggest an exact match for the typed prefix", () => {
    const entries = entriesOf({
      "2026-11-14.txt": "# ask @Ruth",
      "2026-11-15.txt": "# ask @Rutherford",
    });

    const rows = buildSuggestions("name", "ruth", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows).toEqual([{ insert: "@Rutherford", label: "@Rutherford", lastUsed: "2026-11-15" }]);
  });

  it("gathers and ranks topic tags", () => {
    const entries = entriesOf({
      "2026-11-15.txt": "# (budget) a",
      "2026-11-02.txt": "# (building) b",
      "2026-11-01.txt": "# (budget) c",
    });

    const rows = buildSuggestions("topic", "b", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows).toEqual([
      { insert: "(budget)", label: "(budget)", lastUsed: "2026-11-15" },
      { insert: "(building)", label: "(building)", lastUsed: "2026-11-02" },
    ]);
  });

  it("skips scratchpads and puts undated files after dated notes with lastUsed null", () => {
    const entries = entriesOf({
      "2026-11-10.txt": "# @Robin",
      "notes.txt": "# @Rosa\n# @Rory",
      "scratchpad:1": "# @Rachel",
    });

    const rows = buildSuggestions("name", "r", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows).toEqual([
      { insert: "@Robin", label: "@Robin", lastUsed: "2026-11-10" },
      { insert: "@Rory", label: "@Rory", lastUsed: null },
      { insert: "@Rosa", label: "@Rosa", lastUsed: null },
    ]);
  });

  it("orders titles with today's meetings first, then recurring titles from the 90-day window", () => {
    const entries = entriesOf({
      "2026-11-04.txt": "Board meeting\n=============\n# x\n\nBoard prep\n==========\n# y",
      "2026-10-07.txt": "Board meeting\n=============\n# z",
    });

    const rows = buildSuggestions("title", "board", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: ["[14:00 - 15:00] Board review"],
    });

    expect(rows).toEqual([
      { insert: "[14:00 - 15:00] Board review", label: "[14:00 - 15:00] Board review", lastUsed: null, meetingToday: true },
      { insert: "Board meeting", label: "Board meeting", lastUsed: "2026-11-04" },
    ]);
  });

  it("enforces the 90-day window for recurring titles", () => {
    const entriesOutside = entriesOf({
      "2026-08-17.txt": "Board meeting\n=============\n# a",
      "2026-11-04.txt": "Board meeting\n=============\n# b",
    });

    expect(
      buildSuggestions("title", "board", {
        noteDate: "2026-11-16",
        entries: entriesOutside,
        meetingsToday: [],
      }),
    ).toEqual([]);

    const entriesInside = entriesOf({
      "2026-08-18.txt": "Board meeting\n=============\n# a",
      "2026-11-04.txt": "Board meeting\n=============\n# b",
    });

    expect(
      buildSuggestions("title", "board", {
        noteDate: "2026-11-16",
        entries: entriesInside,
        meetingsToday: [],
      }),
    ).toEqual([{ insert: "Board meeting", label: "Board meeting", lastUsed: "2026-11-04" }]);
  });

  it("drops recurring titles that match a listed meeting today", () => {
    const entries = entriesOf({
      "2026-11-04.txt": "Standup\n=======\n# a",
      "2026-10-28.txt": "Standup\n=======\n# b",
    });

    const rows = buildSuggestions("title", "stand", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: ["Standup"],
    });

    expect(rows).toEqual([{ insert: "Standup", label: "Standup", lastUsed: null, meetingToday: true }]);
  });

  it("caps suggestions at 8 rows", () => {
    const names = Array.from({ length: 12 }, (_, i) => `# @Ana${String(i).padStart(2, "0")}`).join("\n");
    const entries = entriesOf({ "2026-11-15.txt": names });

    const rows = buildSuggestions("name", "a", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows).toHaveLength(8);
  });

  it("puts invited attendees first in attendee order, then usual rows", () => {
    const entries = entriesOf({
      "2026-11-15.txt": "# ping @Dave",
    });

    const rows = buildSuggestions("name", "D", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
      attendees: attendeeNames(["Dana Smith", "Ben Jones"], ""),
    });

    expect(rows).toEqual([
      { insert: "@Dana", label: "@Dana", lastUsed: null, invited: true },
      { insert: "@Dave", label: "@Dave", lastUsed: "2026-11-15" },
    ]);
  });

  it("lists an attendee already used in notes once, keeping their lastUsed date", () => {
    const entries = entriesOf({
      "2026-11-12.txt": "# ask @dana",
      "2026-11-15.txt": "# ping @Dave",
    });

    const rows = buildSuggestions("name", "D", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
      attendees: attendeeNames(["Dana Smith", "Ben Jones"], ""),
    });

    expect(rows).toEqual([
      { insert: "@Dana", label: "@Dana", lastUsed: "2026-11-12", invited: true },
      { insert: "@Dave", label: "@Dave", lastUsed: "2026-11-15" },
    ]);
  });

  it("measures buildSuggestions on busy-week scenario", () => {
    const seed = scenario("busy-week");
    const entries = entriesOf(seed.notes ?? {});
    const noteDate = "2026-09-07";

    const t0 = performance.now();
    const nameRows = buildSuggestions("name", "m", { noteDate, entries, meetingsToday: [] });
    const topicRows = buildSuggestions("topic", "a", { noteDate, entries, meetingsToday: [] });
    const titleRows = buildSuggestions("title", "s", { noteDate, entries, meetingsToday: [] });
    const coldMs = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < 100; i++) {
      buildSuggestions("name", "m", { noteDate, entries, meetingsToday: [] });
    }
    const warmAvgMs = (performance.now() - t1) / 100;

    console.info(
      `[busy-week] entries=${entries.size} cold=${coldMs.toFixed(2)}ms warmAvg=${warmAvgMs.toFixed(3)}ms counts=${nameRows.length}/${topicRows.length}/${titleRows.length}`,
    );
    expect(coldMs).toBeLessThan(200);
    expect(warmAvgMs).toBeLessThan(20);
  });
});

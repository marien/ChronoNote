import { describe, expect, it } from "vitest";
import type { NoteEntry } from "./notesIndex";
import { buildSuggestions } from "./suggestions";

function makeEntry(dateISO: string, text: string, source: "disk" | "tab" = "disk"): NoteEntry {
  const filename = `${dateISO}.txt`;
  return {
    key: filename,
    filename,
    dateISO,
    text,
    source,
  };
}

function makeEntries(notes: Array<[string, string, ("disk" | "tab")?]>): ReadonlyMap<string, NoteEntry> {
  const map = new Map<string, NoteEntry>();
  for (const [dateISO, text, source] of notes) {
    const entry = makeEntry(dateISO, text, source);
    map.set(entry.key, entry);
  }
  return map;
}

describe("buildSuggestions", () => {
  it("orders names by latest note date, breaking spelling ties with latest note", () => {
    const entries = makeEntries([
      ["2026-11-12", "# ask @Ruth"],
      ["2026-11-03", "# ask @Robin"],
      ["2026-10-12", "o x (@Rosa)"],
      ["2026-11-14", "# @ruth call"],
    ]);

    const rows = buildSuggestions("name", "R", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows.map((r) => r.insert)).toEqual(["@ruth", "@Robin", "@Rosa"]);
  });

  it("picks the most frequent spelling when one variant appears more often", () => {
    const entries = makeEntries([
      ["2026-11-12", "# ask @Ruth"],
      ["2026-11-03", "# ask @Robin"],
      ["2026-10-12", "o x (@Rosa)"],
      ["2026-11-14", "# @ruth call"],
      ["2026-11-01", "# @Ruth again"],
    ]);

    const rows = buildSuggestions("name", "R", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows.map((r) => r.insert)).toEqual(["@Ruth", "@Robin", "@Rosa"]);
  });

  it("orders topics by latest note date", () => {
    const entries = makeEntries([
      ["2026-11-15", "# (budget) a"],
      ["2026-11-02", "# (building) b"],
      ["2026-11-01", "# (budget) c"],
    ]);

    const rows = buildSuggestions("topic", "b", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows.map((r) => r.insert)).toEqual(["(budget)", "(building)"]);
  });

  it("puts matching meetingsToday first, then recurring section titles", () => {
    const entries = makeEntries([
      ["2026-11-04", "Board meeting\n=============\n\nBoard prep\n==========\n"],
      ["2026-10-07", "Board meeting\n=============\n"],
    ]);

    const rows = buildSuggestions("title", "board", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: ["[14:00 - 15:00] Board review"],
    });

    expect(rows.map((r) => r.insert)).toEqual([
      "[14:00 - 15:00] Board review",
      "Board meeting",
    ]);
    expect(rows[0].meetingToday).toBe(true);
    expect(rows[1].meetingToday).toBeFalsy();
  });

  it("excludes section titles whose earlier occurrence is outside the 90-day window", () => {
    const entries = makeEntries([
      ["2026-08-17", "Budget review\n=============\n"],
      ["2026-11-04", "Budget review\n=============\n"],
    ]);

    const rows = buildSuggestions("title", "budget", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows).toEqual([]);
  });

  it("never suggests the half-typed prefix from today's note", () => {
    const entries = makeEntries([
      ["2026-11-12", "# ask @Ruth"],
      ["2026-11-16", "# ask @R", "tab"],
    ]);

    const rows = buildSuggestions("name", "R", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows.map((r) => r.insert)).toEqual(["@Ruth"]);
  });

  it("caps suggestions at 8 rows", () => {
    const names = [
      "@Aaron",
      "@Adam",
      "@Alan",
      "@Alex",
      "@Alice",
      "@Amy",
      "@Andre",
      "@Andy",
      "@Anna",
      "@Anne",
      "@Arthur",
      "@Ava",
    ];
    const entries = makeEntries([
      ["2026-11-12", names.map((n) => `# ${n}`).join("\n")],
    ]);

    const rows = buildSuggestions("name", "A", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
    });

    expect(rows).toHaveLength(8);
  });
});

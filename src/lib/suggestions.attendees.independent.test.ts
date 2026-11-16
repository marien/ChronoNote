import { describe, expect, it } from "vitest";
import type { NoteEntry } from "./notesIndex";
import { dateISOOfFilename } from "./notesIndex/entries";
import { buildSuggestions } from "./suggestions";

function entriesOf(notes: Record<string, string>): Map<string, NoteEntry> {
  const map = new Map<string, NoteEntry>();
  for (const [key, text] of Object.entries(notes)) {
    const dateISO = key.startsWith("scratchpad:") ? null : dateISOOfFilename(key);
    map.set(key, { key, filename: key, dateISO, text, source: "disk" });
  }
  return map;
}

describe("buildSuggestions with attendees", () => {
  it("lists matching invited attendees first and deduplicates prior note mentions case-insensitively", () => {
    const entries = entriesOf({
      "2026-11-14.txt": "# @Diego",
      "2026-11-01.txt": "# @dana",
    });

    const rows = buildSuggestions("name", "D", {
      noteDate: "2026-11-16",
      entries,
      meetingsToday: [],
      attendees: ["Dana", "Ben"],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      insert: "@Dana",
      label: "@Dana",
      invited: true,
    });
    expect(rows[1]).toMatchObject({
      insert: "@Diego",
      label: "@Diego",
      lastUsed: "2026-11-14",
    });
    expect(rows[1].invited).toBeFalsy();
  });
});

import { describe, expect, it } from "vitest";
import type { NoteEntry } from "./notesIndex";
import { dateISOOfFilename } from "./notesIndex/entries";
import { buildPersonView, knownPeople, personForLineMenu, personMatches } from "./personView";

function makeEntries(notes: Record<string, string>): Map<string, NoteEntry> {
  const map = new Map<string, NoteEntry>();
  for (const [key, text] of Object.entries(notes)) {
    const isScratchpad = key.startsWith("scratchpad:");
    map.set(key, {
      key,
      filename: isScratchpad ? key.slice("scratchpad:".length) : key,
      dateISO: isScratchpad ? null : dateISOOfFilename(key),
      text,
      source: "disk",
    });
  }
  return map;
}

describe("personMatches", () => {
  it("matches every row of the brief table", () => {
    expect(personMatches("# send Dana the budget sheet", "dana")).toBe(true);
    expect(personMatches("# ask @Dana about the key", "Dana")).toBe(true);
    expect(personMatches("o rota (@Ruth, @dana)", "Dana")).toBe(true);
    expect(personMatches("# call @Danal", "Dana")).toBe(false);
    expect(personMatches("# Danaë's book", "Dana")).toBe(false);
  });

  it("handles punctuation boundaries and hyphenated names", () => {
    expect(personMatches("Ask Dana's team", "Dana")).toBe(true);
    expect(personMatches("Ask @Dana-Lee", "Dana")).toBe(false);
    expect(personMatches("Ask @Dana-Lee", "Dana-Lee")).toBe(true);
    expect(personMatches("Dana", "dana")).toBe(true);
    expect(personMatches("Plain line", "")).toBe(false);
  });
});

describe("buildPersonView", () => {
  it("filters by 8-week window, keeps all open actions, and avoids double-counting", () => {
    const entries = makeEntries({
      "2026-06-01.txt": "Old meeting\n===========\n# send Dana the archive\n",
      "2026-09-01.txt": "September\n=========\n=> @dana check the invoices\n",
      "2026-11-10.txt": "Tuesday\n=======\n=> @Dana order cups\nv ask Dana about keys\n",
      "2026-11-12.txt":
        "[10:00 - 10:30] Coffee rota\n===========================\n- Dana brings milk\n- also Dana brings sugar\n",
      "notes.txt": "Backlog\n=======\n# call Dana later\n=> @Dana undated delegation\nDana undated mention\n",
      "scratchpad:Scratchpad 1": "# ignore Dana in scratchpad\n",
    });

    const recent = buildPersonView("Dana", entries, "2026-11-16", false);
    expect(recent.openActions.map((r) => ({ filename: r.filename, text: r.text, section: r.section }))).toEqual([
      { filename: "2026-06-01.txt", text: "send Dana the archive", section: "Old meeting" },
      { filename: "notes.txt", text: "call Dana later", section: "Backlog" },
    ]);

    expect(recent.delegated.map((r) => ({ filename: r.filename, text: r.text }))).toEqual([
      { filename: "2026-11-10.txt", text: "@Dana order cups" },
    ]);

    expect(recent.mentions).toEqual([
      {
        filename: "2026-11-12.txt",
        dateISO: "2026-11-12",
        title: "Coffee rota",
        lineIdx: 2,
        count: 2,
      },
      {
        filename: "2026-11-10.txt",
        dateISO: "2026-11-10",
        title: "Tuesday",
        lineIdx: 3,
        count: 1,
      },
    ]);
    expect(recent.hasOlder).toBe(true);

    const withOlder = buildPersonView("Dana", entries, "2026-11-16", true);
    expect(withOlder.delegated.map((r) => ({ filename: r.filename, text: r.text }))).toEqual([
      { filename: "2026-11-10.txt", text: "@Dana order cups" },
      { filename: "2026-09-01.txt", text: "@dana check the invoices" },
    ]);
    expect(withOlder.hasOlder).toBe(false);
  });

  it("does not set hasOlder when older notes only have open actions already in group 1", () => {
    const entries = makeEntries({
      "2026-06-01.txt": "Old\n===\n# ask Dana\n",
    });
    const view = buildPersonView("Dana", entries, "2026-11-16", false);
    expect(view.openActions).toHaveLength(1);
    expect(view.mentions).toHaveLength(0);
    expect(view.hasOlder).toBe(false);
  });

  it("handles lines outside any section and multi-part action lines", () => {
    const entries = makeEntries({
      "2026-11-15.txt": "Dana called before the meeting\n# ask @Ben => # send Dana notes\n",
    });
    const view = buildPersonView("Dana", entries, "2026-11-16", false);
    expect(view.openActions.map((r) => r.text)).toEqual(["send Dana notes"]);
    expect(view.mentions).toEqual([
      {
        filename: "2026-11-15.txt",
        dateISO: "2026-11-15",
        title: "",
        lineIdx: 0,
        count: 1,
      },
    ]);
  });

  it("includes future notes in the 8-week window", () => {
    const entries = makeEntries({
      "2026-11-23.txt": "Next week\n=========\n=> @Dana bring slides\n",
    });
    const view = buildPersonView("Dana", entries, "2026-11-16", false);
    expect(view.delegated).toHaveLength(1);
    expect(view.delegated[0].dateISO).toBe("2026-11-23");
  });
});

describe("knownPeople", () => {
  it("picks the most-used spelling and orders most recently used first", () => {
    const entries = makeEntries({
      "2026-11-15.txt": "=> @ruth check\n",
      "2026-11-14.txt": "=> @Dana first\n=> @Dana second\n=> @dana third\n",
      "2026-11-10.txt": "=> @Ruth fourth\n=> @Ruth fifth\n=> @Ben sixth\n",
      "scratchpad:Scratchpad 1": "=> @Ghost ignored\n",
    });
    expect(knownPeople(entries)).toEqual(["Ruth", "Dana", "Ben"]);
  });
});

describe("personForLineMenu", () => {
  it("picks the assignee at col or falls back to the first assignee on the line", () => {
    const line = "# ask @Ben and @Dana";
    expect(personForLineMenu(line, 16)).toBe("Dana");
    expect(personForLineMenu(line, 2)).toBe("Ben");
    expect(personForLineMenu(line)).toBe("Ben");
    expect(personForLineMenu("# plain action", 2)).toBeNull();
    expect(personForLineMenu("1:1 @Dana", 5, { title: true })).toBeNull();
  });
});

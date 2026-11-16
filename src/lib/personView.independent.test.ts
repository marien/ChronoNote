import { describe, it, expect } from "vitest";
import type { NoteEntry } from "./notesIndex";
import { personMatches, buildPersonView, knownPeople } from "./personView";

const entry = (dateISO: string, text: string): NoteEntry => ({
  key: `${dateISO}.txt`,
  filename: `${dateISO}.txt`,
  dateISO,
  text,
  source: "disk",
});

describe("personMatches", () => {
  it.each([
    { line: "# send Dana the budget sheet", name: "dana", expected: true },
    { line: "# ask @Dana about the key", name: "Dana", expected: true },
    { line: "o rota (@Ruth, @dana)", name: "Dana", expected: true },
    { line: "# call @Danal", name: "Dana", expected: false },
    { line: "# Danaë's book", name: "Dana", expected: false },
    { line: "# ask Ruth", name: "Dana", expected: false },
  ])("personMatches($line, $name) -> $expected", ({ line, name, expected }) => {
    expect(personMatches(line, name)).toBe(expected);
  });
});

describe("buildPersonView", () => {
  const entries: NoteEntry[] = [
    entry("2026-06-01", "# ask Dana about the key"),
    entry("2026-09-01", "# book hall => @dana"),
    entry("2026-11-10", "# shirts => @Dana"),
    entry(
      "2026-11-12",
      [
        "[10:00 - 10:30] Coffee rota",
        "===========================",
        "Dana brings milk",
        "Dana has the key",
        "v ask Dana about cups",
        "# remind @Dana of the rota",
      ].join("\n"),
    ),
  ];

  it("returns open actions of any age newest first, delegated within 8 weeks, and mentions grouped by meeting when showOlder is false", () => {
    const view = buildPersonView("Dana", entries, "2026-11-16", false);

    // Group 1: open actions mentioning Dana, newest first, regardless of age
    expect(view.openActions).toHaveLength(2);
    expect(view.openActions[0]).toMatchObject({
      filename: "2026-11-12.txt",
      dateISO: "2026-11-12",
      lineIdx: 5,
    });
    expect(view.openActions[0].text).toContain("remind @Dana of the rota");
    expect(view.openActions[1]).toMatchObject({
      filename: "2026-06-01.txt",
      dateISO: "2026-06-01",
      lineIdx: 0,
    });
    expect(view.openActions[1].text).toContain("ask Dana about the key");

    // Group 2: delegated to Dana, only within 8 weeks of 2026-11-16
    expect(view.delegated).toHaveLength(1);
    expect(view.delegated[0]).toMatchObject({
      filename: "2026-11-10.txt",
      dateISO: "2026-11-10",
      lineIdx: 0,
    });
    expect(view.hasOlder).toBe(true);

    // Group 3: mentions by meeting, excluding lines already in group 1
    expect(view.mentions).toHaveLength(1);
    expect(view.mentions[0]).toMatchObject({
      filename: "2026-11-12.txt",
      dateISO: "2026-11-12",
      title: "Coffee rota",
      count: 3,
      lineIdx: 2,
    });
  });

  it("includes older delegated items after newer ones when showOlder is true", () => {
    const view = buildPersonView("Dana", entries, "2026-11-16", true);

    expect(view.delegated.map((row) => row.dateISO)).toEqual([
      "2026-11-10",
      "2026-09-01",
    ]);
  });
});

describe("knownPeople", () => {
  it("orders most recently used first with the most used spelling", () => {
    const entries: NoteEntry[] = [
      entry("2026-11-10", "# ask @Dana\n# ping @dana\n# call @Dana"),
      entry("2026-11-12", "# check with @Ben"),
    ];

    expect(knownPeople(entries)).toEqual(["Ben", "Dana"]);
  });
});

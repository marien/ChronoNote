import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { clearDiskLayer, seedDiskNotesForTest } from "./notesIndex/diskLayer";
import { runSearch } from "./search";
import { searchResultsStore, tabs } from "./stores";
import { sortFilenamesByRecency } from "./tabSort";
import type { NoteTab, SearchResultItem } from "./types";

describe("runSearch('all') via notesIndex", () => {
  beforeEach(() => {
    clearDiskLayer();
    tabs.set([]);
    searchResultsStore.set([]);
  });

  it("matches the old allNotesCache reference in order and tabIds, and skips scratchpads", () => {
    const diskNotes: Record<string, string> = {
      "2026-09-10.txt": "intro\n# deploy api\nafter",
      "2026-09-20.txt": "disk version without match",
      "ideas.txt": "first\n# deploy docs\nlast",
    };
    seedDiskNotesForTest(diskNotes);

    const openTab: NoteTab = {
      id: "tab-20",
      filename: "2026-09-20.txt",
      content: "top\n# deploy frontend\nbottom",
      isScratchpad: false,
    };
    const scratchTab: NoteTab = {
      id: "tab-scratch",
      filename: "Scratchpad 1",
      content: "# deploy from scratchpad should not appear",
      isScratchpad: true,
    };
    tabs.set([openTab, scratchTab]);

    // Reference implementation of the pre-S4 all-files branch.
    const allSources: Record<string, string> = {
      ...diskNotes,
      [openTab.filename]: openTab.content,
    };
    const openTabIdByFilename = new Map(
      get(tabs)
        .filter((t) => !t.isScratchpad)
        .map((t) => [t.filename, t.id]),
    );
    const reference: SearchResultItem[] = [];
    for (const filename of sortFilenamesByRecency(Object.keys(allSources))) {
      const lines = allSources[filename].split("\n");
      lines.forEach((line, lineIdx) => {
        if (line.toLowerCase().includes("deploy")) {
          reference.push({
            tabId: openTabIdByFilename.get(filename),
            tabFilename: filename,
            lineIdx,
            line,
            contextBefore: lineIdx > 0 ? lines[lineIdx - 1] : undefined,
            contextAfter: lineIdx < lines.length - 1 ? lines[lineIdx + 1] : undefined,
          });
        }
      });
    }

    runSearch("deploy", "all");
    const actual = get(searchResultsStore);

    expect(actual).toEqual(reference);
    expect(actual.map((r) => [r.tabFilename, r.tabId])).toEqual([
      ["ideas.txt", undefined],
      ["2026-09-20.txt", "tab-20"],
      ["2026-09-10.txt", undefined],
    ]);
    expect(actual.some((r) => r.tabFilename === "Scratchpad 1" || r.line.includes("scratchpad"))).toBe(false);
  });
});

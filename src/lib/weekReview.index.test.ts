// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { ensureLoaded, notesIndex, noteTexts } from "./notesIndex";
import { clearDiskLayer, seedDiskNotesForTest } from "./notesIndex/diskLayer";
import { tabs } from "./stores";
import { buildWeekReview } from "./weekReview";

function oldNoteList(): { filename: string; content: string }[] {
  const tabList = get(tabs);
  const cache = noteTexts(get(notesIndex));
  const tabMap = new Map(tabList.map((t) => [t.filename, t.content]));
  const result: { filename: string; content: string }[] = [];
  for (const [filename, content] of Object.entries(cache)) {
    result.push({
      filename,
      content: tabMap.has(filename) ? tabMap.get(filename)! : content,
    });
  }
  for (const t of tabList) {
    if (!Object.prototype.hasOwnProperty.call(cache, t.filename)) {
      result.push({ filename: t.filename, content: t.content });
    }
  }
  return result;
}

function newNoteList(): { filename: string; content: string }[] {
  return Array.from(get(notesIndex).entries.values(), (e) => ({
    filename: e.filename,
    content: e.text,
  }));
}

describe("week review reading notesIndex (S3)", () => {
  beforeEach(() => {
    clearDiskLayer();
    tabs.set([]);
    get(notesIndex);
  });

  it("deep-equals buildWeekReview on the old noteList construction for two week notes and a scratchpad tab", async () => {
    seedDiskNotesForTest({
      "2026-10-19.txt": "# earlier task by:2026-10-25",
      "2026-10-26.txt": "Standup\n=======\n# monday task\nv done task",
      "2026-10-28.txt": "Sync\n====\n# stale wednesday task",
    });
    tabs.set([
      {
        id: "tab-wed",
        filename: "2026-10-28.txt",
        isScratchpad: false,
        content: "Sync\n====\n# live wednesday task by:2026-10-27\n  # nested action",
      },
      {
        id: "tab-scratch",
        filename: "Scratchpad 1",
        isScratchpad: true,
        content: "# scratchpad action",
      },
    ]);
    await ensureLoaded();

    const actual = buildWeekReview(newNoteList(), 2026, 44, "2026-10-28");
    const expected = buildWeekReview(oldNoteList(), 2026, 44, "2026-10-28");

    expect(actual.days).toHaveLength(2);
    expect(actual).toEqual(expected);
  });
});

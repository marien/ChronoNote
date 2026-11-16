import { beforeEach, describe, expect, it, vi } from "vitest";

const { disk, apiMock } = vi.hoisted(() => {
  const disk = new Map<string, string>();
  return {
    disk,
    apiMock: {
      readAllNotes: vi.fn(async () => [...disk.entries()]),
      readNote: vi.fn(async (fn: string) => disk.get(fn) ?? null),
      setOccurrenceHint: vi.fn(async () => {}),
    },
  };
});

vi.mock("./tauriApi", () => apiMock);

import { clearDiskLayer } from "./notesIndex/diskLayer";
import { occurrenceFiles, occurrenceKeyApplies } from "./occurrences";
import { activeTabId, registerEditorApi, tabs } from "./stores";
import type { NoteTab } from "./types";

describe("occurrences via notesIndex", () => {
  beforeEach(() => {
    disk.clear();
    clearDiskLayer();
    tabs.set([]);
    activeTabId.set("");
    apiMock.readAllNotes.mockClear();
  });

  it("occurrenceFiles('Standup') includes an open tab that just added a Standup section", async () => {
    disk.set("2026-09-01.txt", "Standup\n=======\n# check build");
    disk.set("2026-09-03.txt", "Retro\n=====\nno standup here");
    disk.set("2026-09-05.txt", "Notes\n=====\nstill no standup on disk");

    const openTab: NoteTab = {
      id: "tab-05",
      filename: "2026-09-05.txt",
      content: "Notes\n=====\nstill no standup on disk\n\nStandup\n=======\n# newly added",
      isScratchpad: false,
    };
    tabs.set([openTab]);

    const files = await occurrenceFiles("Standup");
    expect(files).toEqual(["2026-09-01.txt", "2026-09-05.txt"]);
  });

  it("occurrenceKeyApplies is true before the first disk load", () => {
    const openTab: NoteTab = {
      id: "tab-05",
      filename: "2026-09-05.txt",
      content: "Standup\n=======\n# item",
      isScratchpad: false,
    };
    tabs.set([openTab]);
    activeTabId.set("tab-05");
    registerEditorApi({
      getContent: () => openTab.content,
      setContent: () => {},
      insertAtCursor: () => {},
      jumpToLine: () => {},
      getCursorLineIdx: () => 2,
      getSelection: () => ({ text: "", fromLine: 0, toLine: 0 }),
      focus: () => {},
      find: { setQuery: () => {}, next: () => {}, prev: () => {}, clear: () => {} },
    });

    expect(occurrenceKeyApplies()).toBe(true);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

/** R1 / S1b: a prefetch (the date picker reading a few notes on its own) must not put what it read into the
 * notes index's disk texts when a folder switch or a full read happened while it waited. */
const { disk, apiMock } = vi.hoisted(() => {
  const disk = new Map<string, string>();
  return {
    disk,
    apiMock: {
      readAllNotes: vi.fn(async () => [...disk.entries()]),
      readNote: vi.fn(async (fn: string) => disk.get(fn) ?? null),
      oneDriveSyncNow: vi.fn(),
      oneDriveGetConflicts: vi.fn(async () => []),
      saveScratchpadDrafts: vi.fn(async () => {}),
    },
  };
});

vi.mock("../tauriApi", () => apiMock);
vi.mock("../drift", () => ({ checkActiveTabForDrift: vi.fn(async () => {}) }));
vi.mock("../calendarSyncActions", () => ({ refreshAgendaFileExists: vi.fn(async () => {}) }));

import { tabs } from "../stores";
import { prefetchNotesForDates } from "../persistence";
import { ensureLoaded, notesIndex, noteTexts } from "./index";
import { clearDiskLayer, invalidateDiskLayer, shownNotes } from "./diskLayer";

const deferredRead = () => {
  let resolve!: (v: string | null) => void;
  const promise = new Promise<string | null>((r) => (resolve = r));
  return { promise, resolve };
};

describe("prefetchNotesForDates and the disk layer", () => {
  beforeEach(() => {
    tabs.set([]);
    clearDiskLayer();
    disk.clear();
    apiMock.readNote.mockClear();
    apiMock.readAllNotes.mockClear();
  });

  it("a prefetch that nothing overtakes adds what it read to shown", async () => {
    disk.set("2026-11-01.txt", "# one\n");
    await prefetchNotesForDates(["2026-11-01.txt", "2026-11-02.txt"]);
    expect({ ...shownNotes() }).toEqual({ "2026-11-01.txt": "# one\n" });
    expect(noteTexts(get(notesIndex))).toEqual({ "2026-11-01.txt": "# one\n" });
  });

  it("a prefetch whose read resolves after a folder switch adds nothing to shown", async () => {
    const read = deferredRead();
    apiMock.readNote.mockImplementationOnce(() => read.promise);
    const prefetching = prefetchNotesForDates(["2026-11-01.txt"]);
    clearDiskLayer(); // the folder switch
    read.resolve("# from the old folder\n");
    await prefetching;
    expect({ ...shownNotes() }).toEqual({});
    expect(noteTexts(get(notesIndex))).toEqual({});
  });

  it("a prefetch whose read resolves after a full read adds nothing: the full read is newer", async () => {
    const read = deferredRead();
    apiMock.readNote.mockImplementationOnce(() => read.promise);
    const prefetching = prefetchNotesForDates(["2026-11-01.txt"]); // the file exists when it is read...
    invalidateDiskLayer();
    await ensureLoaded(); // ...but a full read, made later, says it is gone
    expect({ ...shownNotes() }).toEqual({});
    read.resolve("# gone since\n");
    await prefetching;
    expect({ ...shownNotes() }).toEqual({});
  });
});

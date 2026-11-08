import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

/** §451: after a OneDrive sync the list of all notes (`allNotesCache`, which the status bar's due item and the
 * Actions view are built on) takes in the notes the sync changed, without a full re-read. */
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

vi.mock("./tauriApi", () => apiMock);
vi.mock("./drift", () => ({ checkActiveTabForDrift: vi.fn(async () => {}) }));
vi.mock("./calendarSyncActions", () => ({ refreshAgendaFileExists: vi.fn(async () => {}) }));

import { allNotesCache, currentDateISO, notesChangedBySync, oneDriveFolder, tabs } from "./stores";
import { invalidateDiskNotesCache, refreshAllNotesCache } from "./persistence";
import { syncOneDriveNow } from "./oneDriveSync";
import { dueSummary } from "./dueOverview";

describe("the list of all notes after a sync (§451)", () => {
  beforeEach(async () => {
    currentDateISO.set("2026-11-08");
    disk.clear();
    disk.set("2026-11-05.txt", "# older action\n");
    tabs.set([]);
    allNotesCache.set({});
    invalidateDiskNotesCache();
    oneDriveFolder.set({ folderId: "f", folderPath: "/Notes" });
    apiMock.readAllNotes.mockClear();
    apiMock.readNote.mockClear();
    await refreshAllNotesCache();
    expect(apiMock.readAllNotes).toHaveBeenCalledTimes(1);
  });

  it("takes in a note the sync downloaded, reading only that note", async () => {
    disk.set("2026-11-07.txt", "# written yesterday by:2026-11-10\n");
    apiMock.oneDriveSyncNow.mockResolvedValueOnce({ success: true, changedFiles: ["2026-11-07.txt"] });
    const before = get(notesChangedBySync);

    await syncOneDriveNow();

    expect(get(allNotesCache)["2026-11-07.txt"]).toBe("# written yesterday by:2026-11-10\n");
    expect(get(allNotesCache)["2026-11-05.txt"]).toBe("# older action\n");
    expect(apiMock.readAllNotes).toHaveBeenCalledTimes(1);
    expect(apiMock.readNote).toHaveBeenCalledWith("2026-11-07.txt");
    expect(get(notesChangedBySync)).toBe(before + 1);
    expect(get(dueSummary).items.map((i) => i.text)).toContain("written yesterday");
  });

  it("drops a note the sync deleted", async () => {
    disk.delete("2026-11-05.txt");
    apiMock.oneDriveSyncNow.mockResolvedValueOnce({ success: true, changedFiles: ["2026-11-05.txt"] });
    await syncOneDriveNow();
    expect("2026-11-05.txt" in get(allNotesCache)).toBe(false);
  });

  it("a sync that changed nothing reads nothing and leaves the list as it is", async () => {
    const before = get(notesChangedBySync);
    apiMock.oneDriveSyncNow.mockResolvedValueOnce({ success: true, changedFiles: [] });
    await syncOneDriveNow();
    expect(apiMock.readNote).not.toHaveBeenCalled();
    expect(get(notesChangedBySync)).toBe(before);
    await refreshAllNotesCache();
    expect(apiMock.readAllNotes).toHaveBeenCalledTimes(1);
  });

  it("a failed sync that changed notes before failing still reports them", async () => {
    disk.set("2026-11-07.txt", "# came down\n");
    apiMock.oneDriveSyncNow.mockResolvedValueOnce({
      success: false,
      message: { code: "other", detail: "upload failed" },
      changedFiles: ["2026-11-07.txt"],
    });
    await syncOneDriveNow();
    expect(get(allNotesCache)["2026-11-07.txt"]).toBe("# came down\n");
  });

  it("a result without the list falls back to a full re-read on the next request", async () => {
    disk.set("2026-11-07.txt", "# other backend\n");
    apiMock.oneDriveSyncNow.mockResolvedValueOnce({ success: false, message: { code: "other", detail: "x" } });
    await syncOneDriveNow();
    expect(apiMock.readNote).not.toHaveBeenCalled();
    await refreshAllNotesCache();
    expect(apiMock.readAllNotes).toHaveBeenCalledTimes(2);
    expect(get(allNotesCache)["2026-11-07.txt"]).toBe("# other backend\n");
  });
});

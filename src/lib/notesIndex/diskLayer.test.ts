import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const { disk, apiMock } = vi.hoisted(() => {
  const disk = new Map<string, string>();
  return {
    disk,
    apiMock: {
      readAllNotes: vi.fn(async () => [...disk.entries()] as [string, string][]),
    },
  };
});

vi.mock("../tauriApi", () => apiMock);

import {
  addPrefetched,
  clearDiskLayer,
  diskSnapshot,
  diskVersion,
  ensureLoaded,
  invalidateDiskLayer,
  isDiskLoaded,
  isShownLoaded,
  readAllIntoDiskLayer,
  removeDiskNote,
  seedDiskNotesForTest,
  setDiskNote,
  shownNotes,
  whenDiskReadSettled,
} from "./diskLayer";

const shown = () => ({ ...shownNotes() });

describe("the disk layer", () => {
  beforeEach(() => {
    clearDiskLayer();
    disk.clear();
    apiMock.readAllNotes.mockClear();
  });

  it("starts empty: not loaded, nothing shown", () => {
    expect(isDiskLoaded()).toBe(false);
    expect(isShownLoaded()).toBe(false);
    expect(diskSnapshot()).toBeNull();
    expect(shown()).toEqual({});
  });

  describe("readAllIntoDiskLayer", () => {
    it("fills raw and shown with exactly the entries, and bumps the version", () => {
      const v = get(diskVersion);
      readAllIntoDiskLayer([
        ["a.txt", "A"],
        ["b.txt", "B"],
      ]);
      expect(isDiskLoaded()).toBe(true);
      expect(isShownLoaded()).toBe(true);
      expect(diskSnapshot()).toEqual({ "a.txt": "A", "b.txt": "B" });
      expect(shown()).toEqual({ "a.txt": "A", "b.txt": "B" });
      expect(get(diskVersion)).toBeGreaterThan(v);
    });

    it("a file gone from disk leaves shown too", () => {
      readAllIntoDiskLayer([
        ["a.txt", "A"],
        ["b.txt", "B"],
      ]);
      readAllIntoDiskLayer([["a.txt", "A2"]]);
      expect(diskSnapshot()).toEqual({ "a.txt": "A2" });
      expect(shown()).toEqual({ "a.txt": "A2" });
    });

    it("a note shown while raw was null is replaced by the read", () => {
      setDiskNote("closed.txt", "from a closed tab");
      readAllIntoDiskLayer([["a.txt", "A"]]);
      expect(shown()).toEqual({ "a.txt": "A" });
    });

    it("an empty folder is a read too: loaded, nothing shown, version bumped", () => {
      const v = get(diskVersion);
      readAllIntoDiskLayer([]);
      expect(isDiskLoaded()).toBe(true);
      expect(isShownLoaded()).toBe(true);
      expect(diskSnapshot()).toEqual({});
      expect(get(diskVersion)).toBeGreaterThan(v);
    });
  });

  describe("setDiskNote", () => {
    it("sets raw and shown when raw holds a read, and bumps", () => {
      seedDiskNotesForTest({ "a.txt": "A" });
      const v = get(diskVersion);
      setDiskNote("a.txt", "A2");
      setDiskNote("b.txt", "B");
      expect(diskSnapshot()).toEqual({ "a.txt": "A2", "b.txt": "B" });
      expect(shown()).toEqual({ "a.txt": "A2", "b.txt": "B" });
      expect(get(diskVersion)).toBe(v + 2);
    });

    it("sets shown but leaves raw null when raw is null", () => {
      const v = get(diskVersion);
      setDiskNote("closed.txt", "text");
      expect(isDiskLoaded()).toBe(false);
      expect(diskSnapshot()).toBeNull();
      expect(shown()).toEqual({ "closed.txt": "text" });
      expect(get(diskVersion)).toBeGreaterThan(v);
    });

    it("does not set raw after an invalidation either", () => {
      seedDiskNotesForTest({ "a.txt": "A" });
      invalidateDiskLayer();
      setDiskNote("a.txt", "A2");
      expect(diskSnapshot()).toBeNull();
      expect(shown()).toEqual({ "a.txt": "A2" });
    });
  });

  describe("removeDiskNote", () => {
    it("deletes from raw and shown when raw holds a read, and bumps", () => {
      seedDiskNotesForTest({ "a.txt": "A", "b.txt": "B" });
      const v = get(diskVersion);
      removeDiskNote("a.txt");
      expect(diskSnapshot()).toEqual({ "b.txt": "B" });
      expect(shown()).toEqual({ "b.txt": "B" });
      expect(get(diskVersion)).toBeGreaterThan(v);
    });

    it("deletes from shown when raw is null", () => {
      seedDiskNotesForTest({ "a.txt": "A", "b.txt": "B" });
      invalidateDiskLayer();
      removeDiskNote("a.txt");
      expect(diskSnapshot()).toBeNull();
      expect(shown()).toEqual({ "b.txt": "B" });
    });
  });

  describe("addPrefetched", () => {
    it("sets shown for a note it does not know, leaves raw alone, and bumps", () => {
      seedDiskNotesForTest({ "a.txt": "A" });
      const v = get(diskVersion);
      addPrefetched("p.txt", "P");
      expect(shown()).toEqual({ "a.txt": "A", "p.txt": "P" });
      expect(diskSnapshot()).toEqual({ "a.txt": "A" });
      expect(get(diskVersion)).toBeGreaterThan(v);
    });

    it("does not touch raw when raw is null", () => {
      addPrefetched("p.txt", "P");
      expect(diskSnapshot()).toBeNull();
      expect(isDiskLoaded()).toBe(false);
      expect(shown()).toEqual({ "p.txt": "P" });
    });

    it("a prefetched note does not overwrite a shown one", () => {
      seedDiskNotesForTest({ "a.txt": "A" });
      const v = get(diskVersion);
      addPrefetched("a.txt", "older read");
      expect(shown()).toEqual({ "a.txt": "A" });
      expect(diskSnapshot()).toEqual({ "a.txt": "A" });
      expect(get(diskVersion)).toBe(v);
    });
  });

  describe("invalidateDiskLayer", () => {
    it("sets raw to null and keeps shown, and shown stays loaded", () => {
      seedDiskNotesForTest({ "a.txt": "A" });
      const v = get(diskVersion);
      invalidateDiskLayer();
      expect(isDiskLoaded()).toBe(false);
      expect(diskSnapshot()).toBeNull();
      expect(shown()).toEqual({ "a.txt": "A" });
      expect(isShownLoaded()).toBe(true);
      expect(get(diskVersion)).toBe(v);
    });
  });

  describe("clearDiskLayer", () => {
    it("empties both, is no longer loaded, and bumps", () => {
      seedDiskNotesForTest({ "a.txt": "A" });
      const v = get(diskVersion);
      clearDiskLayer();
      expect(isDiskLoaded()).toBe(false);
      expect(isShownLoaded()).toBe(false);
      expect(diskSnapshot()).toBeNull();
      expect(shown()).toEqual({});
      expect(get(diskVersion)).toBeGreaterThan(v);
    });
  });

  describe("diskSnapshot", () => {
    it("is a copy: changing it changes nothing in the layer", () => {
      seedDiskNotesForTest({ "a.txt": "A" });
      const copy = diskSnapshot()!;
      copy["x.txt"] = "X";
      delete copy["a.txt"];
      expect(diskSnapshot()).toEqual({ "a.txt": "A" });
      expect(shown()).toEqual({ "a.txt": "A" });
    });
  });

  describe("seedDiskNotesForTest", () => {
    it("is a full read of those notes", () => {
      seedDiskNotesForTest({ "a.txt": "A", "b.txt": "B" });
      expect(isDiskLoaded()).toBe(true);
      expect(diskSnapshot()).toEqual({ "a.txt": "A", "b.txt": "B" });
      expect(shown()).toEqual({ "a.txt": "A", "b.txt": "B" });
    });
  });

  describe("ensureLoaded", () => {
    it("reads the folder once for callers that ask at the same time", async () => {
      disk.set("a.txt", "A");
      await Promise.all([ensureLoaded(), ensureLoaded(), ensureLoaded()]);
      expect(apiMock.readAllNotes).toHaveBeenCalledTimes(1);
      expect(diskSnapshot()).toEqual({ "a.txt": "A" });
      expect(shown()).toEqual({ "a.txt": "A" });
    });

    it("reads nothing when the layer already holds a read", async () => {
      seedDiskNotesForTest({ "a.txt": "A" });
      await ensureLoaded();
      expect(apiMock.readAllNotes).not.toHaveBeenCalled();
    });

    it("reads again after an invalidation, and replaces shown with what is on disk", async () => {
      seedDiskNotesForTest({ "a.txt": "A", "gone.txt": "G" });
      disk.set("a.txt", "A2");
      invalidateDiskLayer();
      await ensureLoaded();
      expect(apiMock.readAllNotes).toHaveBeenCalledTimes(1);
      expect(shown()).toEqual({ "a.txt": "A2" });
    });

    it("a failed read leaves the layer unread and the next call tries again", async () => {
      apiMock.readAllNotes.mockRejectedValueOnce(new Error("disk gone"));
      await expect(ensureLoaded()).rejects.toThrow("disk gone");
      expect(isDiskLoaded()).toBe(false);
      disk.set("a.txt", "A");
      await ensureLoaded();
      expect(apiMock.readAllNotes).toHaveBeenCalledTimes(2);
      expect(shown()).toEqual({ "a.txt": "A" });
    });

    it("whenDiskReadSettled resolves also when the read failed", async () => {
      apiMock.readAllNotes.mockRejectedValueOnce(new Error("disk gone"));
      const pending = ensureLoaded().catch(() => {});
      await whenDiskReadSettled();
      await pending;
      expect(isDiskLoaded()).toBe(false);
    });
  });

  describe("a full read that is overtaken", () => {
    type Entries = [string, string][];
    const deferred = () => {
      let resolve!: (v: Entries) => void;
      const promise = new Promise<Entries>((r) => (resolve = r));
      return { promise, resolve };
    };
    const settle = () => new Promise((r) => setTimeout(r, 0));

    beforeEach(() => {
      apiMock.readAllNotes.mockReset();
      apiMock.readAllNotes.mockImplementation(async () => [...disk.entries()] as Entries);
    });

    it("a folder switch while the read runs: the old folder's notes never land, a second read does", async () => {
      const first = deferred();
      const second = deferred();
      apiMock.readAllNotes.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

      const loading = ensureLoaded();
      expect(apiMock.readAllNotes).toHaveBeenCalledTimes(1);
      clearDiskLayer(); // the folder switch
      first.resolve([["a-only.txt", "folder A"]]);
      await settle();

      expect(shown()).toEqual({});
      expect(isShownLoaded()).toBe(false);
      expect(isDiskLoaded()).toBe(false);
      expect(diskSnapshot()).toBeNull();
      expect(apiMock.readAllNotes).toHaveBeenCalledTimes(2); // ensureLoaded started a second read

      second.resolve([["b-only.txt", "folder B"]]);
      await loading;
      expect(shown()).toEqual({ "b-only.txt": "folder B" });
      expect(diskSnapshot()).toEqual({ "b-only.txt": "folder B" });
      expect(isShownLoaded()).toBe(true);
    });

    it("an invalidation while the read runs: the stale result is dropped, a second read does land", async () => {
      const first = deferred();
      const second = deferred();
      apiMock.readAllNotes.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

      const loading = ensureLoaded();
      invalidateDiskLayer(); // a sync or a write says the folder has changed
      first.resolve([["old.txt", "read before the change"]]);
      await settle();

      expect(shown()).toEqual({});
      expect(isDiskLoaded()).toBe(false);
      expect(apiMock.readAllNotes).toHaveBeenCalledTimes(2);

      second.resolve([["new.txt", "read after the change"]]);
      await loading;
      expect(shown()).toEqual({ "new.txt": "read after the change" });
      expect(diskSnapshot()).toEqual({ "new.txt": "read after the change" });
    });

    it("a caller that arrives after the switch does not join the old read", async () => {
      const first = deferred();
      const second = deferred();
      apiMock.readAllNotes.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

      const early = ensureLoaded();
      clearDiskLayer();
      const late = ensureLoaded();
      expect(apiMock.readAllNotes).toHaveBeenCalledTimes(2); // not joined: its own read

      first.resolve([["a-only.txt", "folder A"]]);
      second.resolve([["b-only.txt", "folder B"]]);
      await Promise.all([early, late]);
      expect(apiMock.readAllNotes).toHaveBeenCalledTimes(2); // the early caller joined the second read
      expect(shown()).toEqual({ "b-only.txt": "folder B" });
    });
  });
});

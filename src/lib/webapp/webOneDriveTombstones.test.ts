import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebBackend } from "./webBackend";
import { installIdbStub } from "../testing/idbStub";
import { IDB_META_KEYS } from "./idb";
import type { OneDriveClient } from "./oneDriveClient";
import { computeSha256Hex } from "./webOneDriveSync";

describe("WebOneDriveSync - Deleted-note tombstones", () => {
  let backend: WebBackend;
  let mockStores: Record<string, Map<string, any>>;
  let mockClient: any;

  beforeEach(async () => {
    mockStores = installIdbStub();
    backend = new WebBackend("0.30.0");

    mockClient = {
      getUserProfile: vi.fn().mockResolvedValue({ email: "test@example.com", displayName: "Tester" }),
      listFolders: vi.fn().mockResolvedValue([]),
      createFolder: vi.fn().mockResolvedValue({ id: "f-1", name: "Notes" }),
      getFolderDelta: vi.fn().mockResolvedValue({ changes: [], deltaLink: "delta-1" }),
      downloadFileContent: vi.fn().mockResolvedValue(""),
      deleteItem: vi.fn().mockResolvedValue("deleted"),
      uploadFileContent: vi.fn().mockResolvedValue({ type: "success", id: "item-up", etag: "tag-up" }),
    };
    (backend.syncEngine as any).client = mockClient as unknown as OneDriveClient;

    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_AUTH, {
      accessToken: "valid-tok",
      refreshToken: "ref-tok",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      account: { email: "test@example.com", displayName: "Tester" },
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_FOLDER, {
      folderId: "folder-xyz",
      folderPath: "/Notes",
    });
    mockStores.meta.set(IDB_META_KEYS.ACTIVE_WORKSPACE, "onedrive");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deleting a note locally sends DELETE with last synced etag on next sync and clears tombstone", async () => {
    const content = "Synced note content\n";
    const hash = await computeSha256Hex(content);

    mockStores.notes_cloud.set("2026-10-20.txt", {
      content,
      contentHash: hash,
      modifiedMs: 1000,
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
      files: { "2026-10-20.txt": { id: "item-123", etag: "etag-abc", localHash: hash } },
      conflicts: {},
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_BASES, {
      "2026-10-20.txt": content,
    });

    // Delete locally
    await backend.invoke("delete_note", { filename: "2026-10-20.txt" });

    const tombstones = mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_TOMBSTONES);
    expect(tombstones).toEqual(["2026-10-20.txt"]);

    // Next sync executes DELETE with last synced etag
    const syncRes = (await backend.invoke("onedrive_sync_now")) as { success: boolean };
    expect(syncRes.success).toBe(true);

    expect(mockClient.deleteItem).toHaveBeenCalledWith("valid-tok", "item-123", "etag-abc");

    // Tombstone is cleared
    const tombstonesAfter = mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_TOMBSTONES);
    expect(tombstonesAfter).toEqual([]);

    // Cache entry and base copy are removed
    const cache = mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_CACHE);
    expect(cache.files["2026-10-20.txt"]).toBeUndefined();
    const bases = mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_BASES);
    expect(bases["2026-10-20.txt"]).toBeUndefined();
  });

  it("a locally deleted note is not re-downloaded on subsequent syncs", async () => {
    // Note was deleted locally and synced away
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
      files: {},
      conflicts: {},
      deltaLink: "delta-1",
    });

    // Subsequent delta query returns no changes for that item
    mockClient.getFolderDelta.mockResolvedValue({
      changes: [],
      deltaLink: "delta-2",
    });

    const syncRes = (await backend.invoke("onedrive_sync_now")) as { success: boolean };
    expect(syncRes.success).toBe(true);

    expect(mockClient.downloadFileContent).not.toHaveBeenCalled();
    expect(mockStores.notes_cloud.has("2026-10-20.txt")).toBe(false);
  });

  it("a note deleted on OneDrive is removed locally on next sync", async () => {
    const content = "Existing remote note\n";
    const hash = await computeSha256Hex(content);

    mockStores.notes_cloud.set("2026-10-20.txt", {
      content,
      contentHash: hash,
      modifiedMs: 1000,
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
      files: { "2026-10-20.txt": { id: "item-remote", etag: "tag-old", localHash: hash } },
      conflicts: {},
      deltaLink: "delta-1",
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_BASES, {
      "2026-10-20.txt": content,
    });

    // Delta feed reports deletion
    mockClient.getFolderDelta.mockResolvedValue({
      changes: [{ id: "item-remote", name: "2026-10-20.txt", isDeleted: true }],
      deltaLink: "delta-2",
    });

    const syncRes = (await backend.invoke("onedrive_sync_now")) as { success: boolean };
    expect(syncRes.success).toBe(true);

    // Removed locally
    expect(mockStores.notes_cloud.has("2026-10-20.txt")).toBe(false);
    const cache = mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_CACHE);
    expect(cache.files["2026-10-20.txt"]).toBeUndefined();
  });

  it("a note deleted on OneDrive but edited locally is kept locally and re-uploaded", async () => {
    const baseContent = "Base note content\n";
    const baseHash = await computeSha256Hex(baseContent);
    const editedContent = "Locally edited content\n";
    const editedHash = await computeSha256Hex(editedContent);

    // Local file was edited after last sync
    mockStores.notes_cloud.set("2026-10-20.txt", {
      content: editedContent,
      contentHash: editedHash,
      modifiedMs: 2000,
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
      files: { "2026-10-20.txt": { id: "item-remote", etag: "tag-old", localHash: baseHash } },
      conflicts: {},
      deltaLink: "delta-1",
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_BASES, {
      "2026-10-20.txt": baseContent,
    });

    // Remote delta says item was deleted on OneDrive
    mockClient.getFolderDelta.mockResolvedValue({
      changes: [{ id: "item-remote", name: "2026-10-20.txt", isDeleted: true }],
      deltaLink: "delta-2",
    });

    const syncRes = (await backend.invoke("onedrive_sync_now")) as { success: boolean };
    expect(syncRes.success).toBe(true);

    // Note was NOT deleted locally
    expect(mockStores.notes_cloud.get("2026-10-20.txt").content).toBe(editedContent);

    // Note was re-uploaded to OneDrive in Phase 3
    expect(mockClient.uploadFileContent).toHaveBeenCalledWith(
      "valid-tok",
      "folder-xyz",
      "2026-10-20.txt",
      editedContent,
      undefined,
    );
  });

  it("a note deleted locally but edited on OneDrive skips delete and restores the newer version locally", async () => {
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
      files: { "2026-10-20.txt": { id: "item-123", etag: "etag-old", localHash: "old-hash" } },
      conflicts: {},
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_TOMBSTONES, ["2026-10-20.txt"]);

    // Remote was edited: DELETE with If-Match etag-old returns 412 ("changed")
    mockClient.deleteItem.mockResolvedValue("changed");

    // Delta feed reports the newer remote version
    mockClient.getFolderDelta.mockResolvedValue({
      changes: [{ id: "item-123", name: "2026-10-20.txt", etag: "etag-new" }],
      deltaLink: "delta-2",
    });
    mockClient.downloadFileContent.mockResolvedValue("Newer content written on OneDrive\n");

    const syncRes = (await backend.invoke("onedrive_sync_now")) as { success: boolean };
    expect(syncRes.success).toBe(true);

    // Tombstone is settled
    expect(mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_TOMBSTONES)).toEqual([]);

    // Note is restored locally with newer content
    const restored = mockStores.notes_cloud.get("2026-10-20.txt");
    expect(restored).toBeDefined();
    expect(restored.content).toBe("Newer content written on OneDrive\n");
  });

  it("a transient failure on DELETE preserves tombstone for the next sync", async () => {
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
      files: { "2026-10-20.txt": { id: "item-123", etag: "etag-old", localHash: "old-hash" } },
      conflicts: {},
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_TOMBSTONES, ["2026-10-20.txt"]);

    mockClient.deleteItem.mockRejectedValue(new Error("Network timeout"));

    await backend.invoke("onedrive_sync_now");

    // Tombstone must be preserved for next sync
    const tombstones = mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_TOMBSTONES);
    expect(tombstones).toEqual(["2026-10-20.txt"]);
  });

  // §413: were suspected bugs (skipped) until the sync learned the rule.
  describe("a deleted note that is back, or held in a conflict, is just forgotten", () => {
    it("forgets tombstone without sending DELETE if note is back on disk before next sync", async () => {
      // CHANGELOG §184: "delete_note now records a tombstone (.onedrive-deleted.json) when OneDrive
      // sync is set up, and the next sync sends DELETE with If-Match = the last synced etag. If the
      // note changed elsewhere the delete is skipped and the pull restores the newer version; a note
      // that is back on disk, never synced, or held in a conflict is just forgotten;"
      //
      // In webOneDriveSync.ts executeSync Phase 1, tombstones are processed without checking whether
      // the note is present in notes_cloud (e.g. recreated or restored from trash before sync).
      // It sends client.deleteItem(...) to OneDrive anyway instead of forgetting the tombstone.
      const content = "Recreated note content\n";
      const hash = await computeSha256Hex(content);

      mockStores.notes_cloud.set("2026-10-20.txt", {
        content,
        contentHash: hash,
        modifiedMs: 2000,
      });
      mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
        files: { "2026-10-20.txt": { id: "item-123", etag: "etag-123", localHash: hash } },
        conflicts: {},
      });
      // Tombstone remained from earlier deletion before note was recreated/restored
      mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_TOMBSTONES, ["2026-10-20.txt"]);

      await backend.invoke("onedrive_sync_now");

      // According to §184, a note that is back on disk should just forget the tombstone and NOT send DELETE
      expect(mockClient.deleteItem).not.toHaveBeenCalled();
      expect(mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_TOMBSTONES)).toEqual([]);
    });

    it("forgets tombstone without sending DELETE if note is held in a conflict", async () => {
      // CHANGELOG §184: "a note that is back on disk, never synced, or held in a conflict is just forgotten"
      //
      // In webOneDriveSync.ts executeSync Phase 1, tombstones are processed without checking cache.conflicts[name].
      // If cache.files[name] is present, it issues a client.deleteItem call instead of forgetting the tombstone.
      mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
        files: { "2026-10-20.txt": { id: "item-123", etag: "etag-123", localHash: "h1" } },
        conflicts: {
          "2026-10-20.txt": { remoteContent: "conflict", remoteId: "item-123", remoteEtag: "etag-conflict" },
        },
      });
      mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_TOMBSTONES, ["2026-10-20.txt"]);

      await backend.invoke("onedrive_sync_now");

      // According to §184, a note held in a conflict should just forget the tombstone
      expect(mockClient.deleteItem).not.toHaveBeenCalled();
      expect(mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_TOMBSTONES)).toEqual([]);
    });
  });
});

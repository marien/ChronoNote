import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyRemoteChange,
  isSyncableFile,
  WebOneDriveSyncEngine,
  type FileCacheEntry,
  type StoredNote,
} from "./webOneDriveSync";
import type { OneDriveClient } from "./oneDriveClient";
import { IDB_META_KEYS, IDB_STORES } from "./idb";

describe("webOneDriveSync unit logic", () => {
  it("isSyncableFile matches standard note files and .agenda.json", () => {
    expect(isSyncableFile("2026-09-19.txt")).toBe(true);
    expect(isSyncableFile("1999-01-01.txt")).toBe(true);
    expect(isSyncableFile(".agenda.json")).toBe(true);
    expect(isSyncableFile("random.txt")).toBe(false);
    expect(isSyncableFile("2026-09-19.md")).toBe(false);
    expect(isSyncableFile(".chrononote-session.json")).toBe(false);
    expect(isSyncableFile(".onedrive-cache.json")).toBe(false);
  });

  it("classifyRemoteChange truth table matches Rust implementation", () => {
    const cached: FileCacheEntry = {
      id: "f1",
      etag: "tag1",
      localHash: "hash-baseline",
    };

    // 1. Local file is absent
    expect(classifyRemoteChange(undefined, undefined, "remote-hash")).toBe("writeLocal");

    // 2. Local already equals remote
    expect(classifyRemoteChange("hash-identical", undefined, "hash-identical")).toBe("adoptRemote");

    // 3. Local unchanged from cached baseline
    expect(classifyRemoteChange("hash-baseline", cached, "new-remote-hash")).toBe("writeLocal");

    // 4. Local changed from baseline and differs from remote -> Divergent
    expect(classifyRemoteChange("hash-edited", cached, "new-remote-hash")).toBe("divergent");
  });
});

describe("WebOneDriveSyncEngine lifecycle & sync", () => {
  let mockStores: Record<string, Map<string, any>>;
  let mockDb: any;
  let mockClient: OneDriveClient;
  let engine: WebOneDriveSyncEngine;

  beforeEach(() => {
    mockStores = {
      notes: new Map(),
      notes_browser: new Map(),
      notes_cloud: new Map(),
      notes_archive: new Map(),
      conflicts: new Map(),
      meta: new Map(),
    };

    mockDb = {
      transaction: (storeName: string, mode: string) => {
        const storeMap = mockStores[storeName] ?? new Map();
        return {
          objectStore: () => ({
            get: (key: string) => {
              const req: any = {};
              setTimeout(() => {
                req.result = storeMap.get(key);
                req.onsuccess?.();
              }, 0);
              return req;
            },
            put: (value: any, key: string) => {
              const req: any = {};
              setTimeout(() => {
                storeMap.set(key, value);
                req.onsuccess?.();
              }, 0);
              return req;
            },
            delete: (key: string) => {
              const req: any = {};
              setTimeout(() => {
                storeMap.delete(key);
                req.onsuccess?.();
              }, 0);
              return req;
            },
            getAllKeys: () => {
              const req: any = {};
              setTimeout(() => {
                req.result = Array.from(storeMap.keys());
                req.onsuccess?.();
              }, 0);
              return req;
            },
            getAll: () => {
              const req: any = {};
              setTimeout(() => {
                req.result = Array.from(storeMap.values());
                req.onsuccess?.();
              }, 0);
              return req;
            },
            clear: () => {
              const req: any = {};
              setTimeout(() => {
                storeMap.clear();
                req.onsuccess?.();
              }, 0);
              return req;
            },
          }),
        };
      },
    };

    mockClient = {
      getUserProfile: vi.fn().mockResolvedValue({
        email: "tester@example.com",
        displayName: "Tester",
      }),
      listFolders: vi.fn().mockResolvedValue([]),
      createFolder: vi.fn().mockResolvedValue({ id: "new-f", name: "ChronoNote" }),
      getFolderDelta: vi.fn().mockResolvedValue({ changes: [], deltaLink: "new-delta" }),
      downloadFileContent: vi.fn().mockResolvedValue(""),
      deleteItem: vi.fn().mockResolvedValue("deleted"),
      uploadFileContent: vi.fn().mockResolvedValue({ type: "success", id: "item-up", etag: "tag-up" }),
    } as unknown as OneDriveClient;

    engine = new WebOneDriveSyncEngine(async () => mockDb, mockClient);
  });

  it("stores and retrieves folder configuration", async () => {
    expect(await engine.getFolder()).toBeNull();

    await engine.setFolder({ folderId: "f-123", folderPath: "/Apps/ChronoNote" });
    const cfg = await engine.getFolder();
    expect(cfg).toEqual({ folderId: "f-123", folderPath: "/Apps/ChronoNote" });
  });

  it("records local deletions into tombstones", async () => {
    await engine.setFolder({ folderId: "f-1", folderPath: "/Notes" });
    await engine.recordLocalDelete("2026-09-19.txt");

    const tombstones = mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_TOMBSTONES);
    expect(tombstones).toEqual(["2026-09-19.txt"]);
  });

  it("resolves conflicts using mine, theirs, both", async () => {
    // Setup initial conflict
    mockStores.notes_cloud.set("2026-09-19.txt", {
      content: "local text",
      contentHash: "local-hash",
      modifiedMs: 1000,
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
      files: {},
      conflicts: {
        "2026-09-19.txt": {
          remoteContent: "remote text",
          remoteId: "rem-1",
          remoteEtag: "etag-rem",
        },
      },
    });

    const conflicts = await engine.listConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      name: "2026-09-19.txt",
      local: "local text",
      remote: "remote text",
    });

    // Test 'theirs' resolution
    await engine.resolveConflict("2026-09-19.txt", "theirs");
    const updatedNote = mockStores.notes_cloud.get("2026-09-19.txt");
    expect(updatedNote.content).toBe("remote text");

    const remainingConflicts = await engine.listConflicts();
    expect(remainingConflicts).toHaveLength(0);
  });

  it("rebases the cache onto the held remote so 'mine' and 'both' push with its etag", async () => {
    for (const resolution of ["mine", "both"] as const) {
      mockStores.notes_cloud.set("2026-09-19.txt", {
        content: "local text",
        contentHash: "local-hash",
        modifiedMs: 1000,
      });
      mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
        files: { "2026-09-19.txt": { id: "rem-1", etag: "etag-old", localHash: "base-hash" } },
        conflicts: {
          "2026-09-19.txt": { remoteContent: "remote text", remoteId: "rem-1", remoteEtag: "etag-new" },
        },
      });

      await engine.resolveConflict("2026-09-19.txt", resolution);

      const cache = mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_CACHE);
      expect(cache.files["2026-09-19.txt"].etag).toBe("etag-new");
      expect(cache.conflicts["2026-09-19.txt"]).toBeUndefined();
      // Still differs from the note's hash, so the next sync uploads it.
      const note = mockStores.notes_cloud.get("2026-09-19.txt");
      expect(cache.files["2026-09-19.txt"].localHash).not.toBe(note.contentHash);
    }
  });

  it("rejects a sign-in redirect whose state does not match the saved request", async () => {
    sessionStorage.setItem(
      "chrononote_pkce_session",
      JSON.stringify({ verifier: "v", state: "expected", redirectUri: "http://x/", clientId: "c", tenant: "common", timestamp: 1 }),
    );
    const res = await engine.exchangeCodeDirect("code", "forged");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/did not match/);
  });

  it("logout(true) wipes the cloud notes and sync state but keeps browser notes", async () => {
    mockStores.notes_cloud.set("2026-09-19.txt", { content: "x", contentHash: "h", modifiedMs: 1 });
    mockStores.notes_browser.set("2026-09-18.txt", { content: "keep", contentHash: "k", modifiedMs: 1 });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_AUTH, { accessToken: "t", refreshToken: "r", expiresAt: 1 });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, { files: {}, conflicts: {} });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_BASES, { "2026-09-19.txt": "x" });

    await engine.logout(true);

    expect(mockStores.notes_cloud.size).toBe(0);
    expect(mockStores.notes_browser.size).toBe(1);
    expect(mockStores.meta.has(IDB_META_KEYS.ONEDRIVE_AUTH)).toBe(false);
    expect(mockStores.meta.has(IDB_META_KEYS.ONEDRIVE_CACHE)).toBe(false);
    expect(mockStores.meta.has(IDB_META_KEYS.ONEDRIVE_BASES)).toBe(false);
  });

  it("logout() without the option leaves the cloud notes in place", async () => {
    mockStores.notes_cloud.set("2026-09-19.txt", { content: "x", contentHash: "h", modifiedMs: 1 });
    await engine.logout();
    expect(mockStores.notes_cloud.size).toBe(1);
  });

  it("pushes local modified notes in Phase 3 of syncNow", async () => {
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_AUTH, {
      accessToken: "valid-tok",
      refreshToken: "ref-tok",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      account: { email: "a@b.com", displayName: "A" },
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_FOLDER, {
      folderId: "folder-xyz",
      folderPath: "/Notes",
    });

    mockStores.notes_cloud.set("2026-09-19.txt", {
      content: "Hello Cloud",
      contentHash: "hash-123",
      modifiedMs: 2000,
    });

    const res = await engine.syncNow();
    expect(res.success).toBe(true);

    expect(mockClient.uploadFileContent).toHaveBeenCalledWith(
      "valid-tok",
      "folder-xyz",
      "2026-09-19.txt",
      "Hello Cloud",
      undefined,
    );

    const cache = mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_CACHE);
    expect(cache.files["2026-09-19.txt"]).toEqual({
      id: "item-up",
      etag: "tag-up",
      localHash: "hash-123",
    });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeSha256Hex,
  isSyncableFile,
  WebOneDriveSyncEngine,
} from "./webOneDriveSync";
import type { OneDriveClient } from "./oneDriveClient";
import { IDB_META_KEYS } from "./idb";

describe("saved searches OneDrive sync", () => {
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
      transaction: (storeName: string) => {
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

  it("isSyncableFile accepts .chrononote-searches.txt", () => {
    expect(isSyncableFile(".chrononote-searches.txt")).toBe(true);
  });

  it("unions a divergent .chrononote-searches.txt locally without holding a conflict", async () => {
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

    const base = "a\n";
    const baseHash = await computeSha256Hex(base);
    const local = "a\nb\n";
    const localHash = await computeSha256Hex(local);

    mockStores.notes_cloud.set(".chrononote-searches.txt", {
      content: local,
      contentHash: localHash,
      modifiedMs: 1,
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_BASES, {
      ".chrononote-searches.txt": base,
    });
    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
      deltaLink: "d1",
      files: {
        ".chrononote-searches.txt": {
          id: "rem-1",
          etag: "etag-old",
          localHash: baseHash,
        },
      },
      conflicts: {},
    });

    (mockClient.getFolderDelta as any).mockResolvedValue({
      changes: [
        { id: "rem-1", name: ".chrononote-searches.txt", etag: "etag-new", isDeleted: false },
      ],
      deltaLink: "d2",
    });
    (mockClient.downloadFileContent as any).mockResolvedValue("a\nc\n");

    const res = await engine.syncNow();
    expect(res.success).toBe(true);
    expect(mockStores.notes_cloud.get(".chrononote-searches.txt")?.content).toBe("a\nb\nc\n");
    expect(await engine.listConflicts()).toEqual([]);
    expect(
      mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_CACHE)?.conflicts?.[".chrononote-searches.txt"],
    ).toBeUndefined();
  });
});

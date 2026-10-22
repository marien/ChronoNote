import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebBackend } from "./webBackend";
import { installIdbStub } from "../testing/idbStub";
import { IDB_META_KEYS } from "./idb";
import type { OneDriveClient } from "./oneDriveClient";
import type { SyncHealth } from "../generated/tauri-types";
import { computeSha256Hex } from "./webOneDriveSync";

describe("WebOneDriveSync - syncNow and sync health", () => {
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
    sessionStorage.clear();
  });

  it("successful sync updates lastSyncSuccessMs timestamp and sets status to idle", async () => {
    const beforeSync = Date.now();
    const res = (await backend.invoke("onedrive_sync_now")) as { success: boolean };
    expect(res.success).toBe(true);

    const health = (await backend.invoke("get_sync_health")) as SyncHealth;
    expect(health.status).toBe("idle");
    expect(health.lastSyncSuccessMs).toBeGreaterThanOrEqual(beforeSync);
  });

  it("reports correct localNoteCount and pendingUploadCount in sync health", async () => {
    const syncedHash = await computeSha256Hex("synced text\n");
    const modHash = await computeSha256Hex("modified text\n");
    const newHash = await computeSha256Hex("new text\n");

    // 1. Synced note (hash matches cache)
    mockStores.notes_cloud.set("2026-10-20.txt", {
      content: "synced text\n",
      contentHash: syncedHash,
      modifiedMs: 1000,
    });
    // 2. Locally modified note (hash differs from cache)
    mockStores.notes_cloud.set("2026-10-21.txt", {
      content: "modified text\n",
      contentHash: modHash,
      modifiedMs: 2000,
    });
    // 3. New local note (not in cache)
    mockStores.notes_cloud.set("2026-10-22.txt", {
      content: "new text\n",
      contentHash: newHash,
      modifiedMs: 3000,
    });
    // 4. Non-syncable file (should be ignored in counts)
    mockStores.notes_cloud.set("readme.md", {
      content: "ignored",
      contentHash: "hash-ignored",
      modifiedMs: 4000,
    });

    mockStores.meta.set(IDB_META_KEYS.ONEDRIVE_CACHE, {
      files: {
        "2026-10-20.txt": { id: "id-20", etag: "tag-20", localHash: syncedHash },
        "2026-10-21.txt": { id: "id-21", etag: "tag-21", localHash: "different-hash" },
      },
      conflicts: {},
    });

    const health = (await backend.invoke("get_sync_health")) as SyncHealth;
    expect(health.localNoteCount).toBe(3); // 3 valid daily notes
    expect(health.pendingUploadCount).toBe(2); // 2026-10-21 and 2026-10-22 need upload
  });

  it("reports failing Graph delta call rather than swallowing it and sets status to error", async () => {
    mockClient.getFolderDelta.mockRejectedValue(new Error("Graph delta 500 Server Error"));

    const res = (await backend.invoke("onedrive_sync_now")) as {
      success: boolean;
      message?: { code: string; detail?: string };
    };

    expect(res.success).toBe(false);
    expect(res.message).toEqual({
      code: "other",
      detail: expect.stringContaining("Graph delta 500 Server Error"),
    });

    const health = (await backend.invoke("get_sync_health")) as SyncHealth;
    expect(health.status).toBe("error");
  });

  it("reports failing Graph file download call rather than swallowing it and sets status to error", async () => {
    mockClient.getFolderDelta.mockResolvedValue({
      changes: [{ id: "item-remote", name: "2026-10-20.txt", etag: "tag-1" }],
      deltaLink: "delta-2",
    });
    mockClient.downloadFileContent.mockRejectedValue(new Error("Graph download 403 Forbidden"));

    const res = (await backend.invoke("onedrive_sync_now")) as {
      success: boolean;
      message?: { code: string; detail?: string };
    };

    expect(res.success).toBe(false);
    expect(res.message).toEqual({
      code: "other",
      detail: expect.stringContaining("Graph download 403 Forbidden"),
    });

    const health = (await backend.invoke("get_sync_health")) as SyncHealth;
    expect(health.status).toBe("error");
  });

  it("reports failing Graph file upload call rather than swallowing it and sets status to error", async () => {
    mockStores.notes_cloud.set("2026-10-20.txt", {
      content: "Upload me",
      contentHash: await computeSha256Hex("Upload me"),
      modifiedMs: 1000,
    });

    mockClient.uploadFileContent.mockRejectedValue(new Error("Graph upload 507 Insufficient Storage"));

    const res = (await backend.invoke("onedrive_sync_now")) as {
      success: boolean;
      message?: { code: string; detail?: string };
    };

    expect(res.success).toBe(false);
    expect(res.message).toEqual({
      code: "other",
      detail: expect.stringContaining("Graph upload 507 Insufficient Storage"),
    });

    const health = (await backend.invoke("get_sync_health")) as SyncHealth;
    expect(health.status).toBe("error");
  });

  it("classifies network errors as offline status", async () => {
    mockClient.getFolderDelta.mockRejectedValue(new Error("Failed to fetch"));

    const res = (await backend.invoke("onedrive_sync_now")) as { success: boolean };
    expect(res.success).toBe(false);

    const health = (await backend.invoke("get_sync_health")) as SyncHealth;
    expect(health.status).toBe("offline");
  });

  it("concurrent syncNow call while one is running does not start a second sync and returns oneDriveSyncBusy", async () => {
    let folderDeltaCalled: () => void;
    const deltaStarted = new Promise<void>((resolve) => {
      folderDeltaCalled = resolve;
    });

    let resolveFirstSync: (val: any) => void;
    const delayedPromise = new Promise((resolve) => {
      resolveFirstSync = resolve;
    });

    mockClient.getFolderDelta.mockImplementationOnce(async () => {
      folderDeltaCalled();
      return delayedPromise;
    });

    // Start first sync (runs asynchronously)
    const sync1Promise = backend.invoke("onedrive_sync_now") as Promise<{ success: boolean }>;

    // Wait until sync1 has reached getFolderDelta and is in progress
    await deltaStarted;

    // Start second sync concurrently while first sync is in flight
    const sync2Result = (await backend.invoke("onedrive_sync_now")) as {
      success: boolean;
      message?: { code: string };
    };

    expect(sync2Result.success).toBe(false);
    expect(sync2Result.message).toEqual({ code: "oneDriveSyncBusy" });

    // getFolderDelta was called only once for the first sync
    expect(mockClient.getFolderDelta).toHaveBeenCalledTimes(1);

    // Resolve first sync
    resolveFirstSync!({ changes: [], deltaLink: "d2" });
    const sync1Result = await sync1Promise;
    expect(sync1Result.success).toBe(true);
  });

  describe("Sign-in code exchange (exchangeCodeDirect)", () => {
    it("returns oneDriveNoPendingSession error when PKCE session verifier is missing", async () => {
      // No PKCE session stored in sessionStorage
      const res = (await backend.invoke("onedrive_exchange_code", {
        code: "test-auth-code",
      })) as { success: boolean; pending: boolean; error?: { code: string } };

      expect(res.success).toBe(false);
      expect(res.pending).toBe(false);
      expect(res.error).toEqual({ code: "oneDriveNoPendingSession" });
    });

    it("successful code exchange stores auth credentials, sets status to idle, and returns account profile", async () => {
      sessionStorage.setItem(
        "chrononote_pkce_session",
        JSON.stringify({
          verifier: "pkce-test-verifier",
          state: "expected-state",
          redirectUri: "http://localhost/",
          clientId: "client-123",
          tenant: "common",
          timestamp: Date.now(),
        }),
      );

      const fakeTokenResponse = {
        access_token: "exchanged-access-token",
        refresh_token: "exchanged-refresh-token",
        expires_in: 3600,
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => fakeTokenResponse,
        }),
      );

      mockClient.getUserProfile.mockResolvedValue({
        email: "alice@example.com",
        displayName: "Alice",
      });

      const res = (await backend.invoke("onedrive_exchange_code", {
        code: "auth-code-valid",
        state: "expected-state",
      })) as {
        success: boolean;
        pending: boolean;
        account?: { email: string; displayName: string };
      };

      expect(res.success).toBe(true);
      expect(res.pending).toBe(false);
      expect(res.account).toEqual({
        email: "alice@example.com",
        displayName: "Alice",
      });

      // Status becomes idle
      const health = (await backend.invoke("get_sync_health")) as SyncHealth;
      expect(health.status).toBe("idle");

      // Auth is saved in IndexedDB
      const auth = mockStores.meta.get(IDB_META_KEYS.ONEDRIVE_AUTH);
      expect(auth).toMatchObject({
        accessToken: "exchanged-access-token",
        refreshToken: "exchanged-refresh-token",
        account: { email: "alice@example.com", displayName: "Alice" },
      });
    });

    it("returns app error when token endpoint returns an error", async () => {
      sessionStorage.setItem(
        "chrononote_pkce_session",
        JSON.stringify({
          verifier: "pkce-test-verifier",
          state: "expected-state",
          redirectUri: "http://localhost/",
          clientId: "client-123",
          tenant: "common",
          timestamp: Date.now(),
        }),
      );

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ error: "invalid_grant", error_description: "Code expired" }),
        }),
      );

      const res = (await backend.invoke("onedrive_exchange_code", {
        code: "expired-code",
        state: "expected-state",
      })) as { success: boolean; pending: boolean; error?: { code: string; detail?: string } };

      expect(res.success).toBe(false);
      expect(res.pending).toBe(false);
      expect(res.error).toBeDefined();
    });
  });
});

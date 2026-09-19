import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebBackend } from "./webBackend";

describe("WebBackend", () => {
  let backend: WebBackend;
  let mockStores: Record<string, Map<string, any>>;

  beforeEach(() => {
    mockStores = {
      notes: new Map(),
      notes_browser: new Map(),
      notes_cloud: new Map(),
      notes_archive: new Map(),
      conflicts: new Map(),
      meta: new Map(),
    };

    const mockDb = {
      objectStoreNames: {
        contains: (s: string) => s in mockStores,
      },
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

    vi.stubGlobal("indexedDB", {
      open: () => {
        const req: any = {};
        setTimeout(() => {
          req.result = mockDb;
          req.onsuccess?.();
        }, 0);
        return req;
      },
    });

    backend = new WebBackend("0.10.0");
  });

  it("writes and reads notes", async () => {
    await backend.invoke("write_note", {
      filename: "2026-09-19.txt",
      content: "# Today",
    });

    const content = await backend.invoke("read_note", { filename: "2026-09-19.txt" });
    expect(content).toBe("# Today");
  });

  it("records local deletions into tombstones on delete_note when in onedrive", async () => {
    await backend.invoke("onedrive_set_folder", { folderId: "f-1", folderPath: "/Notes" });
    await backend.invoke("write_note", {
      filename: "2026-09-19.txt",
      content: "# Today",
    });

    await backend.invoke("delete_note", { filename: "2026-09-19.txt" });

    const content = await backend.invoke("read_note", { filename: "2026-09-19.txt" });
    expect(content).toBeNull();

    const tombstones = mockStores.meta.get("onedrive_tombstones");
    expect(tombstones).toEqual(["2026-09-19.txt"]);
  });

  it("handles agenda parsing from .agenda.json", async () => {
    expect(await backend.invoke("agenda_file_exists")).toBe(false);

    const agendaData = [
      { date: "2026-09-19", start: "09:00", end: "10:00", title: "Team Standup" },
      { date: "2026-09-19", start: "11:00", end: "12:00", title: "Declined: Skip Me" },
      { date: "2026-09-20", start: "14:00", end: "15:00", title: "Future Project Review" },
    ];

    mockStores.notes_browser.set(".agenda.json", {
      content: JSON.stringify(agendaData),
      contentHash: "hash-agenda",
      modifiedMs: Date.now(),
    });

    expect(await backend.invoke("agenda_file_exists")).toBe(true);

    const todayMeetings = await backend.invoke("read_agenda_for_date", { date: "2026-09-19" });
    expect(todayMeetings).toEqual(["Team Standup"]);

    const futureMeetings = await backend.invoke("read_agenda_after", { afterDate: "2026-09-19" });
    expect(futureMeetings).toEqual([["2026-09-20", "Future Project Review"]]);
  });

  it("isolates Browser storage notes from OneDrive notes", async () => {
    // Write note in browser storage
    await backend.invoke("write_note", {
      filename: "2026-09-01.txt",
      content: "Written in browser storage",
    });

    // Check it exists in browser
    expect(await backend.invoke("read_note", { filename: "2026-09-01.txt" })).toBe("Written in browser storage");

    // Connect to OneDrive folder
    await backend.invoke("onedrive_set_folder", { folderId: "f-cloud", folderPath: "/MyNotes" });

    // Cloud workspace should not see the browser note
    expect(await backend.invoke("read_note", { filename: "2026-09-01.txt" })).toBeNull();

    // Write a note in cloud
    await backend.invoke("write_note", {
      filename: "2026-09-02.txt",
      content: "Written in cloud",
    });
    expect(await backend.invoke("read_note", { filename: "2026-09-02.txt" })).toBe("Written in cloud");

    // Logout from OneDrive / switch back to browser storage
    await backend.invoke("onedrive_logout");
    await backend.invoke("set_notes_dir", { path: "Browser storage" });

    // Browser note should be intact, and cloud note should not be visible in browser storage
    expect(await backend.invoke("read_note", { filename: "2026-09-01.txt" })).toBe("Written in browser storage");
    expect(await backend.invoke("read_note", { filename: "2026-09-02.txt" })).toBeNull();
  });

  it("migrates browser notes to OneDrive with conflict handling and backup", async () => {
    // Set up notes in browser storage
    await backend.invoke("write_note", {
      filename: "2026-09-18.txt",
      content: "# Yesterday in browser",
    });
    await backend.invoke("write_note", {
      filename: "2026-09-19.txt",
      content: "# Today in browser",
    });

    const check = (await backend.invoke("web_check_browser_notes")) as { count: number; filenames: string[] };
    expect(check.count).toBe(2);
    expect(check.filenames).toEqual(["2026-09-18.txt", "2026-09-19.txt"]);

    // Set cloud folder
    await backend.invoke("onedrive_set_folder", { folderId: "f-cloud", folderPath: "/Notes" });

    // Add an existing cloud note with different content for today
    mockStores.notes_cloud.set("2026-09-19.txt", {
      content: "# Today on cloud machine",
      contentHash: "cloud-hash",
      modifiedMs: 1000,
    });

    // Perform migration
    const res = (await backend.invoke("web_migrate_browser_notes")) as { migratedCount: number; conflictCount: number };
    expect(res.migratedCount).toBe(2);
    // Conflict was detected and flagged in cache.conflicts
    expect(res.conflictCount).toBe(1);

    // Browser notes should now be archived and cleared
    expect(mockStores.notes_browser.size).toBe(0);
    expect(mockStores.notes_archive.size).toBe(2);

    // Cloud should now have both notes
    expect(mockStores.notes_cloud.has("2026-09-18.txt")).toBe(true);
    expect(mockStores.notes_cloud.has("2026-09-19.txt")).toBe(true);
    const conflicts = await backend.syncEngine.listConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].name).toBe("2026-09-19.txt");
  });

  describe("migrate, then choose the folder, then first sync (the order the picker uses)", () => {
    function stubClient(remote: Record<string, string>) {
      const uploads: string[] = [];
      const client = {
        getFolderDelta: vi.fn().mockResolvedValue({
          changes: Object.keys(remote).map((name) => ({ id: `id-${name}`, name, etag: `etag-${name}`, isDeleted: false })),
          deltaLink: "delta-1",
        }),
        downloadFileContent: vi.fn(async (_t: string, id: string) => remote[id.replace(/^id-/, "")]),
        uploadFileContent: vi.fn(async (_t: string, _f: string, name: string) => {
          uploads.push(name);
          return { type: "success", id: `id-${name}`, etag: "etag-new" };
        }),
        deleteItem: vi.fn().mockResolvedValue("deleted"),
      };
      (backend.syncEngine as any).client = client;
      return { client, uploads };
    }

    async function connect() {
      mockStores.meta.set("onedrive_auth", {
        accessToken: "tok",
        refreshToken: "ref",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        account: { email: "a@b.c", displayName: "A" },
      });
    }

    it("keeps both versions of a note that exists in the browser and on OneDrive - nothing is overwritten", async () => {
      await connect();
      await backend.invoke("write_note", { filename: "2026-09-19.txt", content: "browser version\n" });
      const { uploads } = stubClient({ "2026-09-19.txt": "OneDrive version\n" });

      await backend.invoke("web_migrate_browser_notes");
      await backend.invoke("onedrive_set_folder", { folderId: "f", folderPath: "/Notes" });
      const res = (await backend.invoke("onedrive_sync_now")) as { success: boolean };
      expect(res.success).toBe(true);

      // The OneDrive copy was never replaced...
      expect(uploads).not.toContain("2026-09-19.txt");
      // ...and the disagreement is held for the user, with both sides intact.
      const conflicts = await backend.syncEngine.listConflicts();
      expect(conflicts).toEqual([{ name: "2026-09-19.txt", local: "browser version\n", remote: "OneDrive version\n" }]);
    });

    it("a blank browser note never displaces the OneDrive version", async () => {
      await connect();
      await backend.invoke("write_note", { filename: "2026-09-19.txt", content: "" });
      await backend.invoke("write_note", { filename: "2026-09-18.txt", content: "only in browser\n" });
      const { uploads } = stubClient({ "2026-09-19.txt": "OneDrive version\n" });

      await backend.invoke("web_migrate_browser_notes");
      await backend.invoke("onedrive_set_folder", { folderId: "f", folderPath: "/Notes" });
      await backend.invoke("onedrive_sync_now");

      expect(await backend.invoke("read_note", { filename: "2026-09-19.txt" })).toBe("OneDrive version\n");
      expect(uploads).toEqual(["2026-09-18.txt"]);
    });

    describe("choosing a different folder", () => {
      async function connectedTo(folderId: string) {
        await connect();
        await backend.invoke("onedrive_set_folder", { folderId, folderPath: `/${folderId}` });
      }

      it("syncs the old folder first, then clears the mirror so its notes don't reach the new folder", async () => {
        const { uploads, client } = stubClient({});
        await connectedTo("A");
        await backend.invoke("write_note", { filename: "2026-09-10.txt", content: "from folder A\n" });

        const prep = (await backend.invoke("web_prepare_folder_switch", { newFolderId: "B" })) as { ready: boolean; switched: boolean };
        expect(prep).toMatchObject({ ready: true, switched: true });
        expect(client.uploadFileContent).toHaveBeenCalledWith("tok", "A", "2026-09-10.txt", "from folder A\n", undefined);
        expect(mockStores.notes_cloud.size).toBe(0);

        uploads.length = 0;
        await backend.invoke("onedrive_set_folder", { folderId: "B", folderPath: "/B" });
        await backend.invoke("onedrive_sync_now");
        expect(uploads).toEqual([]);
      });

      it("blocks the switch and changes nothing when the old folder can't be synced", async () => {
        const { client } = stubClient({});
        await connectedTo("A");
        await backend.invoke("write_note", { filename: "2026-09-10.txt", content: "unsynced\n" });
        client.uploadFileContent.mockRejectedValue(new Error("network down"));

        const prep = (await backend.invoke("web_prepare_folder_switch", { newFolderId: "B" })) as { ready: boolean; message?: string };
        expect(prep.ready).toBe(false);
        expect(prep.message).toMatch(/Nothing was changed/);
        expect(mockStores.notes_cloud.get("2026-09-10.txt").content).toBe("unsynced\n");
      });

      it("blocks the switch while a sync conflict is held", async () => {
        stubClient({ "2026-09-10.txt": "remote\n" });
        await connectedTo("A");
        await backend.invoke("write_note", { filename: "2026-09-10.txt", content: "local\n" });

        const prep = (await backend.invoke("web_prepare_folder_switch", { newFolderId: "B" })) as { ready: boolean; message?: string };
        expect(prep.ready).toBe(false);
        expect(prep.message).toMatch(/conflict/);
        expect(mockStores.notes_cloud.has("2026-09-10.txt")).toBe(true);
      });

      it("after a sign-out, archives what can't be synced instead of uploading or dropping it", async () => {
        const { client } = stubClient({});
        await connectedTo("A");
        await backend.invoke("write_note", { filename: "2026-09-10.txt", content: "left behind\n" });
        await backend.invoke("onedrive_logout", {}); // keeps the mirror, remembers folder A
        await connect();
        client.uploadFileContent.mockRejectedValue(new Error("not this account's folder"));

        const prep = (await backend.invoke("web_prepare_folder_switch", { newFolderId: "B" })) as { ready: boolean; archivedCount: number };
        expect(prep).toMatchObject({ ready: true, archivedCount: 1 });
        expect(mockStores.notes_cloud.size).toBe(0);
        const archived = [...mockStores.notes_archive.entries()];
        expect(archived).toHaveLength(1);
        expect(archived[0][0]).toMatch(/^cloud-\d+\/2026-09-10\.txt$/);
        expect(archived[0][1].content).toBe("left behind\n");
        expect(mockStores.meta.has("onedrive_folder")).toBe(false); // the temporary folder is gone again
      });

      it("leaves everything alone for the same folder or a first connection", async () => {
        stubClient({});
        await connectedTo("A");
        await backend.invoke("write_note", { filename: "2026-09-10.txt", content: "keep\n" });
        expect(await backend.invoke("web_prepare_folder_switch", { newFolderId: "A" })).toMatchObject({ switched: false });
        expect(mockStores.notes_cloud.size).toBe(1);

        await backend.invoke("onedrive_logout", { removeLocalData: true });
        await backend.invoke("write_note", { filename: "2026-09-11.txt", content: "browser\n" });
        expect(await backend.invoke("web_prepare_folder_switch", { newFolderId: "B" })).toMatchObject({ switched: false });
      });
    });
  });
});

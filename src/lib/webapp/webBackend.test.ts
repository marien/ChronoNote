import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebBackend } from "./webBackend";

describe("WebBackend", () => {
  let backend: WebBackend;
  let mockStores: Record<string, Map<string, any>>;

  beforeEach(() => {
    mockStores = {
      notes: new Map(),
      conflicts: new Map(),
      meta: new Map(),
    };

    const mockDb = {
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

  it("records local deletions into tombstones on delete_note", async () => {
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

    mockStores.notes.set(".agenda.json", {
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
});

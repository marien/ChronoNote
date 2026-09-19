import { describe, it, expect, vi, beforeEach } from "vitest";
import { OneDriveClient } from "./oneDriveClient";

describe("OneDriveClient", () => {
  let client: OneDriveClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new OneDriveClient();
  });

  it("getUserProfile fetches and formats profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        displayName: "John Doe",
        mail: "john@example.com",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await client.getUserProfile("test-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName",
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect(profile).toEqual({
      displayName: "John Doe",
      email: "john@example.com",
    });
  });

  it("listFolders queries root or parent item", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          { id: "f1", name: "Folder 1" },
          { id: "f2", name: "Folder 2" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rootFolders = await client.listFolders("test-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/drive/root/children?$filter=folder%20ne%20null&$select=id,name,folder",
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect(rootFolders).toEqual([
      { id: "f1", name: "Folder 1" },
      { id: "f2", name: "Folder 2" },
    ]);

    const childFolders = await client.listFolders("test-token", "parent-123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/drive/items/parent-123/children?$filter=folder%20ne%20null&$select=id,name,folder",
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect(childFolders).toHaveLength(2);
  });

  it("createFolder posts folder creation payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "created-folder-id",
        name: "New Folder",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await client.createFolder("test-token", null, "New Folder");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/drive/root/children",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "New Folder",
          folder: {},
          "@microsoft.graph.conflictBehavior": "rename",
        }),
      },
    );
    expect(res).toEqual({ id: "created-folder-id", name: "New Folder" });
  });

  it("getFolderDelta paginates and returns items with deltaLink", async () => {
    const page1 = {
      value: [
        { id: "item-1", name: "note1.md", file: {}, eTag: "tag-1" },
        { id: "item-deleted", deleted: {} },
      ],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/next-page",
    };
    const page2 = {
      value: [
        { id: "item-2", name: "note2.md", file: {}, eTag: "tag-2" },
      ],
      "@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta-token-final",
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => page1,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => page2,
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.getFolderDelta("test-token", "folder-123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.changes).toEqual([
      { id: "item-1", name: "note1.md", etag: "tag-1", isDeleted: false },
      { id: "item-deleted", name: undefined, etag: undefined, isDeleted: true },
      { id: "item-2", name: "note2.md", etag: "tag-2", isDeleted: false },
    ]);
    expect(result.deltaLink).toBe("https://graph.microsoft.com/v1.0/delta-token-final");
  });

  it("downloadFileContent gets text content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "# Hello from OneDrive",
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = await client.downloadFileContent("test-token", "file-123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/drive/items/file-123/content",
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect(content).toBe("# Hello from OneDrive");
  });

  it("deleteItem handles 204, 404, and 412 status codes", async () => {
    // 204 deleted
    let fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });
    vi.stubGlobal("fetch", fetchMock);
    let res = await client.deleteItem("test-token", "file-1", "etag-1");
    expect(res).toBe("deleted");

    // 404 already gone
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal("fetch", fetchMock);
    res = await client.deleteItem("test-token", "file-1");
    expect(res).toBe("deleted");

    // 412 precondition failed (changed on server)
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 412,
    });
    vi.stubGlobal("fetch", fetchMock);
    res = await client.deleteItem("test-token", "file-1", "etag-1");
    expect(res).toBe("changed");
  });

  it("uploadFileContent handles success and conflict", async () => {
    // Success
    let fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "uploaded-file-id",
        eTag: "new-etag-999",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    let res = await client.uploadFileContent(
      "test-token",
      "folder-123",
      "2026-09-19.md",
      "note text",
      "prev-etag",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/drive/items/folder-123:/2026-09-19.md:/content",
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "text/plain; charset=utf-8",
          "If-Match": "prev-etag",
        },
        body: "note text",
      },
    );
    expect(res).toEqual({
      type: "success",
      id: "uploaded-file-id",
      etag: "new-etag-999",
    });

    // Conflict (412)
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 412,
    });
    vi.stubGlobal("fetch", fetchMock);

    res = await client.uploadFileContent(
      "test-token",
      "folder-123",
      "2026-09-19.md",
      "note text",
      "stale-etag",
    );
    expect(res).toEqual({ type: "conflict" });
  });
});

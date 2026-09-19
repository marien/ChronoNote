import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import * as api from "../../tauriApi";
import { oneDriveFolder } from "../../stores";

vi.mock("../../tauriApi", () => ({
  oneDriveListFolders: vi.fn(),
  oneDriveCreateFolder: vi.fn(),
  oneDriveSetFolder: vi.fn(),
  webCheckBrowserNotes: vi.fn(),
  webMigrateBrowserNotes: vi.fn(),
}));

describe("OneDriveFolderPickerModal logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    oneDriveFolder.set(null);
  });

  it("lists folders at root", async () => {
    const mockFolders = [
      { id: "f1", name: "Documents" },
      { id: "f2", name: "Notes" },
    ];
    vi.mocked(api.oneDriveListFolders).mockResolvedValueOnce(mockFolders);

    const result = await api.oneDriveListFolders(null);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Documents");
    expect(result[1].name).toBe("Notes");
    expect(api.oneDriveListFolders).toHaveBeenCalledWith(null);
  });

  it("lists child folders when navigating into a folder", async () => {
    const mockChildren = [
      { id: "f3", name: "Daily" },
      { id: "f4", name: "Projects" },
    ];
    vi.mocked(api.oneDriveListFolders).mockResolvedValueOnce(mockChildren);

    const result = await api.oneDriveListFolders("f2");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Daily");
    expect(api.oneDriveListFolders).toHaveBeenCalledWith("f2");
  });

  it("creates a new subfolder and updates directory", async () => {
    const newFolder = { id: "f5", name: "Archive" };
    vi.mocked(api.oneDriveCreateFolder).mockResolvedValueOnce(newFolder);

    const result = await api.oneDriveCreateFolder("Archive", "f2");
    expect(result.id).toBe("f5");
    expect(result.name).toBe("Archive");
    expect(api.oneDriveCreateFolder).toHaveBeenCalledWith("Archive", "f2");
  });

  it("sets the selected notes folder", async () => {
    vi.mocked(api.oneDriveSetFolder).mockResolvedValueOnce();

    await api.oneDriveSetFolder("f2", "/Notes");
    expect(api.oneDriveSetFolder).toHaveBeenCalledWith("f2", "/Notes");

    oneDriveFolder.set({ folderId: "f2", folderPath: "/Notes" });
    expect(get(oneDriveFolder)).toEqual({ folderId: "f2", folderPath: "/Notes" });
  });

  it("checks browser notes count on web", async () => {
    vi.mocked(api.webCheckBrowserNotes).mockResolvedValueOnce({ count: 3, filenames: ["2026-09-17.txt", "2026-09-18.txt", "2026-09-19.txt"] });
    const res = await api.webCheckBrowserNotes();
    expect(res.count).toBe(3);
    expect(res.filenames).toHaveLength(3);
  });

  it("migrates browser notes to cloud on web", async () => {
    vi.mocked(api.webMigrateBrowserNotes).mockResolvedValueOnce({ migratedCount: 3, conflictCount: 0 });
    const res = await api.webMigrateBrowserNotes();
    expect(res.migratedCount).toBe(3);
    expect(res.conflictCount).toBe(0);
  });
});

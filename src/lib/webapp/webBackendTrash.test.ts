import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { WebBackend } from "./webBackend";
import { installIdbStub } from "../testing/idbStub";
import type { TrashItem } from "../generated/tauri-types";

describe("WebBackend - Recently deleted notes (trash)", () => {
  let backend: WebBackend;
  let mockStores: Record<string, Map<string, any>>;

  beforeEach(() => {
    mockStores = installIdbStub();
    backend = new WebBackend("0.30.0");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deleting a note that has content keeps it in the trash for 30 days and removes the note", async () => {
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "# Meeting notes\nFirst line of content",
    });

    await backend.invoke("delete_note", { filename: "2026-10-20.txt" });

    // Note is gone from active storage
    const content = await backend.invoke("read_note", { filename: "2026-10-20.txt" });
    expect(content).toBeNull();

    // Note is present in trash
    const trash = (await backend.invoke("list_trash")) as TrashItem[];
    expect(trash).toHaveLength(1);
    expect(trash[0].originalFilename).toBe("2026-10-20.txt");
    expect(trash[0].preview).toBe("# Meeting notes");
    expect(trash[0].name).toMatch(/^\d{8}-\d{6}_2026-10-20\.txt$/);
    expect(trash[0].deletedMs).toBeGreaterThan(0);
  });

  it("restoring a note from trash brings back the note with its text and removes it from trash", async () => {
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Important content to restore",
    });

    await backend.invoke("delete_note", { filename: "2026-10-20.txt" });

    const trash = (await backend.invoke("list_trash")) as TrashItem[];
    expect(trash).toHaveLength(1);

    const restoredName = await backend.invoke("restore_from_trash", { name: trash[0].name });
    expect(restoredName).toBe("2026-10-20.txt");

    // Note is back in active storage
    const content = await backend.invoke("read_note", { filename: "2026-10-20.txt" });
    expect(content).toBe("Important content to restore");

    // Trash is now empty
    const remainingTrash = (await backend.invoke("list_trash")) as TrashItem[];
    expect(remainingTrash).toHaveLength(0);
  });

  it("refuses to restore from trash while that day's note already has content", async () => {
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Original text in trash",
    });

    await backend.invoke("delete_note", { filename: "2026-10-20.txt" });
    const trash = (await backend.invoke("list_trash")) as TrashItem[];

    // Re-create note with new content
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "New different text",
    });

    // Restore should fail with "note-exists"
    await expect(
      backend.invoke("restore_from_trash", { name: trash[0].name }),
    ).rejects.toThrow("note-exists");

    // Current note text is untouched
    const current = await backend.invoke("read_note", { filename: "2026-10-20.txt" });
    expect(current).toBe("New different text");

    // Item remains in trash
    const trashAfter = (await backend.invoke("list_trash")) as TrashItem[];
    expect(trashAfter).toHaveLength(1);
  });

  it("allows restoring from trash when an empty note exists for that day", async () => {
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Original text to restore",
    });

    await backend.invoke("delete_note", { filename: "2026-10-20.txt" });
    const trash = (await backend.invoke("list_trash")) as TrashItem[];

    // Write empty note
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "",
    });

    // Should succeed because current content is empty
    const restored = await backend.invoke("restore_from_trash", { name: trash[0].name });
    expect(restored).toBe("2026-10-20.txt");

    const content = await backend.invoke("read_note", { filename: "2026-10-20.txt" });
    expect(content).toBe("Original text to restore");
  });

  it("deleting an emptied note that has earlier versions puts its newest version's text in the trash", async () => {
    // Write version 1
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Text in version 1",
    });

    // Empty the note (writes "" over version 1, keeping version 1 in earlier versions)
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "",
    });

    // Now delete the emptied note
    await backend.invoke("delete_note", { filename: "2026-10-20.txt" });

    // The trash should contain the newest version's text ("Text in version 1")
    const trash = (await backend.invoke("list_trash")) as TrashItem[];
    expect(trash).toHaveLength(1);
    expect(trash[0].originalFilename).toBe("2026-10-20.txt");
    expect(trash[0].preview).toBe("Text in version 1");

    // Restoring brings back that version's text
    await backend.invoke("restore_from_trash", { name: trash[0].name });
    const restored = await backend.invoke("read_note", { filename: "2026-10-20.txt" });
    expect(restored).toBe("Text in version 1");
  });

  it("deleting an empty note without versions leaves nothing in the trash", async () => {
    // Note created empty with no prior versions
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "",
    });

    await backend.invoke("delete_note", { filename: "2026-10-20.txt" });

    const trash = (await backend.invoke("list_trash")) as TrashItem[];
    expect(trash).toEqual([]);
  });

  it("clean-up removes trash items older than 30 days and keeps newer ones", async () => {
    const now = new Date("2026-10-20T12:00:00Z").getTime();
    const day35Ago = now - 35 * 24 * 60 * 60 * 1000;
    const day5Ago = now - 5 * 24 * 60 * 60 * 1000;

    mockStores.meta.set("trash", [
      { filename: "2026-09-15.txt", content: "Old trash content", deletedMs: day35Ago },
      { filename: "2026-10-15.txt", content: "Recent trash content", deletedMs: day5Ago },
    ]);

    await backend.cleanUpVersionsAndTrash(now);

    const trash = (await backend.invoke("list_trash")) as TrashItem[];
    expect(trash).toHaveLength(1);
    expect(trash[0].originalFilename).toBe("2026-10-15.txt");
    expect(trash[0].preview).toBe("Recent trash content");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebBackend } from "./webBackend";
import { installIdbStub } from "../testing/idbStub";
import type { ImportResult, NoteVersion } from "../generated/tauri-types";

describe("WebBackend - Import of a notes bundle", () => {
  let backend: WebBackend;
  let mockStores: Record<string, Map<string, any>>;

  beforeEach(() => {
    mockStores = installIdbStub();
    backend = new WebBackend("0.30.0");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("merge mode", () => {
    it("adds a note that does not exist and increments imported count", async () => {
      const res = (await backend.invoke("import_notes_bundle", {
        notes: { "2026-10-01.txt": "New imported note" },
        mode: "merge",
      })) as ImportResult;

      expect(res).toEqual({ imported: 1, skipped: 0 });
      const content = await backend.invoke("read_note", { filename: "2026-10-01.txt" });
      expect(content).toBe("New imported note");
    });

    it("skips an existing note with identical content and increments skipped count", async () => {
      await backend.invoke("write_note", {
        filename: "2026-10-01.txt",
        content: "Exact same content",
      });

      const res = (await backend.invoke("import_notes_bundle", {
        notes: { "2026-10-01.txt": "Exact same content" },
        mode: "merge",
      })) as ImportResult;

      expect(res).toEqual({ imported: 0, skipped: 1 });
      const content = await backend.invoke("read_note", { filename: "2026-10-01.txt" });
      expect(content).toBe("Exact same content");
    });

    it("skips an existing note with different content without overwriting it", async () => {
      await backend.invoke("write_note", {
        filename: "2026-10-01.txt",
        content: "Local existing content",
      });

      const res = (await backend.invoke("import_notes_bundle", {
        notes: { "2026-10-01.txt": "Different bundle content" },
        mode: "merge",
      })) as ImportResult;

      expect(res).toEqual({ imported: 0, skipped: 1 });
      const content = await backend.invoke("read_note", { filename: "2026-10-01.txt" });
      expect(content).toBe("Local existing content");
    });

    it("skips invalid note filenames rather than erroring", async () => {
      const res = (await backend.invoke("import_notes_bundle", {
        notes: {
          "invalid-name.txt": "Should be skipped",
          "2026-10-02.md": "Wrong extension",
          "2026-10-03.txt": "Valid filename",
        },
        mode: "merge",
      })) as ImportResult;

      expect(res).toEqual({ imported: 1, skipped: 2 });
      expect(await backend.invoke("read_note", { filename: "2026-10-03.txt" })).toBe("Valid filename");
    });
  });

  describe("replace mode", () => {
    it("writes imported notes and replaces existing notes with new text", async () => {
      await backend.invoke("write_note", {
        filename: "2026-10-01.txt",
        content: "Old text before replace",
      });

      const res = (await backend.invoke("import_notes_bundle", {
        notes: { "2026-10-01.txt": "New text after replace" },
        mode: "replace",
      })) as ImportResult;

      expect(res).toEqual({ imported: 1, skipped: 0 });
      const content = await backend.invoke("read_note", { filename: "2026-10-01.txt" });
      expect(content).toBe("New text after replace");
    });

    it("keeps previous text of a replaced note as an earlier version", async () => {
      await backend.invoke("write_note", {
        filename: "2026-10-01.txt",
        content: "Pre-replace text",
      });

      await backend.invoke("import_notes_bundle", {
        notes: { "2026-10-01.txt": "Post-replace text" },
        mode: "replace",
      });

      const versions = (await backend.invoke("list_versions", {
        filename: "2026-10-01.txt",
      })) as NoteVersion[];

      expect(versions).toHaveLength(1);
      const versionText = await backend.invoke("read_version", {
        filename: "2026-10-01.txt",
        name: versions[0].name,
      });
      expect(versionText).toBe("Pre-replace text");
    });

    it("removes old notes not in the bundle and keeps their previous text as earlier versions", async () => {
      await backend.invoke("write_note", {
        filename: "2026-10-01.txt",
        content: "Note to be updated",
      });
      await backend.invoke("write_note", {
        filename: "2026-10-02.txt",
        content: "Note to be removed",
      });

      const res = (await backend.invoke("import_notes_bundle", {
        notes: { "2026-10-01.txt": "Updated note 1" },
        mode: "replace",
      })) as ImportResult;

      expect(res).toEqual({ imported: 1, skipped: 0 });

      // Note 1 is updated
      expect(await backend.invoke("read_note", { filename: "2026-10-01.txt" })).toBe("Updated note 1");

      // Note 2 is removed from note files
      expect(await backend.invoke("read_note", { filename: "2026-10-02.txt" })).toBeNull();
      const files = (await backend.invoke("list_note_files")) as string[];
      expect(files).toEqual(["2026-10-01.txt"]);

      // But Note 2's text was preserved in earlier versions
      const v2 = (await backend.invoke("list_versions", {
        filename: "2026-10-02.txt",
      })) as NoteVersion[];
      expect(v2).toHaveLength(1);
      const versionContent = await backend.invoke("read_version", {
        filename: "2026-10-02.txt",
        name: v2[0].name,
      });
      expect(versionContent).toBe("Note to be removed");
    });

    it("skips invalid filenames in replace mode and counts them as skipped", async () => {
      const res = (await backend.invoke("import_notes_bundle", {
        notes: {
          "invalid.txt": "Bad filename",
          "2026-10-05.txt": "Valid filename",
        },
        mode: "replace",
      })) as ImportResult;

      expect(res).toEqual({ imported: 1, skipped: 1 });
      expect(await backend.invoke("read_note", { filename: "2026-10-05.txt" })).toBe("Valid filename");
    });
  });
});

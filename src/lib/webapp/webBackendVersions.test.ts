import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { WebBackend } from "./webBackend";
import { installIdbStub } from "../testing/idbStub";
import type { NoteVersion } from "../generated/tauri-types";

describe("WebBackend - Earlier versions of a note", () => {
  let backend: WebBackend;
  let mockStores: Record<string, Map<string, any>>;

  beforeEach(() => {
    mockStores = installIdbStub();
    backend = new WebBackend("0.30.0");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps previous text as a version when a note is emptied", async () => {
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Original populated content",
    });

    const meta = (await backend.invoke("get_file_metadata", { filename: "2026-10-20.txt" })) as {
      contentHash: string;
    };

    // Empties the note
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "",
      expectedHash: meta.contentHash,
    });

    const versions = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];

    expect(versions).toHaveLength(1);
    const versionContent = await backend.invoke("read_version", {
      filename: "2026-10-20.txt",
      name: versions[0].name,
    });
    expect(versionContent).toBe("Original populated content");
  });

  it("keeps previous text as a version when saved without an expected hash", async () => {
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Version 1 content",
    });

    // Save with expectedHash omitted (null / undefined)
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Version 2 content",
    });

    const versions = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];

    expect(versions).toHaveLength(1);
    const content = await backend.invoke("read_version", {
      filename: "2026-10-20.txt",
      name: versions[0].name,
    });
    expect(content).toBe("Version 1 content");
  });

  it("keeps previous text as a version on edit when the newest version is more than 5 minutes old", async () => {
    const startTime = new Date("2026-10-20T10:00:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(startTime);

    // Initial note write
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "First draft",
    });

    // Second write at T=0 creates version for "First draft" because versions list was empty
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Second draft",
    });

    let versions = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];
    expect(versions).toHaveLength(1);

    // Advance 6 minutes (> 5 minutes threshold)
    vi.spyOn(Date, "now").mockReturnValue(startTime + 6 * 60 * 1000);
    const meta = (await backend.invoke("get_file_metadata", { filename: "2026-10-20.txt" })) as {
      contentHash: string;
    };

    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Third draft",
      expectedHash: meta.contentHash,
    });

    versions = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];
    expect(versions).toHaveLength(2);

    const newestVersionContent = await backend.invoke("read_version", {
      filename: "2026-10-20.txt",
      name: versions[0].name,
    });
    expect(newestVersionContent).toBe("Second draft");
  });

  it("does not keep a new version on edit when newest version is 5 minutes old or less", async () => {
    const startTime = new Date("2026-10-20T10:00:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(startTime);

    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "First draft",
    });

    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Second draft",
    });

    // Advance only 2 minutes (<= 5 minutes)
    vi.spyOn(Date, "now").mockReturnValue(startTime + 2 * 60 * 1000);
    const meta = (await backend.invoke("get_file_metadata", { filename: "2026-10-20.txt" })) as {
      contentHash: string;
    };

    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Third draft",
      expectedHash: meta.contentHash,
    });

    const versions = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];
    // Still only 1 version (from the first save)
    expect(versions).toHaveLength(1);
  });

  it("keeps previous text as a version when keepVersion is true even if newest version is within 5 minutes cooldown", async () => {
    const startTime = new Date("2026-10-20T10:00:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(startTime);

    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "First draft",
    });

    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Second draft",
    });

    // Advance only 2 minutes (<= 5 minutes)
    vi.spyOn(Date, "now").mockReturnValue(startTime + 2 * 60 * 1000);
    const meta = (await backend.invoke("get_file_metadata", { filename: "2026-10-20.txt" })) as {
      contentHash: string;
    };

    // Refused write when hash does not match keeps nothing
    await expect(
      backend.invoke("write_note", {
        filename: "2026-10-20.txt",
        content: "Refused third draft",
        expectedHash: "stale_hash",
        keepVersion: true,
      }),
    ).rejects.toThrow("conflict: note changed on disk");

    let versions = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];
    expect(versions).toHaveLength(1);

    // Accepted write with keepVersion: true overrides 5-minute cooldown
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Third draft",
      expectedHash: meta.contentHash,
      keepVersion: true,
    });

    versions = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];
    expect(versions).toHaveLength(2);

    const newestVersionContent = await backend.invoke("read_version", {
      filename: "2026-10-20.txt",
      name: versions[0].name,
    });
    expect(newestVersionContent).toBe("Second draft");
  });

  it("does not keep identical text twice in version history", async () => {
    await backend.keepVersion("2026-10-20.txt", "Same exact text\n");
    await backend.keepVersion("2026-10-20.txt", "Same exact text\n");

    const versions = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];
    expect(versions).toHaveLength(1);
  });

  it("lists versions sorted newest first with name, timestamp, and size", async () => {
    const t1 = new Date("2026-10-20T10:00:00").getTime();
    const t2 = new Date("2026-10-20T11:00:00").getTime();

    await backend.keepVersion("2026-10-20.txt", "Short", t1);
    await backend.keepVersion("2026-10-20.txt", "Longer text here", t2);

    const versions = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];

    expect(versions).toHaveLength(2);
    expect(versions[0].savedMs).toBe(t2);
    expect(versions[1].savedMs).toBe(t1);
    expect(versions[0].sizeBytes).toBeGreaterThan(versions[1].sizeBytes);
    expect(versions[0].name).toMatch(/^\d{8}-\d{6}$/);
  });

  it("reads the content of a specific version by name", async () => {
    const t1 = new Date("2026-10-20T10:00:00").getTime();
    await backend.keepVersion("2026-10-20.txt", "Specific version content", t1);

    const versions = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];
    const content = await backend.invoke("read_version", {
      filename: "2026-10-20.txt",
      name: versions[0].name,
    });
    expect(content).toBe("Specific version content");

    // Also accepts .txt suffix
    const contentWithSuffix = await backend.invoke("read_version", {
      filename: "2026-10-20.txt",
      name: `${versions[0].name}.txt`,
    });
    expect(contentWithSuffix).toBe("Specific version content");

    // Non-existent version throws
    await expect(
      backend.invoke("read_version", {
        filename: "2026-10-20.txt",
        name: "99999999-999999",
      }),
    ).rejects.toThrow(/Version not found/);
  });

  it("restoring a version keeps current text as a version first, then restores the old text", async () => {
    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "First version text",
    });

    await backend.invoke("write_note", {
      filename: "2026-10-20.txt",
      content: "Second version text",
    });

    const versionsBefore = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];
    expect(versionsBefore).toHaveLength(1);
    const targetVersion = versionsBefore[0];

    // Restore "First version text"
    await backend.invoke("restore_version", {
      filename: "2026-10-20.txt",
      name: targetVersion.name,
    });

    // Current content is now restored
    const currentContent = await backend.invoke("read_note", {
      filename: "2026-10-20.txt",
    });
    expect(currentContent).toBe("First version text");

    // Version history now includes "Second version text" as a version
    const versionsAfter = (await backend.invoke("list_versions", {
      filename: "2026-10-20.txt",
    })) as NoteVersion[];
    expect(versionsAfter).toHaveLength(2);
    const newestVersionContent = await backend.invoke("read_version", {
      filename: "2026-10-20.txt",
      name: versionsAfter[0].name,
    });
    expect(newestVersionContent).toBe("Second version text");
  });

  describe("Clean-up of versions", () => {
    it("keeps all versions saved today", async () => {
      const today = new Date("2026-10-20T16:00:00");
      const t1 = new Date("2026-10-20T09:00:00").getTime();
      const t2 = new Date("2026-10-20T12:00:00").getTime();
      const t3 = new Date("2026-10-20T15:00:00").getTime();

      await backend.keepVersion("2026-10-20.txt", "Today morning", t1);
      await backend.keepVersion("2026-10-20.txt", "Today noon", t2);
      await backend.keepVersion("2026-10-20.txt", "Today afternoon", t3);

      await backend.cleanUpVersionsAndTrash(today.getTime());

      const versions = (await backend.invoke("list_versions", {
        filename: "2026-10-20.txt",
      })) as NoteVersion[];
      expect(versions).toHaveLength(3);
    });

    it("collapses earlier days to the newest version per day", async () => {
      const today = new Date("2026-10-20T16:00:00");
      // Day -1 (yesterday)
      const y1 = new Date("2026-10-19T09:00:00").getTime();
      const y2 = new Date("2026-10-19T17:00:00").getTime();
      // Day -2 (two days ago)
      const d1 = new Date("2026-10-18T08:00:00").getTime();
      const d2 = new Date("2026-10-18T14:00:00").getTime();

      await backend.keepVersion("2026-10-20.txt", "Yesterday morning", y1);
      await backend.keepVersion("2026-10-20.txt", "Yesterday evening", y2);
      await backend.keepVersion("2026-10-20.txt", "Day-2 morning", d1);
      await backend.keepVersion("2026-10-20.txt", "Day-2 afternoon", d2);

      await backend.cleanUpVersionsAndTrash(today.getTime());

      const versions = (await backend.invoke("list_versions", {
        filename: "2026-10-20.txt",
      })) as NoteVersion[];

      expect(versions).toHaveLength(2);
      expect(versions[0].savedMs).toBe(y2); // newest of yesterday
      expect(versions[1].savedMs).toBe(d2); // newest of day -2
    });

    it("drops versions older than 30 days", async () => {
      const today = new Date("2026-10-20T16:00:00").getTime();
      const day35Ago = today - 35 * 24 * 60 * 60 * 1000;
      const day5Ago = today - 5 * 24 * 60 * 60 * 1000;

      await backend.keepVersion("2026-10-20.txt", "Very old version", day35Ago);
      await backend.keepVersion("2026-10-20.txt", "Recent version", day5Ago);

      await backend.cleanUpVersionsAndTrash(today);

      const versions = (await backend.invoke("list_versions", {
        filename: "2026-10-20.txt",
      })) as NoteVersion[];

      expect(versions).toHaveLength(1);
      expect(versions[0].savedMs).toBe(day5Ago);
    });

    it("removes version metadata entry when all versions for a note are pruned", async () => {
      const today = new Date("2026-10-20T16:00:00").getTime();
      const day35Ago = today - 35 * 24 * 60 * 60 * 1000;

      await backend.keepVersion("2026-10-20.txt", "Only very old version", day35Ago);
      expect(mockStores.meta.has("versions:2026-10-20.txt")).toBe(true);

      await backend.cleanUpVersionsAndTrash(today);

      expect(mockStores.meta.has("versions:2026-10-20.txt")).toBe(false);
      const versions = (await backend.invoke("list_versions", {
        filename: "2026-10-20.txt",
      })) as NoteVersion[];
      expect(versions).toEqual([]);
    });
  });

  // §413: was a suspected bug (skipped) until Keep mine kept the OneDrive text.
  describe("a OneDrive conflict resolved with Keep mine", () => {
    it("keeps previous text as a version when a conflict is resolved with Keep mine", async () => {
      // Spec §6.6: "Before an overwrite (when the note is emptied, saved without an expected hash,
      // on an import with Replace, or on a conflict resolved with 'Keep mine'), or when editing if
      // the newest version is more than 5 minutes old, the note's previous text is saved to a
      // hidden .chrononote-versions/<filename>/<timestamp>.txt subfolder."
      //
      // In WebOneDriveSyncEngine.resolveConflict("mine"), cache.files is rebased and cache.conflicts
      // is cleared, but keepVersion is never called, so no version is kept in version history.
      await backend.invoke("onedrive_set_folder", { folderId: "f-1", folderPath: "/Notes" });
      await backend.invoke("write_note", {
        filename: "2026-10-20.txt",
        content: "Local conflicting text",
      });

      mockStores.meta.set("onedrive_cache", {
        files: { "2026-10-20.txt": { id: "rem-1", etag: "tag-1", localHash: "hash-1" } },
        conflicts: {
          "2026-10-20.txt": { remoteContent: "Remote conflicting text", remoteId: "rem-1", remoteEtag: "tag-2" },
        },
      });

      await backend.invoke("onedrive_resolve_conflict", {
        name: "2026-10-20.txt",
        resolution: "mine",
      });

      const versions = (await backend.invoke("list_versions", {
        filename: "2026-10-20.txt",
      })) as NoteVersion[];

      // According to spec §6.6, resolving with "Keep mine" keeps previous text as a version: here the OneDrive text
      // that "mine" overwrites on the next push.
      expect(versions.length).toBeGreaterThan(0);
      const newest = await backend.invoke("read_version", { filename: "2026-10-20.txt", name: versions[0].name });
      expect(newest).toBe("Remote conflicting text");
    });
  });
});

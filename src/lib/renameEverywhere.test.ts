// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { MockBackend } from "./testing/mockBackend";
import type { FileMetadata, NoteTab, NoteWithMetadata } from "./types";
import type { NoteVersion } from "./generated/tauri-types";
import type { EditorApi } from "./stores";

let backend: MockBackend;

const { apiMock } = vi.hoisted(() => {
  return {
    apiMock: {
      getFileMetadata: vi.fn((filename: string) =>
        backend.invoke("get_file_metadata", { filename }) as Promise<FileMetadata>,
      ),
      readNoteWithMetadata: vi.fn((filename: string) =>
        backend.invoke("read_note_with_metadata", { filename }) as Promise<NoteWithMetadata>,
      ),
      writeNote: vi.fn(
        (filename: string, content: string, expectedHash?: string | null, options?: { keepVersion?: boolean }) =>
          backend.invoke("write_note", {
            filename,
            content,
            expectedHash: expectedHash ?? null,
            ...(options?.keepVersion !== undefined ? { keepVersion: options.keepVersion } : {}),
          }) as Promise<FileMetadata>,
      ),
      readNote: vi.fn((filename: string) => backend.invoke("read_note", { filename }) as Promise<string | null>),
      listNoteFiles: vi.fn(() => backend.invoke("list_note_files", {}) as Promise<string[]>),
      readAllNotes: vi.fn(() => backend.invoke("read_all_notes", {}) as Promise<[string, string][]>),
      listVersions: vi.fn((filename: string) =>
        backend.invoke("list_versions", { filename }) as Promise<NoteVersion[]>,
      ),
      readVersion: vi.fn((filename: string, name: string) =>
        backend.invoke("read_version", { filename, name }) as Promise<string>,
      ),
      saveScratchpadDrafts: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("./tauriApi", () => apiMock);

import {
  applyRename,
  diffLineEdits,
  planRename,
  renameInText,
  renameTargetAt,
  renameTargetsForCursor,
  undoRename,
  validTarget,
} from "./renameEverywhere";
import { applyLineEdits } from "./editor/commands";
import { clearDiskLayer } from "./notesIndex/diskLayer";
import { ensureLoaded } from "./notesIndex";
import { sha256Hex } from "./hash";
import {
  activeTabId,
  clearAllTabCleanHashes,
  markTabClean,
  registerEditorApi,
  tabs,
  toastAction,
  toastMessage,
} from "./stores";
import { createTestEditor } from "./testing/testEditor";
import { updateActiveTabContent } from "./persistence";

describe("renameInText (step 1 table)", () => {
  it("renames a title with time prefix and resizes an exact underline", () => {
    const before = "[10:00 - 10:30] Coffee rota\n===========================\n";
    const res = renameInText(before, { kind: "title", from: "Coffee rota", to: "Hospitality rota" }, { titles: true });
    expect(res.text).toBe("[10:00 - 10:30] Hospitality rota\n================================\n");
    expect(res.lines).toEqual([
      {
        lineIdx: 0,
        before: "[10:00 - 10:30] Coffee rota",
        after: "[10:00 - 10:30] Hospitality rota",
      },
      {
        lineIdx: 1,
        before: "===========================",
        after: "================================",
      },
    ]);
  });

  it("renames a title with trailing date and keeps a non-exact underline", () => {
    const before = "Coffee rota - 2026-10-30\n===\n";
    const res = renameInText(before, { kind: "title", from: "Coffee rota", to: "Hospitality rota" }, { titles: true });
    expect(res.text).toBe("Hospitality rota - 2026-10-30\n===\n");
    expect(res.lines).toHaveLength(1);
  });

  it("renames a canceled title case-insensitively and keeps non-exact underline", () => {
    const before = "[CANCELED] coffee ROTA\n=====\n";
    const res = renameInText(before, { kind: "title", from: "Coffee rota", to: "Hospitality rota" }, { titles: true });
    expect(res.text).toBe("[CANCELED] Hospitality rota\n=====\n");
    expect(res.lines).toHaveLength(1);
  });

  it("leaves a different title unchanged", () => {
    const before = "Coffee rota planning\n===\n";
    const res = renameInText(before, { kind: "title", from: "Coffee rota", to: "Hospitality rota" }, { titles: true });
    expect(res.text).toBe(before);
    expect(res.lines).toEqual([]);
  });

  it("leaves titles alone when opts.titles is false", () => {
    const before = "[10:00 - 10:30] Coffee rota\n===========================\n";
    const res = renameInText(before, { kind: "title", from: "Coffee rota", to: "Hospitality rota" }, { titles: false });
    expect(res.text).toBe(before);
    expect(res.lines).toEqual([]);
  });

  it("renames every matching @name token on a line case-insensitively", () => {
    const before = "# ask @dana => @Dana x (@Ben, @DANA)";
    const res = renameInText(before, { kind: "name", from: "Dana", to: "Dana-S" }, { titles: true });
    expect(res.text).toBe("# ask @Dana-S => @Dana-S x (@Ben, @Dana-S)");
    expect(res.lines).toEqual([
      {
        lineIdx: 0,
        before,
        after: "# ask @Dana-S => @Dana-S x (@Ben, @Dana-S)",
      },
    ]);
  });

  it("does not rename prefix-matching longer names", () => {
    const before = "# call @Danal";
    const res = renameInText(before, { kind: "name", from: "Dana", to: "Dana-S" }, { titles: true });
    expect(res.text).toBe(before);
    expect(res.lines).toEqual([]);
  });

  it("renames (topic) tag after action or topic symbol", () => {
    const before = "# (budget) send";
    const res = renameInText(before, { kind: "topic", from: "budget", to: "finance" }, { titles: true });
    expect(res.text).toBe("# (finance) send");
    expect(res.lines).toEqual([{ lineIdx: 0, before, after: "# (finance) send" }]);
  });

  it("leaves plain parenthesized words unchanged when renaming a topic", () => {
    const before = "plain (budget) text";
    const res = renameInText(before, { kind: "topic", from: "budget", to: "finance" }, { titles: true });
    expect(res.text).toBe(before);
    expect(res.lines).toEqual([]);
  });
});

describe("validTarget", () => {
  it("validates name rules and drops a leading @", () => {
    expect(validTarget({ kind: "name", from: "Dana", to: "Dana-S" })).toBeNull();
    expect(validTarget({ kind: "name", from: "Dana", to: "@Dana-S" })).toBeNull();
    expect(validTarget({ kind: "name", from: "dana", to: "Dana" })).toBeNull();
    expect(validTarget({ kind: "name", from: "Dana", to: "" })).toBe("rename.invalid.name");
    expect(validTarget({ kind: "name", from: "Dana", to: "@" })).toBe("rename.invalid.name");
    expect(validTarget({ kind: "name", from: "Dana", to: "Dana Smith" })).toBe("rename.invalid.name");
    expect(validTarget({ kind: "name", from: "Dana", to: "Dana" })).toBe("rename.invalid.same");
    expect(validTarget({ kind: "name", from: "Dana", to: "@Dana" })).toBe("rename.invalid.same");
  });

  it("validates topic rules", () => {
    expect(validTarget({ kind: "topic", from: "budget", to: "finance" })).toBeNull();
    expect(validTarget({ kind: "topic", from: "budget", to: "Budget" })).toBeNull();
    expect(validTarget({ kind: "topic", from: "budget", to: "" })).toBe("rename.invalid.topic");
    expect(validTarget({ kind: "topic", from: "budget", to: "my budget" })).toBe("rename.invalid.topic");
    expect(validTarget({ kind: "topic", from: "budget", to: "(finance)" })).toBe("rename.invalid.topic");
    expect(validTarget({ kind: "topic", from: "budget", to: "budget" })).toBe("rename.invalid.same");
  });

  it("validates title rules", () => {
    expect(validTarget({ kind: "title", from: "Coffee rota", to: "Hospitality rota" })).toBeNull();
    expect(validTarget({ kind: "title", from: "coffee rota", to: "Coffee rota" })).toBeNull();
    expect(validTarget({ kind: "title", from: "Coffee rota", to: "   " })).toBe("rename.invalid.title");
    expect(validTarget({ kind: "title", from: "Coffee rota", to: "Line 1\nLine 2" })).toBe("rename.invalid.title");
    expect(validTarget({ kind: "title", from: "Coffee rota", to: "[10:00 - 10:30] New" })).toBe("rename.invalid.title");
    expect(validTarget({ kind: "title", from: "Coffee rota", to: "2026-11-16 Meeting" })).toBe("rename.invalid.title");
    expect(validTarget({ kind: "title", from: "Coffee rota", to: " Coffee rota " })).toBe("rename.invalid.same");
  });
});

describe("planRename", () => {
  beforeEach(() => {
    clearDiskLayer();
    tabs.set([]);
    activeTabId.set("");
  });

  it("leaves future-dated titles alone, renames names on future notes, skips scratchpads, and orders newest-first", async () => {
    backend = new MockBackend({
      notes: {
        "2026-11-10.txt": "Coffee rota\n===========\n# ask @dana\n",
        "2026-11-16.txt": "Coffee rota\n===========\n# remind @Dana\n",
        "2026-11-20.txt": "Coffee rota\n===========\n# ask @Dana\n",
      },
    });
    tabs.set([
      {
        id: "scratch-1",
        filename: "Scratchpad 1",
        isScratchpad: true,
        content: "Coffee rota\n===========\n# ask @Dana\n",
      },
    ]);

    const titlePlan = await planRename(
      { kind: "title", from: "Coffee rota", to: "Hospitality rota" },
      "2026-11-16",
    );
    expect(titlePlan.map((e) => e.filename)).toEqual(["2026-11-16.txt", "2026-11-10.txt"]);

    const namePlan = await planRename({ kind: "name", from: "Dana", to: "Dana-S" }, "2026-11-16");
    expect(namePlan.map((e) => e.filename)).toEqual(["2026-11-20.txt", "2026-11-16.txt", "2026-11-10.txt"]);
  });
});

describe("applyRename & undoRename against MockBackend", () => {
  let cleanupEditor: (() => void) | null = null;

  beforeEach(() => {
    clearDiskLayer();
    clearAllTabCleanHashes();
    tabs.set([]);
    activeTabId.set("");
    registerEditorApi(null);
    toastMessage.set("");
    toastAction.set(null);
  });

  afterEach(() => {
    cleanupEditor?.();
    cleanupEditor = null;
    registerEditorApi(null);
  });

  it("skips a closed note changed meanwhile, saves old text as earlier versions, and supports undo", async () => {
    const old10 = "Coffee rota\n===========\n# task 1\n";
    const old15 = "Coffee rota\n===========\n# task 2\n";
    const old16 = "Coffee rota\n===========\n# task 3\n";
    backend = new MockBackend({
      notes: {
        "2026-11-10.txt": old10,
        "2026-11-15.txt": old15,
        "2026-11-16.txt": old16,
      },
    });

    // Open 2026-11-16 as the active tab with a real TestEditor so applyLineEdits runs.
    const tab16: NoteTab = { id: "tab-16", filename: "2026-11-16.txt", isScratchpad: false, content: old16 };
    tabs.set([tab16]);
    activeTabId.set("tab-16");
    markTabClean("tab-16", await sha256Hex(old16));

    const ed = createTestEditor({ doc: old16 });
    cleanupEditor = () => ed.destroy();
    const api: EditorApi = {
      getContent: () => ed.text(),
      setContent: () => {},
      insertAtCursor: () => {},
      jumpToLine: () => {},
      getCursorLineIdx: () => 0,
      getSelection: () => ({ text: "", fromLine: 0, toLine: 0 }),
      focus: () => {},
      find: { setQuery: () => {}, next: () => {}, prev: () => {}, clear: () => {} },
      applyLineEdits: (edits) => {
        applyLineEdits(ed.view, edits);
        updateActiveTabContent(ed.text());
      },
    };
    registerEditorApi(api);

    await ensureLoaded();
    const plan = await planRename(
      { kind: "title", from: "Coffee rota", to: "Hospitality rota" },
      "2026-11-16",
    );
    expect(plan).toHaveLength(3);

    // Simulate 2026-11-15 changing on disk between plan and apply.
    const changed15 = "Coffee rota\n===========\n# edited externally\n";
    await backend.invoke("write_note", {
      filename: "2026-11-15.txt",
      content: changed15,
      expectedHash: null,
    });

    const result = await applyRename(plan, new Set(plan.map((p) => p.filename)));
    expect(result.renamed).toEqual(["2026-11-16.txt", "2026-11-10.txt"]);
    expect(result.skipped).toEqual(["2026-11-15.txt"]);

    // Changed note was never overwritten.
    expect(backend.getNote("2026-11-15.txt")).toBe(changed15);

    // Toast includes count, undo action, and skipped note date.
    expect(get(toastMessage)).toContain("Renamed in 2 notes");
    expect(get(toastMessage)).toContain("2026-11-15");
    expect(get(toastAction)).not.toBeNull();

    // Earlier versions of each renamed note hold the old text (NOT the new text).
    for (const [fn, expectedOld] of [
      ["2026-11-16.txt", old16],
      ["2026-11-10.txt", old10],
    ] as const) {
      const versions = (await backend.invoke("list_versions", { filename: fn })) as NoteVersion[];
      expect(versions.length).toBeGreaterThanOrEqual(1);
      const latestVersionText = await backend.invoke("read_version", {
        filename: fn,
        name: versions[0].name,
      });
      expect(latestVersionText).toBe(expectedOld);
    }

    // Active tab editor has new text and one Ctrl+Z restores it.
    expect(ed.text()).toBe("Hospitality rota\n================\n# task 3\n");

    // Edit 2026-11-10 after rename so undo skips it, while restoring 2026-11-16.
    const edited10 = "Hospitality rota\n================\n# task 1\n# added later\n";
    await backend.invoke("write_note", {
      filename: "2026-11-10.txt",
      content: edited10,
      expectedHash: null,
    });

    const renamedEntries = plan.filter((e) => result.renamed.includes(e.filename));
    const undoRes = await undoRename(renamedEntries);
    expect(undoRes.renamed).toEqual(["2026-11-16.txt"]);
    expect(undoRes.skipped).toEqual(["2026-11-10.txt"]);

    expect(backend.getNote("2026-11-16.txt")).toBe(old16);
    expect(ed.text()).toBe(old16);
    expect(backend.getNote("2026-11-10.txt")).toBe(edited10);

    // Undo also kept an earlier version holding textAfter for 2026-11-16.txt.
    const versionsAfterUndo = (await backend.invoke("list_versions", {
      filename: "2026-11-16.txt",
    })) as NoteVersion[];
    expect(versionsAfterUndo.length).toBeGreaterThanOrEqual(2);
    const savedTextAfter = await backend.invoke("read_version", {
      filename: "2026-11-16.txt",
      name: versionsAfterUndo[0].name,
    });
    expect(savedTextAfter).toBe("Hospitality rota\n================\n# task 3\n");
  });
});

describe("renameTargetAt & renameTargetsForCursor & diffLineEdits", () => {
  it("picks token under col before title, and builds cursor targets", () => {
    expect(renameTargetAt("[10:00 - 10:30] Coffee rota", 3, { title: true, isSectionTitle: true })).toEqual({
      kind: "title",
      from: "Coffee rota",
      to: "Coffee rota",
    });
    expect(renameTargetAt("# (budget) ask @Dana", 17)).toEqual({
      kind: "name",
      from: "Dana",
      to: "Dana",
    });
    expect(renameTargetAt("# (budget) ask @Dana", 4)).toEqual({
      kind: "topic",
      from: "budget",
      to: "budget",
    });
    expect(renameTargetAt("# (budget) ask @Dana", 12)).toBeNull();

    const doc = "Coffee rota\n===========\n# (budget) ask @Dana\n";
    const offsetOnDana = doc.indexOf("@Dana") + 2;
    expect(renameTargetsForCursor(doc, offsetOnDana)).toEqual({
      section: { kind: "title", from: "Coffee rota", to: "Coffee rota" },
      name: { kind: "name", from: "Dana", to: "Dana" },
      topic: null,
    });

    expect(diffLineEdits("a\nb\nc", "a\nx\nc")).toEqual([{ lineIdx: 1, text: "x" }]);
  });
});

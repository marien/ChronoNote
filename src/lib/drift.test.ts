import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";
import {
  checkActiveTabForDrift,
  resolveConflictKeepDisk,
  resolveConflictKeepMine,
  resolveConflictSaveCopy,
  handleWriteConflict,
  sha256Hex,
} from "./drift";
import {
  activeTabId,
  conflictInfo,
  clearTabCleanHash,
  getTabCleanHash,
  markTabClean,
  modal,
  registerEditorApi,
  toastMessage,
  tabs,
  type EditorApi,
} from "./stores";
import {
  cancelScheduledSave,
  flushSave,
  scheduleSave,
  setWriteConflictHandler,
  writeNoteAndInvalidateCache,
} from "./persistence";
import { EMPTY_CONTENT_HASH } from "./hash";
import { MockBackend } from "./testing/mockBackend";
import type { FileMetadata, NoteTab, NoteWithMetadata } from "./types";
import type { NoteVersion } from "./generated/tauri-types";
import type { CommandArgs, CommandReturn, TauriCommand } from "./tauriCommands";

let backend: MockBackend;

async function invoke<K extends TauriCommand>(cmd: K, args: CommandArgs<K>): Promise<CommandReturn<K>> {
  return (await backend.invoke(cmd, args as Record<string, unknown>)) as CommandReturn<K>;
}

const { apiMock } = vi.hoisted(() => {
  return {
    apiMock: {
      getFileMetadata: vi.fn((filename: string) => backend.invoke("get_file_metadata", { filename }) as Promise<FileMetadata>),
      readNoteWithMetadata: vi.fn((filename: string) => backend.invoke("read_note_with_metadata", { filename }) as Promise<NoteWithMetadata>),
      writeNote: vi.fn(
        (filename: string, content: string, expectedHash?: string | null, options?: { keepVersion?: boolean }) =>
          backend.invoke("write_note", {
            filename,
            content,
            expectedHash: expectedHash ?? null,
            ...(options?.keepVersion !== undefined ? { keepVersion: options.keepVersion } : {}),
          }) as Promise<FileMetadata>,
      ),
      writeConflictCopy: vi.fn((name: string, content: string) =>
        backend.invoke("write_conflict_copy", { name, content }) as Promise<string>,
      ),
      deleteNote: vi.fn((filename: string, expectedHash?: string | null) =>
        backend.invoke("delete_note", { filename, expectedHash: expectedHash ?? null }) as Promise<void>,
      ),
      readNote: vi.fn((filename: string) => backend.invoke("read_note", { filename }) as Promise<string | null>),
      listNoteFiles: vi.fn(() => backend.invoke("list_note_files", {}) as Promise<string[]>),
      readAllNotes: vi.fn(() => backend.invoke("read_all_notes", {}) as Promise<[string, string][]>),
      listVersions: vi.fn((filename: string) => backend.invoke("list_versions", { filename }) as Promise<NoteVersion[]>),
      readVersion: vi.fn((filename: string, name: string) => backend.invoke("read_version", { filename, name }) as Promise<string>),
      getConfig: vi.fn().mockResolvedValue({}),
      readTabSession: vi.fn().mockResolvedValue(null),
      writeTabSession: vi.fn().mockResolvedValue(undefined),
      saveScratchpadDrafts: vi.fn().mockResolvedValue(undefined),
      loadScratchpadDrafts: vi.fn().mockResolvedValue({}),
      cleanUpVersionsAndTrash: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("./tauriApi", () => apiMock);

function makeTab(partial: Partial<NoteTab> & { id: string; filename: string }): NoteTab {
  return {
    content: "",
    isScratchpad: false,
    ...partial,
  };
}

let mockEditor: EditorApi;

describe("conflict resolution and drift detection (§94, §291, §292, spec §6.3, §6.4, §6.6)", () => {
  const FILE = "2026-09-01.txt";

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new MockBackend({
      notes: {},
    });
    tabs.set([]);
    activeTabId.set("");
    modal.set("none");
    conflictInfo.set(null);
    toastMessage.set("");
    mockEditor = {
      getContent: vi.fn(),
      setContent: vi.fn(),
      insertAtCursor: vi.fn(),
      jumpToLine: vi.fn(),
      getCursorLineIdx: vi.fn(),
      getSelection: vi.fn().mockReturnValue({ from: 0, to: 0 }),
      focus: vi.fn(),
      find: {
        setQuery: vi.fn(),
        next: vi.fn(),
        prev: vi.fn(),
        clear: vi.fn(),
      },
    };
    registerEditorApi(mockEditor);
    setWriteConflictHandler(null);
  });

  afterEach(() => {
    registerEditorApi(null);
    setWriteConflictHandler(null);
    vi.useRealTimers();
  });

  async function setupConflictState(options?: {
    filename?: string;
    initialContent?: string;
    diskContent?: string;
    localContent?: string;
  }) {
    const filename = options?.filename ?? FILE;
    const initial = options?.initialContent ?? "initial baseline text\n";
    const disk = options?.diskContent ?? "external edit on disk\n";
    const local = options?.localContent ?? "local unsaved edits in tab\n";

    // 1. Initial write to disk
    await invoke("write_note", { filename, content: initial, expectedHash: null });
    const initialMeta = await invoke("get_file_metadata", { filename });
    const initialHash = initialMeta.contentHash!;

    // 2. Open tab and record clean baseline matching initial disk content
    const tabId = "tab-active";
    tabs.set([makeTab({ id: tabId, filename, content: local })]);
    activeTabId.set(tabId);
    markTabClean(tabId, initialHash);

    // 3. External change lands on disk outside ChronoNote (written directly to disk)
    backend.setNote(filename, disk);
    const diskMeta = await invoke("get_file_metadata", { filename });
    const diskHash = diskMeta.contentHash!;

    // 4. Trigger drift check to establish conflict state (Case C)
    await checkActiveTabForDrift();

    expect(get(modal)).toBe("conflict");
    expect(get(conflictInfo)).toEqual({
      tabId,
      filename,
      diskContent: disk,
      diskHash,
    });

    return { tabId, filename, initial, initialHash, disk, diskHash, local };
  }

  describe("Choice 1: Keep disk version (resolveConflictKeepDisk)", () => {
    it("replaces tab content and live editor text with disk content and drops local edits", async () => {
      const { tabId, disk } = await setupConflictState();

      await resolveConflictKeepDisk();

      const currentTab = get(tabs).find((t) => t.id === tabId);
      expect(currentTab?.content).toBe(disk);
      expect(mockEditor.setContent).toHaveBeenCalledWith(disk);
    });

    it("updates tab clean baseline to disk hash so subsequent check sees no change", async () => {
      const { tabId, diskHash } = await setupConflictState();

      await resolveConflictKeepDisk();

      expect(getTabCleanHash(tabId)).toBe(diskHash);

      // Subsequent drift check must be a no-op (Case A)
      await checkActiveTabForDrift();
      expect(get(modal)).toBe("none");
      expect(get(conflictInfo)).toBeNull();
    });

    it("allows subsequent saves with new edits without refusal because the baseline was updated", async () => {
      const { tabId, filename, diskHash } = await setupConflictState();

      await resolveConflictKeepDisk();
      expect(getTabCleanHash(tabId)).toBe(diskHash);

      // User makes a new edit
      const freshContent = "fresh edit after keeping disk version\n";
      tabs.update((list) => list.map((t) => (t.id === tabId ? { ...t, content: freshContent } : t)));

      // Save tab: passes tab's new clean baseline (diskHash)
      await writeNoteAndInvalidateCache(filename, freshContent, { kind: "tabBaseline" });

      const onDisk = await invoke("read_note", { filename });
      expect(onDisk).toBe(freshContent);
      expect(apiMock.writeNote).toHaveBeenLastCalledWith(filename, freshContent, diskHash);
    });

    it("closes the conflict modal and clears conflictInfo", async () => {
      await setupConflictState();

      await resolveConflictKeepDisk();

      expect(get(modal)).toBe("none");
      expect(get(conflictInfo)).toBeNull();
    });

    it("displays a toast notification confirming reload from disk", async () => {
      const { filename } = await setupConflictState();

      await resolveConflictKeepDisk();

      expect(get(toastMessage)).toContain(filename);
    });

    it("safely no-ops if conflictInfo is null when called", async () => {
      conflictInfo.set(null);
      modal.set("none");

      await resolveConflictKeepDisk();

      expect(get(modal)).toBe("none");
      expect(get(conflictInfo)).toBeNull();
    });
  });

  describe("Choice 2: Keep my version (resolveConflictKeepMine)", () => {
    it("writes tab content to disk with compare-and-swap using the external disk hash shown to user", async () => {
      const { filename, diskHash, local } = await setupConflictState();

      await resolveConflictKeepMine();

      expect(apiMock.writeNote).toHaveBeenCalledWith(filename, local, diskHash, { keepVersion: true });
      const onDisk = await invoke("read_note", { filename });
      expect(onDisk).toBe(local);
    });

    it("updates the tab clean baseline to the new content hash on successful write", async () => {
      const { tabId, local } = await setupConflictState();

      await resolveConflictKeepMine();

      const expectedNewHash = await sha256Hex(local);
      expect(getTabCleanHash(tabId)).toBe(expectedNewHash);

      // Subsequent drift check sees no change
      await checkActiveTabForDrift();
      expect(get(modal)).toBe("none");
    });

    it("closes the conflict modal and clears conflictInfo on success", async () => {
      await setupConflictState();

      await resolveConflictKeepMine();

      expect(get(modal)).toBe("none");
      expect(get(conflictInfo)).toBeNull();
      expect(get(toastMessage)).not.toBe("");
    });

    it("if the file changed a third time meanwhile, CAS prevents overwrite and re-opens conflict prompt", async () => {
      const { filename, local } = await setupConflictState();

      // Third change occurs on disk while user is reviewing the prompt
      const thirdVersion = "third change by sync client while prompt open\n";
      backend.setNote(filename, thirdVersion);
      const thirdMeta = await invoke("get_file_metadata", { filename });
      const thirdHash = thirdMeta.contentHash!;

      // User clicks "Keep my version", but CAS guard rejects because diskHash no longer matches
      await resolveConflictKeepMine();

      // Disk file must NOT have been overwritten with local tab content
      const onDisk = await invoke("read_note", { filename });
      expect(onDisk).toBe(thirdVersion);
      expect(onDisk).not.toBe(local);

      // Prompt must come back for the user with the new third version
      expect(get(modal)).toBe("conflict");
      expect(get(conflictInfo)?.diskContent).toBe(thirdVersion);
      expect(get(conflictInfo)?.diskHash).toBe(thirdHash);
    });

    it("keeps the overwritten disk text as an earlier version when no prior version exists today (spec §6.6)", async () => {
      const filename = FILE;
      const initial = "initial baseline text\n";
      const disk = "external edit on disk\n";
      const local = "local unsaved edits in tab\n";

      // 1. Initial write to disk
      await invoke("write_note", { filename, content: initial, expectedHash: null });
      const initialMeta = await invoke("get_file_metadata", { filename });
      const initialHash = initialMeta.contentHash!;

      // 2. Open tab and record clean baseline matching initial disk content
      const tabId = "tab-active";
      tabs.set([makeTab({ id: tabId, filename, content: local })]);
      activeTabId.set(tabId);
      markTabClean(tabId, initialHash);

      // 3. Clear version history so no prior version exists, simulating external write directly on disk
      backend = new MockBackend({ notes: { [filename]: disk }, versions: {} });
      const diskMeta = await invoke("get_file_metadata", { filename });
      const diskHash = diskMeta.contentHash!;

      // 4. Trigger drift check to establish conflict state (Case C)
      await checkActiveTabForDrift();
      expect(get(modal)).toBe("conflict");

      // 5. Keep my version overwrites the external disk text
      await resolveConflictKeepMine();

      // spec §6.6: the disk text that is overwritten is kept as an earlier version first
      const versions = await invoke("list_versions", { filename });
      expect(versions.length).toBeGreaterThanOrEqual(1);

      const savedVersionText = await invoke("read_version", {
        filename,
        name: versions[0].name,
      });
      expect(savedVersionText).toBe(disk);
    });

    it("keeps the overwritten disk text as an earlier version even if another version was saved less than 5 minutes ago (spec §6.6)", async () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const filename = FILE;
      const v0 = "version 0 initial\n";
      const vExternal = "external edit on disk to be overwritten\n";
      const vLocal = "my version that wins\n";

      // 1. Initial note write
      await invoke("write_note", { filename, content: v0, expectedHash: null });
      const v0Meta = await invoke("get_file_metadata", { filename });
      const v0Hash = v0Meta.contentHash!;

      // 2. An earlier version was created 60 seconds ago (< 5 minutes cooldown)
      backend.keepVersion(filename, v0, backend.notesDir, now - 60_000);

      // 3. Tab is open at v0 baseline with local edits
      const tabId = "tab-active";
      tabs.set([makeTab({ id: tabId, filename, content: vLocal })]);
      activeTabId.set(tabId);
      markTabClean(tabId, v0Hash);

      // 4. External change on disk
      backend.setNote(filename, vExternal);
      const extMeta = await invoke("get_file_metadata", { filename });
      const extHash = extMeta.contentHash!;

      // 5. Drift check opens conflict prompt
      await checkActiveTabForDrift();
      expect(get(modal)).toBe("conflict");
      expect(get(conflictInfo)?.diskHash).toBe(extHash);

      // 6. User chooses "Keep my version"
      await resolveConflictKeepMine();

      // Spec §6.6 requires that resolving conflict with "Keep mine" is an overwrite condition
      // that saves the overwritten disk text (vExternal) as an earlier version first.
      const versions = await invoke("list_versions", { filename });
      const newestVersionContent = await invoke("read_version", {
        filename,
        name: versions[0].name,
      });

      expect(newestVersionContent).toBe(vExternal);
    });
  });

  describe("Choice 3: Save mine as a copy (resolveConflictSaveCopy)", () => {
    it("writes tab text to a conflict copy named <name>-<HHMMSS>.txt in .chrononote-conflicts/ folder", async () => {
      const fakeTime = new Date(2026, 8, 1, 14, 30, 22);
      vi.useFakeTimers();
      vi.setSystemTime(fakeTime);

      const { local } = await setupConflictState();

      await resolveConflictSaveCopy();

      // Verify the filename format: <stem>-<HHMMSS>.txt
      const expectedCopyName = "2026-09-01-143022.txt";
      expect(apiMock.writeConflictCopy).toHaveBeenCalledWith(expectedCopyName, local);

      const copies = backend.conflictCopyNames();
      expect(copies).toContain(expectedCopyName);
      expect(backend.conflictCopy(expectedCopyName)).toBe(local);
    });

    it("matches the required 6-digit timestamp regex format <name>-<HHMMSS>.txt", async () => {
      await setupConflictState();

      await resolveConflictSaveCopy();

      expect(apiMock.writeConflictCopy).toHaveBeenCalledWith(
        expect.stringMatching(/^2026-09-01-\d{6}\.txt$/),
        expect.any(String),
      );
    });

    it("reloads the disk text into the tab and live editor after saving the copy", async () => {
      const { tabId, disk, diskHash } = await setupConflictState();

      await resolveConflictSaveCopy();

      const currentTab = get(tabs).find((t) => t.id === tabId);
      expect(currentTab?.content).toBe(disk);
      expect(mockEditor.setContent).toHaveBeenCalledWith(disk);
      expect(getTabCleanHash(tabId)).toBe(diskHash);
    });

    it("closes the conflict modal and clears conflictInfo on success", async () => {
      await setupConflictState();

      await resolveConflictSaveCopy();

      expect(get(modal)).toBe("none");
      expect(get(conflictInfo)).toBeNull();
      expect(get(toastMessage)).toContain(".txt");
    });

    it("the conflict copy in .chrononote-conflicts/ is excluded from note file listings (listNoteFiles / readAllNotes)", async () => {
      const { filename } = await setupConflictState();

      await resolveConflictSaveCopy();

      const files = await invoke("list_note_files", {});
      expect(files).toEqual([filename]);

      const allNotes = await invoke("read_all_notes", {});
      expect(allNotes.map(([f]) => f)).toEqual([filename]);
    });

    it("preserves tab text and aborts reload if writing conflict copy fails", async () => {
      const { tabId, local, disk } = await setupConflictState();

      apiMock.writeConflictCopy.mockRejectedValueOnce(new Error("disk full"));

      await resolveConflictSaveCopy();

      // Local edits must NOT have been lost or overwritten by disk
      const currentTab = get(tabs).find((t) => t.id === tabId);
      expect(currentTab?.content).toBe(local);
      expect(currentTab?.content).not.toBe(disk);
      expect(mockEditor.setContent).not.toHaveBeenCalledWith(disk);
    });

    it("safely no-ops if conflictInfo is null when called", async () => {
      conflictInfo.set(null);
      modal.set("none");

      await resolveConflictSaveCopy();

      expect(get(modal)).toBe("none");
      expect(apiMock.writeConflictCopy).not.toHaveBeenCalled();
    });
  });

  describe("Freezing autosave while prompt is open", () => {
    it("cancels scheduled autosave when drift check detects conflict so disk copy is not overwritten", async () => {
      vi.useFakeTimers();

      const initial = "initial text\n";
      const disk = "disk changed externally\n";
      const local = "local edits typed by user\n";

      await invoke("write_note", { filename: FILE, content: initial, expectedHash: null });
      const initialMeta = await invoke("get_file_metadata", { filename: FILE });
      const initialHash = initialMeta.contentHash!;

      const tabId = "tab-active";
      const currentTab = makeTab({ id: tabId, filename: FILE, content: local });
      tabs.set([currentTab]);
      activeTabId.set(tabId);
      markTabClean(tabId, initialHash);

      // Typing triggers scheduled autosave (400ms debounce)
      scheduleSave(currentTab);

      // External change lands on disk
      backend.setNote(FILE, disk);

      // Drift check runs on window focus / tab activation
      await checkActiveTabForDrift();
      expect(get(modal)).toBe("conflict");

      // Advance timers past the 400ms autosave interval
      await vi.advanceTimersByTimeAsync(1000);

      // Disk content must remain untouched (not overwritten by the autosave)
      const onDisk = await invoke("read_note", { filename: FILE });
      expect(onDisk).toBe(disk);
    });

    it("bails from drift check while conflict modal is already open", async () => {
      await setupConflictState();
      expect(get(modal)).toBe("conflict");

      apiMock.getFileMetadata.mockClear();

      // Trigger drift check again while modal is open
      await checkActiveTabForDrift();

      // Must not make any IPC call
      expect(apiMock.getFileMetadata).not.toHaveBeenCalled();
    });
  });

  describe("Save refused because note changed on disk (handleWriteConflict)", () => {
    it("active tab: refused write triggers drift check and opens conflict prompt without losing local text", async () => {
      const initial = "initial baseline\n";
      const disk = "external change on disk\n";
      const local = "unsaved local modifications\n";

      await invoke("write_note", { filename: FILE, content: initial, expectedHash: null });
      const initialMeta = await invoke("get_file_metadata", { filename: FILE });
      const initialHash = initialMeta.contentHash!;

      const tabId = "tab-active";
      tabs.set([makeTab({ id: tabId, filename: FILE, content: local })]);
      activeTabId.set(tabId);
      markTabClean(tabId, initialHash);

      // External change on disk causes next write with expectedHash initialHash to be refused
      backend.setNote(FILE, disk);

      // Refusal triggers handleWriteConflict for active tab
      await handleWriteConflict(FILE);

      expect(get(modal)).toBe("conflict");
      expect(get(conflictInfo)?.diskContent).toBe(disk);

      // Local text in tab is intact and not lost
      const currentTab = get(tabs).find((t) => t.id === tabId);
      expect(currentTab?.content).toBe(local);
    });

    it("background tab: refused write saves local edits as a conflict copy in .chrononote-conflicts/ so nothing is lost", async () => {
      const fakeTime = new Date(2026, 8, 1, 10, 15, 30);
      vi.useFakeTimers();
      vi.setSystemTime(fakeTime);

      const activeFile = "2026-09-02.txt";
      const bgFile = "2026-09-01.txt";
      const bgLocalText = "background tab local text that was refused save\n";

      tabs.set([
        makeTab({ id: "tab-active", filename: activeFile, content: "active text" }),
        makeTab({ id: "tab-bg", filename: bgFile, content: bgLocalText }),
      ]);
      activeTabId.set("tab-active");

      await handleWriteConflict(bgFile);

      // Active tab modal was not disturbed
      expect(get(modal)).toBe("none");

      // Conflict copy was written for the background tab so data is not lost
      const expectedCopyName = "2026-09-01-101530.txt";
      expect(apiMock.writeConflictCopy).toHaveBeenCalledWith(expectedCopyName, bgLocalText);
      expect(backend.conflictCopy(expectedCopyName)).toBe(bgLocalText);
      expect(get(toastMessage)).toContain(expectedCopyName);

      // Background tab's in-memory content is still preserved
      const bgTab = get(tabs).find((t) => t.id === "tab-bg");
      expect(bgTab?.content).toBe(bgLocalText);
    });

    it("persistence integration: a refused save via writeNoteAndInvalidateCache invokes writeConflictHandler", async () => {
      setWriteConflictHandler(handleWriteConflict);

      const initial = "initial baseline\n";
      const disk = "external change on disk\n";
      const local = "local edits attempting save\n";

      await invoke("write_note", { filename: FILE, content: initial, expectedHash: null });
      const initialMeta = await invoke("get_file_metadata", { filename: FILE });
      const initialHash = initialMeta.contentHash!;

      const tabId = "tab-active";
      tabs.set([makeTab({ id: tabId, filename: FILE, content: local })]);
      activeTabId.set(tabId);
      markTabClean(tabId, initialHash);

      // External change lands on disk
      backend.setNote(FILE, disk);

      // Attempting to write with tab's baseline hash will reject with conflict error
      await expect(
        writeNoteAndInvalidateCache(FILE, local, { kind: "tabBaseline" }),
      ).rejects.toThrow(/conflict: note changed on disk/);

      // handleWriteConflict must have been invoked and opened the conflict modal
      expect(get(modal)).toBe("conflict");
      expect(get(conflictInfo)?.diskContent).toBe(disk);
    });

    it("safely no-ops if filename does not match any open tab or matches a scratchpad", async () => {
      tabs.set([
        makeTab({ id: "scratch-1", filename: "scratch-1", isScratchpad: true, content: "scratchpad" }),
      ]);
      activeTabId.set("scratch-1");

      await handleWriteConflict("non-existent-file.txt");
      await handleWriteConflict("scratch-1");

      expect(get(modal)).toBe("none");
      expect(apiMock.writeConflictCopy).not.toHaveBeenCalled();
    });
  });

  describe("Deleted on disk", () => {
    it("when note file is deleted on disk, drops clean baseline without showing conflict prompt and preserves tab text", async () => {
      const initial = "content before deletion\n";
      await invoke("write_note", { filename: FILE, content: initial, expectedHash: null });
      const initialMeta = await invoke("get_file_metadata", { filename: FILE });
      const initialHash = initialMeta.contentHash!;

      const tabId = "tab-active";
      tabs.set([makeTab({ id: tabId, filename: FILE, content: initial })]);
      activeTabId.set(tabId);
      markTabClean(tabId, initialHash);

      // File is deleted on disk
      backend.deleteNote(FILE);

      await checkActiveTabForDrift();

      // No modal prompt
      expect(get(modal)).toBe("none");

      // Content in tab is preserved untouched
      const currentTab = get(tabs).find((t) => t.id === tabId);
      expect(currentTab?.content).toBe(initial);

      // Baseline is dropped
      expect(getTabCleanHash(tabId)).toBeUndefined();

      // Toast notification is displayed
      expect(get(toastMessage)).toContain(FILE);
    });

    it("subsequent save of a note deleted on disk re-creates the file with tab content", async () => {
      const initial = "content to re-create on disk\n";
      await invoke("write_note", { filename: FILE, content: initial, expectedHash: null });
      const initialMeta = await invoke("get_file_metadata", { filename: FILE });
      const initialHash = initialMeta.contentHash!;

      const tabId = "tab-active";
      tabs.set([makeTab({ id: tabId, filename: FILE, content: initial })]);
      activeTabId.set(tabId);
      markTabClean(tabId, initialHash);

      // File deleted on disk
      backend.deleteNote(FILE);
      await checkActiveTabForDrift();
      expect(getTabCleanHash(tabId)).toBeUndefined();

      // Next save writes without expectedHash and re-creates the file
      await writeNoteAndInvalidateCache(FILE, initial, { kind: "tabBaseline" });

      const onDisk = await invoke("read_note", { filename: FILE });
      expect(onDisk).toBe(initial);

      // Baseline is re-established
      const newHash = await sha256Hex(initial);
      expect(getTabCleanHash(tabId)).toBe(newHash);
    });
  });

  describe("No change on disk / changed without local edits", () => {
    it("no change on disk: Case A is a complete no-op (no reload, no modal, content untouched)", async () => {
      const content = "unmodified content\n";
      await invoke("write_note", { filename: FILE, content, expectedHash: null });
      const meta = await invoke("get_file_metadata", { filename: FILE });
      const hash = meta.contentHash!;

      const tabId = "tab-active";
      tabs.set([makeTab({ id: tabId, filename: FILE, content })]);
      activeTabId.set(tabId);
      markTabClean(tabId, hash);

      await checkActiveTabForDrift();

      expect(get(modal)).toBe("none");
      expect(get(conflictInfo)).toBeNull();
      expect(get(toastMessage)).toBe("");
      expect(mockEditor.setContent).not.toHaveBeenCalled();
    });

    it("note not existing yet with empty-content baseline is a no-op", async () => {
      const tabId = "tab-active";
      tabs.set([makeTab({ id: tabId, filename: FILE, content: "" })]);
      activeTabId.set(tabId);
      markTabClean(tabId, EMPTY_CONTENT_HASH);

      await checkActiveTabForDrift();

      expect(get(modal)).toBe("none");
      expect(get(conflictInfo)).toBeNull();
      expect(get(toastMessage)).toBe("");
    });

    it("changed without local edits: Case B silently reloads disk content and updates editor text", async () => {
      const initial = "v1 initial\n";
      const externalV2 = "v2 external changes\n";

      await invoke("write_note", { filename: FILE, content: initial, expectedHash: null });
      const initialMeta = await invoke("get_file_metadata", { filename: FILE });
      const initialHash = initialMeta.contentHash!;

      const tabId = "tab-active";
      tabs.set([makeTab({ id: tabId, filename: FILE, content: initial })]);
      activeTabId.set(tabId);
      markTabClean(tabId, initialHash);

      // File modified on disk, tab has no local edits
      backend.setNote(FILE, externalV2);
      const externalMeta = await invoke("get_file_metadata", { filename: FILE });
      const externalHash = externalMeta.contentHash!;

      await checkActiveTabForDrift();

      // Silently reloads: no modal prompt
      expect(get(modal)).toBe("none");

      // Content and editor are updated with disk text
      const currentTab = get(tabs).find((t) => t.id === tabId);
      expect(currentTab?.content).toBe(externalV2);
      expect(mockEditor.setContent).toHaveBeenCalledWith(externalV2);

      // Clean baseline is updated to external hash
      expect(getTabCleanHash(tabId)).toBe(externalHash);

      // Toast confirms reload
      expect(get(toastMessage)).toContain(FILE);
    });
  });



  // §412: the mock used to keep a version before its compare-and-swap check (storage.rs checks first); fixed.
  describe("a refused Keep my version", () => {
    it("does not archive an earlier version if Keep my version fails CAS because the file changed a third time", async () => {
      const filename = FILE;
      const initial = "initial text\n";
      const diskV2 = "external edit v2\n";
      const diskV3 = "third change v3\n";
      const local = "local text\n";

      await invoke("write_note", { filename, content: initial, expectedHash: null });
      const initialMeta = await invoke("get_file_metadata", { filename });
      const initialHash = initialMeta.contentHash!;

      const tabId = "tab-active";
      tabs.set([makeTab({ id: tabId, filename, content: local })]);
      activeTabId.set(tabId);
      markTabClean(tabId, initialHash);

      backend.setNote(filename, diskV2);
      await checkActiveTabForDrift();

      // Set version history to empty
      backend = new MockBackend({ notes: { [filename]: diskV3 }, versions: {} });

      // User attempts "Keep my version" against diskV2 hash: CAS fails because disk holds diskV3
      await resolveConflictKeepMine();

      // Since the write was refused (NOT overwritten), no version of diskV3 should be archived
      const versions = await invoke("list_versions", { filename });
      expect(versions).toHaveLength(0);
    });
  });
});

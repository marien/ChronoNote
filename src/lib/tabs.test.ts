import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { closeTab } from "./tabs";
import { writeNoteAndInvalidateCache } from "./persistence";
import {
  activeTabId,
  getTabCleanHash,
  markTabClean,
  modal,
  tabs,
  toastMessage,
} from "./stores";
import { MockBackend } from "./testing/mockBackend";
import type { FileMetadata, NoteTab, NoteWithMetadata } from "./types";
import type { CommandArgs, CommandReturn, TauriCommand } from "./tauriCommands";

let backend: MockBackend;

async function invoke<K extends TauriCommand>(cmd: K, args: CommandArgs<K>): Promise<CommandReturn<K>> {
  return (await backend.invoke(cmd, args as Record<string, unknown>)) as CommandReturn<K>;
}

const { apiMock } = vi.hoisted(() => ({
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
    saveScratchpadDrafts: vi.fn().mockResolvedValue(undefined),
    writeTabSession: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./tauriApi", () => apiMock);

function makeTab(partial: Partial<NoteTab> & { id: string; filename: string }): NoteTab {
  return { content: "", isScratchpad: false, ...partial };
}

describe("Rule 3: Closing a tab never overwrites a newer file", () => {
  const FILE = "2026-09-01.txt";

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new MockBackend({ notes: {} });
    tabs.set([]);
    activeTabId.set("");
    modal.set("none");
    toastMessage.set("");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the newer disk version and saves a conflict copy when closing a tab with unsaved typing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 1, 14, 5, 9));

    const initial = "initial text\n";
    const diskNewer = "newer version on disk\n";
    const localUnsaved = "unsaved local typing\n";

    const meta = await invoke("write_note", { filename: FILE, content: initial, expectedHash: null });
    const tabId = "tab-1";
    tabs.set([makeTab({ id: tabId, filename: FILE, content: localUnsaved })]);
    activeTabId.set(tabId);
    markTabClean(tabId, meta.contentHash!);

    // Someone else updates the file on disk before the tab is closed.
    backend.setNote(FILE, diskNewer);

    closeTab(tabId);
    expect(getTabCleanHash(tabId)).toBeUndefined();

    await vi.waitFor(() => {
      expect(apiMock.writeConflictCopy).toHaveBeenCalledTimes(1);
    });

    expect(backend.getNote(FILE)).toBe(diskNewer);
    const expectedCopy = "2026-09-01-140509.txt";
    expect(apiMock.writeConflictCopy).toHaveBeenCalledWith(expectedCopy, localUnsaved);
    expect(backend.conflictCopy(expectedCopy)).toBe(localUnsaved);
    expect(get(toastMessage)).toContain(expectedCopy);
  });

  it("a save still running at close is not mistaken for someone else's change", async () => {
    const meta = await invoke("write_note", { filename: FILE, content: "initial\n", expectedHash: null });
    const tabId = "tab-1";
    tabs.set([makeTab({ id: tabId, filename: FILE, content: "autosaved\n" })]);
    activeTabId.set(tabId);
    markTabClean(tabId, meta.contentHash!);

    // The autosave of "autosaved" is on its way to disk when the user types more and closes the tab.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const realWrite = apiMock.writeNote.getMockImplementation()!;
    apiMock.writeNote.mockImplementationOnce(async (...args) => {
      await held;
      return realWrite(...args);
    });
    const autosave = writeNoteAndInvalidateCache(FILE, "autosaved\n", { kind: "tabBaseline" });
    await Promise.resolve();
    tabs.set([makeTab({ id: tabId, filename: FILE, content: "autosaved\nmore\n" })]);
    closeTab(tabId);
    release();
    await autosave;

    await vi.waitFor(() => expect(backend.getNote(FILE)).toBe("autosaved\nmore\n"));
    expect(apiMock.writeConflictCopy).not.toHaveBeenCalled();
  });

  it("writes normally once when closing a tab with unsaved typing and disk did not change", async () => {
    const initial = "initial text\n";
    const localUnsaved = "unsaved local typing\n";

    const meta = await invoke("write_note", { filename: FILE, content: initial, expectedHash: null });
    apiMock.writeNote.mockClear();

    const tabId = "tab-1";
    tabs.set([makeTab({ id: tabId, filename: FILE, content: localUnsaved })]);
    activeTabId.set(tabId);
    markTabClean(tabId, meta.contentHash!);

    closeTab(tabId);

    await vi.waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalledTimes(1);
    });
    expect(backend.getNote(FILE)).toBe(localUnsaved);
    expect(apiMock.writeConflictCopy).not.toHaveBeenCalled();
  });

  it("does not write when closing a tab with no unsaved changes", async () => {
    const initial = "initial text\n";
    const meta = await invoke("write_note", { filename: FILE, content: initial, expectedHash: null });
    apiMock.writeNote.mockClear();

    const tabId = "tab-1";
    tabs.set([makeTab({ id: tabId, filename: FILE, content: initial })]);
    activeTabId.set(tabId);
    markTabClean(tabId, meta.contentHash!);

    closeTab(tabId);
    await Promise.resolve();
    await Promise.resolve();

    expect(apiMock.writeNote).not.toHaveBeenCalled();
    expect(apiMock.writeConflictCopy).not.toHaveBeenCalled();
  });
});

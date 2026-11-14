import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { writeTabContentAndWait } from "./persistence";
import { activeTabId, markTabClean, registerEditorApi, tabs, type EditorApi } from "./stores";
import { MockBackend } from "./testing/mockBackend";
import type { FileMetadata, NoteTab } from "./types";
import type { CommandArgs, CommandReturn, TauriCommand } from "./tauriCommands";

let backend: MockBackend;

async function invoke<K extends TauriCommand>(cmd: K, args: CommandArgs<K>): Promise<CommandReturn<K>> {
  return (await backend.invoke(cmd, args as Record<string, unknown>)) as CommandReturn<K>;
}

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    writeNote: vi.fn(
      (filename: string, content: string, expectedHash?: string | null, options?: { keepVersion?: boolean }) =>
        backend.invoke("write_note", {
          filename,
          content,
          expectedHash: expectedHash ?? null,
          ...(options?.keepVersion !== undefined ? { keepVersion: options.keepVersion } : {}),
        }) as Promise<FileMetadata>,
    ),
    readNoteWithMetadata: vi.fn(),
    readNote: vi.fn(),
    readAllNotes: vi.fn(),
    saveScratchpadDrafts: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./tauriApi", () => apiMock);

function makeTab(partial: Partial<NoteTab> & { id: string; filename: string }): NoteTab {
  return { content: "", isScratchpad: false, ...partial };
}

describe("Rule 4: A failed phone-companion write keeps what the user typed meanwhile", () => {
  const FILE = "2026-09-01.txt";
  let mockEditor: EditorApi;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new MockBackend({ notes: {} });
    mockEditor = {
      getContent: vi.fn(),
      setContent: vi.fn(),
      insertAtCursor: vi.fn(),
      jumpToLine: vi.fn(),
      getCursorLineIdx: vi.fn(),
      getSelection: vi.fn().mockReturnValue({ text: "", fromLine: 0, toLine: 0 }),
      focus: vi.fn(),
      find: { setQuery: vi.fn(), next: vi.fn(), prev: vi.fn(), clear: vi.fn() },
    };
    registerEditorApi(mockEditor);
    tabs.set([]);
    activeTabId.set("");
  });

  afterEach(() => {
    registerEditorApi(null);
  });

  it("removes only the phone's change and keeps user typing made while the save was running", async () => {
    const restoreTo = "original\n";
    const newContent = "original\nphone line\n";
    const meta = await invoke("write_note", { filename: FILE, content: restoreTo, expectedHash: null });

    const tabId = "tab-1";
    tabs.set([makeTab({ id: tabId, filename: FILE, content: restoreTo })]);
    activeTabId.set(tabId);
    markTabClean(tabId, meta.contentHash!);

    let rejectWrite!: (err: Error) => void;
    apiMock.writeNote.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectWrite = reject;
        }),
    );

    const writePromise = writeTabContentAndWait(tabId, newContent, restoreTo);
    await vi.waitFor(() => expect(rejectWrite).toBeTypeOf("function"));

    // User types at the start of line 1 while the save is in flight.
    const withUserTyping = "USER original\nphone line\n";
    tabs.update((list) => list.map((t) => (t.id === tabId ? { ...t, content: withUserTyping } : t)));

    rejectWrite(new Error("disk I/O error"));
    await expect(writePromise).rejects.toThrow("disk I/O error");

    expect(get(tabs).find((t) => t.id === tabId)?.content).toBe("USER original\n");
    expect(mockEditor.setContent).toHaveBeenLastCalledWith("USER original\n", { outside: true });
  });

  it("restores restoreTo exactly when the user typed nothing while the save failed", async () => {
    const restoreTo = "original\n";
    const newContent = "original\nphone line\n";
    const meta = await invoke("write_note", { filename: FILE, content: restoreTo, expectedHash: null });

    const tabId = "tab-1";
    tabs.set([makeTab({ id: tabId, filename: FILE, content: restoreTo })]);
    activeTabId.set(tabId);
    markTabClean(tabId, meta.contentHash!);

    apiMock.writeNote.mockRejectedValueOnce(new Error("disk I/O error"));

    await expect(writeTabContentAndWait(tabId, newContent, restoreTo)).rejects.toThrow("disk I/O error");

    expect(get(tabs).find((t) => t.id === tabId)?.content).toBe(restoreTo);
    expect(mockEditor.setContent).toHaveBeenLastCalledWith(restoreTo, { outside: true });
  });
});

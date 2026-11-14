// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MockBackend } from "./mockBackend";
import type { NoteWithMetadata } from "../generated/tauri-types";

describe("MockBackend CRLF delete hash check (batch 3, rule 8)", () => {
  it("deleting a CRLF note with the hash returned by read_note_with_metadata succeeds", async () => {
    const filename = "2026-09-07.txt";
    const crlfNote = "Weekly Sync\r\n===========\r\n# follow up with Sam\r\n";
    const backend = new MockBackend({
      notes: { [filename]: crlfNote },
    });

    const read = (await backend.invoke("read_note_with_metadata", {
      filename,
    })) as NoteWithMetadata;

    expect(read.metadata.exists).toBe(true);
    expect(read.metadata.contentHash).toBeTruthy();

    await backend.invoke("delete_note", {
      filename,
      expectedHash: read.metadata.contentHash,
    });

    expect(backend.getNote(filename)).toBeNull();
    expect(await backend.invoke("read_note", { filename })).toBeNull();
  });
});

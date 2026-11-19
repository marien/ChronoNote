import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

/** What the backend holds: notes, the phone's inbox file and the ledger. */
const disk = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  inbox: null as string | null,
  ledger: null as string | null,
}));
const apiMock = vi.hoisted(() => ({
  readPhoneInbox: vi.fn(async (): Promise<string | null> => disk.inbox),
  readPhoneLedger: vi.fn(async (): Promise<string | null> => disk.ledger),
  writePhoneLedger: vi.fn(async (content: string) => {
    disk.ledger = content;
  }),
  readNoteWithMetadata: vi.fn(async (name: string) => ({
    content: disk.files[name] ?? null,
    metadata: { exists: name in disk.files, contentHash: null, sizeBytes: null, modifiedMs: null },
  })),
  writeNote: vi.fn(async (name: string, content: string, _expected?: string | null, _options?: { keepVersion?: boolean }) => {
    disk.files[name] = content;
    return { exists: true, contentHash: null, sizeBytes: null, modifiedMs: null };
  }),
  readNote: vi.fn(async (name: string): Promise<string | null> => disk.files[name] ?? null),
  readAllNotes: vi.fn(async (): Promise<[string, string][]> => Object.entries(disk.files)),
  readAgendaForDate: vi.fn(async (_date: string): Promise<string[]> => []),
  readAgendaAfter: vi.fn(async (_after: string): Promise<[string, string][]> => []),
  writePhoneMeetings: vi.fn(async (_content: string) => {}),
  writePhoneOutbox: vi.fn(async (_content: string) => {}),
  setPhoneCompanion: vi.fn(async (_on: boolean) => ({})),
  saveScratchpadDrafts: vi.fn(async (_drafts: Record<string, string>) => {}), // flushAllPendingSaves saves drafts too
  appendLog: vi.fn(async (_level: string, _msg: string) => {}),
}));
vi.mock("./tauriApi", () => apiMock);

import { scheduleSave } from "./persistence";
import { phoneCompanionEnabled, resetPhoneCompanionForTests } from "./phoneCompanion";
import {
  phoneConflicts,
  phoneInboxRun,
  pollPhoneInbox,
  processPhoneInbox,
  phoneConflictNote,
  resetPhoneInboxForTests,
  resolvePhoneConflict,
} from "./phoneInbox";
import { appVersion, backendKind, currentDateISO, notesDir, tabs } from "./stores";

const TODAY = "2026-10-30";
const NOTE = "2026-10-30.txt";

type Raw = Record<string, unknown>;
const addLine = (id: string, text: string, extra: Raw = {}): Raw => ({
  id,
  type: "addLine",
  date: TODAY,
  section: "Standup",
  text,
  ...extra,
});
const setState = (id: string, line: string, state: string, extra: Raw = {}): Raw => ({
  id,
  type: "setState",
  date: TODAY,
  section: "Standup",
  line,
  n: 3,
  state,
  ...extra,
});
const inboxOf = (requests: unknown[], format = 1) => JSON.stringify({ format, writer: "test", requests });

function ledger(): { format: number; handled: Record<string, { result: string; reason?: string; at: string; request: Raw }> } {
  return JSON.parse(disk.ledger!);
}
function lastOutbox(): { results: { id: string; result: string; reason?: string; at: string }[] } {
  return JSON.parse(apiMock.writePhoneOutbox.mock.calls.at(-1)![0]);
}

describe("processPhoneInbox", () => {
  beforeEach(() => {
    resetPhoneCompanionForTests();
    resetPhoneInboxForTests();
    for (const fn of Object.values(apiMock)) fn.mockClear();
    backendKind.set("desktop");
    phoneCompanionEnabled.set(true);
    currentDateISO.set(TODAY);
    appVersion.set("0.36.0");
    disk.files = { [NOTE]: "Day\n\nStandup\n=======\n# a\n" };
    disk.inbox = null;
    disk.ledger = null;
    tabs.set([]);
  });

  it("applies an addLine to a closed note through updateNoteOnDisk, keeping the earlier text as a version", async () => {
    disk.inbox = inboxOf([addLine("r1", "o hiring plan")]);
    const run = await processPhoneInbox();
    expect(disk.files[NOTE]).toBe("Day\n\nStandup\n=======\n# a\no hiring plan\n");
    expect(apiMock.writeNote).toHaveBeenCalledTimes(1);
    expect(apiMock.writeNote).toHaveBeenCalledWith(NOTE, disk.files[NOTE], expect.anything(), { keepVersion: true });
    expect(run!.applied.map((e) => e.request.id)).toEqual(["r1"]);
    expect(run!.conflicts).toEqual([]);
    expect(run!.rejected).toEqual([]);
    expect(get(phoneInboxRun)).toEqual(run);
  });

  it("creates a note that doesn't exist yet, and uses the day's agenda to place a new section", async () => {
    disk.files = { [NOTE]: "A\n===\n# a\n\nC\n===\n# c\n" };
    apiMock.readAgendaForDate.mockResolvedValueOnce(["A", "B", "C"]);
    disk.inbox = inboxOf([addLine("r1", "o x", { section: "B" }), addLine("r2", "o y", { date: "2026-10-31", section: "B" })]);
    await processPhoneInbox();
    expect(apiMock.readAgendaForDate).toHaveBeenCalledWith(TODAY);
    expect(disk.files[NOTE]).toBe("A\n===\n# a\n\nB\n===\no x\n\nC\n===\n# c\n");
    expect(disk.files["2026-10-31.txt"]).toBe("B\n===\no y\n");
  });

  it("falls back to the end of the note when the agenda can't be read", async () => {
    apiMock.readAgendaForDate.mockRejectedValueOnce(new Error("no agenda"));
    disk.inbox = inboxOf([addLine("r1", "o x", { section: "Other" })]);
    await processPhoneInbox();
    expect(disk.files[NOTE]).toBe("Day\n\nStandup\n=======\n# a\n\nOther\n=====\no x\n");
  });

  it("applies the requests of one note in order, each to the text the previous left", async () => {
    disk.inbox = inboxOf([addLine("r1", "# b"), setState("r2", "# b", "done", { n: 4 })]);
    await processPhoneInbox();
    expect(disk.files[NOTE]).toBe("Day\n\nStandup\n=======\n# a\nv b\n");
    expect(apiMock.writeNote).toHaveBeenCalledTimes(1);
    expect(ledger().handled.r2.result).toBe("applied");
  });

  it("applies to an open tab through the tab, and writes it with keepVersion", async () => {
    tabs.set([{ id: "t1", filename: NOTE, isScratchpad: false, content: "Day\n\nStandup\n=======\n# a\nunsaved\n" }]);
    disk.inbox = inboxOf([addLine("r1", "o from phone")]);
    await processPhoneInbox();
    expect(get(tabs)[0].content).toBe("Day\n\nStandup\n=======\n# a\nunsaved\no from phone\n");
    expect(apiMock.readNoteWithMetadata).not.toHaveBeenCalled();
    expect(apiMock.writeNote).toHaveBeenCalledTimes(1);
    expect(apiMock.writeNote).toHaveBeenCalledWith(NOTE, get(tabs)[0].content, undefined, { keepVersion: true });
    expect(ledger().handled.r1.result).toBe("applied");
  });

  it("an open tab whose write fails gets its text back, and the request stays unhandled for the next run", async () => {
    const before = "Day\n\nStandup\n=======\n# a\n";
    tabs.set([{ id: "t1", filename: NOTE, isScratchpad: false, content: before }]);
    apiMock.writeNote.mockRejectedValueOnce(new Error("disk full"));
    disk.inbox = inboxOf([addLine("r1", "o from phone")]);
    const run = await processPhoneInbox();
    expect(get(tabs)[0].content).toBe(before);
    expect(run!.applied).toEqual([]);
    expect(disk.ledger === null || !("r1" in ledger().handled)).toBe(true);
    expect(lastOutbox().results).toEqual([]);
    await processPhoneInbox();
    expect(get(tabs)[0].content).toBe(before + "o from phone\n");
    expect(ledger().handled.r1.result).toBe("applied");
  });

  it("a failed ledger save doesn't make this session apply a request twice", async () => {
    apiMock.writePhoneLedger.mockRejectedValueOnce(new Error("locked"));
    disk.inbox = inboxOf([addLine("r1", "o x")]);
    await processPhoneInbox();
    await processPhoneInbox();
    expect(disk.files[NOTE]).toBe("Day\n\nStandup\n=======\n# a\no x\n");
    // The next run saves it after all.
    expect(ledger().handled.r1.result).toBe("applied");
  });

  it("a setState for a day without a note is a conflict and creates no file", async () => {
    disk.inbox = inboxOf([setState("r1", "# a", "done", { date: "2026-11-02" })]);
    await processPhoneInbox();
    expect("2026-11-02.txt" in disk.files).toBe(false);
    expect(ledger().handled.r1).toMatchObject({ result: "conflict", reason: "lineChanged" });
  });

  it("does not treat a scratchpad with that name as the note's tab", async () => {
    tabs.set([{ id: "s1", filename: NOTE, isScratchpad: true, content: "" }]);
    disk.inbox = inboxOf([addLine("r1", "o x")]);
    await processPhoneInbox();
    expect(get(tabs)[0].content).toBe("");
    expect(disk.files[NOTE]).toContain("o x");
  });

  it("writes nothing when a request changes nothing (the line already has the state)", async () => {
    disk.files[NOTE] = "Day\n\nStandup\n=======\nv a\n";
    disk.inbox = inboxOf([setState("r1", "# a", "done", { n: 5 })]);
    const run = await processPhoneInbox();
    expect(apiMock.writeNote).not.toHaveBeenCalled();
    expect(run!.applied).toHaveLength(1);
    expect(ledger().handled.r1.result).toBe("applied");
  });

  it("records the results, reasons and times in the ledger and holds conflicts and rejects", async () => {
    disk.inbox = inboxOf([
      setState("ok", "# a", "done", { n: 5 }),
      setState("gone", "# nowhere", "done"),
      setState("bad", "Day", "done", { section: undefined, n: 1 }), // plain text, not an action
      { id: "broken", type: "addLine", date: "nope", text: "x" },
      { type: "addLine" },
    ]);
    const run = await processPhoneInbox();
    expect(disk.files[NOTE]).toBe("Day\n\nStandup\n=======\nv a\n");
    const handled = ledger().handled;
    expect(ledger().format).toBe(1);
    expect(Object.keys(handled)).toEqual(expect.arrayContaining(["ok", "gone", "bad", "broken"]));
    expect(Object.keys(handled)).toHaveLength(4); // the request without an id is skipped silently
    expect(handled.ok).toMatchObject({ result: "applied", request: { id: "ok", type: "setState" } });
    expect(handled.ok.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(handled.gone).toMatchObject({ result: "conflict", reason: "lineChanged" });
    expect(handled.bad).toMatchObject({ result: "rejected", reason: "invalid" });
    expect(handled.broken).toMatchObject({ result: "rejected", reason: "invalid" });
    expect(run!.applied.map((e) => e.request.id)).toEqual(["ok"]);
    expect(run!.conflicts.map((e) => e.request.id)).toEqual(["gone"]);
    expect(run!.rejected.map((e) => e.request.id)).toEqual(["bad", "broken"]);
    expect(get(phoneConflicts).map((e) => e.request.id)).toEqual(["gone"]);
  });

  it("does not apply an id that is in the ledger again, whatever its result", async () => {
    disk.inbox = inboxOf([addLine("r1", "o x"), setState("c1", "# nowhere", "done")]);
    await processPhoneInbox();
    expect(apiMock.writeNote).toHaveBeenCalledTimes(1);
    const after = disk.files[NOTE];
    apiMock.writeNote.mockClear();
    const run = await processPhoneInbox();
    expect(apiMock.writeNote).not.toHaveBeenCalled();
    expect(disk.files[NOTE]).toBe(after);
    expect(run).toMatchObject({ applied: [], conflicts: [], rejected: [] });
    expect(get(phoneConflicts)).toHaveLength(1); // still held
    // also with a ledger from an earlier session
    resetPhoneInboxForTests();
    expect((await processPhoneInbox())!.applied).toEqual([]);
    expect(apiMock.writeNote).not.toHaveBeenCalled();
  });

  it("handles a repeated id in one inbox once", async () => {
    disk.inbox = inboxOf([addLine("r1", "o x"), addLine("r1", "o y")]);
    await processPhoneInbox();
    expect(disk.files[NOTE]).toContain("o x");
    expect(disk.files[NOTE]).not.toContain("o y");
  });

  it("drops ledger entries whose id is no longer in the inbox", async () => {
    disk.inbox = inboxOf([addLine("r1", "o x"), addLine("r2", "o y")]);
    await processPhoneInbox();
    expect(Object.keys(ledger().handled).sort()).toEqual(["r1", "r2"]);
    disk.inbox = inboxOf([addLine("r2", "o y")]);
    await processPhoneInbox();
    expect(Object.keys(ledger().handled)).toEqual(["r2"]);
    expect(lastOutbox().results.map((r) => r.id)).toEqual(["r2"]);
  });

  it("a missing inbox file (OneDrive can hide one while syncing) keeps the ledger and results, and changes no note", async () => {
    disk.inbox = inboxOf([addLine("r1", "o x")]);
    await processPhoneInbox();
    const outboxWrites = apiMock.writePhoneOutbox.mock.calls.length;
    apiMock.writeNote.mockClear();
    disk.inbox = null;
    const run = await processPhoneInbox();
    expect(run).toMatchObject({ applied: [], conflicts: [], rejected: [] });
    expect(Object.keys(ledger().handled)).toEqual(["r1"]);
    expect(apiMock.writeNote).not.toHaveBeenCalled();
    expect(apiMock.writePhoneOutbox.mock.calls.length).toBe(outboxWrites);
    // Back with the same request: not applied a second time.
    disk.inbox = inboxOf([addLine("r1", "o x")]);
    await processPhoneInbox();
    expect(apiMock.writeNote).not.toHaveBeenCalled();
  });

  it("a newer format rejects every request not yet handled, without touching notes", async () => {
    disk.inbox = inboxOf([addLine("r1", "o x"), { id: "r2", type: "future" }], 2);
    const run = await processPhoneInbox();
    expect(apiMock.writeNote).not.toHaveBeenCalled();
    expect(run!.rejected.map((e) => e.request.id)).toEqual(["r1", "r2"]);
    expect(ledger().handled.r1).toMatchObject({ result: "rejected", reason: "format" });
    expect(ledger().handled.r2).toMatchObject({ result: "rejected", reason: "format" });
    expect(lastOutbox().results).toEqual([
      { id: "r1", result: "rejected", reason: "format", at: expect.any(String) },
      { id: "r2", result: "rejected", reason: "format", at: expect.any(String) },
    ]);
  });

  it("a broken inbox changes no note or ledger, and the outbox keeps the known results", async () => {
    disk.files = { [NOTE]: "x\n" };
    disk.ledger = JSON.stringify({ format: 1, handled: { old: { result: "applied", at: "2026-10-29T09:00:00+01:00", request: {} } } });
    for (const text of ["{ not json", "[]", '{"format":1}', "", "\uFEFF"]) {
      disk.inbox = text;
      await processPhoneInbox();
    }
    expect(apiMock.writeNote).not.toHaveBeenCalled();
    expect(apiMock.writePhoneLedger).not.toHaveBeenCalled();
    expect(Object.keys(ledger().handled)).toEqual(["old"]);
    expect(lastOutbox().results).toEqual([{ id: "old", result: "applied", at: "2026-10-29T09:00:00+01:00" }]);
  });

  it("an inbox that can't be read (too large) is treated as broken", async () => {
    apiMock.readPhoneInbox.mockRejectedValueOnce(new Error("inbox too large"));
    expect(await processPhoneInbox()).toMatchObject({ applied: [], conflicts: [], rejected: [] });
    expect(apiMock.writeNote).not.toHaveBeenCalled();
    expect(apiMock.writePhoneLedger).not.toHaveBeenCalled();
  });

  it("an unreadable ledger counts as empty", async () => {
    disk.ledger = "garbage{";
    disk.inbox = inboxOf([addLine("r1", "o x")]);
    await processPhoneInbox();
    expect(ledger().handled.r1.result).toBe("applied");
  });

  it("does nothing when the setting is off or this is not the desktop app", async () => {
    disk.inbox = inboxOf([addLine("r1", "o x")]);
    phoneCompanionEnabled.set(false);
    expect(await processPhoneInbox()).toBeNull();
    phoneCompanionEnabled.set(true);
    backendKind.set("web");
    expect(await processPhoneInbox()).toBeNull();
    expect(apiMock.readPhoneInbox).not.toHaveBeenCalled();
    expect(apiMock.readPhoneLedger).not.toHaveBeenCalled();
    expect(apiMock.writeNote).not.toHaveBeenCalled();
    expect(apiMock.writePhoneLedger).not.toHaveBeenCalled();
    expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();
  });

  it("gives the outbox the results (setOutboxResults, then the outbox is rebuilt) once the notes are written", async () => {
    disk.inbox = inboxOf([addLine("r1", "o x"), setState("c1", "# nowhere", "done"), addLine("r2", "o y")]);
    apiMock.writeNote.mockImplementationOnce(async (name: string, content: string) => {
      // the outbox is not written before this note is
      expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();
      disk.files[name] = content;
      return { exists: true, contentHash: null, sizeBytes: null, modifiedMs: null };
    });
    await processPhoneInbox();
    expect(apiMock.writePhoneOutbox).toHaveBeenCalled();
    expect(lastOutbox().results).toEqual([
      { id: "r1", result: "applied", at: expect.any(String) },
      { id: "c1", result: "conflict", reason: "lineChanged", at: expect.any(String) },
      { id: "r2", result: "applied", at: expect.any(String) },
    ]);
  });

  it("leaves the requests of a note whose write failed out of the ledger, and retries them next run", async () => {
    disk.inbox = inboxOf([addLine("r1", "o x"), addLine("r2", "o y", { date: "2026-10-31" })]);
    apiMock.writeNote.mockImplementationOnce(async () => {
      throw new Error("disk full");
    });
    const run = await processPhoneInbox();
    expect(Object.keys(ledger().handled)).toEqual(["r2"]); // r1's note failed
    expect(run!.applied.map((e) => e.request.id)).toEqual(["r2"]);
    expect(lastOutbox().results.map((r) => r.id)).toEqual(["r2"]);
    await processPhoneInbox();
    expect(Object.keys(ledger().handled).sort()).toEqual(["r1", "r2"]);
    expect(disk.files[NOTE]).toContain("o x");
  });

  it("a call while a run is in progress waits for it and runs once more", async () => {
    disk.inbox = inboxOf([addLine("r1", "o x")]);
    const first = processPhoneInbox();
    disk.inbox = inboxOf([addLine("r1", "o x"), addLine("r2", "o y")]);
    const second = processPhoneInbox();
    await Promise.all([first, second]);
    expect(Object.keys(ledger().handled).sort()).toEqual(["r1", "r2"]);
    expect(disk.files[NOTE]).toContain("o y");
  });

  it("uses a section's body only: a setState does not touch an equal line elsewhere", async () => {
    disk.files[NOTE] = "Day\n\nStandup\n=======\n# a\n\nOther\n=====\n# a\n";
    disk.inbox = inboxOf([setState("r1", "# a", "done", { section: "Other", n: 9 })]);
    await processPhoneInbox();
    expect(disk.files[NOTE]).toBe("Day\n\nStandup\n=======\n# a\n\nOther\n=====\nv a\n");
  });

  describe("pollPhoneInbox", () => {
    it("runs only when the inbox's text differs from the last one handled", async () => {
      disk.inbox = inboxOf([addLine("r1", "o x")]);
      expect(await pollPhoneInbox()).not.toBeNull();
      expect(await pollPhoneInbox()).toBeNull();
      expect(apiMock.writeNote).toHaveBeenCalledTimes(1);
      disk.inbox = inboxOf([addLine("r1", "o x"), addLine("r2", "o y")]);
      expect((await pollPhoneInbox())!.applied.map((e) => e.request.id)).toEqual(["r2"]);
      expect(await pollPhoneInbox()).toBeNull();
    });

    it("does nothing when inactive", async () => {
      phoneCompanionEnabled.set(false);
      disk.inbox = inboxOf([addLine("r1", "o x")]);
      expect(await pollPhoneInbox()).toBeNull();
      expect(apiMock.readPhoneInbox).not.toHaveBeenCalled();
    });
  });

  describe("resolvePhoneConflict", () => {
    it("skip turns a held conflict into rejected / skipped, saves the ledger and republishes the results", async () => {
      disk.inbox = inboxOf([setState("c1", "# nowhere", "done"), addLine("r1", "o x")]);
      await processPhoneInbox();
      expect(get(phoneConflicts)).toHaveLength(1);
      await resolvePhoneConflict("c1", "skip");
      expect(ledger().handled.c1).toMatchObject({ result: "rejected", reason: "skipped" });
      expect(get(phoneConflicts)).toEqual([]);
      expect(lastOutbox().results).toEqual([
        { id: "c1", result: "rejected", reason: "skipped", at: expect.any(String) },
        { id: "r1", result: "applied", at: expect.any(String) },
      ]);
    });

    it("ignores an id that is not a held conflict", async () => {
      disk.inbox = inboxOf([addLine("r1", "o x")]);
      await processPhoneInbox();
      apiMock.writePhoneLedger.mockClear();
      await resolvePhoneConflict("r1", "skip");
      await resolvePhoneConflict("unknown", "skip");
      expect(apiMock.writePhoneLedger).not.toHaveBeenCalled();
      expect(ledger().handled.r1.result).toBe("applied");
    });

    it("resolve to a line applies and records applied and saves the ledger", async () => {
      disk.files[NOTE] = "Day\n\nStandup\n=======\n# call the venue\n# book the room\n";
      disk.inbox = inboxOf([setState("c1", "# nowhere", "done")]);
      await processPhoneInbox();
      expect(get(phoneConflicts)).toHaveLength(1);

      apiMock.writePhoneLedger.mockClear();
      const res = await resolvePhoneConflict("c1", { line: 5, text: "# book the room" });
      expect(res).toBe("done");
      expect(disk.files[NOTE]).toContain("v book the room");
      expect(ledger().handled.c1).toMatchObject({ result: "applied", at: expect.any(String) });
      expect(get(phoneConflicts)).toEqual([]);
      expect(apiMock.writePhoneLedger).toHaveBeenCalled();
      expect(lastOutbox().results).toEqual([
        { id: "c1", result: "applied", at: expect.any(String) },
      ]);
    });

    it("the line changed -> noteChanged, nothing written", async () => {
      disk.files[NOTE] = "Day\n\nStandup\n=======\n# call the venue\n# book the room\n";
      disk.inbox = inboxOf([setState("c1", "# nowhere", "done")]);
      await processPhoneInbox();
      expect(get(phoneConflicts)).toHaveLength(1);

      apiMock.writeNote.mockClear();
      apiMock.writePhoneLedger.mockClear();
      const res = await resolvePhoneConflict("c1", { line: 4, text: "# modified line" });
      expect(res).toBe("noteChanged");
      expect(apiMock.writeNote).not.toHaveBeenCalled();
      expect(apiMock.writePhoneLedger).not.toHaveBeenCalled();
      expect(ledger().handled.c1.result).toBe("conflict");
      expect(get(phoneConflicts)).toHaveLength(1);
    });

    it("add adds the line with the requested state's symbol in the section", async () => {
      disk.files[NOTE] = "Day\n\nStandup\n=======\n# a\n";
      disk.inbox = inboxOf([setState("c1", "# missing action", "done")]);
      await processPhoneInbox();
      expect(get(phoneConflicts)).toHaveLength(1);

      const res = await resolvePhoneConflict("c1", "add");
      expect(res).toBe("done");
      expect(disk.files[NOTE]).toBe("Day\n\nStandup\n=======\n# a\nv missing action\n");
      expect(ledger().handled.c1).toMatchObject({ result: "applied", at: expect.any(String) });
      expect(get(phoneConflicts)).toEqual([]);
    });

    it("write failure -> failed, still a conflict", async () => {
      disk.files[NOTE] = "Day\n\nStandup\n=======\n# a\n";
      disk.inbox = inboxOf([setState("c1", "# missing action", "done")]);
      await processPhoneInbox();
      expect(get(phoneConflicts)).toHaveLength(1);

      apiMock.writeNote.mockRejectedValueOnce(new Error("disk full"));
      const res = await resolvePhoneConflict("c1", "add");
      expect(res).toBe("failed");
      expect(ledger().handled.c1.result).toBe("conflict");
      expect(get(phoneConflicts)).toHaveLength(1);
    });

    it("unknown id -> gone", async () => {
      const res = await resolvePhoneConflict("unknown", "skip");
      expect(res).toBe("gone");
    });

    it("open tab path: modifies open tab and keeps version", async () => {
      const content = "Day\n\nStandup\n=======\n# call\n";
      tabs.set([
        {
          id: "tab1",
          filename: NOTE,
          title: "Today",
          content,
          isScratchpad: false,
          cleanHash: "hash1",
        } as any,
      ]);
      disk.inbox = inboxOf([setState("c1", "# nowhere", "done")]);
      await processPhoneInbox();
      expect(get(phoneConflicts)).toHaveLength(1);

      const res = await resolvePhoneConflict("c1", { line: 4, text: "# call" });
      expect(res).toBe("done");
      expect(get(tabs)[0].content).toBe("Day\n\nStandup\n=======\nv call\n");
      expect(ledger().handled.c1).toMatchObject({ result: "applied" });
    });

    it("phoneConflictNote returns open tab content, else disk content, else empty string", async () => {
      disk.files[NOTE] = "disk content";
      expect(await phoneConflictNote(TODAY)).toBe("disk content");
      expect(await phoneConflictNote("2099-01-01")).toBe("");

      tabs.set([
        {
          id: "tab1",
          filename: NOTE,
          title: "Today",
          content: "tab content",
          isScratchpad: false,
          cleanHash: "hash1",
        } as any,
      ]);
      expect(await phoneConflictNote(TODAY)).toBe("tab content");
    });

  });

  describe("ledger loading", () => {
    it("ignores a ledger whose format is not 1", async () => {
      disk.ledger = JSON.stringify({
        format: 2,
        handled: {
          r1: { result: "applied", at: "2026-10-30T09:00:00+01:00", request: addLine("r1", "o x") },
        },
      });
      disk.inbox = inboxOf([addLine("r1", "o x")]);
      await processPhoneInbox();
      expect(disk.files[NOTE]).toContain("o x");
    });

    it("ignores a ledger whose handled field is not an object", async () => {
      disk.ledger = JSON.stringify({ format: 1, handled: "not-an-object" });
      disk.inbox = inboxOf([addLine("r1", "o x")]);
      await processPhoneInbox();
      expect(disk.files[NOTE]).toContain("o x");

      resetPhoneInboxForTests();
      disk.files[NOTE] = "Day\n\nStandup\n=======\n# a\n";
      disk.ledger = JSON.stringify({ format: 1, handled: null });
      await processPhoneInbox();
      expect(disk.files[NOTE]).toContain("o x");
    });

    it("ignores a ledger whose handled field is an array, even when it holds valid entries", async () => {
      disk.ledger = JSON.stringify({
        format: 1,
        handled: [
          { result: "applied", at: "2026-10-30T09:00:00+01:00", request: addLine("0", "o from array") },
        ],
      });
      disk.inbox = inboxOf([addLine("0", "o from array")]);
      await processPhoneInbox();
      expect(disk.files[NOTE]).toContain("o from array");
    });

    it("ignores invalid ledger entries while keeping valid applied, conflict and rejected entries beside them", async () => {
      disk.ledger = JSON.stringify({
        format: 1,
        handled: {
          badNull: null,
          badArray: [],
          badString: "applied",
          badResult: { result: "unknown", at: "2026-10-30T09:00:00+01:00", request: addLine("badResult", "o badResult") },
          emptyResult: { result: "", at: "2026-10-30T09:00:00+01:00", request: addLine("emptyResult", "o emptyResult") },
          missingAt: { result: "applied", request: addLine("missingAt", "o missingAt") },
          nonStringAt: { result: "applied", at: 123, request: addLine("nonStringAt", "o nonStringAt") },
          goodApplied: { result: "applied", at: "2026-10-30T09:00:00+01:00", request: addLine("goodApplied", "o goodApplied") },
          goodConflict: {
            result: "conflict",
            reason: "lineChanged",
            at: "2026-10-30T09:00:00+01:00",
            request: addLine("goodConflict", "o goodConflict"),
          },
          goodRejected: {
            result: "rejected",
            reason: "invalid",
            at: "2026-10-30T09:00:00+01:00",
            request: addLine("goodRejected", "o goodRejected"),
          },
        },
      });
      disk.inbox = inboxOf([
        addLine("badNull", "o badNull"),
        addLine("badArray", "o badArray"),
        addLine("badString", "o badString"),
        addLine("badResult", "o badResult"),
        addLine("emptyResult", "o emptyResult"),
        addLine("missingAt", "o missingAt"),
        addLine("nonStringAt", "o nonStringAt"),
        addLine("goodApplied", "o goodApplied"),
        addLine("goodConflict", "o goodConflict"),
        addLine("goodRejected", "o goodRejected"),
      ]);

      await processPhoneInbox();

      for (const kept of ["goodApplied", "goodConflict", "goodRejected"]) {
        expect(disk.files[NOTE]).not.toContain(`o ${kept}`);
      }
      for (const ignored of ["badNull", "badArray", "badString", "badResult", "emptyResult", "missingAt", "nonStringAt"]) {
        expect(disk.files[NOTE]).toContain(`o ${ignored}`);
      }
      expect(get(phoneConflicts).map((e) => e.request.id)).toEqual(["goodConflict"]);
      expect(lastOutbox().results.find((r) => r.id === "goodRejected")?.result).toBe("rejected");
    });

    it("does not reuse an in-memory ledger when the notes folder changes", async () => {
      const prevDir = get(notesDir);
      try {
        notesDir.set("/notes-a");
        disk.inbox = inboxOf([addLine("r1", "o x")]);
        await processPhoneInbox();
        expect(disk.files[NOTE]).toContain("o x");

        notesDir.set("/notes-b");
        disk.files = { [NOTE]: "Day\n\nStandup\n=======\n# a\n" };
        disk.ledger = null;
        await processPhoneInbox();
        expect(disk.files[NOTE]).toContain("o x");
      } finally {
        notesDir.set(prevDir);
      }
    });

    it("does not re-read or re-save the ledger when the folder and inbox entries are unchanged", async () => {
      disk.ledger = JSON.stringify({
        format: 1,
        handled: {
          r1: { result: "applied", at: "2026-10-30T09:00:00+01:00", request: addLine("r1", "o x") },
        },
      });
      disk.inbox = inboxOf([addLine("r1", "o x")]);
      apiMock.readPhoneLedger.mockClear();
      apiMock.writePhoneLedger.mockClear();

      await processPhoneInbox();
      expect(apiMock.readPhoneLedger).toHaveBeenCalledTimes(1);
      expect(apiMock.writePhoneLedger).not.toHaveBeenCalled();

      await processPhoneInbox();
      expect(apiMock.readPhoneLedger).toHaveBeenCalledTimes(1);
      expect(apiMock.writePhoneLedger).not.toHaveBeenCalled();
    });

    it("does not mark the in-memory ledger dirty after saving so an unchanged follow-up run does not rewrite it", async () => {
      disk.inbox = inboxOf([addLine("r1", "o x")]);
      await processPhoneInbox();
      expect(apiMock.writePhoneLedger).toHaveBeenCalledTimes(1);

      apiMock.writePhoneLedger.mockClear();
      await processPhoneInbox();
      expect(apiMock.writePhoneLedger).not.toHaveBeenCalled();
    });
  });

  describe("phoneConflictNote", () => {
    it("ignores a scratchpad tab whose filename equals the date note and falls back to the file", async () => {
      disk.files[NOTE] = "disk content";
      tabs.set([{ id: "s1", filename: NOTE, isScratchpad: true, content: "scratchpad content" }]);
      expect(await phoneConflictNote(TODAY)).toBe("disk content");
    });

    it("uses the real open tab rather than a scratchpad tab with the same filename", async () => {
      disk.files[NOTE] = "disk content";
      tabs.set([
        { id: "s1", filename: NOTE, isScratchpad: true, content: "scratchpad content" },
        { id: "t1", filename: NOTE, isScratchpad: false, content: "real tab content" },
      ]);
      expect(await phoneConflictNote(TODAY)).toBe("real tab content");
    });

    it("ignores open tabs for other dates and reads the disk file", async () => {
      disk.files[NOTE] = "disk content";
      tabs.set([{ id: "other", filename: "2026-10-29.txt", isScratchpad: false, content: "other tab" }]);
      expect(await phoneConflictNote(TODAY)).toBe("disk content");
    });

    it("returns an empty string when the note file is missing or cannot be read", async () => {
      expect(await phoneConflictNote("2099-01-01")).toBe("");
      apiMock.readNoteWithMetadata.mockRejectedValueOnce(new Error("read failed"));
      expect(await phoneConflictNote(TODAY)).toBe("");
    });
  });

  describe("data safety and edge rules", () => {
    it("saves the ledger with a trailing newline and omits reason on applied entries", async () => {
      disk.inbox = inboxOf([addLine("r1", "o x")]);
      const run = await processPhoneInbox();
      expect(disk.ledger?.endsWith("\n")).toBe(true);
      expect(run!.applied).toHaveLength(1);
      expect("reason" in run!.applied[0]).toBe(false);
    });

    it("emits one outbox result per distinct request id when an id is repeated in the inbox", async () => {
      disk.inbox = inboxOf([addLine("r1", "o x"), addLine("r1", "o y")]);
      const run = await processPhoneInbox();
      expect(run!.applied.map((e) => e.request.id)).toEqual(["r1"]);
      expect(lastOutbox().results).toEqual([{ id: "r1", result: "applied", at: expect.any(String) }]);
    });

    it("skips requests with an empty string id silently without recording them in the ledger or outbox", async () => {
      disk.inbox = inboxOf([{ id: "", type: "addLine", date: TODAY, text: "o bad" }, addLine("r1", "o ok")]);
      const run = await processPhoneInbox();
      expect(disk.files[NOTE]).not.toContain("o bad");
      expect(disk.files[NOTE]).toContain("o ok");
      expect(Object.keys(ledger().handled)).toEqual(["r1"]);
      expect(run!.rejected).toEqual([]);
      expect(lastOutbox().results.map((r) => r.id)).toEqual(["r1"]);
    });

    it("sorts run results in inbox order when requests for multiple dates are interleaved", async () => {
      disk.files["2026-10-31.txt"] = "Day\n\nStandup\n=======\n";
      disk.inbox = inboxOf([
        addLine("r1", "o first", { date: TODAY }),
        addLine("r2", "o middle", { date: "2026-10-31" }),
        addLine("r3", "o last", { date: TODAY }),
      ]);
      const run = await processPhoneInbox();
      expect(run!.applied.map((e) => e.request.id)).toEqual(["r1", "r2", "r3"]);
    });

    it("calls readAgendaForDate only when a note's batch includes an addLine request", async () => {
      disk.inbox = inboxOf([setState("s1", "# a", "done", { n: 5 })]);
      await processPhoneInbox();
      expect(apiMock.readAgendaForDate).not.toHaveBeenCalled();

      disk.files[NOTE] = "A\n===\n# a\n\nC\n===\n# c\n";
      apiMock.readAgendaForDate.mockResolvedValueOnce(["A", "B", "C"]);
      disk.inbox = inboxOf([
        setState("s2", "# a", "done", { section: "A", n: 3 }),
        addLine("a1", "o x", { section: "B" }),
      ]);
      await processPhoneInbox();
      expect(apiMock.readAgendaForDate).toHaveBeenCalledWith(TODAY);
      expect(disk.files[NOTE]).toBe("A\n===\nv a\n\nB\n===\no x\n\nC\n===\n# c\n");
    });

    it("modifies only the matching open tab when other dated tabs are open, and skips writing when unchanged", async () => {
      tabs.set([
        { id: "t-other", filename: "2026-10-29.txt", isScratchpad: false, content: "Day\n\nStandup\n=======\n# other\n" },
        { id: "t-today", filename: NOTE, isScratchpad: false, content: "Day\n\nStandup\n=======\nv a\n" },
      ]);
      disk.inbox = inboxOf([setState("s1", "# a", "done", { n: 5 })]);
      const run = await processPhoneInbox();
      expect(run!.applied).toHaveLength(1);
      expect(apiMock.writeNote).not.toHaveBeenCalled();
      expect(get(tabs)[0].content).toBe("Day\n\nStandup\n=======\n# other\n");

      // Only the other date is open: request for TODAY goes to disk, leaving t-other untouched.
      tabs.set([{ id: "t-other", filename: "2026-10-29.txt", isScratchpad: false, content: "other content\n" }]);
      disk.inbox = inboxOf([addLine("r2", "o disk")]);
      await processPhoneInbox();
      expect(get(tabs)[0].content).toBe("other content\n");
      expect(disk.files[NOTE]).toContain("o disk");
    });

    it("fails safely and leaves requests unhandled if an open tab closes while pending saves flush", async () => {
      const tab = { id: "t1", filename: NOTE, isScratchpad: false, content: "Day\n\nStandup\n=======\n# a\n" };
      tabs.set([tab]);
      scheduleSave(tab);
      apiMock.writeNote.mockImplementationOnce(async (name: string, content: string) => {
        disk.files[name] = content;
        tabs.set([]); // user closes the tab during the flush
        return { exists: true, contentHash: null, sizeBytes: null, modifiedMs: null };
      });
      disk.inbox = inboxOf([addLine("r1", "o from phone")]);

      const run = await processPhoneInbox();
      expect(run!.applied).toEqual([]);
      expect(disk.ledger === null || !("r1" in ledger().handled)).toBe(true);
      expect(disk.files[NOTE]).not.toContain("o from phone");

      // Next run applies it to disk after all.
      await processPhoneInbox();
      expect(disk.files[NOTE]).toContain("o from phone");
      expect(ledger().handled.r1.result).toBe("applied");
    });

    it("logs warnings on note write failure and ledger save failure", async () => {
      disk.inbox = inboxOf([addLine("r1", "o x")]);
      apiMock.writeNote.mockRejectedValueOnce(new Error("disk full"));
      await processPhoneInbox();
      expect(apiMock.appendLog).toHaveBeenCalledWith("WARN", expect.stringContaining(`applying to ${NOTE} failed`));

      apiMock.appendLog.mockClear();
      apiMock.writePhoneLedger.mockRejectedValueOnce(new Error("ledger locked"));
      await processPhoneInbox();
      expect(apiMock.appendLog).toHaveBeenCalledWith("WARN", expect.stringContaining("saving the ledger failed"));
    });

    it("rebuilds the outbox with a fresh disk read after processPhoneInbox", async () => {
      disk.inbox = inboxOf([addLine("r1", "o x")]);
      await processPhoneInbox();
      expect(apiMock.readNote).toHaveBeenCalledWith(NOTE);
    });

    it("retries on the next pollPhoneInbox when a note write failed", async () => {
      disk.inbox = inboxOf([addLine("r1", "o retry")]);
      apiMock.writeNote.mockRejectedValueOnce(new Error("disk full"));
      await pollPhoneInbox();
      expect(disk.files[NOTE]).not.toContain("o retry");

      const retryRun = await pollPhoneInbox();
      expect(retryRun).not.toBeNull();
      expect(retryRun!.applied.map((e) => e.request.id)).toEqual(["r1"]);
      expect(disk.files[NOTE]).toContain("o retry");
    });

    it("keeps held conflicts populated and skips unchanged broken, unreadable, or missing inboxes on poll", async () => {
      disk.ledger = JSON.stringify({
        format: 1,
        handled: {
          c1: { result: "conflict", reason: "lineChanged", at: "2026-10-30T09:00:00+01:00", request: setState("c1", "# gone", "done") },
        },
      });

      // Missing inbox: populates held conflicts without logging a warning, and polls once until changed.
      disk.inbox = null;
      await pollPhoneInbox();
      expect(get(phoneConflicts).map((e) => e.request.id)).toEqual(["c1"]);
      expect(apiMock.appendLog).not.toHaveBeenCalled();
      expect(await pollPhoneInbox()).toBeNull();

      // Broken inbox: logs one warning for the broken streak, skips unchanged polls.
      disk.inbox = "{ bad json";
      await pollPhoneInbox();
      expect(get(phoneConflicts).map((e) => e.request.id)).toEqual(["c1"]);
      expect(apiMock.appendLog).toHaveBeenCalledTimes(1);
      expect(apiMock.appendLog).toHaveBeenLastCalledWith("WARN", expect.stringContaining("not a valid inbox file"));
      expect(await pollPhoneInbox()).toBeNull();

      // Different broken text: runs (new key) but does not repeat the warning while still broken.
      disk.inbox = "[]";
      await pollPhoneInbox();
      expect(apiMock.appendLog).toHaveBeenCalledTimes(1);

      // Valid inbox resets warnedBroken; a subsequent unreadable inbox logs again.
      disk.inbox = inboxOf([addLine("r1", "o ok")]);
      await pollPhoneInbox();
      expect(disk.files[NOTE]).toContain("o ok");

      // Unreadable inbox: logs the read error once and skips polling while the same error repeats.
      try {
        apiMock.readPhoneInbox.mockRejectedValue(new Error("inbox too large"));
        await pollPhoneInbox();
        expect(apiMock.appendLog).toHaveBeenCalledTimes(2);
        expect(apiMock.appendLog).toHaveBeenLastCalledWith("WARN", expect.stringContaining("inbox too large"));

        expect(await pollPhoneInbox()).toBeNull();

        apiMock.readPhoneInbox.mockRejectedValue(new Error("permission denied"));
        expect(await pollPhoneInbox()).not.toBeNull();
        expect(apiMock.appendLog).toHaveBeenCalledTimes(2); // still in the same broken streak

        // Valid inbox resets warnedBroken again; a subsequent broken inbox logs.
        apiMock.readPhoneInbox.mockImplementation(async () => disk.inbox);
        disk.inbox = inboxOf([addLine("r1", "o ok"), addLine("r2", "o ok2")]);
        await pollPhoneInbox();

        disk.inbox = "{ broken again";
        await pollPhoneInbox();
        expect(apiMock.appendLog).toHaveBeenCalledTimes(3);
        expect(await pollPhoneInbox()).toBeNull();
      } finally {
        apiMock.readPhoneInbox.mockImplementation(async () => disk.inbox);
      }
    });

    it("queues one rerun while in progress and skips the rerun if phone companion turns off mid-run", async () => {
      let releaseRead!: (v: string | null) => void;
      let markReadStarted!: () => void;
      const readStarted = new Promise<void>((r) => {
        markReadStarted = r;
      });
      apiMock.readPhoneInbox.mockImplementationOnce(
        () =>
          new Promise<string | null>((resolve) => {
            releaseRead = resolve;
            markReadStarted();
          }),
      );

      const first = processPhoneInbox();
      await readStarted;
      disk.inbox = inboxOf([addLine("r1", "o first"), addLine("r2", "o second")]);
      const second = processPhoneInbox();
      releaseRead(inboxOf([addLine("r1", "o first")]));

      const [rFirst, rSecond] = await Promise.all([first, second]);
      expect(rFirst!.applied.map((e) => e.request.id)).toEqual(["r2"]);
      expect(rSecond).toEqual(rFirst);
      expect(disk.files[NOTE]).toContain("o first");
      expect(disk.files[NOTE]).toContain("o second");

      // Turning off phone companion mid-run cancels the pending rerun.
      let releaseSecondRead!: (v: string | null) => void;
      let markSecondStarted!: () => void;
      const secondStarted = new Promise<void>((r) => {
        markSecondStarted = r;
      });
      apiMock.readPhoneInbox.mockImplementationOnce(
        () =>
          new Promise<string | null>((resolve) => {
            releaseSecondRead = resolve;
            markSecondStarted();
          }),
      );
      const runA = processPhoneInbox();
      await secondStarted;
      disk.inbox = inboxOf([addLine("r1", "o first"), addLine("r2", "o second"), addLine("r3", "o skipped")]);
      processPhoneInbox();
      phoneCompanionEnabled.set(false);
      releaseSecondRead(inboxOf([addLine("r1", "o first"), addLine("r2", "o second")]));
      await runA;
      expect(disk.files[NOTE]).not.toContain("o skipped");
    });

    it("resetPhoneInboxForTests clears phoneInboxRun, phoneConflicts and broken-warning state", async () => {
      disk.inbox = inboxOf([setState("c1", "# missing", "done")]);
      await processPhoneInbox();
      expect(get(phoneInboxRun)).not.toBeNull();
      expect(get(phoneConflicts)).toHaveLength(1);

      disk.inbox = "{ broken";
      await processPhoneInbox();
      expect(apiMock.appendLog).toHaveBeenCalledTimes(1);

      resetPhoneInboxForTests();
      expect(get(phoneInboxRun)).toBeNull();
      expect(get(phoneConflicts)).toEqual([]);

      await processPhoneInbox();
      expect(apiMock.appendLog).toHaveBeenCalledTimes(2);
    });

    describe("resolvePhoneConflict additional safety rules", () => {
      it("returns gone and writes nothing when phone companion is inactive or the conflict is not setState", async () => {
        disk.inbox = inboxOf([setState("c1", "# nowhere", "done")]);
        await processPhoneInbox();
        apiMock.writePhoneOutbox.mockClear();

        phoneCompanionEnabled.set(false);
        expect(await resolvePhoneConflict("c1", "skip")).toBe("gone");
        expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();

        phoneCompanionEnabled.set(true);
        resetPhoneInboxForTests();
        disk.ledger = JSON.stringify({
          format: 1,
          handled: {
            badConflict: { result: "conflict", reason: "lineChanged", at: "2026-10-30T09:00:00+01:00", request: addLine("badConflict", "o x") },
          },
        });
        expect(await resolvePhoneConflict("badConflict", "add")).toBe("gone");
        expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();
      });

      it("returns done on skip, updates outbox freshly, and falls back to ledger keys when inbox is missing", async () => {
        disk.inbox = inboxOf([addLine("r1", "o x"), setState("c1", "# nowhere", "done")]);
        await processPhoneInbox();
        apiMock.readNote.mockClear();
        apiMock.writePhoneOutbox.mockClear();

        // Missing inbox while resolving falls back to ledger order.
        disk.inbox = null;
        expect(await resolvePhoneConflict("c1", "skip")).toBe("done");
        expect(apiMock.readNote).toHaveBeenCalledWith(NOTE);
        expect(apiMock.writePhoneOutbox).toHaveBeenCalled();
        expect(lastOutbox().results.map((r) => r.id)).toEqual(["r1", "c1"]);
      });

      it("uses inbox request order (ignoring invalid/empty ids) and logs if saving the ledger fails during resolve", async () => {
        disk.inbox = inboxOf([setState("c1", "# nowhere", "done")]);
        await processPhoneInbox();
        // Ledger insertion order is [c1, r1].
        disk.inbox = inboxOf([setState("c1", "# nowhere", "done"), addLine("r1", "o x")]);
        await processPhoneInbox();
        // Reorder inbox to [r1, c1] with unreportable entries; resolve should still report in inbox order.
        disk.inbox = inboxOf([{ type: "addLine" }, { id: "", type: "addLine", date: TODAY, text: "o bad" }, addLine("r1", "o x"), setState("c1", "# nowhere", "done")]);
        apiMock.writePhoneLedger.mockRejectedValueOnce(new Error("ledger busy"));
        expect(await resolvePhoneConflict("c1", "skip")).toBe("done");
        expect(apiMock.appendLog).toHaveBeenCalledWith("WARN", expect.stringContaining("saving the ledger failed"));
        expect(lastOutbox().results.map((r) => r.id)).toEqual(["r1", "c1"]);
      });

      it("add choice places a new section in agenda order and falls back to end if agenda fails", async () => {
        disk.files[NOTE] = "A\n===\n# a\n\nC\n===\n# c\n";
        disk.inbox = inboxOf([setState("c1", "# missing", "done", { section: "B" })]);
        await processPhoneInbox();

        apiMock.readAgendaForDate.mockResolvedValueOnce(["A", "B", "C"]);
        expect(await resolvePhoneConflict("c1", "add")).toBe("done");
        expect(disk.files[NOTE]).toBe("A\n===\n# a\n\nB\n===\nv missing\n\nC\n===\n# c\n");
        expect(lastOutbox().results).toEqual([{ id: "c1", result: "applied", at: expect.any(String) }]);

        // Fallback when readAgendaForDate rejects.
        disk.files[NOTE] = "A\n===\n# a\n";
        disk.inbox = inboxOf([setState("c2", "# missing", "done", { section: "D" })]);
        await processPhoneInbox();
        apiMock.readAgendaForDate.mockRejectedValueOnce(new Error("no agenda"));
        expect(await resolvePhoneConflict("c2", "add")).toBe("done");
        expect(disk.files[NOTE]).toBe("A\n===\n# a\n\nD\n===\nv missing\n");
      });

      it("validates line bounds, line state eligibility, concurrent note changes, and write failures when resolving to a line", async () => {
        disk.files[NOTE] = "# first\nplain text\n> deferred\n";
        disk.inbox = inboxOf([setState("c1", "# nowhere", "done")]);
        await processPhoneInbox();
        apiMock.writePhoneOutbox.mockClear();

        // Out of bounds or non-actionable line -> noteChanged, no outbox write.
        expect(await resolvePhoneConflict("c1", { line: -1, text: "# first" })).toBe("noteChanged");
        expect(await resolvePhoneConflict("c1", { line: 3, text: "" })).toBe("noteChanged");
        expect(await resolvePhoneConflict("c1", { line: 1, text: "plain text" })).toBe("noteChanged");
        expect(await resolvePhoneConflict("c1", { line: 2, text: "> deferred" })).toBe("noteChanged");
        expect(apiMock.writeNote).not.toHaveBeenCalled();
        expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();

        // Concurrent change on disk between phoneConflictNote read and updateNoteOnDisk read -> noteChanged.
        apiMock.readNoteWithMetadata
          .mockResolvedValueOnce({
            content: "# first\nplain text\n> deferred\n",
            metadata: { exists: true, contentHash: null, sizeBytes: null, modifiedMs: null },
          })
          .mockResolvedValueOnce({
            content: "# changed concurrently\nplain text\n> deferred\n",
            metadata: { exists: true, contentHash: null, sizeBytes: null, modifiedMs: null },
          });
        expect(await resolvePhoneConflict("c1", { line: 0, text: "# first" })).toBe("noteChanged");
        expect(apiMock.writeNote).not.toHaveBeenCalled();
        expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();

        // Write failure on { line, text } -> failed.
        apiMock.writeNote.mockRejectedValueOnce(new Error("disk full"));
        expect(await resolvePhoneConflict("c1", { line: 0, text: "# first" })).toBe("failed");
        expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();

        // Line 0 boundary succeeds when note is unchanged.
        expect(await resolvePhoneConflict("c1", { line: 0, text: "# first" })).toBe("done");
        expect(disk.files[NOTE]).toBe("v first\nplain text\n> deferred\n");
        expect(apiMock.writePhoneOutbox).toHaveBeenCalled();
      });
    });
  });
});

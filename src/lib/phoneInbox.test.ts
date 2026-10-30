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
  writePhoneOutbox: vi.fn(async (_content: string) => {}),
  setPhoneCompanion: vi.fn(async (_on: boolean) => ({})),
  saveScratchpadDrafts: vi.fn(async (_drafts: Record<string, string>) => {}), // flushAllPendingSaves saves drafts too
}));
vi.mock("./tauriApi", () => apiMock);

import { phoneCompanionEnabled, resetPhoneCompanionForTests } from "./phoneCompanion";
import {
  phoneConflicts,
  phoneInboxRun,
  pollPhoneInbox,
  processPhoneInbox,
  resetPhoneInboxForTests,
  resolvePhoneConflict,
} from "./phoneInbox";
import { appVersion, backendKind, currentDateISO, tabs } from "./stores";

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
  });
});

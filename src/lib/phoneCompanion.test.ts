import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What `readNote` finds on disk. */
const disk = vi.hoisted(() => ({ files: {} as Record<string, string> }));
const apiMock = vi.hoisted(() => ({
  readNote: vi.fn(async (name: string): Promise<string | null> => disk.files[name] ?? null),
  readAgendaAfter: vi.fn(async (_after: string): Promise<[string, string][]> => []),
  writePhoneMeetings: vi.fn(async (_content: string) => {}),
  writePhoneOutbox: vi.fn(async (_content: string) => {}),
  readPhoneInbox: vi.fn(async (): Promise<string | null> => null),
  setPhoneCompanion: vi.fn(async (_on: boolean) => ({})),
}));
vi.mock("./tauriApi", () => apiMock);
vi.mock("./persistence", () => ({ refreshAllNotesCache: vi.fn(async () => {}) }));

import {
  buildMeetings,
  buildOutbox,
  HEARTBEAT_MS,
  INBOX_POLL_MS,
  localIsoWithOffset,
  meetingKey,
  meetingsJson,
  outboxJson,
  phoneCompanionEnabled,
  resetPhoneCompanionForTests,
  schedulePhoneOutbox,
  setOutboxResults,
  setPhoneCompanion,
  updatePhoneOutbox,
  wirePhoneCompanion,
} from "./phoneCompanion";
import { allNotesCache, appVersion, backendKind, currentDateISO, tabs } from "./stores";

const TODAY = "2026-10-29";
const NOW = new Date(2026, 9, 29, 8, 40, 12);

function section(title: string, ...lines: string[]): string {
  return `${title}\n${"=".repeat(Math.max(3, title.length))}\n${lines.join("\n")}\n`;
}

function build(notes: Record<string, string>, agenda: [string, string][] = []) {
  return buildMeetings({ notes, agenda, today: TODAY, appVersion: "0.36.0", now: NOW });
}

describe("meetingKey", () => {
  it("is m- plus 6 hex digits of FNV-1a over the lower-cased title", () => {
    expect(meetingKey("a")).toBe("m-e40c29"); // FNV-1a 32 of "a" is 0xe40c292c
    expect(meetingKey("Weekly Sync")).toBe(meetingKey("weekly sync"));
    expect(meetingKey("Weekly Sync")).toMatch(/^m-[0-9a-f]{6}$/);
    expect(meetingKey("Weekly Sync")).not.toBe(meetingKey("Weekly Sync 2"));
  });
});

describe("buildMeetings", () => {
  it("has the file's header fields and a window of 14 days each way", () => {
    const o = build({});
    expect(o.format).toBe(1);
    expect(o.appVersion).toBe("0.36.0");
    expect(o.window).toEqual({ from: "2026-10-15", to: "2026-11-12" });
    expect(o.generatedAt).toBe(localIsoWithOffset(NOW));
    expect(o.generatedAt).toMatch(/^2026-10-29T08:40:12[+-]\d{2}:\d{2}$/);
    expect(o.meetings).toEqual([]);
  });

  it("treats titles with a time range, [CANCELED] or a date as one meeting, keeping each title as written", () => {
    const o = build({
      "2026-10-22.txt": section("[09:00 - 09:30] Weekly Sync", "# a"),
      "2026-10-29.txt": section("Weekly Sync 2026-10-29", "# b"),
      "2026-11-05.txt": section("[CANCELED] weekly sync"),
    });
    expect(o.meetings).toHaveLength(1);
    const m = o.meetings[0];
    expect(m.key).toBe(meetingKey("weekly sync"));
    expect(m.title).toBe("weekly sync"); // the most recent occurrence's title
    expect(m.occurrences).toEqual([
      { date: "2026-10-22", title: "[09:00 - 09:30] Weekly Sync" },
      { date: "2026-10-29", title: "Weekly Sync 2026-10-29" },
      { date: "2026-11-05", title: "[CANCELED] weekly sync" },
    ]);
  });

  it("lists the 5 most recent occurrences before the window, oldest first, however far back", () => {
    const notes: Record<string, string> = { "2026-10-28.txt": section("Board") };
    for (const d of ["2025-01-02", "2025-06-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-10-14"]) {
      notes[`${d}.txt`] = section("Board");
    }
    const dates = build(notes).meetings[0].occurrences.map((o) => o.date);
    expect(dates).toEqual(["2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-10-14", "2026-10-28"]);
  });

  it("leaves out meetings that only occur outside the window", () => {
    const o = build({
      "2026-10-14.txt": section("Old"),
      "2026-11-13.txt": section("Later"),
      "2026-10-15.txt": section("Edge start"),
      "2026-11-12.txt": section("Edge end"),
    });
    expect(o.meetings.map((m) => m.title)).toEqual(["Edge end", "Edge start"]);
  });

  it("leaves out ad-hoc sections, the day part, sub-headings and non-note files", () => {
    const o = build({
      "2026-10-29.txt":
        "day part line\n\n'Call 09:45\n==========\n- x\n\n’Other\n======\n\nTopic\n-----\n\nReal\n====\n",
      "notes.txt": section("Not a note"),
      "2026-10-29 copy.txt": section("Copy"),
    });
    expect(o.meetings.map((m) => m.title)).toEqual(["Real"]);
  });

  it("doesn't take an underline right under another underline for a title", () => {
    const o = build({ "2026-10-29.txt": "Standup\n=======\n=======\n" });
    expect(o.meetings.map((m) => m.title)).toEqual(["Standup"]);
  });

  it("counts a meeting once per day", () => {
    const o = build({ "2026-10-29.txt": section("Standup") + "\n" + section("Standup") });
    expect(o.meetings[0].occurrences).toEqual([{ date: "2026-10-29", title: "Standup" }]);
  });

  it("adds agenda meetings in the window, with the notes' history when they have one", () => {
    const o = build(
      { "2026-09-01.txt": section("Quarterly review 2026-09-01") },
      [
        ["2026-11-03", "Quarterly review"],
        ["2026-11-04", "New meeting"],
        ["2026-11-20", "Too late"],
        ["2026-10-01", "Too early"],
      ],
    );
    expect(o.meetings.map((m) => [m.title, m.occurrences.map((x) => x.date)])).toEqual([
      ["New meeting", []],
      ["Quarterly review", ["2026-09-01"]],
    ]);
  });

  it("sorts meetings by title, ignoring case", () => {
    const o = build({ "2026-10-29.txt": section("beta") + section("Alpha") + section("Gamma") });
    expect(o.meetings.map((m) => m.title)).toEqual(["Alpha", "beta", "Gamma"]);
  });

  it("is written as two-space JSON with a final newline", () => {
    const text = meetingsJson(build({}));
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "format": 1,');
  });
});

describe("buildOutbox", () => {
  it("builds the format 2 outbox with results and no meetings or window keys", () => {
    const results = [{ id: "r1", result: "applied" as const, at: "2026-10-29T09:01:03+01:00" }];
    const o = buildOutbox({ appVersion: "0.36.0", now: NOW, results });
    expect(o.format).toBe(2);
    expect(o.appVersion).toBe("0.36.0");
    expect(o.generatedAt).toBe(localIsoWithOffset(NOW));
    expect(o.results).toEqual(results);
    expect((o as unknown as Record<string, unknown>).meetings).toBeUndefined();
    expect((o as unknown as Record<string, unknown>).window).toBeUndefined();
  });

  it("defaults results to empty array when omitted", () => {
    const o = buildOutbox({ appVersion: "0.36.0", now: NOW });
    expect(o.results).toEqual([]);
    const text = outboxJson(o);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "format": 2,');
  });
});

describe("updatePhoneOutbox", () => {
  beforeEach(() => {
    resetPhoneCompanionForTests();
    apiMock.writePhoneMeetings.mockClear();
    apiMock.writePhoneOutbox.mockClear();
    apiMock.readAgendaAfter.mockClear();
    apiMock.readPhoneInbox.mockClear();
    backendKind.set("desktop");
    phoneCompanionEnabled.set(true);
    currentDateISO.set(TODAY);
    appVersion.set("0.36.0");
    disk.files = { "2026-10-28.txt": section("Standup") };
    allNotesCache.set({ ...disk.files });
    tabs.set([]);
    apiMock.readNote.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    phoneCompanionEnabled.set(false);
  });

  function writtenTitles(call = -1): string[] {
    const calls = apiMock.writePhoneMeetings.mock.calls;
    return JSON.parse(calls.at(call)![0]).meetings.map((m: { title: string }) => m.title);
  }

  it("re-reads the window's notes from disk on a fresh rebuild, not after an edit", async () => {
    await updatePhoneOutbox();
    expect(apiMock.readNote).toHaveBeenCalledTimes(29);
    // OneDrive brings in a changed note and a new one; the folder-wide cache still has the old text.
    disk.files = { "2026-10-28.txt": section("Standup renamed"), "2026-11-02.txt": section("Offsite") };
    apiMock.readNote.mockClear();
    await updatePhoneOutbox(false);
    expect(apiMock.readNote).not.toHaveBeenCalled();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    await updatePhoneOutbox(true);
    expect(writtenTitles()).toEqual(["Offsite", "Standup renamed"]);
  });

  it("drops a window note that is gone from disk", async () => {
    disk.files = {};
    await updatePhoneOutbox();
    expect(writtenTitles()).toEqual([]);
  });

  it("writes nothing when turned off while building, and writes afresh when turned on again", async () => {
    await updatePhoneOutbox();
    let release!: () => void;
    apiMock.readAgendaAfter.mockImplementationOnce(() => new Promise((r) => (release = () => r([]))));
    tabs.set([{ id: "t", filename: "2026-10-29.txt", content: section("Planning"), isScratchpad: false }]);
    const run = updatePhoneOutbox();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await setPhoneCompanion(false);
    release();
    await run;
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    tabs.set([]);
    await setPhoneCompanion(true);
    await updatePhoneOutbox();
    // Same content as the first write, written again because turning it off forgot what was written.
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(2);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(2);
  });

  it("writes once, and again only when the content changes", async () => {
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    expect(apiMock.readAgendaAfter).toHaveBeenCalledWith("2026-10-14");
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    tabs.set([{ id: "t", filename: "2026-10-29.txt", content: section("Planning"), isScratchpad: false }]);
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(2);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    expect(writtenTitles(1)).toEqual(["Planning", "Standup"]);
  });

  it("uses an open tab's text over the disk copy, and ignores scratchpads", async () => {
    tabs.set([
      { id: "a", filename: "2026-10-28.txt", content: section("Renamed"), isScratchpad: false },
      { id: "b", filename: "2026-10-27.txt", content: section("Scratch"), isScratchpad: true },
    ]);
    await updatePhoneOutbox();
    const written = JSON.parse(apiMock.writePhoneMeetings.mock.calls[0][0]);
    expect(written.meetings.map((m: { title: string }) => m.title)).toEqual(["Renamed"]);
  });

  it("does nothing when the setting is off or outside the desktop app", async () => {
    phoneCompanionEnabled.set(false);
    await updatePhoneOutbox();
    phoneCompanionEnabled.set(true);
    backendKind.set("web");
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).not.toHaveBeenCalled();
    expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();
  });

  it("still writes when the agenda can't be read", async () => {
    apiMock.readAgendaAfter.mockRejectedValueOnce(new Error("AgendaInvalid"));
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
  });

  it("retries a failed write on the next update", async () => {
    apiMock.writePhoneMeetings.mockRejectedValueOnce(new Error("locked"));
    await updatePhoneOutbox();
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(2);
  });

  it("debounces scheduled rebuilds", async () => {
    vi.useFakeTimers();
    schedulePhoneOutbox();
    schedulePhoneOutbox();
    await vi.advanceTimersByTimeAsync(4999);
    expect(apiMock.writePhoneMeetings).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1));
  });

  it("meetings.json is not rewritten when only results change and vice versa", async () => {
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    apiMock.writePhoneMeetings.mockClear();
    apiMock.writePhoneOutbox.mockClear();

    // 1. Only results change
    setOutboxResults([{ id: "r1", result: "applied", at: "2026-10-29T09:00:00+01:00" }]);
    await updatePhoneOutbox(false);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneMeetings).not.toHaveBeenCalled();
    apiMock.writePhoneMeetings.mockClear();
    apiMock.writePhoneOutbox.mockClear();

    // 2. Only meetings change (vice versa)
    tabs.set([{ id: "t", filename: "2026-10-29.txt", content: section("Planning"), isScratchpad: false }]);
    await updatePhoneOutbox(false);
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();
  });

  it("heartbeat writes outbox with newer generatedAt after 5 min without rewriting meetings.json", async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 29, 8, 0, 0) });
    wirePhoneCompanion();
    await updatePhoneOutbox();
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    const firstOutbox = JSON.parse(apiMock.writePhoneOutbox.mock.calls[0][0]);
    apiMock.writePhoneOutbox.mockClear();
    apiMock.writePhoneMeetings.mockClear();

    // Advance 4 minutes 59 seconds: no outbox write before 5 min with nothing changed
    await vi.advanceTimersByTimeAsync(4 * 60_000 + 59_000);
    expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();
    expect(apiMock.writePhoneMeetings).not.toHaveBeenCalled();

    // Advance across 5 minutes (next 15 s interval tick at 5m 00s)
    await vi.advanceTimersByTimeAsync(16_000);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneMeetings).not.toHaveBeenCalled();
    const secondOutbox = JSON.parse(apiMock.writePhoneOutbox.mock.calls[0][0]);
    expect(secondOutbox.generatedAt).not.toBe(firstOutbox.generatedAt);
    expect(secondOutbox.generatedAt).toBe(localIsoWithOffset(new Date(2026, 9, 29, 8, 5, 0)));
  });

  it("polls the inbox every 15 s", async () => {
    expect(INBOX_POLL_MS).toBe(15_000);
    expect(HEARTBEAT_MS).toBe(300_000);
    vi.useFakeTimers();
    wirePhoneCompanion();
    // Advance past boot delay and first interval
    await vi.advanceTimersByTimeAsync(15_000);
    apiMock.readPhoneInbox.mockClear();

    // Now test that subsequent polls happen every 15 s
    await vi.advanceTimersByTimeAsync(14_999);
    expect(apiMock.readPhoneInbox).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(apiMock.readPhoneInbox).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(apiMock.readPhoneInbox).toHaveBeenCalledTimes(2);
  });

  it("a failing meetings write still writes the outbox", async () => {
    apiMock.writePhoneMeetings.mockRejectedValueOnce(new Error("disk full"));
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    // Next update: retries meetings write, but outbox is not rewritten
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(2);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
  });
});

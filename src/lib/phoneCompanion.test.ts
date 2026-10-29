import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  readAgendaAfter: vi.fn(async (_after: string): Promise<[string, string][]> => []),
  writePhoneOutbox: vi.fn(async (_content: string) => {}),
  setPhoneCompanion: vi.fn(async (_on: boolean) => ({})),
}));
vi.mock("./tauriApi", () => apiMock);
vi.mock("./persistence", () => ({ refreshAllNotesCache: vi.fn(async () => {}) }));

import {
  buildOutbox,
  localIsoWithOffset,
  meetingKey,
  outboxJson,
  phoneCompanionEnabled,
  resetPhoneCompanionForTests,
  schedulePhoneOutbox,
  updatePhoneOutbox,
} from "./phoneCompanion";
import { allNotesCache, appVersion, backendKind, currentDateISO, tabs } from "./stores";

const TODAY = "2026-10-29";
const NOW = new Date(2026, 9, 29, 8, 40, 12);

function section(title: string, ...lines: string[]): string {
  return `${title}\n${"=".repeat(Math.max(3, title.length))}\n${lines.join("\n")}\n`;
}

function build(notes: Record<string, string>, agenda: [string, string][] = []) {
  return buildOutbox({ notes, agenda, today: TODAY, appVersion: "0.36.0", now: NOW });
}

describe("meetingKey", () => {
  it("is m- plus 6 hex digits of FNV-1a over the lower-cased title", () => {
    expect(meetingKey("a")).toBe("m-e40c29"); // FNV-1a 32 of "a" is 0xe40c292c
    expect(meetingKey("Weekly Sync")).toBe(meetingKey("weekly sync"));
    expect(meetingKey("Weekly Sync")).toMatch(/^m-[0-9a-f]{6}$/);
    expect(meetingKey("Weekly Sync")).not.toBe(meetingKey("Weekly Sync 2"));
  });
});

describe("buildOutbox", () => {
  it("has the file's header fields and a window of 14 days each way", () => {
    const o = build({});
    expect(o.format).toBe(1);
    expect(o.appVersion).toBe("0.36.0");
    expect(o.window).toEqual({ from: "2026-10-15", to: "2026-11-12" });
    expect(o.generatedAt).toBe(localIsoWithOffset(NOW));
    expect(o.generatedAt).toMatch(/^2026-10-29T08:40:12[+-]\d{2}:\d{2}$/);
    expect(o.meetings).toEqual([]);
    expect(o.results).toEqual([]);
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
    const text = outboxJson(build({}));
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "format": 1,');
  });
});

describe("updatePhoneOutbox", () => {
  beforeEach(() => {
    resetPhoneCompanionForTests();
    apiMock.writePhoneOutbox.mockClear();
    apiMock.readAgendaAfter.mockClear();
    backendKind.set("desktop");
    phoneCompanionEnabled.set(true);
    currentDateISO.set(TODAY);
    appVersion.set("0.36.0");
    allNotesCache.set({ "2026-10-28.txt": section("Standup") });
    tabs.set([]);
  });
  afterEach(() => {
    vi.useRealTimers();
    phoneCompanionEnabled.set(false);
  });

  it("writes once, and again only when the content changes", async () => {
    await updatePhoneOutbox();
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    expect(apiMock.readAgendaAfter).toHaveBeenCalledWith("2026-10-14");
    await updatePhoneOutbox();
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    tabs.set([{ id: "t", filename: "2026-10-29.txt", content: section("Planning"), isScratchpad: false }]);
    await updatePhoneOutbox();
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(2);
    const written = JSON.parse(apiMock.writePhoneOutbox.mock.calls[1][0]);
    expect(written.meetings.map((m: { title: string }) => m.title)).toEqual(["Planning", "Standup"]);
  });

  it("uses an open tab's text over the disk copy, and ignores scratchpads", async () => {
    tabs.set([
      { id: "a", filename: "2026-10-28.txt", content: section("Renamed"), isScratchpad: false },
      { id: "b", filename: "2026-10-27.txt", content: section("Scratch"), isScratchpad: true },
    ]);
    await updatePhoneOutbox();
    const written = JSON.parse(apiMock.writePhoneOutbox.mock.calls[0][0]);
    expect(written.meetings.map((m: { title: string }) => m.title)).toEqual(["Renamed"]);
  });

  it("does nothing when the setting is off or outside the desktop app", async () => {
    phoneCompanionEnabled.set(false);
    await updatePhoneOutbox();
    phoneCompanionEnabled.set(true);
    backendKind.set("web");
    await updatePhoneOutbox();
    expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();
  });

  it("still writes when the agenda can't be read", async () => {
    apiMock.readAgendaAfter.mockRejectedValueOnce(new Error("AgendaInvalid"));
    await updatePhoneOutbox();
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
  });

  it("retries a failed write on the next update", async () => {
    apiMock.writePhoneOutbox.mockRejectedValueOnce(new Error("locked"));
    await updatePhoneOutbox();
    await updatePhoneOutbox();
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(2);
  });

  it("debounces scheduled rebuilds", async () => {
    vi.useFakeTimers();
    schedulePhoneOutbox();
    schedulePhoneOutbox();
    await vi.advanceTimersByTimeAsync(4999);
    expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1));
  });
});

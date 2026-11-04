import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Mock backend state: notes on disk, inbox file, ledger file. */
const disk = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  inbox: null as string | null,
  ledger: null as string | null,
}));

const apiMock = vi.hoisted(() => ({
  readNote: vi.fn(async (name: string): Promise<string | null> => disk.files[name] ?? null),
  readAgendaAfter: vi.fn(async (_after: string): Promise<[string, string][]> => []),
  writePhoneOutbox: vi.fn(async (_content: string): Promise<void> => {}),
  writePhoneMeetings: vi.fn(async (_content: string): Promise<void> => {}),
  setPhoneCompanion: vi.fn(async (_on: boolean): Promise<{}> => ({})),
  readPhoneInbox: vi.fn(async (): Promise<string | null> => disk.inbox),
  readPhoneLedger: vi.fn(async (): Promise<string | null> => disk.ledger),
  writePhoneLedger: vi.fn(async (content: string): Promise<void> => {
    disk.ledger = content;
  }),
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
  setOutboxResults,
  setPhoneCompanion,
  updatePhoneOutbox,
  type OutboxResult,
} from "./phoneCompanion";
import { allNotesCache, appVersion, backendKind, currentDateISO, tabs } from "./stores";

const TODAY = "2026-10-29";
const NOW = new Date(2026, 9, 29, 8, 40, 12);

function section(title: string, ...lines: string[]): string {
  return `${title}\n${"=".repeat(Math.max(3, title.length))}\n${lines.join("\n")}\n`;
}

/** Fresh module instance helper for tests exercising wirePhoneCompanion timers. */
async function loadWiredCompanion() {
  vi.resetModules();
  const stores = await import("./stores");
  const pc = await import("./phoneCompanion");
  return { stores, pc };
}

describe("1. buildMeetings and meetingsJson", () => {
  it("buildMeetings output has exactly format 1, generatedAt, appVersion, window, and meetings from notes in window", () => {
    const notes = {
      "2026-10-28.txt": section("Weekly Sync", "Discuss sprint goals"),
      "2026-10-10.txt": section("Old Meeting", "Before window"),
    };
    const agenda: [string, string][] = [["2026-11-02", "Sprint Review"]];

    const m = (buildMeetings as any)({
      notes,
      agenda,
      today: TODAY,
      appVersion: "0.36.0",
      now: NOW,
    });

    expect(Object.keys(m).sort()).toEqual(["appVersion", "format", "generatedAt", "meetings", "window"]);
    expect(m.format).toBe(1);
    expect(m.appVersion).toBe("0.36.0");
    expect(m.generatedAt).toBe(localIsoWithOffset(NOW));
    expect(m.window).toEqual({ from: "2026-10-15", to: "2026-11-12" });

    // Meeting from note in window
    const titles = m.meetings.map((x: { title: string }) => x.title);
    expect(titles).toContain("Weekly Sync");
    expect(titles).toContain("Sprint Review");
    expect(titles).not.toContain("Old Meeting");

    const weekly = m.meetings.find((x: { title: string }) => x.title === "Weekly Sync");
    expect(weekly.key).toBe(meetingKey("Weekly Sync"));
    expect(weekly.occurrences).toEqual([{ date: "2026-10-28", title: "Weekly Sync" }]);

    // meetingsJson is 2-space JSON ending in newline
    const json = (meetingsJson as any)(m);
    expect(json.endsWith("}\n")).toBe(true);
    expect(json).toBe(JSON.stringify(m, null, 2) + "\n");
    expect(json).toContain('\n  "format": 1,');
    expect(json).toContain('\n  "meetings": [');
  });
});

describe("2. buildOutbox and outboxJson", () => {
  it("buildOutbox has exactly format 2, generatedAt, appVersion, results ([] without results)", () => {
    const o = (buildOutbox as any)({
      appVersion: "0.36.0",
      now: NOW,
    });

    expect(Object.keys(o).sort()).toEqual(["appVersion", "format", "generatedAt", "results"]);
    expect(o.format).toBe(2);
    expect(o.appVersion).toBe("0.36.0");
    expect(o.generatedAt).toBe(localIsoWithOffset(NOW));
    expect(o.results).toEqual([]);
    expect((o as unknown as Record<string, unknown>).window).toBeUndefined();
    expect((o as unknown as Record<string, unknown>).meetings).toBeUndefined();

    const json = outboxJson(o);
    expect(json.endsWith("}\n")).toBe(true);
    expect(json).toBe(JSON.stringify(o, null, 2) + "\n");
    expect(json).toContain('\n  "format": 2,');
    expect(json).toContain('\n  "results": []');
  });

  it("buildOutbox passes through results when provided", () => {
    const results: OutboxResult[] = [
      { id: "r1", result: "applied", at: "2026-10-29T09:00:00+01:00" },
      { id: "r2", result: "conflict", reason: "LineModified", at: "2026-10-29T09:01:00+01:00" },
    ];

    const o = (buildOutbox as any)({
      appVersion: "0.36.0",
      now: NOW,
      results,
    });

    expect(o.results).toEqual(results);
  });
});

describe("exported constants", () => {
  it("exports HEARTBEAT_MS (5 min) and INBOX_POLL_MS (15 s)", () => {
    expect(HEARTBEAT_MS).toBe(5 * 60_000);
    expect(INBOX_POLL_MS).toBe(15_000);
  });
});

describe("3. updatePhoneOutbox split file writes", () => {
  beforeEach(() => {
    resetPhoneCompanionForTests();
    apiMock.writePhoneOutbox.mockClear();
    apiMock.writePhoneMeetings.mockClear();
    apiMock.readAgendaAfter.mockClear();
    apiMock.readNote.mockClear();

    backendKind.set("desktop");
    phoneCompanionEnabled.set(true);
    currentDateISO.set(TODAY);
    appVersion.set("0.36.0");
    disk.files = { "2026-10-28.txt": section("Standup") };
    allNotesCache.set({ ...disk.files });
    tabs.set([]);
  });

  afterEach(() => {
    phoneCompanionEnabled.set(false);
  });

  it("with setting active writes both meetings.json (format 1) and outbox.json (format 2) once; second call writes neither", async () => {
    await updatePhoneOutbox();

    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);

    const meetingsWritten = JSON.parse(apiMock.writePhoneMeetings.mock.calls[0][0]);
    expect(meetingsWritten.format).toBe(1);
    expect(meetingsWritten.window).toEqual({ from: "2026-10-15", to: "2026-11-12" });
    expect(meetingsWritten.meetings.map((m: { title: string }) => m.title)).toEqual(["Standup"]);

    const outboxWritten = JSON.parse(apiMock.writePhoneOutbox.mock.calls[0][0]);
    expect(outboxWritten.format).toBe(2);
    expect(outboxWritten.results).toEqual([]);
    expect(outboxWritten.window).toBeUndefined();
    expect(outboxWritten.meetings).toBeUndefined();

    // Second call with nothing changed writes neither
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
  });

  it("4. changing only results rewrites outbox.json but not meetings.json", async () => {
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);

    const results: OutboxResult[] = [
      { id: "req-1", result: "applied", at: "2026-10-29T09:10:00+01:00" },
    ];
    setOutboxResults(results);

    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(2);

    const updatedOutbox = JSON.parse(apiMock.writePhoneOutbox.mock.calls[1][0]);
    expect(updatedOutbox.format).toBe(2);
    expect(updatedOutbox.results).toEqual(results);
  });

  it("5. changing a note's meetings in the window rewrites meetings.json but not outbox.json", async () => {
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);

    // Add a new section title in a tab in the window
    tabs.set([
      { id: "tab-1", filename: "2026-10-29.txt", content: section("Design Review"), isScratchpad: false },
    ]);

    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(2);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);

    const updatedMeetings = JSON.parse(apiMock.writePhoneMeetings.mock.calls[1][0]);
    expect(updatedMeetings.format).toBe(1);
    const titles = updatedMeetings.meetings.map((m: { title: string }) => m.title);
    expect(titles).toContain("Design Review");
  });
});

describe("8. write failure isolation and retries", () => {
  beforeEach(() => {
    resetPhoneCompanionForTests();
    apiMock.writePhoneOutbox.mockClear();
    apiMock.writePhoneMeetings.mockClear();
    apiMock.readAgendaAfter.mockClear();
    apiMock.readNote.mockClear();

    backendKind.set("desktop");
    phoneCompanionEnabled.set(true);
    currentDateISO.set(TODAY);
    appVersion.set("0.36.0");
    disk.files = { "2026-10-28.txt": section("Standup") };
    allNotesCache.set({ ...disk.files });
    tabs.set([]);
  });

  afterEach(() => {
    phoneCompanionEnabled.set(false);
  });

  it("if writePhoneMeetings rejects, writePhoneOutbox is still called in that run, and next run tries meetings.json again", async () => {
    apiMock.writePhoneMeetings.mockRejectedValueOnce(new Error("disk locked for meetings"));

    await updatePhoneOutbox().catch(() => {});
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);

    // Next run tries meetings.json again; outbox.json succeeded previously so it is not rewritten
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(2);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
  });

  it("if writePhoneOutbox rejects, writePhoneMeetings was still called in that run, and next run tries outbox.json again", async () => {
    apiMock.writePhoneOutbox.mockRejectedValueOnce(new Error("disk locked for outbox"));

    await updatePhoneOutbox().catch(() => {});
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);

    // Next run tries outbox.json again; meetings.json succeeded previously so it is not rewritten
    await updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(2);
  });
});

describe("6 & 7. heartbeat with fake timers and wirePhoneCompanion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMock.writePhoneOutbox.mockClear();
    apiMock.writePhoneMeetings.mockClear();
    disk.files = { "2026-10-28.txt": section("Standup") };
    disk.inbox = null;
    disk.ledger = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("6. heartbeat: advancing < 5 min writes no outbox; advancing past 5 min writes outbox.json with later generatedAt and same results without rewriting meetings.json", async () => {
    const { stores, pc } = await loadWiredCompanion();
    stores.backendKind.set("desktop");
    pc.phoneCompanionEnabled.set(true);
    stores.currentDateISO.set(TODAY);
    stores.appVersion.set("0.36.0");
    stores.allNotesCache.set({ ...disk.files });
    stores.tabs.set([]);

    pc.wirePhoneCompanion();

    // Trigger the initial write
    await pc.updatePhoneOutbox();
    // Allow any initial boot timer (BOOT_DELAY_MS = 3000ms) to settle
    await vi.advanceTimersByTimeAsync(3500);

    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);

    const firstOutbox = JSON.parse(apiMock.writePhoneOutbox.mock.calls[0][0]);

    // Advance by less than 5 minutes (4 minutes)
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);

    // Advance past 5 minutes total (another 2 minutes = 6 minutes total since first write)
    await vi.advanceTimersByTimeAsync(2 * 60_000);

    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(2);
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);

    const secondOutbox = JSON.parse(apiMock.writePhoneOutbox.mock.calls[1][0]);
    expect(new Date(secondOutbox.generatedAt).getTime()).toBeGreaterThan(new Date(firstOutbox.generatedAt).getTime());
    expect(secondOutbox.results).toEqual(firstOutbox.results);
  });

  it("7. with setting off, nothing is written and heartbeat writes nothing", async () => {
    const { stores, pc } = await loadWiredCompanion();
    stores.backendKind.set("desktop");
    pc.phoneCompanionEnabled.set(false);
    stores.currentDateISO.set(TODAY);
    stores.appVersion.set("0.36.0");
    stores.allNotesCache.set({ ...disk.files });
    stores.tabs.set([]);

    pc.wirePhoneCompanion();

    await pc.updatePhoneOutbox();
    expect(apiMock.writePhoneMeetings).not.toHaveBeenCalled();
    expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();

    // Advance past heartbeat timer while off
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(apiMock.writePhoneMeetings).not.toHaveBeenCalled();
    expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();
  });

  it("7b. turning setting off stops heartbeat from writing", async () => {
    const { stores, pc } = await loadWiredCompanion();
    stores.backendKind.set("desktop");
    pc.phoneCompanionEnabled.set(true);
    stores.currentDateISO.set(TODAY);
    stores.appVersion.set("0.36.0");
    stores.allNotesCache.set({ ...disk.files });
    stores.tabs.set([]);

    pc.wirePhoneCompanion();
    await pc.updatePhoneOutbox();
    await vi.advanceTimersByTimeAsync(3500);

    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);

    // Turn setting off
    await pc.setPhoneCompanion(false);

    // Advance past 5 minutes (e.g. 10 minutes)
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    // Outbox was not written again while disabled
    expect(apiMock.writePhoneOutbox).toHaveBeenCalledTimes(1);
    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
  });

  it("7c. does nothing and heartbeat writes nothing when backendKind is web", async () => {
    const { stores, pc } = await loadWiredCompanion();
    stores.backendKind.set("web");
    pc.phoneCompanionEnabled.set(true);
    stores.currentDateISO.set(TODAY);
    stores.appVersion.set("0.36.0");
    stores.allNotesCache.set({ ...disk.files });
    stores.tabs.set([]);

    pc.wirePhoneCompanion();
    await pc.updatePhoneOutbox();
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(apiMock.writePhoneMeetings).not.toHaveBeenCalled();
    expect(apiMock.writePhoneOutbox).not.toHaveBeenCalled();
  });
});

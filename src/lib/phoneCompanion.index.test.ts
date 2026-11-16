import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const disk = vi.hoisted(() => ({ files: {} as Record<string, string> }));
const apiMock = vi.hoisted(() => ({
  readNote: vi.fn(async (name: string): Promise<string | null> => disk.files[name] ?? null),
  readAgendaAfter: vi.fn(async (): Promise<[string, string][]> => []),
  writePhoneMeetings: vi.fn(async (_content: string) => {}),
  writePhoneOutbox: vi.fn(async (_content: string) => {}),
  readPhoneInbox: vi.fn(async (): Promise<string | null> => null),
  setPhoneCompanion: vi.fn(async () => ({})),
}));
vi.mock("./tauriApi", () => apiMock);
vi.mock("./persistence", () => ({}));

import { clearDiskLayer, seedDiskNotesForTest } from "./notesIndex/diskLayer";
import {
  phoneCompanionEnabled,
  resetPhoneCompanionForTests,
  updatePhoneOutbox,
} from "./phoneCompanion";
import { appVersion, backendKind, currentDateISO, tabs } from "./stores";

const TODAY = "2026-11-06";

function section(title: string, body: string): string {
  return `${title}\n${"=".repeat(Math.max(3, title.length))}\n${body}\n`;
}

function writtenTitles(): string[] {
  const calls = apiMock.writePhoneMeetings.mock.calls;
  return JSON.parse(calls.at(-1)![0]).meetings.map((m: { title: string }) => m.title);
}

describe("phoneCompanion reads notesIndex with fresh window and tab overlay", () => {
  beforeEach(() => {
    resetPhoneCompanionForTests();
    clearDiskLayer();
    apiMock.writePhoneMeetings.mockClear();
    apiMock.writePhoneOutbox.mockClear();
    apiMock.readNote.mockClear();
    backendKind.set("desktop");
    phoneCompanionEnabled.set(true);
    currentDateISO.set(TODAY);
    appVersion.set("0.36.0");
    tabs.set([]);
  });

  afterEach(() => {
    phoneCompanionEnabled.set(false);
    tabs.set([]);
    clearDiskLayer();
  });

  it("uses the fresh focus window note over the index when no tab is open for it", async () => {
    seedDiskNotesForTest({ "2026-11-06.txt": section("From index", "v b") });
    disk.files = { "2026-11-06.txt": section("From fresh window", "# fresh") };

    await updatePhoneOutbox(true);

    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(writtenTitles()).toEqual(["From fresh window"]);
  });

  it("prefers an open non-scratchpad tab over both the fresh window and the index", async () => {
    seedDiskNotesForTest({ "2026-11-06.txt": section("From index", "v b") });
    disk.files = { "2026-11-06.txt": section("From fresh window", "# fresh") };
    tabs.set([{ id: "t1", filename: "2026-11-06.txt", content: section("From open tab", "# tab"), isScratchpad: false }]);

    await updatePhoneOutbox(true);

    expect(apiMock.writePhoneMeetings).toHaveBeenCalledTimes(1);
    expect(writtenTitles()).toEqual(["From open tab"]);
  });
});

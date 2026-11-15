import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { activeTabId, autoAddedMeetings, tabs } from "./stores";
import { recordAutoAddedMeetings } from "./autoAddedMeetings";
import * as api from "./tauriApi";

vi.mock("./tauriApi", () => ({
  writeTabSession: vi.fn().mockResolvedValue(undefined),
}));

describe("recordAutoAddedMeetings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 9, 0, 0));
    autoAddedMeetings.set({});
    tabs.set([
      {
        id: "tab-1",
        filename: "2026-09-15.txt",
        isScratchpad: false,
        content: "",
      },
    ]);
    activeTabId.set("tab-1");
    vi.mocked(api.writeTabSession).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges titles deduplicating after trim().toLowerCase() and writes session immediately", () => {
    recordAutoAddedMeetings("2026-09-15", ["Standup"]);
    expect(get(autoAddedMeetings)).toEqual({ "2026-09-15": ["Standup"] });
    expect(api.writeTabSession).toHaveBeenCalledTimes(1);
    expect(api.writeTabSession).toHaveBeenLastCalledWith(
      ["2026-09-15.txt"],
      "2026-09-15.txt",
      "2026-09-15",
      { "2026-09-15": ["Standup"] },
    );

    recordAutoAddedMeetings("2026-09-15", [" standup "]);
    expect(get(autoAddedMeetings)).toEqual({ "2026-09-15": ["Standup"] });
    expect(api.writeTabSession).toHaveBeenCalledTimes(2);
    expect(api.writeTabSession).toHaveBeenLastCalledWith(
      ["2026-09-15.txt"],
      "2026-09-15.txt",
      "2026-09-15",
      { "2026-09-15": ["Standup"] },
    );
  });

  it("keeps meetings on different dates separate", () => {
    recordAutoAddedMeetings("2026-09-15", ["Standup"]);
    recordAutoAddedMeetings("2026-09-16", ["Retro", "Standup"]);

    expect(get(autoAddedMeetings)).toEqual({
      "2026-09-15": ["Standup"],
      "2026-09-16": ["Retro", "Standup"],
    });
    expect(api.writeTabSession).toHaveBeenCalledTimes(2);
    expect(api.writeTabSession).toHaveBeenLastCalledWith(
      ["2026-09-15.txt"],
      "2026-09-15.txt",
      "2026-09-15",
      {
        "2026-09-15": ["Standup"],
        "2026-09-16": ["Retro", "Standup"],
      },
    );
  });
});

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  fuzzyMatchWithIndices,
  splitHighlighted,
  buildPaletteResults,
  openCommandPalette,
  runPaletteLineAction,
} from "./commandPalette";
import { get } from "svelte/store";
import { registerEditorApi, allNotesCache, modal, type EditorApi } from "./stores";

vi.mock("./tauriApi", () => ({
  readAllNotes: vi.fn(async () => [
    ["2026-09-20.txt", "# Buy milk\nv Call dentist\n> Review pull request"],
    ["2026-09-21.txt", "# Plan sprint"],
  ]),
}));

describe("commandPalette match highlighting", () => {
  it("handles empty needle fallback", () => {
    const res = fuzzyMatchWithIndices("New scratchpad", "");
    expect(res).toEqual({ matches: true, score: 0, indices: [] });
  });

  it("performs case-insensitive sequential character matching and records indices", () => {
    const res = fuzzyMatchWithIndices("New Scratchpad", "nsc");
    expect(res).not.toBeNull();
    expect(res?.matches).toBe(true);
    expect(res?.indices).toEqual([0, 4, 5]); // N, S, c
  });

  it("returns null when sequential match is not satisfied", () => {
    const res = fuzzyMatchWithIndices("New Scratchpad", "xyz");
    expect(res).toBeNull();
  });

  it("correctly groups segments with splitHighlighted", () => {
    const segments = splitHighlighted("Hello world", [1, 2, 6]);
    expect(segments).toEqual([
      { text: "H", highlight: false },
      { text: "el", highlight: true },
      { text: "lo ", highlight: false },
      { text: "w", highlight: true },
      { text: "orld", highlight: false },
    ]);
  });

  it("handles empty string and undefined indices in splitHighlighted", () => {
    expect(splitHighlighted("")).toEqual([]);
    expect(splitHighlighted("plain", [])).toEqual([{ text: "plain", highlight: false }]);
    expect(splitHighlighted("plain", undefined)).toEqual([{ text: "plain", highlight: false }]);
  });
});

describe("buildPaletteResults prefix query modes", () => {
  beforeEach(() => {
    allNotesCache.set({
      "2026-09-20.txt": "# Buy milk\nv Call dentist\n> Review pull request",
      "2026-09-21.txt": "# Plan sprint",
    });
  });

  it("handles '>' prefix for commands only with match highlighting", async () => {
    const items = await buildPaletteResults(">scratch");
    expect(items.length).toBeGreaterThan(0);
    const scratch = items.find((i) => i.id === "cmd-scratch");
    expect(scratch).toBeDefined();
    expect(scratch?.group).toBe("Commands");
    expect(scratch?.matchedIndices).toBeDefined();
    expect(scratch?.matchedIndices!.length).toBeGreaterThan(0);
  });

  it("handles '!' and '#' prefix for open actions with match highlighting", async () => {
    const items1 = await buildPaletteResults("!milk");
    expect(items1.length).toBe(1);
    expect(items1[0].label).toBe("Buy milk");
    expect(items1[0].group).toBe("Open actions");
    expect(items1[0].matchedIndices).toBeDefined();

    const items2 = await buildPaletteResults("#sprint");
    expect(items2.length).toBe(1);
    expect(items2[0].label).toBe("Plan sprint");
    expect(items2[0].matchedIndices).toBeDefined();
  });

  it("handles '@' prefix for date navigation with substring match highlighting", async () => {
    const items = await buildPaletteResults("@2026-09-20");
    expect(items.length).toBeGreaterThan(0);
    const dateItem = items.find((i) => i.id === "date-2026-09-20");
    expect(dateItem).toBeDefined();
    expect(dateItem?.matchedIndices).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);

    // Substring matching: non-substring should not match existing note (e.g. 0919 does not match 2026-09-20)
    const nonSub = await buildPaletteResults("@0919");
    const nonSubMatch = nonSub.find((i) => i.id === "date-2026-09-20");
    expect(nonSubMatch).toBeUndefined();
  });

  it("registers Current line commands and export command", async () => {
    const items = await buildPaletteResults(">current line");
    const lineClose = items.find((i) => i.id === "cmd-line-close-open");
    expect(lineClose).toBeDefined();
    expect(lineClose?.group).toBe("Current line");

    const exportCmd = (await buildPaletteResults(">export")).find((i) => i.id === "cmd-export-notes");
    expect(exportCmd).toBeDefined();
    expect(exportCmd?.group).toBe("Commands");
  });
});

describe("Selection Snapshotting & Focus Restoration (Decision 2)", () => {
  it("restores editor selection and focus before executing line actions", () => {
    let focused = false;
    let restoredRange: { anchor: number; head: number } | null = null;
    let actionExecuted = false;

    const mockApi: EditorApi = {
      getContent: () => "test content",
      setContent: vi.fn(),
      insertAtCursor: vi.fn(),
      jumpToLine: vi.fn(),
      getCursorLineIdx: () => 0,
      getSelection: () => ({ text: "test", fromLine: 0, toLine: 0 }),
      getSelectionRange: () => ({ anchor: 5, head: 10 }),
      setSelectionRange: (range) => {
        restoredRange = range;
      },
      focus: () => {
        focused = true;
      },
      closeCurrentOpenAction: () => {
        // Selection and focus must already be restored at the moment the action executes!
        expect(focused).toBe(true);
        expect(restoredRange).toEqual({ anchor: 5, head: 10 });
        actionExecuted = true;
        return true;
      },
      find: { setQuery: vi.fn(), next: vi.fn(), prev: vi.fn(), clear: vi.fn() },
    };

    registerEditorApi(mockApi);

    // Open palette snapshots selection
    openCommandPalette();
    expect(get(modal)).toBe("commandPalette");

    // Run palette line action
    const ok = runPaletteLineAction((api) => api.closeCurrentOpenAction?.());
    expect(ok).toBe(true);
    expect(actionExecuted).toBe(true);
    expect(focused).toBe(true);
    expect(restoredRange).toEqual({ anchor: 5, head: 10 });

    registerEditorApi(null);
  });
});

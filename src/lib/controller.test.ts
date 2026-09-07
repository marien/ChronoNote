import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import type { NoteTab } from "./types";

/** Every mock function lives here, outside the `vi.mock` factories, so
 * `beforeEach` can reset them directly without depending on the factory
 * being re-invoked. */
const apiMock = {
  getConfig: vi.fn(),
  setNotesDir: vi.fn(),
  setColorMode: vi.fn(),
  setWordWrap: vi.fn(),
  listNoteFiles: vi.fn(),
  readNote: vi.fn(),
  writeNote: vi.fn(),
  readAllNotes: vi.fn(),
  readTabSession: vi.fn(),
  writeTabSession: vi.fn(),
  pathExists: vi.fn(),
  getAppVersion: vi.fn(),
  openExternalUrl: vi.fn(),
};

vi.mock("./tauriApi", () => apiMock);

const tauriWindowMock = {
  setTitle: vi.fn(),
  isFullscreen: vi.fn(),
  isMaximized: vi.fn(),
  onResized: vi.fn(),
};
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => tauriWindowMock,
}));

const dialogMock = { open: vi.fn() };
vi.mock("@tauri-apps/plugin-dialog", () => dialogMock);

/** `controller.ts` keeps a few pieces of state as plain module-level
 * variables (the closed-tab history, the "last copied action" for the
 * paste-forward feature, the disk-notes cache) with no exported reset —
 * by design, nothing outside the module needs one in the real app, where
 * it only ever loads once. `vi.resetModules()` + a fresh dynamic import
 * before every test sidesteps that entirely: each test gets its own,
 * fully independent module instance, so those hidden singletons can
 * never leak between tests regardless of import order. */
let controller: typeof import("./controller");

function tab(overrides: Partial<NoteTab> = {}): NoteTab {
  return { id: `tab-${Math.random()}`, filename: "2026-09-01.txt", isScratchpad: false, content: "", ...overrides };
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  apiMock.readNote.mockResolvedValue(null);
  apiMock.readAllNotes.mockResolvedValue([]);
  apiMock.readTabSession.mockResolvedValue(null);
  apiMock.writeNote.mockResolvedValue(undefined);
  apiMock.writeTabSession.mockResolvedValue(undefined);
  apiMock.openExternalUrl.mockResolvedValue(undefined);
  apiMock.getConfig.mockResolvedValue({
    notesDir: "/notes",
    colorMode: "grayscale",
    wordWrap: false,
    recentNotesDirs: [],
  });
  apiMock.setNotesDir.mockResolvedValue({
    notesDir: "/new",
    colorMode: "grayscale",
    wordWrap: false,
    recentNotesDirs: [],
  });
  apiMock.getAppVersion.mockResolvedValue("0.0.0-test");
  tauriWindowMock.setTitle.mockResolvedValue(undefined);
  tauriWindowMock.isFullscreen.mockResolvedValue(false);
  tauriWindowMock.isMaximized.mockResolvedValue(false);
  tauriWindowMock.onResized.mockResolvedValue(undefined);
  controller = await import("./controller");
});

describe("sortedTabsForDisplay", () => {
  it("sorts dated tabs chronologically and puts scratchpads last", () => {
    const list = [
      tab({ id: "b", filename: "2026-09-05.txt" }),
      tab({ id: "s1", filename: "Scratchpad 1", isScratchpad: true }),
      tab({ id: "a", filename: "2026-09-01.txt" }),
    ];
    expect(controller.sortedTabsForDisplay(list).map((t) => t.id)).toEqual(["a", "b", "s1"]);
  });

  it("does not mutate the input array", () => {
    const list = [tab({ id: "b", filename: "2026-09-05.txt" }), tab({ id: "a", filename: "2026-09-01.txt" })];
    const copy = [...list];
    controller.sortedTabsForDisplay(list);
    expect(list).toEqual(copy);
  });
});

describe("sortFilenamesByRecency", () => {
  it("orders most-recent-first", () => {
    expect(controller.sortFilenamesByRecency(["2026-09-01.txt", "2026-09-05.txt", "2026-08-20.txt"])).toEqual([
      "2026-09-05.txt",
      "2026-09-01.txt",
      "2026-08-20.txt",
    ]);
  });
});

describe("tab lifecycle", () => {
  it("createScratchpad numbers scratchpads sequentially and activates the new one", () => {
    controller.createScratchpad();
    controller.createScratchpad();
    const list = get(controller.tabs);
    expect(list.map((t) => t.filename)).toEqual(["Scratchpad 1", "Scratchpad 2"]);
    expect(get(controller.activeTabId)).toBe(list[1].id);
  });

  it("cycleTab wraps around in both directions", () => {
    controller.tabs.set([tab({ id: "a", filename: "2026-09-01.txt" }), tab({ id: "b", filename: "2026-09-02.txt" })]);
    controller.activeTabId.set("a");
    controller.cycleTab(1);
    expect(get(controller.activeTabId)).toBe("b");
    controller.cycleTab(1);
    expect(get(controller.activeTabId)).toBe("a"); // wrapped forward
    controller.cycleTab(-1);
    expect(get(controller.activeTabId)).toBe("b"); // wrapped backward
  });

  it("requestTabClose closes immediately when there's nothing to protect", () => {
    controller.tabs.set([tab({ id: "a", content: "just notes" })]);
    controller.activeTabId.set("a");
    controller.requestTabClose("a");
    // Closing the only tab always leaves a fresh scratchpad behind.
    const list = get(controller.tabs);
    expect(list).toHaveLength(1);
    expect(list[0].isScratchpad).toBe(true);
    expect(get(controller.modal)).toBe("none");
  });

  it("requestTabClose blocks on an unresolved open action, via the safety modal", () => {
    controller.tabs.set([tab({ id: "a", content: "# still open" })]);
    controller.requestTabClose("a");
    expect(get(controller.modal)).toBe("safety");
    expect(get(controller.safetyMessage)).toMatch(/unresolved open action/);
    // The tab is untouched until the user actually confirms.
    expect(get(controller.tabs)).toHaveLength(1);
  });

  it("requestTabClose blocks on a non-empty scratchpad (content would be lost forever)", () => {
    controller.tabs.set([tab({ id: "a", isScratchpad: true, content: "unsaved idea" })]);
    controller.requestTabClose("a");
    expect(get(controller.modal)).toBe("safety");
    expect(get(controller.safetyMessage)).toMatch(/scratchpad/);
  });

  it("requestTabClose does not block an empty scratchpad", () => {
    controller.tabs.set([tab({ id: "a", isScratchpad: true, content: "   " })]);
    controller.requestTabClose("a");
    expect(get(controller.modal)).toBe("none");
  });

  it("confirmSafetyClose actually closes the pending tab", () => {
    controller.tabs.set([tab({ id: "a", content: "# open" }), tab({ id: "b", filename: "2026-09-02.txt" })]);
    controller.requestTabClose("a");
    controller.confirmSafetyClose();
    expect(get(controller.tabs).map((t) => t.id)).toEqual(["b"]);
    expect(get(controller.modal)).toBe("none");
  });

  it("cancelSafetyClose leaves the tab open", () => {
    controller.tabs.set([tab({ id: "a", content: "# open" })]);
    controller.requestTabClose("a");
    controller.cancelSafetyClose();
    expect(get(controller.tabs)).toHaveLength(1);
    expect(get(controller.modal)).toBe("none");
  });

  it("closing the active tab activates a sensible neighbor in display order", () => {
    controller.tabs.set([
      tab({ id: "a", filename: "2026-09-01.txt" }),
      tab({ id: "b", filename: "2026-09-02.txt" }),
      tab({ id: "c", filename: "2026-09-03.txt" }),
    ]);
    controller.activeTabId.set("b");
    controller.closeTab("b");
    expect(get(controller.activeTabId)).toBe("a");
  });

  it("reopenLastClosedTab restores a scratchpad's content verbatim", () => {
    controller.tabs.set([tab({ id: "a", isScratchpad: true, filename: "Scratchpad 1", content: "important idea" })]);
    controller.closeTab("a");
    // Closing the only open tab always leaves a fresh, empty scratchpad
    // behind (see the "never left with zero tabs" case below) — reopening
    // adds the restored one alongside it, rather than replacing it.
    expect(get(controller.tabs)).toHaveLength(1);
    controller.reopenLastClosedTab();
    const list = get(controller.tabs);
    expect(list).toHaveLength(2);
    expect(list.some((t) => t.isScratchpad && t.content === "important idea")).toBe(true);
  });

  it("closing the only open tab never leaves zero tabs — a fresh scratchpad takes its place", () => {
    controller.tabs.set([tab({ id: "a", content: "# only tab" })]);
    controller.closeTab("a");
    const list = get(controller.tabs);
    expect(list).toHaveLength(1);
    expect(list[0].isScratchpad).toBe(true);
    expect(get(controller.activeTabId)).toBe(list[0].id);
  });

  it("reopenLastClosedTab re-reads a dated file from disk rather than trusting the cached snapshot", async () => {
    controller.tabs.set([tab({ id: "a", filename: "2026-09-01.txt", content: "stale cached content" })]);
    controller.closeTab("a");
    apiMock.readNote.mockResolvedValue("fresh content from disk");
    await controller.reopenLastClosedTab();
    const list = get(controller.tabs);
    expect(list.some((t) => t.filename === "2026-09-01.txt" && t.content === "fresh content from disk")).toBe(true);
  });

  it("reopenLastClosedTab is a no-op with nothing to reopen", () => {
    expect(() => controller.reopenLastClosedTab()).not.toThrow();
  });
});

describe("updateActiveTabContent", () => {
  it("updates the active tab's content in place", () => {
    controller.tabs.set([tab({ id: "a", content: "old" })]);
    controller.activeTabId.set("a");
    controller.updateActiveTabContent("new");
    expect(get(controller.tabs)[0].content).toBe("new");
  });
});

describe("buildActionSnapshotOpenTabs", () => {
  it("includes every action state, not just open (§69)", () => {
    controller.tabs.set([
      tab({
        id: "a",
        filename: "2026-09-01.txt",
        content: ["Standup", "=======", "# open one", "v done one", "> deferred one", "x wontdo one"].join("\n"),
      }),
    ]);
    const snapshot = controller.buildActionSnapshotOpenTabs();
    expect(snapshot).toHaveLength(4);
    expect(snapshot.every((item) => item.header === "Standup")).toBe(true);
  });

  it("includes a consequence-action and a delegated line", () => {
    controller.tabs.set([
      tab({ id: "a", content: "Talked to Sam => # follow up\nTalked to Alice => @bob" }),
    ]);
    expect(controller.buildActionSnapshotOpenTabs()).toHaveLength(2);
  });

  it("excludes a plain follow-up with no action state and no delegate", () => {
    controller.tabs.set([tab({ id: "a", content: "Talked to Sam => let's regroup" })]);
    expect(controller.buildActionSnapshotOpenTabs()).toHaveLength(0);
  });

  it("orders open tabs most-recent-first", () => {
    controller.tabs.set([
      tab({ id: "old", filename: "2026-09-01.txt", content: "# a" }),
      tab({ id: "new", filename: "2026-09-05.txt", content: "# b" }),
    ]);
    const snapshot = controller.buildActionSnapshotOpenTabs();
    expect(snapshot.map((i) => i.filename)).toEqual(["2026-09-05.txt", "2026-09-01.txt"]);
  });
});

describe("toggleActionLine / forwardActionToToday", () => {
  it("cycles the line's action symbol in place", () => {
    controller.tabs.set([tab({ id: "a", content: "# do the thing" })]);
    controller.toggleActionLine("a", 0);
    expect(get(controller.tabs)[0].content).toBe("v do the thing");
  });

  it("does nothing for a line with no action symbol", () => {
    controller.tabs.set([tab({ id: "a", content: "plain text" })]);
    controller.toggleActionLine("a", 0);
    expect(get(controller.tabs)[0].content).toBe("plain text");
  });

  it("forwards an open action to today, marking the source deferred", () => {
    controller.tabs.set([
      tab({ id: "src", filename: "2026-08-01.txt", content: "# call the client" }),
      tab({ id: "today", filename: "2026-09-15.txt", content: "existing note" }),
    ]);
    vi.setSystemTime(new Date(2026, 8, 15));
    controller.forwardActionToToday("src", 0);
    const list = get(controller.tabs);
    expect(list.find((t) => t.id === "src")!.content).toBe("> call the client");
    expect(list.find((t) => t.id === "today")!.content).toBe("# call the client\nexisting note");
    vi.useRealTimers();
  });
});

describe("recordCopiedAction / handlePasteIntoTab (§64)", () => {
  it("defers the original when pasted into today's note", () => {
    controller.tabs.set([
      tab({ id: "src", filename: "2026-08-01.txt", content: "before\n# do the thing\nafter" }),
      tab({ id: "today", filename: "2026-09-15.txt", content: "" }),
    ]);
    vi.setSystemTime(new Date(2026, 8, 15));
    controller.recordCopiedAction("# do the thing", "src");
    controller.handlePasteIntoTab("today");
    expect(get(controller.tabs).find((t) => t.id === "src")!.content).toBe("before\n> do the thing\nafter");
    vi.useRealTimers();
  });

  it("defers every open action in a multi-line copy, not just the first (§64)", () => {
    controller.tabs.set([
      tab({ id: "src", filename: "2026-08-01.txt", content: "# first\nplain\n# second" }),
      tab({ id: "today", filename: "2026-09-15.txt", content: "" }),
    ]);
    vi.setSystemTime(new Date(2026, 8, 15));
    controller.recordCopiedAction("# first\nplain\n# second", "src");
    controller.handlePasteIntoTab("today");
    expect(get(controller.tabs).find((t) => t.id === "src")!.content).toBe("> first\nplain\n> second");
    vi.useRealTimers();
  });

  it("does not defer when pasted into an earlier-dated note (§49: today-or-later only)", () => {
    controller.tabs.set([
      tab({ id: "src", filename: "2026-09-10.txt", content: "# do the thing" }),
      tab({ id: "earlier", filename: "2026-08-01.txt", content: "" }),
    ]);
    controller.recordCopiedAction("# do the thing", "src");
    controller.handlePasteIntoTab("earlier");
    expect(get(controller.tabs).find((t) => t.id === "src")!.content).toBe("# do the thing");
  });

  it("does not defer when pasted into a scratchpad", () => {
    controller.tabs.set([
      tab({ id: "src", filename: "2026-08-01.txt", content: "# do the thing" }),
      tab({ id: "scratch", isScratchpad: true, filename: "Scratchpad 1", content: "" }),
    ]);
    controller.recordCopiedAction("# do the thing", "src");
    controller.handlePasteIntoTab("scratch");
    expect(get(controller.tabs).find((t) => t.id === "src")!.content).toBe("# do the thing");
  });

  it("does not defer when pasted back into its own source tab", () => {
    controller.tabs.set([tab({ id: "src", filename: "2026-09-15.txt", content: "# do the thing" })]);
    vi.setSystemTime(new Date(2026, 8, 15));
    controller.recordCopiedAction("# do the thing", "src");
    controller.handlePasteIntoTab("src");
    expect(get(controller.tabs).find((t) => t.id === "src")!.content).toBe("# do the thing");
    vi.useRealTimers();
  });

  it("ignores a paste when the copied text no longer exists in the source (edited since copy)", () => {
    controller.tabs.set([
      tab({ id: "src", filename: "2026-08-01.txt", content: "# something else now" }),
      tab({ id: "today", filename: "2026-09-15.txt", content: "" }),
    ]);
    vi.setSystemTime(new Date(2026, 8, 15));
    controller.recordCopiedAction("# do the thing", "src");
    controller.handlePasteIntoTab("today");
    expect(get(controller.tabs).find((t) => t.id === "src")!.content).toBe("# something else now");
    vi.useRealTimers();
  });

  it("does nothing without a prior copy", () => {
    controller.tabs.set([tab({ id: "a", content: "# do the thing" })]);
    expect(() => controller.handlePasteIntoTab("a")).not.toThrow();
    expect(get(controller.tabs)[0].content).toBe("# do the thing");
  });
});

describe("runSearch", () => {
  it("finds a case-insensitive match across open tabs", () => {
    controller.tabs.set([tab({ id: "a", content: "Talk to BOB about the roadmap" })]);
    controller.runSearch("bob");
    expect(get(controller.searchResultsStore)).toHaveLength(1);
  });

  it("clears results for an empty query", () => {
    controller.tabs.set([tab({ id: "a", content: "Talk to Bob" })]);
    controller.runSearch("bob");
    controller.runSearch("   ");
    expect(get(controller.searchResultsStore)).toHaveLength(0);
  });

  it("searches across all files when scope is 'all'", async () => {
    controller.tabs.set([]);
    apiMock.readAllNotes.mockResolvedValue([["2026-08-01.txt", "an old note about Bob"]]);
    await controller.refreshAllNotesCache();
    controller.runSearch("bob", "all");
    expect(get(controller.searchResultsStore)).toHaveLength(1);
  });
});

describe("openMeetingHistory (§70: mid-line consequence-action dedup)", () => {
  it("aggregates matching sections across dates, deduping a mid-line consequence-action", async () => {
    controller.tabs.set([tab({ id: "active", filename: "2026-09-10.txt", content: "Weekly Sync\n====\nsome note" })]);
    controller.activeTabId.set("active");
    controller.registerEditorApi({
      getContent: () => "",
      setContent: () => {},
      insertAtCursor: () => {},
      jumpToLine: () => {},
      getCursorLineIdx: () => 2,
      focus: () => {},
    });
    apiMock.readAllNotes.mockResolvedValue([
      ["2026-09-01.txt", "Weekly Sync\n====\nTalked to Sam => # follow up with him"],
      ["2026-09-08.txt", "Weekly Sync\n====\nTalked to Sam => # follow up with him"], // same action, reworded context
    ]);
    await controller.openMeetingHistory();
    expect(get(controller.modal)).toBe("history");
    expect(get(controller.historyTargetHeader)).toBe("Weekly Sync");
    expect(get(controller.historyItems)).toHaveLength(1); // deduped, not 2
  });

  it("shows a toast and does not open when the cursor isn't inside a named section", async () => {
    controller.tabs.set([tab({ id: "active", content: "no header here" })]);
    controller.activeTabId.set("active");
    controller.registerEditorApi({
      getContent: () => "",
      setContent: () => {},
      insertAtCursor: () => {},
      jumpToLine: () => {},
      getCursorLineIdx: () => 0,
      focus: () => {},
    });
    await controller.openMeetingHistory();
    expect(get(controller.modal)).not.toBe("history");
    expect(get(controller.toastMessage)).toMatch(/not on or inside a named section/);
  });
});

describe("importSectionsIntoActiveTab", () => {
  it("appends imported sections to the active tab", () => {
    controller.tabs.set([tab({ id: "a", content: "" })]);
    controller.activeTabId.set("a");
    controller.importSectionsIntoActiveTab("Standup");
    expect(get(controller.tabs)[0].content).toContain("Standup");
    expect(get(controller.toastMessage)).toBe("Sections imported.");
  });

  it("shows a toast instead of a no-op change", () => {
    controller.tabs.set([tab({ id: "a", content: "unchanged" })]);
    controller.activeTabId.set("a");
    controller.importSectionsIntoActiveTab("");
    expect(get(controller.tabs)[0].content).toBe("unchanged");
    expect(get(controller.toastMessage)).toBe("Nothing to import.");
  });
});

describe("directory switching", () => {
  it("switches directly when there's no unresolved scratchpad content", async () => {
    controller.tabs.set([tab({ id: "a", content: "saved note" })]);
    apiMock.setNotesDir.mockResolvedValue({
      notesDir: "/new-folder",
      colorMode: "grayscale",
      wordWrap: false,
      recentNotesDirs: [],
    });
    await controller.switchToRecentDirectory("/new-folder");
    expect(get(controller.notesDir)).toBe("/new-folder");
    expect(get(controller.modal)).toBe("none");
  });

  it("blocks with the unsaved-scratchpads gate when a scratchpad has real content", async () => {
    controller.tabs.set([tab({ id: "a", isScratchpad: true, filename: "Scratchpad 1", content: "unsaved idea" })]);
    await controller.switchToRecentDirectory("/new-folder");
    expect(get(controller.modal)).toBe("unsavedScratchpads");
    expect(get(controller.unsavedScratchpadNames)).toEqual(["Scratchpad 1"]);
    expect(apiMock.setNotesDir).not.toHaveBeenCalled();
  });

  it("cancelDirectorySwitch backs out without switching", async () => {
    controller.tabs.set([tab({ id: "a", isScratchpad: true, content: "unsaved idea" })]);
    await controller.switchToRecentDirectory("/new-folder");
    controller.cancelDirectorySwitch();
    expect(get(controller.modal)).toBe("settings");
    expect(apiMock.setNotesDir).not.toHaveBeenCalled();
  });

  it("confirmDiscardAndSwitch proceeds despite the unsaved scratchpad", async () => {
    controller.tabs.set([tab({ id: "a", isScratchpad: true, content: "unsaved idea" })]);
    apiMock.setNotesDir.mockResolvedValue({
      notesDir: "/new-folder",
      colorMode: "grayscale",
      wordWrap: false,
      recentNotesDirs: [],
    });
    await controller.switchToRecentDirectory("/new-folder");
    await controller.confirmDiscardAndSwitch();
    expect(apiMock.setNotesDir).toHaveBeenCalledWith("/new-folder");
    expect(get(controller.notesDir)).toBe("/new-folder");
  });
});

describe("initApp", () => {
  it("loads config and always includes today's tab", async () => {
    apiMock.getConfig.mockResolvedValue({
      notesDir: "/notes",
      colorMode: "color",
      wordWrap: true,
      recentNotesDirs: ["/old"],
    });
    vi.setSystemTime(new Date(2026, 8, 15));
    await controller.initApp();
    expect(get(controller.notesDir)).toBe("/notes");
    expect(get(controller.colorMode)).toBe("color");
    expect(get(controller.wordWrap)).toBe(true);
    expect(get(controller.recentNotesDirs)).toEqual(["/old"]);
    expect(get(controller.tabs).some((t) => t.filename === "2026-09-15.txt")).toBe(true);
    vi.useRealTimers();
  });

  it("restores the previously active tab, falling back to today if it no longer exists", async () => {
    vi.setSystemTime(new Date(2026, 8, 15));
    apiMock.readTabSession.mockResolvedValue({ openTabs: ["2026-09-14.txt"], activeTab: "2026-09-14.txt" });
    apiMock.readNote.mockImplementation(async (filename: string) =>
      filename === "2026-09-14.txt" ? "yesterday's note" : null,
    );
    await controller.initApp();
    const active = get(controller.tabs).find((t) => t.id === get(controller.activeTabId));
    expect(active?.filename).toBe("2026-09-14.txt");
    vi.useRealTimers();
  });

  it("silently skips a session tab whose file was deleted", async () => {
    vi.setSystemTime(new Date(2026, 8, 15));
    apiMock.readTabSession.mockResolvedValue({ openTabs: ["2026-09-10.txt"], activeTab: "2026-09-10.txt" });
    apiMock.readNote.mockResolvedValue(null); // file no longer exists
    await controller.initApp();
    expect(get(controller.tabs).some((t) => t.filename === "2026-09-10.txt")).toBe(false);
    // Falls back to today since the previously-active tab couldn't be restored.
    const active = get(controller.tabs).find((t) => t.id === get(controller.activeTabId));
    expect(active?.filename).toBe("2026-09-15.txt");
    vi.useRealTimers();
  });
});

describe("modal open/close helpers", () => {
  it.each([
    ["openDatePicker", "date"],
    ["openActionDrawer", "actions"],
    ["openCrossTabSearch", "search"],
    ["openSectionImport", "sectionImport"],
    ["openSettings", "settings"],
    ["openShortcutsHelp", "shortcuts"],
    ["openGlyphLegend", "glyphLegend"],
    ["openAbout", "about"],
  ] as const)("%s sets modal to %s", (fn, expected) => {
    (controller as any)[fn]();
    expect(get(controller.modal)).toBe(expected);
  });

  it("closeAllModals resets to none", () => {
    controller.modal.set("settings");
    controller.closeAllModals();
    expect(get(controller.modal)).toBe("none");
  });

  it("openProjectLink opens the project URL externally", () => {
    controller.openProjectLink();
    expect(apiMock.openExternalUrl).toHaveBeenCalledWith(controller.PROJECT_URL);
  });
});

describe("setColorMode", () => {
  it("updates the store, the DOM dataset, and persists via the API", async () => {
    await controller.setColorMode("color");
    expect(get(controller.colorMode)).toBe("color");
    expect(document.documentElement.dataset.colorMode).toBe("color");
    expect(apiMock.setColorMode).toHaveBeenCalledWith("color");
  });
});

describe("setWordWrap (§80)", () => {
  it("updates the store and persists via the API", async () => {
    await controller.setWordWrap(true);
    expect(get(controller.wordWrap)).toBe(true);
    expect(apiMock.setWordWrap).toHaveBeenCalledWith(true);

    await controller.setWordWrap(false);
    expect(get(controller.wordWrap)).toBe(false);
    expect(apiMock.setWordWrap).toHaveBeenLastCalledWith(false);
  });
});

describe("import draft (§33)", () => {
  it("remembers unsubmitted text and can be cleared", () => {
    controller.saveImportDraft("draft text");
    expect(controller.getImportDraftText()).toBe("draft text");
    controller.clearImportDraft();
    expect(controller.getImportDraftText()).toBe("");
  });

  it("clears a draft that was left empty", () => {
    controller.saveImportDraft("something");
    controller.saveImportDraft("   ");
    expect(controller.getImportDraftText()).toBe("");
  });
});

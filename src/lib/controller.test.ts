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
  setThemeMode: vi.fn(),
  setLastSeenVersion: vi.fn(),
  setWordWrap: vi.fn(),
  setReadableLineLength: vi.fn(),
  setAutoCheckUpdates: vi.fn(),
  listNoteFiles: vi.fn(),
  readNote: vi.fn(),
  writeNote: vi.fn(),
  readNoteWithMetadata: vi.fn(),
  getFileMetadata: vi.fn(),
  writeConflictCopy: vi.fn(),
  readAllNotes: vi.fn(),
  readTabSession: vi.fn(),
  writeTabSession: vi.fn(),
  pathExists: vi.fn(),
  getAppVersion: vi.fn(),
  openExternalUrl: vi.fn(),
};

const NO_META = { exists: false, contentHash: null, sizeBytes: null, modifiedMs: null };
/** `read_note_with_metadata` mock result for a note whose content is `c`
 * (`null` = the file doesn't exist). */
const withMeta = (c: string | null) => ({
  content: c,
  metadata: c === null ? NO_META : { exists: true, contentHash: `h:${c}`, sizeBytes: c.length, modifiedMs: 0 },
});

vi.mock("./tauriApi", () => apiMock);

const tauriWindowMock = {
  setTitle: vi.fn(),
  isFullscreen: vi.fn(),
  isMaximized: vi.fn(),
  onResized: vi.fn(),
  onCloseRequested: vi.fn(),
  onFocusChanged: vi.fn(),
  destroy: vi.fn(),
};
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => tauriWindowMock,
}));

const dialogMock = { open: vi.fn() };
vi.mock("@tauri-apps/plugin-dialog", () => dialogMock);

// §update-check: `boot.ts` may fire a launch-time check (gated on
// `AppConfig.autoCheckUpdates`); mocked here so no test that calls
// `initApp()` reaches the real plugin (no `window.__TAURI_INTERNALS__`
// exists under Vitest/jsdom).
const updaterMock = { check: vi.fn() };
vi.mock("@tauri-apps/plugin-updater", () => updaterMock);
const processMock = { relaunch: vi.fn() };
vi.mock("@tauri-apps/plugin-process", () => processMock);

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
  apiMock.readNoteWithMetadata.mockResolvedValue({ content: null, metadata: NO_META });
  apiMock.getFileMetadata.mockResolvedValue(NO_META);
  apiMock.writeConflictCopy.mockResolvedValue("/notes/.chrononote-conflicts/copy.txt");
  apiMock.readAllNotes.mockResolvedValue([]);
  apiMock.readTabSession.mockResolvedValue(null);
  apiMock.writeNote.mockResolvedValue({ exists: true, contentHash: "hash", sizeBytes: 0, modifiedMs: 0 });
  apiMock.writeTabSession.mockResolvedValue(undefined);
  apiMock.setLastSeenVersion.mockResolvedValue({} as never);
  apiMock.openExternalUrl.mockResolvedValue(undefined);
  // Off by default here (unlike the real Rust default) so the launch-time
  // update check in `initApp()` stays inert for every test that doesn't
  // explicitly opt in — `updaterMock.check` still resolves `null` as a
  // second line of defense for any test that does.
  apiMock.getConfig.mockResolvedValue({
    notesDir: "/notes",
    colorMode: "grayscale",
    wordWrap: false,
    readableLineLength: false,
    recentNotesDirs: [],
    autoCheckUpdates: false,
  });
  apiMock.setNotesDir.mockResolvedValue({
    notesDir: "/new",
    colorMode: "grayscale",
    wordWrap: false,
    readableLineLength: false,
    recentNotesDirs: [],
    autoCheckUpdates: false,
  });
  updaterMock.check.mockResolvedValue(null);
  processMock.relaunch.mockResolvedValue(undefined);
  apiMock.getAppVersion.mockResolvedValue("0.0.0-test");
  tauriWindowMock.setTitle.mockResolvedValue(undefined);
  tauriWindowMock.isFullscreen.mockResolvedValue(false);
  tauriWindowMock.isMaximized.mockResolvedValue(false);
  tauriWindowMock.onResized.mockResolvedValue(undefined);
  tauriWindowMock.onCloseRequested.mockResolvedValue(() => {});
  tauriWindowMock.onFocusChanged.mockResolvedValue(() => {});
  tauriWindowMock.destroy.mockResolvedValue(undefined);
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
    apiMock.readNoteWithMetadata.mockResolvedValue(withMeta("fresh content from disk"));
    await controller.reopenLastClosedTab();
    const list = get(controller.tabs);
    expect(list.some((t) => t.filename === "2026-09-01.txt" && t.content === "fresh content from disk")).toBe(true);
  });

  it("reopenLastClosedTab is a no-op with nothing to reopen", () => {
    expect(() => controller.reopenLastClosedTab()).not.toThrow();
  });

  it("#46: closing a tab right after resolving its last action updates the all-notes cache, not just disk", async () => {
    // Populate the disk-read cache *while the action is still open* —
    // mirrors opening the date picker (or Action Drawer "All Files") once
    // before resolving anything.
    apiMock.readAllNotes.mockResolvedValue([["2026-09-11.txt", "# open action"]]);
    controller.tabs.set([tab({ id: "a", filename: "2026-09-11.txt", content: "# open action" })]);
    controller.activeTabId.set("a");
    await controller.refreshAllNotesCache();
    expect(get(controller.allNotesCache)["2026-09-11.txt"]).toBe("# open action");

    // Resolve it, then close the tab — while it was open,
    // `writeNoteAndInvalidateCache` alone wouldn't touch the cache (the
    // live-tab overlay was covering for it); closing is the moment that
    // overlay disappears.
    controller.tabs.set([tab({ id: "a", filename: "2026-09-11.txt", content: "v open action" })]);
    controller.closeTab("a");

    // Without #46's fix, this would still read the stale "# open action"
    // — the disk-cache entry from the first read, now with no live tab
    // left to override it (a date-picker dot, or an Action-Drawer/Search/
    // Section-History row, that never clears).
    await controller.refreshAllNotesCache();
    expect(get(controller.allNotesCache)["2026-09-11.txt"]).toBe("v open action");
  });

  it("#46: a closed scratchpad's content never touches the all-notes cache (it was never on disk)", async () => {
    apiMock.readAllNotes.mockResolvedValue([]);
    controller.tabs.set([tab({ id: "a", isScratchpad: true, filename: "Scratchpad 1", content: "# an idea" })]);
    await controller.refreshAllNotesCache();
    controller.closeTab("a");
    await controller.refreshAllNotesCache();
    expect(get(controller.allNotesCache)["Scratchpad 1"]).toBeUndefined();
  });
});

describe("prefetchNotesForDates (date-picker perf)", () => {
  it("fetches missing filenames individually and merges them into the cache", async () => {
    apiMock.readNote.mockImplementation(async (fn: string) => (fn === "2026-01-05.txt" ? "# open" : null));
    await controller.prefetchNotesForDates(["2026-01-05.txt", "2026-01-06.txt"]);
    expect(apiMock.readNote).toHaveBeenCalledWith("2026-01-05.txt");
    expect(apiMock.readNote).toHaveBeenCalledWith("2026-01-06.txt");
    expect(get(controller.allNotesCache)["2026-01-05.txt"]).toBe("# open");
    // A missing file (readNote resolves null) never gets a cache entry.
    expect(get(controller.allNotesCache)["2026-01-06.txt"]).toBeUndefined();
  });

  it("skips a filename already in the cache — nothing left to gain re-reading it", async () => {
    controller.allNotesCache.set({ "2026-01-05.txt": "already cached" });
    await controller.prefetchNotesForDates(["2026-01-05.txt"]);
    expect(apiMock.readNote).not.toHaveBeenCalled();
    expect(get(controller.allNotesCache)["2026-01-05.txt"]).toBe("already cached");
  });

  it("uses an open tab's live content instead of reading it from disk", async () => {
    controller.tabs.set([tab({ id: "a", filename: "2026-01-05.txt", content: "unsaved edit" })]);
    await controller.prefetchNotesForDates(["2026-01-05.txt"]);
    expect(apiMock.readNote).not.toHaveBeenCalledWith("2026-01-05.txt");
    expect(get(controller.allNotesCache)["2026-01-05.txt"]).toBe("unsaved edit");
  });

  it("never uses a scratchpad's content — it isn't a dated filename to begin with", async () => {
    controller.tabs.set([tab({ id: "a", isScratchpad: true, filename: "Scratchpad 1", content: "an idea" })]);
    apiMock.readNote.mockResolvedValue("on-disk content");
    await controller.prefetchNotesForDates(["2026-01-05.txt"]);
    expect(get(controller.allNotesCache)["2026-01-05.txt"]).toBe("on-disk content");
    expect(get(controller.allNotesCache)["Scratchpad 1"]).toBeUndefined();
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

describe("flushAllPendingSaves (§93 exit barrier)", () => {
  it("writes a tab's debounced content immediately instead of waiting out the 400ms", async () => {
    controller.tabs.set([tab({ id: "a", filename: "2026-09-01.txt", content: "start" })]);
    controller.activeTabId.set("a");
    controller.updateActiveTabContent("typed just now"); // schedules a 400ms save
    expect(apiMock.writeNote).not.toHaveBeenCalled();

    await controller.flushAllPendingSaves();

    expect(apiMock.writeNote).toHaveBeenCalledWith("2026-09-01.txt", "typed just now");
  });

  it("resolves cleanly when nothing is pending", async () => {
    await expect(controller.flushAllPendingSaves()).resolves.toBeUndefined();
  });

  it("never rejects even if a write fails", async () => {
    apiMock.writeNote.mockRejectedValueOnce(new Error("disk full"));
    controller.tabs.set([tab({ id: "a", filename: "2026-09-02.txt", content: "x" })]);
    controller.activeTabId.set("a");
    controller.updateActiveTabContent("more");
    await expect(controller.flushAllPendingSaves()).resolves.toBeUndefined();
  });
});

describe("saveState (§100 / §102 — derived from the active tab)", () => {
  it("goes saving → saved around a successful write, and to error on failure", async () => {
    controller.tabs.set([tab({ id: "a", filename: "2026-09-03.txt", content: "start" })]);
    controller.activeTabId.set("a");

    controller.updateActiveTabContent("edited"); // schedules a save
    expect(get(controller.saveState)).toBe("saving");
    await controller.flushAllPendingSaves();
    expect(get(controller.saveState)).toBe("saved");

    apiMock.writeNote.mockRejectedValueOnce(new Error("disk full"));
    controller.updateActiveTabContent("edited again");
    await controller.flushAllPendingSaves();
    expect(get(controller.saveState)).toBe("error");
  });

  it("a §94 conflict cancelling the pending write doesn't leave it stuck on 'saving'", async () => {
    controller.tabs.set([tab({ id: "a", filename: "2026-09-04.txt", content: "x" })]);
    controller.activeTabId.set("a");
    controller.updateActiveTabContent("typing");
    expect(get(controller.saveState)).toBe("saving");
    controller.cancelScheduledSave("a");
    expect(get(controller.saveState)).toBe("saved");
  });

  it("a failed write for one note isn't masked by a concurrent success on another", async () => {
    controller.tabs.set([
      tab({ id: "a", filename: "2026-09-05.txt", content: "a" }),
      tab({ id: "b", filename: "2026-09-06.txt", content: "b" }),
    ]);
    controller.activeTabId.set("a");
    apiMock.writeNote.mockImplementation(async (filename: string) => {
      if (filename === "2026-09-05.txt") throw new Error("denied");
      return { exists: true, contentHash: "h", sizeBytes: 0, modifiedMs: 0 };
    });
    // both notes get a write; A fails, B succeeds
    controller.tabs.set(controller.writeTabContent("a", "a-edit", get(controller.tabs)));
    controller.tabs.set(controller.writeTabContent("b", "b-edit", get(controller.tabs)));
    await controller.flushAllPendingSaves();
    // active tab is A → still shows the failure
    expect(get(controller.saveState)).toBe("error");
    // switch to B → it saved fine (in the app the activeTabId subscription
    // re-derives this; here we call it directly)
    controller.activeTabId.set("b");
    controller.recomputeSaveState();
    expect(get(controller.saveState)).toBe("saved");
    apiMock.writeNote.mockResolvedValue({ exists: true, contentHash: "h", sizeBytes: 0, modifiedMs: 0 });
  });

  it("a scratchpad reads as 'idle' (memory only)", () => {
    controller.tabs.set([tab({ id: "s", isScratchpad: true, filename: "Scratchpad 1", content: "note" })]);
    controller.activeTabId.set("s");
    controller.recomputeSaveState();
    expect(get(controller.saveState)).toBe("idle");
  });
});

describe("historyInsertText (§109/§110)", () => {
  it("rewrites a deferred line as a fresh open action, leaves the rest verbatim", () => {
    expect(controller.historyInsertText("> chase the vendor")).toBe("# chase the vendor");
    expect(controller.historyInsertText("# already open")).toBe("# already open");
    expect(controller.historyInsertText("v done")).toBe("v done");
    expect(controller.historyInsertText("=> # consequence")).toBe("=> # consequence");
  });
});

describe("checkActiveTabForDrift (§94)", () => {
  const FILE = "2026-09-01.txt";
  async function openTabAt(content: string) {
    const hash = await controller.sha256Hex(content);
    controller.tabs.set([tab({ id: "a", filename: FILE, content })]);
    controller.activeTabId.set("a");
    controller.markTabClean("a", hash); // baseline: disk matched `content`
    return hash;
  }
  const metaFor = async (content: string | null) => ({
    exists: content !== null,
    contentHash: content === null ? null : await controller.sha256Hex(content),
    sizeBytes: 0,
    modifiedMs: 0,
  });

  it("Case A: no-op when the disk hash still matches the baseline", async () => {
    await openTabAt("same on both");
    apiMock.getFileMetadata.mockResolvedValue(await metaFor("same on both"));
    await controller.checkActiveTabForDrift();
    expect(get(controller.modal)).toBe("none");
    expect(get(controller.tabs)[0].content).toBe("same on both");
  });

  it("Case B: silent reload when disk changed but there are no local edits", async () => {
    await openTabAt("v1");
    apiMock.getFileMetadata.mockResolvedValue(await metaFor("v2 from elsewhere"));
    apiMock.readNoteWithMetadata.mockResolvedValue({
      content: "v2 from elsewhere",
      metadata: await metaFor("v2 from elsewhere"),
    });
    await controller.checkActiveTabForDrift();
    expect(get(controller.modal)).toBe("none");
    expect(get(controller.tabs)[0].content).toBe("v2 from elsewhere");
  });

  it("Case C: opens the conflict prompt when disk changed AND there are local edits", async () => {
    await openTabAt("v1");
    // local edit — content no longer matches the baseline
    controller.tabs.update((list) => list.map((t) => ({ ...t, content: "v1 + my edit" })));
    apiMock.getFileMetadata.mockResolvedValue(await metaFor("v2 external"));
    apiMock.readNoteWithMetadata.mockResolvedValue({
      content: "v2 external",
      metadata: await metaFor("v2 external"),
    });
    await controller.checkActiveTabForDrift();
    expect(get(controller.modal)).toBe("conflict");
    expect(get(controller.conflictInfo)?.diskContent).toBe("v2 external");
  });

  it("Case C then 'keep my version' writes with a compare-and-swap hash", async () => {
    await openTabAt("v1");
    controller.tabs.update((list) => list.map((t) => ({ ...t, content: "mine" })));
    const externalHash = (await metaFor("external")).contentHash;
    apiMock.getFileMetadata.mockResolvedValue(await metaFor("external"));
    apiMock.readNoteWithMetadata.mockResolvedValue({ content: "external", metadata: await metaFor("external") });
    await controller.checkActiveTabForDrift();

    await controller.resolveConflictKeepMine();
    expect(apiMock.writeNote).toHaveBeenCalledWith(FILE, "mine", externalHash);
    expect(get(controller.modal)).toBe("none");
  });

  it("a deleted-on-disk file drops the baseline without a prompt", async () => {
    await openTabAt("still here in memory");
    apiMock.getFileMetadata.mockResolvedValue(await metaFor(null));
    await controller.checkActiveTabForDrift();
    expect(get(controller.modal)).toBe("none");
    expect(get(controller.tabs)[0].content).toBe("still here in memory");
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

  it("a later copy of a non-action line clears the stale record — no wrong-tab defer (§82 / #8)", () => {
    controller.tabs.set([
      tab({ id: "old", filename: "2026-08-01.txt", content: "# forward me\n# and me" }),
      tab({ id: "today", filename: "2026-09-15.txt", content: "some notes here" }),
    ]);
    vi.setSystemTime(new Date(2026, 8, 15));

    // Copy an open-action block in the old tab (e.g. to paste into another app).
    controller.recordCopiedAction("# forward me\n# and me", "old");
    // Then copy a plain line in today's tab and paste it into today.
    controller.recordCopiedAction("some notes here", "today");
    controller.handlePasteIntoTab("today");

    // The old tab's actions are untouched — the plain copy replaced the record.
    expect(get(controller.tabs).find((t) => t.id === "old")!.content).toBe("# forward me\n# and me");
    vi.useRealTimers();
  });

  it("a later copy of a different open action replaces the record (defers the new one, not the old)", () => {
    controller.tabs.set([
      tab({ id: "old", filename: "2026-08-01.txt", content: "# old task" }),
      tab({ id: "recent", filename: "2026-09-14.txt", content: "# recent task" }),
      tab({ id: "today", filename: "2026-09-15.txt", content: "" }),
    ]);
    vi.setSystemTime(new Date(2026, 8, 15));

    controller.recordCopiedAction("# old task", "old");
    controller.recordCopiedAction("# recent task", "recent");
    controller.handlePasteIntoTab("today");

    expect(get(controller.tabs).find((t) => t.id === "old")!.content).toBe("# old task");
    expect(get(controller.tabs).find((t) => t.id === "recent")!.content).toBe("> recent task");
    vi.useRealTimers();
  });
});

describe("paste-forward undo link (§86 / #9)", () => {
  const srcContent = "notes\n# do the thing\nmore notes";

  function seedAndPaste() {
    controller.tabs.set([
      tab({ id: "src", filename: "2026-08-01.txt", content: srcContent }),
      tab({ id: "today", filename: "2026-09-15.txt", content: "" }),
    ]);
    vi.setSystemTime(new Date(2026, 8, 15));
    controller.recordCopiedAction("# do the thing", "src");
    controller.handlePasteIntoTab("today");
    vi.useRealTimers();
  }
  const src = () => get(controller.tabs).find((t) => t.id === "src")!.content;

  it("records a link on a successful paste-forward and clears it otherwise", () => {
    seedAndPaste();
    expect(controller._pasteDeferLinkForTest()).toMatchObject({
      targetTabId: "today",
      sourceTabId: "src",
      openBlock: "# do the thing",
      deferredBlock: "> do the thing",
      reverted: false,
    });
  });

  it("undoing the paste in the target tab flips the source's `> ` back to `# `", () => {
    seedAndPaste();
    expect(src()).toBe("notes\n> do the thing\nmore notes");
    // The undo that removes the pasted block from the target.
    controller.onEditorUndo("today", "# do the thing", "");
    expect(src()).toBe(srcContent);
    expect(controller._pasteDeferLinkForTest()!.reverted).toBe(true);
  });

  it("redoing the paste re-defers the source", () => {
    seedAndPaste();
    controller.onEditorUndo("today", "# do the thing", "");
    controller.onEditorRedo("today", "", "# do the thing");
    expect(src()).toBe("notes\n> do the thing\nmore notes");
    expect(controller._pasteDeferLinkForTest()!.reverted).toBe(false);
  });

  it("only the undo step that removes the pasted block fires — earlier undos are ignored", () => {
    seedAndPaste();
    // Undo of some edit made after the paste: the block is still there before and after.
    controller.onEditorUndo("today", "# do the thing\ntyped extra", "# do the thing");
    expect(src()).toBe("notes\n> do the thing\nmore notes"); // still deferred
    expect(controller._pasteDeferLinkForTest()!.reverted).toBe(false);
  });

  it("ignores an undo in a different tab", () => {
    seedAndPaste();
    controller.onEditorUndo("src", "# do the thing", "");
    expect(src()).toBe("notes\n> do the thing\nmore notes");
  });

  it("drops the link (no revert) when the source's `> ` block was since hand-edited away", () => {
    seedAndPaste();
    controller.tabs.set(
      get(controller.tabs).map((t) => (t.id === "src" ? { ...t, content: "notes\nx do the thing\nmore notes" } : t)),
    );
    controller.onEditorUndo("today", "# do the thing", "");
    expect(src()).toBe("notes\nx do the thing\nmore notes"); // untouched
    expect(controller._pasteDeferLinkForTest()).toBeNull();
  });

  it("clears the link when either linked tab closes", () => {
    seedAndPaste();
    controller.closeTab("src");
    expect(controller._pasteDeferLinkForTest()).toBeNull();
  });

  it("defers every open action in a multi-line forward and restores them all on undo", () => {
    controller.tabs.set([
      tab({ id: "src", filename: "2026-08-01.txt", content: "# one\nplain\n# two" }),
      tab({ id: "today", filename: "2026-09-15.txt", content: "" }),
    ]);
    vi.setSystemTime(new Date(2026, 8, 15));
    controller.recordCopiedAction("# one\nplain\n# two", "src");
    controller.handlePasteIntoTab("today");
    vi.useRealTimers();
    expect(src()).toBe("> one\nplain\n> two");
    controller.onEditorUndo("today", "# one\nplain\n# two", "");
    expect(src()).toBe("# one\nplain\n# two");
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
      find: { setQuery: () => {}, next: () => {}, prev: () => {}, clear: () => {} },
    });
    apiMock.readAllNotes.mockResolvedValue([
      ["2026-09-01.txt", "Weekly Sync\n====\nTalked to Sam => # follow up with him"],
      ["2026-09-08.txt", "Weekly Sync\n====\nTalked to Sam => # follow up with him"], // same action, reworded context
    ]);
    await controller.openMeetingHistory();
    expect(get(controller.modal)).toBe("history");
    expect(get(controller.historyTargetHeader)).toBe("Weekly Sync");
    expect(get(controller.historyItems)).toHaveLength(1); // deduped, not 2
    expect(get(controller.historyItems)[0].action).toBe("# follow up with him"); // #41: post-arrow text only
  });

  it("#41: a line with a leading action AND a mid-line follow-up yields two rows", async () => {
    controller.tabs.set([tab({ id: "active", filename: "2026-09-10.txt", content: "Sync\n====\nx" })]);
    controller.activeTabId.set("active");
    controller.registerEditorApi({
      getContent: () => "",
      setContent: () => {},
      insertAtCursor: () => {},
      jumpToLine: () => {},
      getCursorLineIdx: () => 2,
      focus: () => {},
      find: { setQuery: () => {}, next: () => {}, prev: () => {}, clear: () => {} },
    });
    apiMock.readAllNotes.mockResolvedValue([["2026-09-02.txt", "Sync\n====\n# draft the plan => # send it round"]]);
    await controller.openMeetingHistory();
    expect(get(controller.historyItems).map((i) => i.action)).toEqual(["# draft the plan", "# send it round"]);
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
      find: { setQuery: () => {}, next: () => {}, prev: () => {}, clear: () => {} },
    });
    await controller.openMeetingHistory();
    expect(get(controller.modal)).not.toBe("history");
    expect(get(controller.toastMessage)).toMatch(/not on or inside a named section/);
  });
});

describe("historyActionsForLine (#41)", () => {
  const f = (line: string) => controller.historyActionsForLine(line);
  it("a plain leading action → itself", () => {
    expect(f("# renew the cert")).toEqual(["# renew the cert"]);
    expect(f("> book the sessions")).toEqual(["> book the sessions"]);
  });
  it("a mid-line follow-up → only the text after it", () => {
    expect(f("Talked to Sam => # follow up")).toEqual(["# follow up"]);
    expect(f("chatted => let's regroup")).toEqual(["=> let's regroup"]);
  });
  it("multiple follow-ups → only the last", () => {
    expect(f("a => b => # c")).toEqual(["# c"]);
  });
  it("a leading action AND a follow-up → both", () => {
    expect(f("# do X => # do Y")).toEqual(["# do X", "# do Y"]);
  });
  it("neither → nothing", () => {
    expect(f("just a plain note")).toEqual([]);
    expect(f("- a bullet")).toEqual([]);
  });
});

describe("findPreviousSectionOccurrence (#27)", () => {
  const sources = {
    "2026-09-10.txt": "Weekly Sync\n====\n# today's fresh action",
    "2026-09-08.txt": "Weekly Sync - 2026-09-08\n====\n# renew the cert\n- talked budget\n\n",
    "2026-09-01.txt": "Weekly Sync\n====\nolder occurrence\nStandup\n====\nunrelated",
  };

  it("returns the verbatim body of the most recent occurrence before the current note", () => {
    const lo = controller.findPreviousSectionOccurrence(sources, "Weekly Sync", "2026-09-10.txt");
    expect(lo).not.toBeNull();
    expect(lo!.filename).toBe("2026-09-08.txt");
    expect(lo!.lines).toEqual(["# renew the cert", "- talked budget"]); // trailing blank trimmed
    expect(lo!.startLineIdx).toBe(2);
  });

  it("stops the body at the next section header and ignores later files", () => {
    const lo = controller.findPreviousSectionOccurrence(sources, "Weekly Sync", "2026-09-08.txt");
    expect(lo!.filename).toBe("2026-09-01.txt");
    expect(lo!.lines).toEqual(["older occurrence"]);
  });

  it("returns null when there is no earlier occurrence", () => {
    expect(controller.findPreviousSectionOccurrence(sources, "Weekly Sync", "2026-09-01.txt")).toBeNull();
    expect(controller.findPreviousSectionOccurrence(sources, "Nonexistent", "2026-09-10.txt")).toBeNull();
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
      readableLineLength: true,
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
      readableLineLength: true,
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
      readableLineLength: false,
      recentNotesDirs: ["/old"],
    });
    vi.setSystemTime(new Date(2026, 8, 15));
    await controller.initApp();
    expect(get(controller.notesDir)).toBe("/notes");
    expect(get(controller.colorMode)).toBe("color");
    expect(get(controller.wordWrap)).toBe(true);
    expect(get(controller.readableLineLength)).toBe(false);
    expect(get(controller.recentNotesDirs)).toEqual(["/old"]);
    expect(get(controller.tabs).some((t) => t.filename === "2026-09-15.txt")).toBe(true);
    vi.useRealTimers();
  });

  it("restores the previously active tab on a same-day reopen, falling back to today if it no longer exists", async () => {
    vi.setSystemTime(new Date(2026, 8, 15));
    apiMock.readTabSession.mockResolvedValue({
      openTabs: ["2026-09-14.txt"],
      activeTab: "2026-09-14.txt",
      lastOpenedDate: "2026-09-15", // already opened today — restore my last tab
    });
    apiMock.readNoteWithMetadata.mockImplementation(async (filename: string) =>
      withMeta(filename === "2026-09-14.txt" ? "yesterday's note" : null),
    );
    await controller.initApp();
    const active = get(controller.tabs).find((t) => t.id === get(controller.activeTabId));
    expect(active?.filename).toBe("2026-09-14.txt");
    vi.useRealTimers();
  });

  it("#23: forces today's tab active on the first open of a new day", async () => {
    vi.setSystemTime(new Date(2026, 8, 15));
    apiMock.readTabSession.mockResolvedValue({
      openTabs: ["2026-09-14.txt"],
      activeTab: "2026-09-14.txt",
      lastOpenedDate: "2026-09-14", // last opened yesterday
    });
    apiMock.readNoteWithMetadata.mockImplementation(async (filename: string) =>
      withMeta(filename === "2026-09-14.txt" ? "yesterday's note" : ""),
    );
    await controller.initApp();
    const active = get(controller.tabs).find((t) => t.id === get(controller.activeTabId));
    expect(active?.filename).toBe("2026-09-15.txt");
    // yesterday's tab is still restored, just not active
    expect(get(controller.tabs).some((t) => t.filename === "2026-09-14.txt")).toBe(true);
    vi.useRealTimers();
  });

  it("#23: forces today's tab active on the very first launch after install", async () => {
    vi.setSystemTime(new Date(2026, 8, 15));
    apiMock.readTabSession.mockResolvedValue(null);
    await controller.initApp();
    const active = get(controller.tabs).find((t) => t.id === get(controller.activeTabId));
    expect(active?.filename).toBe("2026-09-15.txt");
    vi.useRealTimers();
  });

  it("#23: stamps the session with today's date on boot", async () => {
    vi.setSystemTime(new Date(2026, 8, 15));
    apiMock.readTabSession.mockResolvedValue(null);
    await controller.initApp();
    await vi.waitFor(() =>
      expect(apiMock.writeTabSession).toHaveBeenCalledWith(expect.anything(), expect.anything(), "2026-09-15"),
    );
    vi.useRealTimers();
  });

  it("silently skips a session tab whose file was deleted", async () => {
    vi.setSystemTime(new Date(2026, 8, 15));
    apiMock.readTabSession.mockResolvedValue({ openTabs: ["2026-09-10.txt"], activeTab: "2026-09-10.txt" });
    apiMock.readNoteWithMetadata.mockResolvedValue(withMeta(null)); // file no longer exists
    await controller.initApp();
    expect(get(controller.tabs).some((t) => t.filename === "2026-09-10.txt")).toBe(false);
    // Falls back to today since the previously-active tab couldn't be restored.
    const active = get(controller.tabs).find((t) => t.id === get(controller.activeTabId));
    expect(active?.filename).toBe("2026-09-15.txt");
    vi.useRealTimers();
  });

  it("§100: keeps the status word count in sync with the active tab", async () => {
    vi.setSystemTime(new Date(2026, 8, 15));
    apiMock.readTabSession.mockResolvedValue(null);
    apiMock.readNoteWithMetadata.mockResolvedValue(withMeta("one two three"));
    await controller.initApp();
    expect(get(controller.statusWordCount)).toBe(3);

    controller.updateActiveTabContent("now there are five whole words");
    expect(get(controller.statusWordCount)).toBe(6);

    controller.updateActiveTabContent("   ");
    expect(get(controller.statusWordCount)).toBe(0);
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
    ["openGlyphLegend", "shortcuts"], // §110: folded into the combined drawer
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

  it("accepts the §111 legacy palette", async () => {
    await controller.setColorMode("legacy");
    expect(get(controller.colorMode)).toBe("legacy");
    expect(document.documentElement.dataset.colorMode).toBe("legacy");
    expect(apiMock.setColorMode).toHaveBeenCalledWith("legacy");
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

describe("setReadableLineLength (§99 / §110)", () => {
  it("updates the store and persists via the API", async () => {
    await controller.setReadableLineLength(false);
    expect(get(controller.readableLineLength)).toBe(false);
    expect(apiMock.setReadableLineLength).toHaveBeenCalledWith(false);

    await controller.setReadableLineLength(true);
    expect(get(controller.readableLineLength)).toBe(true);
    expect(apiMock.setReadableLineLength).toHaveBeenLastCalledWith(true);
  });

  it("§110: turning it on force-enables word wrap", async () => {
    controller.wordWrap.set(false);
    await controller.setReadableLineLength(true);
    expect(get(controller.wordWrap)).toBe(true);
    expect(apiMock.setWordWrap).toHaveBeenCalledWith(true);

    // turning it back off leaves wrap where it is (user owns it again)
    await controller.setReadableLineLength(false);
    expect(get(controller.wordWrap)).toBe(true);
  });
});

describe("setThemeMode (#48)", () => {
  it("updates the store, reflects it onto the DOM, and persists via the API", async () => {
    await controller.setThemeMode("light");
    expect(get(controller.themeMode)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(apiMock.setThemeMode).toHaveBeenCalledWith("light");

    await controller.setThemeMode("dark");
    expect(get(controller.themeMode)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(apiMock.setThemeMode).toHaveBeenLastCalledWith("dark");

    await controller.setThemeMode("system");
    expect(get(controller.themeMode)).toBe("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(apiMock.setThemeMode).toHaveBeenLastCalledWith("system");
  });
});

describe("setAutoCheckUpdates (§update-check)", () => {
  it("updates the store and persists via the API", async () => {
    await controller.setAutoCheckUpdates(false);
    expect(get(controller.autoCheckUpdates)).toBe(false);
    expect(apiMock.setAutoCheckUpdates).toHaveBeenCalledWith(false);

    await controller.setAutoCheckUpdates(true);
    expect(get(controller.autoCheckUpdates)).toBe(true);
    expect(apiMock.setAutoCheckUpdates).toHaveBeenLastCalledWith(true);
  });
});

describe("initApp — launch-time update check (§update-check)", () => {
  it("checks on boot when the config has it enabled", async () => {
    apiMock.getConfig.mockResolvedValue({
      notesDir: "/notes",
      colorMode: "grayscale",
      wordWrap: false,
      readableLineLength: false,
      recentNotesDirs: [],
      autoCheckUpdates: true,
    });
    await controller.initApp();
    // initApp fires the check without awaiting it — give its promise a
    // tick to run before asserting.
    await Promise.resolve();
    await Promise.resolve();
    expect(updaterMock.check).toHaveBeenCalledTimes(1);
    expect(get(controller.autoCheckUpdates)).toBe(true);
  });

  it("never checks on boot when the config has it disabled", async () => {
    // The shared beforeEach config already has autoCheckUpdates: false.
    await controller.initApp();
    await Promise.resolve();
    await Promise.resolve();
    expect(updaterMock.check).not.toHaveBeenCalled();
    expect(get(controller.autoCheckUpdates)).toBe(false);
  });
});

describe("initApp — first launch after an update (#50)", () => {
  it("shows a status-bar link when the running version differs from lastSeenVersion, and persists it", async () => {
    apiMock.getConfig.mockResolvedValue({
      notesDir: "/notes",
      colorMode: "grayscale",
      wordWrap: false,
      readableLineLength: false,
      recentNotesDirs: [],
      autoCheckUpdates: false,
      lastSeenVersion: "0.7.4",
    });
    apiMock.getAppVersion.mockResolvedValue("0.7.5");
    await controller.initApp();
    expect(get(controller.justUpdatedToVersion)).toBe("0.7.5");
    expect(apiMock.setLastSeenVersion).toHaveBeenCalledWith("0.7.5");
  });

  it("shows nothing on a fresh install — lastSeenVersion omitted", async () => {
    apiMock.getConfig.mockResolvedValue({
      notesDir: "/notes",
      colorMode: "grayscale",
      wordWrap: false,
      readableLineLength: false,
      recentNotesDirs: [],
      autoCheckUpdates: false,
      lastSeenVersion: null,
    });
    apiMock.getAppVersion.mockResolvedValue("0.7.5");
    await controller.initApp();
    expect(get(controller.justUpdatedToVersion)).toBe(null);
    // Still recorded, so the *next* real update has something to compare against.
    expect(apiMock.setLastSeenVersion).toHaveBeenCalledWith("0.7.5");
  });

  it("shows nothing, and doesn't re-persist, when lastSeenVersion already matches", async () => {
    apiMock.getConfig.mockResolvedValue({
      notesDir: "/notes",
      colorMode: "grayscale",
      wordWrap: false,
      readableLineLength: false,
      recentNotesDirs: [],
      autoCheckUpdates: false,
      lastSeenVersion: "0.7.5",
    });
    apiMock.getAppVersion.mockResolvedValue("0.7.5");
    await controller.initApp();
    expect(get(controller.justUpdatedToVersion)).toBe(null);
    expect(apiMock.setLastSeenVersion).not.toHaveBeenCalled();
  });
});

describe("openJustUpdatedReleaseNotes (#50)", () => {
  it("opens the release page for the version shown, and dismisses the banner", async () => {
    controller.justUpdatedToVersion.set("0.7.5");
    controller.openJustUpdatedReleaseNotes();
    expect(apiMock.openExternalUrl).toHaveBeenCalledWith(expect.stringContaining("/releases/tag/v0.7.5"));
    expect(get(controller.justUpdatedToVersion)).toBe(null);
  });

  it("does nothing (no external call) when there's nothing to show", () => {
    controller.justUpdatedToVersion.set(null);
    controller.openJustUpdatedReleaseNotes();
    expect(apiMock.openExternalUrl).not.toHaveBeenCalled();
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

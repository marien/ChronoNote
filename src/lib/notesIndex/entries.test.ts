import { describe, it, expect } from "vitest";
import type { NoteTab } from "../types";
import type { NoteEntry } from "./index";
import { noteTexts, patchTabs, rebuildEntries } from "./entries";

const tab = (id: string, filename: string, content: string, isScratchpad = false): NoteTab => ({
  id,
  filename,
  content,
  isScratchpad,
});

/** What the store does with the two functions: a revision that goes up when the map changed. */
function step(prev: { entries: ReadonlyMap<string, NoteEntry>; revision: number }, next: ReadonlyMap<string, NoteEntry>) {
  return { entries: next, revision: next === prev.entries ? prev.revision : prev.revision + 1 };
}

const SHOWN = { "2026-11-09.txt": "# disk nine\n", "ideas.txt": "# ideas\n" };

describe("rebuildEntries", () => {
  it("two disk notes, no tabs: two disk entries, the date only for the dated filename", () => {
    const entries = rebuildEntries(new Map(), SHOWN, []);
    expect(entries.size).toBe(2);
    const dated = entries.get("2026-11-09.txt")!;
    expect(dated).toMatchObject({
      key: "2026-11-09.txt",
      filename: "2026-11-09.txt",
      dateISO: "2026-11-09",
      text: "# disk nine\n",
      source: "disk",
    });
    expect(dated.tabId).toBeUndefined();
    expect(entries.get("ideas.txt")).toMatchObject({ dateISO: null, source: "disk", text: "# ideas\n" });
  });

  it("a tab open on a disk note: the entry has the tab's text, source tab and the tabId", () => {
    const entries = rebuildEntries(new Map(), SHOWN, [tab("t1", "2026-11-09.txt", "# typed nine\n")]);
    expect(entries.size).toBe(2);
    expect(entries.get("2026-11-09.txt")).toMatchObject({
      text: "# typed nine\n",
      source: "tab",
      tabId: "t1",
      dateISO: "2026-11-09",
    });
    expect(entries.get("ideas.txt")!.source).toBe("disk");
  });

  it("an open tab on a note that is not on disk is an entry too", () => {
    const entries = rebuildEntries(new Map(), {}, [tab("t1", "2026-11-10.txt", "# new\n")]);
    expect(entries.get("2026-11-10.txt")).toMatchObject({ source: "tab", text: "# new\n", tabId: "t1" });
  });

  it("a scratchpad tab is an entry with key scratchpad:<id>, whatever its filename", () => {
    const entries = rebuildEntries(new Map(), SHOWN, [tab("s1", "Scratchpad", "# draft\n", true)]);
    expect(entries.size).toBe(3);
    expect(entries.get("scratchpad:s1")).toMatchObject({
      key: "scratchpad:s1",
      filename: "Scratchpad",
      dateISO: null,
      text: "# draft\n",
      source: "tab",
      tabId: "s1",
    });
    expect(entries.has("Scratchpad")).toBe(false);
  });

  it("a scratchpad does not hide a disk note of the same filename", () => {
    const entries = rebuildEntries(new Map(), { "ideas.txt": "# ideas\n" }, [tab("s1", "ideas.txt", "# draft\n", true)]);
    expect(entries.get("ideas.txt")!.source).toBe("disk");
    expect(entries.get("scratchpad:s1")!.text).toBe("# draft\n");
  });

  it("reuses an entry of the previous map that says the same, and replaces one whose text differs", () => {
    const first = rebuildEntries(new Map(), SHOWN, []);
    const second = rebuildEntries(first, { ...SHOWN, "ideas.txt": "# other\n" }, []);
    expect(second.get("2026-11-09.txt")).toBe(first.get("2026-11-09.txt"));
    expect(second.get("ideas.txt")).not.toBe(first.get("ideas.txt"));
    expect(second.get("ideas.txt")!.text).toBe("# other\n");
  });

  it("returns the previous map itself when nothing differs", () => {
    const first = rebuildEntries(new Map(), SHOWN, [tab("t1", "ideas.txt", "x")]);
    expect(rebuildEntries(first, SHOWN, [tab("t1", "ideas.txt", "x")])).toBe(first);
  });

  it("a note gone from the disk texts is gone from the map", () => {
    const first = rebuildEntries(new Map(), SHOWN, []);
    const second = rebuildEntries(first, { "ideas.txt": "# ideas\n" }, []);
    expect([...second.keys()]).toEqual(["ideas.txt"]);
  });
});

describe("patchTabs", () => {
  it("typing in one tab: only that entry is replaced, every other is the same object, revision up by one", () => {
    const before = [tab("t1", "2026-11-09.txt", "# typed\n"), tab("s1", "Scratchpad", "a", true)];
    const entries = rebuildEntries(new Map(), SHOWN, before);
    const prev = { entries, revision: 5 };

    const after = [tab("t1", "2026-11-09.txt", "# typed more\n"), before[1]];
    const next = step(prev, patchTabs(prev.entries, before, after, SHOWN));

    expect(next.revision).toBe(6);
    expect(next.entries.get("2026-11-09.txt")!.text).toBe("# typed more\n");
    expect(next.entries.get("2026-11-09.txt")).not.toBe(entries.get("2026-11-09.txt"));
    expect(next.entries.get("ideas.txt")).toBe(entries.get("ideas.txt"));
    expect(next.entries.get("scratchpad:s1")).toBe(entries.get("scratchpad:s1"));
    expect(next.entries.size).toBe(entries.size);
  });

  it("the same tabs again: the same map and the same revision", () => {
    const tabsNow = [tab("t1", "2026-11-09.txt", "# typed\n")];
    const entries = rebuildEntries(new Map(), SHOWN, tabsNow);
    const prev = { entries, revision: 3 };
    const next = step(prev, patchTabs(prev.entries, tabsNow, [{ ...tabsNow[0] }], SHOWN));
    expect(next.entries).toBe(entries);
    expect(next.revision).toBe(3);
  });

  it("opening a tab on a disk note: that entry becomes a tab entry, the others stay", () => {
    const entries = rebuildEntries(new Map(), SHOWN, []);
    const next = patchTabs(entries, [], [tab("t1", "ideas.txt", "# changed\n")], SHOWN);
    expect(next.get("ideas.txt")).toMatchObject({ source: "tab", tabId: "t1", text: "# changed\n" });
    expect(next.get("2026-11-09.txt")).toBe(entries.get("2026-11-09.txt"));
  });

  it("opening a scratchpad adds one entry", () => {
    const entries = rebuildEntries(new Map(), SHOWN, []);
    const next = patchTabs(entries, [], [tab("s2", "Scratchpad", "", true)], SHOWN);
    expect(next.size).toBe(3);
    expect(next.get("scratchpad:s2")!.source).toBe("tab");
  });

  it("closing a tab: the entry falls back to the disk text", () => {
    const open = [tab("t1", "2026-11-09.txt", "# typed\n")];
    const entries = rebuildEntries(new Map(), SHOWN, open);
    const next = patchTabs(entries, open, [], SHOWN);
    expect(next.get("2026-11-09.txt")).toMatchObject({ source: "disk", text: "# disk nine\n" });
    expect(next.get("2026-11-09.txt")!.tabId).toBeUndefined();
    expect(next.get("ideas.txt")).toBe(entries.get("ideas.txt"));
  });

  it("closing a tab whose note is not in the disk texts: no entry", () => {
    const open = [tab("t1", "2026-11-10.txt", "# new\n")];
    const entries = rebuildEntries(new Map(), SHOWN, open);
    expect(entries.has("2026-11-10.txt")).toBe(true);
    const next = patchTabs(entries, open, [], SHOWN);
    expect(next.has("2026-11-10.txt")).toBe(false);
    expect(next.size).toBe(2);
  });

  it("closing a scratchpad drops its entry", () => {
    const open = [tab("s1", "Scratchpad", "a", true)];
    const entries = rebuildEntries(new Map(), SHOWN, open);
    const next = patchTabs(entries, open, [], SHOWN);
    expect(next.has("scratchpad:s1")).toBe(false);
  });

  it("a tab that changes its filename moves its entry: the old note falls back, the new one is the tab's", () => {
    const before = [tab("t1", "ideas.txt", "# mine\n")];
    const entries = rebuildEntries(new Map(), SHOWN, before);
    const next = patchTabs(entries, before, [tab("t1", "2026-11-09.txt", "# mine\n")], SHOWN);
    expect(next.get("ideas.txt")).toMatchObject({ source: "disk", text: "# ideas\n" });
    expect(next.get("2026-11-09.txt")).toMatchObject({ source: "tab", tabId: "t1" });
  });

  it("two tabs on one filename that swap places: the last tab's text wins, as a rebuild says", () => {
    const first = tab("t1", "ideas.txt", "# from t1\n");
    const second = tab("t2", "ideas.txt", "# from t2\n");
    const before = [first, second];
    const after = [second, first];
    const entries = rebuildEntries(new Map(), SHOWN, before);
    expect(entries.get("ideas.txt")).toMatchObject({ text: "# from t2\n", tabId: "t2" });
    const patched = patchTabs(entries, before, after, SHOWN);
    expect(patched.get("ideas.txt")).toMatchObject({ text: "# from t1\n", tabId: "t1" });
    expect(patched.get("2026-11-09.txt")).toBe(entries.get("2026-11-09.txt"));
    for (const [key, entry] of rebuildEntries(new Map(), SHOWN, after)) expect(patched.get(key)).toEqual(entry);
  });

  it("typing does not change the order of the tabs: the other tabs' entries stay the same objects", () => {
    const before = [tab("t1", "ideas.txt", "a"), tab("t2", "plan.txt", "b"), tab("s1", "Scratchpad", "c", true)];
    const entries = rebuildEntries(new Map(), SHOWN, before);
    const after = [{ ...before[0], content: "a more" }, before[1], before[2]];
    const next = patchTabs(entries, before, after, SHOWN);
    expect(next.get("ideas.txt")!.text).toBe("a more");
    expect(next.get("plan.txt")).toBe(entries.get("plan.txt"));
    expect(next.get("scratchpad:s1")).toBe(entries.get("scratchpad:s1"));
  });

  it("gives what a rebuild from scratch gives", () => {
    const before = [tab("t1", "ideas.txt", "# mine\n"), tab("s1", "Scratchpad", "a", true)];
    const after = [tab("t1", "ideas.txt", "# mine, more\n"), tab("t2", "2026-11-09.txt", "# open\n")];
    const patched = patchTabs(rebuildEntries(new Map(), SHOWN, before), before, after, SHOWN);
    const scratch = rebuildEntries(new Map(), SHOWN, after);
    expect([...patched.keys()].sort()).toEqual([...scratch.keys()].sort());
    for (const [key, entry] of scratch) expect(patched.get(key)).toEqual(entry);
  });
});

describe("noteTexts", () => {
  it("is key -> text of every non-scratchpad entry", () => {
    const entries = rebuildEntries(new Map(), SHOWN, [
      tab("t1", "ideas.txt", "# mine\n"),
      tab("s1", "Scratchpad", "a", true),
    ]);
    expect(noteTexts({ entries, loaded: true, revision: 1 })).toEqual({
      "2026-11-09.txt": "# disk nine\n",
      "ideas.txt": "# mine\n",
    });
  });
});

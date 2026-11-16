import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { tabs } from "../stores";
import type { NoteTab } from "../types";
import { clearDiskLayer, seedDiskNotesForTest, setDiskNote } from "./diskLayer";
import { notesIndex, type NotesIndex } from "./index";

/** The store around `entries.ts`: it must see a tab that `tabs.ts` changes in place (`renameScratchpad`,
 * `promoteScratchpad`, `exportImport.ts`: change the object, then set a new array with the same objects), and it
 * must tell its subscribers only when something changed. */
describe("the notes index store", () => {
  beforeEach(() => {
    tabs.set([]);
    clearDiskLayer();
  });

  it("a scratchpad renamed in place (the way renameScratchpad does it): the entry has the new filename", () => {
    const scratch: NoteTab = { id: "s1", filename: "Scratchpad 1", isScratchpad: true, content: "# draft\n" };
    tabs.set([scratch]);
    let latest!: NotesIndex;
    const unsubscribe = notesIndex.subscribe((v) => (latest = v));
    try {
      expect(latest.entries.get("scratchpad:s1")!.filename).toBe("Scratchpad 1");
      const list = get(tabs);
      const target = list.find((t) => t.id === "s1")!;
      target.filename = "Project Brainstorm"; // tabs.ts:351
      tabs.set([...list]); // tabs.ts:352
      expect(latest.entries.get("scratchpad:s1")!.filename).toBe("Project Brainstorm");
    } finally {
      unsubscribe();
    }
  });

  it("today's note changed in place by a promotion (promoteScratchpad): the entry has the merged text", () => {
    const today: NoteTab = { id: "t1", filename: "2026-11-16.txt", isScratchpad: false, content: "memory\n" };
    const scratch: NoteTab = { id: "s1", filename: "Scratchpad 1", isScratchpad: true, content: "# scratch\n" };
    tabs.set([today, scratch]);
    let latest!: NotesIndex;
    const unsubscribe = notesIndex.subscribe((v) => (latest = v));
    try {
      const list = get(tabs);
      const remaining = list.filter((t) => t.id !== "s1");
      const todayTab = remaining.find((t) => t.filename === "2026-11-16.txt")!;
      todayTab.content = "memory\n\n\n# scratch\n"; // tabs.ts:416
      tabs.set(remaining); // tabs.ts:421
      expect(latest.entries.get("2026-11-16.txt")!.text).toBe("memory\n\n\n# scratch\n");
      expect(latest.entries.has("scratchpad:s1")).toBe(false);
    } finally {
      unsubscribe();
    }
  });

  it("subscribers hear only about changes: not about equal tabs, nor about a disk write of the same text", () => {
    seedDiskNotesForTest({ "ideas.txt": "# ideas\n" });
    tabs.set([{ id: "t1", filename: "plan.txt", isScratchpad: false, content: "a" }]);
    let calls = 0;
    const unsubscribe = notesIndex.subscribe(() => calls++);
    try {
      expect(calls).toBe(1);

      tabs.set(get(tabs).map((t) => ({ ...t }))); // new array, new objects, same fields
      expect(calls).toBe(1);

      setDiskNote("ideas.txt", "# ideas\n"); // the disk layer says the same again
      expect(calls).toBe(1);

      tabs.set([{ id: "t1", filename: "plan.txt", isScratchpad: false, content: "ab" }]); // typing
      expect(calls).toBe(2);

      setDiskNote("ideas.txt", "# ideas, changed\n");
      expect(calls).toBe(3);
    } finally {
      unsubscribe();
    }
  });

  it("a change of `loaded` alone is announced", () => {
    let latest!: NotesIndex;
    let calls = 0;
    const unsubscribe = notesIndex.subscribe((v) => {
      latest = v;
      calls++;
    });
    try {
      expect(latest.loaded).toBe(false);
      const revision = latest.revision;
      seedDiskNotesForTest({});
      expect(latest.loaded).toBe(true);
      expect(calls).toBe(2);
      expect(latest.revision).toBe(revision); // no entry came or went
    } finally {
      unsubscribe();
    }
  });
});

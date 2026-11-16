import { describe, it, expect, afterAll, vi } from "vitest";
import fc from "fast-check";
import { get } from "svelte/store";

/** R1 / S1: the notes index is the old rule, after every event. The old rule: a note with an open non-scratchpad tab
 * has the tab's text, else the last disk text the disk layer has shown for that name; every scratchpad is an entry
 * of its own. The model of "the last disk text shown" below is written from the events (the table in the S1 brief),
 * not from the code under test. The real `persistence.ts` runs on a fake disk, as in `syncNotesCache.test.ts`. */
const { disk, flags, apiMock } = vi.hoisted(() => {
  const disk = new Map<string, string>();
  const flags = { deleteConflict: false };
  return {
    disk,
    flags,
    apiMock: {
      readAllNotes: vi.fn(async () => [...disk.entries()]),
      readNote: vi.fn(async (fn: string) => disk.get(fn) ?? null),
      deleteNote: vi.fn(async (fn: string, _expectedHash?: string) => {
        if (flags.deleteConflict) throw new Error("conflict: note changed on disk");
        disk.delete(fn);
      }),
      oneDriveSyncNow: vi.fn(),
      oneDriveGetConflicts: vi.fn(async () => []),
      saveScratchpadDrafts: vi.fn(async () => {}),
      // what `promoteScratchpad` writes lands on the fake disk
      writeNote: vi.fn(async (fn: string, content: string, _expectedHash?: string) => {
        disk.set(fn, content);
        return { exists: true, contentHash: `h:${content.length}`, sizeBytes: content.length, modifiedMs: 0 };
      }),
    },
  };
});

vi.mock("../tauriApi", () => apiMock);
// the real `sha256Hex` and the rest of `drift.ts` stay (the real `promoteScratchpad` hashes the merged text)
vi.mock("../drift", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../drift")>()),
  checkActiveTabForDrift: vi.fn(async () => {}),
}));
vi.mock("../calendarSyncActions", () => ({ refreshAgendaFileExists: vi.fn(async () => {}) }));

import { actionTree, flattenActionTree } from "../actionGroups";
import { todayISO } from "../date";
import { allNotesCache, tabs } from "../stores";
import {
  deleteNoteAndInvalidateCache,
  invalidateDiskNotesCache,
  noteClosingWithContent,
  prefetchNotesForDates,
  refreshAllNotesCache,
  updateNotesInCache,
} from "../persistence";
import { promoteScratchpad, renameScratchpad } from "../tabs";
import { dueItems, listSections, normalizeHeaderTitle } from "../tokens";
import type { NoteTab } from "../types";
import { clearDiskLayer, setDiskNote, shownNotes } from "./diskLayer";
import { rebuildEntries } from "./entries";
import { actionsOf, dueOf, linesOf, sectionsOf } from "./facets";
import { notesIndex, noteTexts, type NoteEntry, type NotesIndex } from "./index";

const NAMES = [
  "2026-11-01.txt",
  "2026-11-02.txt",
  "2026-11-03.txt",
  "2026-11-04.txt",
  "2026-11-05.txt",
  "2026-11-06.txt",
  "2026-11-07.txt",
  "2026-11-08.txt",
  "2026-11-09.txt",
  "ideas.txt",
  "plan.txt",
  "misc.txt",
];

const lineArb = fc.constantFrom(
  "# call bob by:2026-11-12",
  "v done thing",
  "# open thing",
  "  # nested step",
  "=> @ann send the form by:2026-11-20",
  "o an idea",
  "- a bullet",
  "Weekly sync",
  "Project plan",
  "=====",
  "=======",
  "[10:00 - 11:00] Planning",
  "[CANCELED] Old title",
  "plain words",
  "",
);
const textArb = fc.array(lineArb, { maxLength: 6 }).map((lines) => lines.join("\n"));
const nameArb = fc.constantFrom(...NAMES);
// Events mostly meet the same few names, so a close, a disk change and a prefetch of one name happen in one run.
const eventNameArb = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...NAMES.slice(0, 3)) },
  { weight: 1, arbitrary: nameArb },
);
const pick = fc.nat(1000);
const scratchNameArb = fc.constantFrom("Scratchpad 9", "Project Brainstorm", "2026-11-03.txt");
const changeArb = fc.record({ name: eventNameArb, text: fc.option(textArb, { nil: null, freq: 5 }) });

type Ev =
  | { k: "edit"; pick: number; text: string }
  | { k: "openNote"; name: string; text: string }
  | { k: "openScratch"; text: string }
  | { k: "close"; pick: number }
  | { k: "diskChange"; name: string; text: string | null }
  | { k: "syncMulti"; changes: { name: string; text: string | null }[] }
  | { k: "delete"; name: string; conflict: boolean }
  | { k: "invalidate" }
  | { k: "refresh" }
  | { k: "prefetch"; names: string[] }
  | { k: "switch" }
  | { k: "rename"; pick: number; name: string }
  | { k: "promote"; pick: number; text: string }
  | { k: "swap"; a: number; b: number };

const eventArb: fc.Arbitrary<Ev> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ k: fc.constant("edit" as const), pick, text: textArb }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant("openNote" as const), name: eventNameArb, text: textArb }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant("openScratch" as const), text: textArb }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant("close" as const), pick }) },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant("diskChange" as const),
      name: eventNameArb,
      text: fc.option(textArb, { nil: null, freq: 5 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      k: fc.constant("syncMulti" as const),
      changes: fc.uniqueArray(changeArb, { minLength: 2, maxLength: 2, selector: (c) => c.name }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ k: fc.constant("delete" as const), name: eventNameArb, conflict: fc.boolean() }) },
  { weight: 1, arbitrary: fc.constant({ k: "invalidate" as const }) },
  { weight: 3, arbitrary: fc.constant({ k: "refresh" as const }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant("prefetch" as const), names: fc.array(eventNameArb, { maxLength: 5 }) }) },
  { weight: 1, arbitrary: fc.constant({ k: "switch" as const }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant("rename" as const), pick, name: scratchNameArb }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant("promote" as const), pick, text: textArb }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant("swap" as const), a: pick, b: pick }) },
);

const scenarioArb = fc.record({
  initial: fc.dictionary(nameArb, textArb),
  events: fc.array(eventArb, { minLength: 1, maxLength: 25 }),
});

/** The model: what the old rule's inputs are after the events so far. */
interface Model {
  /** The last disk text the layer has shown, by name. */
  shown: Record<string, string>;
  /** The disk layer must be read again before the next full refresh. */
  mustRead: boolean;
  /** A full read has happened since the last folder switch. */
  loaded: boolean;
}

let runs = 0;
let msTotal = 0;

function fullRead(model: Model) {
  model.shown = Object.fromEntries(disk);
  model.mustRead = false;
  model.loaded = true;
}

interface Want {
  filename: string;
  dateISO: string | null;
  text: string;
  source: "disk" | "tab";
  tabId?: string;
}

/** The date of a `YYYY-MM-DD.txt` filename, else null (written here from the spec, not taken from the code). */
function dateOf(filename: string): string | null {
  if (!filename.endsWith(".txt")) return null;
  const stem = filename.slice(0, -4);
  return /^\d{4}-\d{2}-\d{2}$/.test(stem) ? stem : null;
}

function expectedEntries(model: Model): Map<string, Want> {
  const out = new Map<string, Want>();
  const list = get(tabs);
  const open = new Map<string, NoteTab>();
  for (const t of list) if (!t.isScratchpad) open.set(t.filename, t); // the old loop: the last tab of a name wins
  for (const [fn, text] of Object.entries(model.shown)) {
    if (!open.has(fn)) out.set(fn, { filename: fn, dateISO: dateOf(fn), text, source: "disk" });
  }
  for (const [fn, t] of open) out.set(fn, { filename: fn, dateISO: dateOf(fn), text: t.content, source: "tab", tabId: t.id });
  for (const t of list) {
    if (t.isScratchpad) {
      out.set(`scratchpad:${t.id}`, { filename: t.filename, dateISO: null, text: t.content, source: "tab", tabId: t.id });
    }
  }
  return out;
}

function checkIndex(index: NotesIndex, model: Model, where: string) {
  // (a) each entry is the old rule's: its text, source, tabId, and also its filename and date
  const expected = expectedEntries(model);
  expect([...index.entries.keys()].sort(), `${where}: keys`).toEqual([...expected.keys()].sort());
  for (const [key, want] of expected) {
    const e = index.entries.get(key)!;
    expect(e.text, `${where}: text of ${key}`).toBe(want.text);
    expect(e.source, `${where}: source of ${key}`).toBe(want.source);
    expect(e.tabId, `${where}: tabId of ${key}`).toBe(want.tabId);
    expect(e.filename, `${where}: filename of ${key}`).toBe(want.filename);
    expect(e.dateISO, `${where}: dateISO of ${key}`).toBe(want.dateISO);
    expect(e.key).toBe(key);
  }
  // `loaded` follows full reads: true after the first, through invalidation, false after a folder switch
  expect(index.loaded, `${where}: loaded`).toBe(model.loaded);
  // (b) every facet equals the same function run from scratch on the entry's text
  for (const e of index.entries.values()) {
    const lines = e.text.split("\n");
    expect(linesOf(e), `${where}: lines of ${e.key}`).toEqual(lines);
    expect(sectionsOf(e), `${where}: sections of ${e.key}`).toEqual(
      listSections(e.text).map((s) => ({ ...s, normalized: normalizeHeaderTitle(s.title) })),
    );
    const roots = actionTree(e.text.split("\n"));
    expect(actionsOf(e), `${where}: actions of ${e.key}`).toEqual({ roots, flat: flattenActionTree(roots) });
    expect(dueOf(e), `${where}: due of ${e.key}`).toEqual(dueItems(e.text));
  }
}

describe("the notes index equals today's rule after every event", { timeout: 30_000 }, () => {
  it("holds for random disks and random event sequences", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ initial, events }) => {
        const started = performance.now();
        // a fresh session
        flags.deleteConflict = false;
        tabs.set([]);
        allNotesCache.set({});
        clearDiskLayer();
        disk.clear();
        for (const [fn, text] of Object.entries(initial)) disk.set(fn, text);
        const model: Model = { shown: {}, mustRead: true, loaded: false };
        let nextTab = 1;

        let latest!: NotesIndex;
        const unsubscribe = notesIndex.subscribe((v) => (latest = v));
        let listening = true;
        const stopListening = () => {
          if (listening) unsubscribe();
          listening = false;
        };
        try {
          checkIndex(latest, model, "start");

          for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            const where = `event ${i} ${JSON.stringify(ev)}`;
            const before = new Map<string, NoteEntry>(latest.entries);
            let editedKey: string | null = null;

            switch (ev.k) {
              case "edit": {
                const list = get(tabs);
                if (list.length === 0) break;
                const idx = ev.pick % list.length;
                const t = list[idx];
                editedKey = t.isScratchpad ? `scratchpad:${t.id}` : t.filename;
                const next = [...list];
                next[idx] = { ...t, content: ev.text }; // what updateActiveTabContent does to the store
                tabs.set(next);
                break;
              }
              case "openNote":
                tabs.update((l) => [...l, { id: `t${nextTab++}`, filename: ev.name, isScratchpad: false, content: ev.text }]);
                break;
              case "openScratch":
                tabs.update((l) => [...l, { id: `t${nextTab++}`, filename: "Scratchpad", isScratchpad: true, content: ev.text }]);
                break;
              case "close": {
                const list = get(tabs);
                if (list.length === 0) break;
                const t = list[ev.pick % list.length];
                if (!t.isScratchpad) {
                  if (t.content.trim() === "") {
                    // tabs.ts: a note that closes empty is deleted, and the delete callback owns the caches
                    await deleteNoteAndInvalidateCache(t.filename, "baseline");
                    disk.delete(t.filename);
                    delete model.shown[t.filename];
                  } else {
                    disk.set(t.filename, t.content); // what the flush writes
                    noteClosingWithContent(t.filename, t.content);
                    model.shown[t.filename] = t.content;
                  }
                }
                tabs.set(get(tabs).filter((x) => x.id !== t.id));
                break;
              }
              case "diskChange": {
                const cachedBefore = Object.keys(get(allNotesCache)).length > 0;
                if (ev.text === null) disk.delete(ev.name);
                else disk.set(ev.name, ev.text);
                await updateNotesInCache([ev.name]);
                if (!model.mustRead) {
                  if (ev.text === null) delete model.shown[ev.name];
                  else model.shown[ev.name] = ev.text;
                }
                if (model.mustRead && cachedBefore) fullRead(model); // updateNotesInCache then refreshes
                break;
              }
              case "delete":
                flags.deleteConflict = ev.conflict;
                await deleteNoteAndInvalidateCache(ev.name, "baseline");
                flags.deleteConflict = false;
                if (ev.conflict) model.mustRead = true; // the file has content we have not read
                else {
                  disk.delete(ev.name);
                  delete model.shown[ev.name];
                }
                break;
              case "invalidate":
                invalidateDiskNotesCache();
                model.mustRead = true;
                break;
              case "refresh":
                await refreshAllNotesCache();
                if (model.mustRead) fullRead(model);
                break;
              case "prefetch": {
                const known = new Set(Object.keys(get(allNotesCache)));
                const open = new Set(
                  get(tabs)
                    .filter((t) => !t.isScratchpad)
                    .map((t) => t.filename),
                );
                await prefetchNotesForDates(ev.names);
                for (const fn of ev.names) {
                  if (known.has(fn) || open.has(fn)) continue;
                  const content = disk.get(fn);
                  if (content !== undefined && !(fn in model.shown)) model.shown[fn] = content;
                }
                break;
              }
              case "switch":
                clearDiskLayer();
                allNotesCache.set({});
                model.shown = {};
                model.mustRead = true;
                model.loaded = false;
                break;
              case "syncMulti": {
                // a sync that changed two files: one updateNotesInCache([f1, f2])
                const cachedBefore = Object.keys(get(allNotesCache)).length > 0;
                for (const c of ev.changes) {
                  if (c.text === null) disk.delete(c.name);
                  else disk.set(c.name, c.text);
                }
                await updateNotesInCache(ev.changes.map((c) => c.name));
                if (!model.mustRead) {
                  for (const c of ev.changes) {
                    if (c.text === null) delete model.shown[c.name];
                    else model.shown[c.name] = c.text;
                  }
                }
                if (model.mustRead && cachedBefore) fullRead(model);
                break;
              }
              case "rename": {
                // the real renameScratchpad: it changes the tab object in place, then sets a new array
                const scratchpads = get(tabs).filter((t) => t.isScratchpad);
                if (scratchpads.length === 0) break;
                renameScratchpad(scratchpads[ev.pick % scratchpads.length].id, ev.name);
                break;
              }
              case "promote": {
                // the real promoteScratchpad, with today's note open: it changes today's tab in place
                const today = `${todayISO()}.txt`;
                const scratchpads = get(tabs).filter((t) => t.isScratchpad && t.content.trim() !== "");
                if (scratchpads.length === 0) break;
                if (!get(tabs).some((t) => !t.isScratchpad && t.filename === today)) {
                  tabs.update((l) => [...l, { id: `t${nextTab++}`, filename: today, isScratchpad: false, content: ev.text }]);
                }
                await promoteScratchpad(scratchpads[ev.pick % scratchpads.length].id);
                break;
              }
              case "swap": {
                const list = get(tabs);
                if (list.length < 2) break;
                const i = ev.a % list.length;
                let j = ev.b % list.length;
                if (j === i) j = (j + 1) % list.length;
                const next = [...list];
                [next[i], next[j]] = [next[j], next[i]];
                tabs.set(next);
                break;
              }
            }

            checkIndex(latest, model, where);
            // the same answer when the store is read on its own, with no standing subscriber involved
            expect([...get(notesIndex).entries.keys()].sort(), where).toEqual([...latest.entries.keys()].sort());

            if (ev.k === "refresh") {
              // (c) allNotesCache is the index's non-scratchpad key -> text map, exactly
              expect(get(allNotesCache), `${where}: allNotesCache`).toEqual(noteTexts(latest));
            }
            if (ev.k === "edit" && editedKey !== null) {
              // (d) every entry other than the edited one is the same object as before
              for (const [key, entry] of latest.entries) {
                if (key === editedKey) continue;
                expect(entry === before.get(key), `${where}: ${key} kept as the same object`).toBe(true);
              }
            }
          }

          // nobody listens: one more change of `tabs` and one of the disk layer, then a fresh subscription must
          // see exactly what a rebuild from scratch gives, entry by entry (all fields), with the right `loaded`
          stopListening();
          const list = get(tabs);
          if (list.length > 0) tabs.set(list.map((t, i) => (i === 0 ? { ...t, content: `${t.content}\n# typed unheard` } : t)));
          else tabs.set([{ id: `t${nextTab++}`, filename: "ideas.txt", isScratchpad: false, content: "# opened unheard" }]);
          disk.set("plan.txt", "# disk change unheard");
          setDiskNote("plan.txt", "# disk change unheard");
          model.shown["plan.txt"] = "# disk change unheard";
          const got = get(notesIndex);
          const want = rebuildEntries(new Map(), shownNotes(), get(tabs));
          expect([...got.entries.keys()].sort(), "no subscriber: keys").toEqual([...want.keys()].sort());
          for (const [key, entry] of want) expect(got.entries.get(key), `no subscriber: ${key}`).toEqual(entry);
          expect(got.loaded, "no subscriber: loaded").toBe(model.loaded);
          checkIndex(got, model, "no subscriber");
        } finally {
          stopListening();
          msTotal += performance.now() - started;
          runs++;
        }
      }),
      { numRuns: 200 },
    );
  });
});

afterAll(() => {
  console.log(`notesIndex property test: ${runs} runs (random disks x event sequences), ${Math.round(msTotal)} ms`);
});

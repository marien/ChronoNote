/** Phone companion, phase 2: applies the requests the phone app leaves in `.chrononote-mobile/inbox.json` to the
 * notes, remembers what it did with each in a ledger (so a request is never applied twice), and reports the results
 * in the outbox. Rules: `docs/design/mobile-companion-design.md` §5-6 and spec §6.7; the per-note text rules are the
 * pure functions in `phoneInboxApply.ts`. No UI here: the stores below are what a later toast and conflict dialog read. */
import { get, writable } from "svelte/store";
import { logWarn } from "./appLog";
import { sha256Hex } from "./hash";
import { flushAllPendingSaves, updateNoteOnDisk, writeTabContentAndWait } from "./persistence";
import {
  localIsoWithOffset,
  phoneCompanionActive,
  setOutboxResults,
  updatePhoneOutbox,
  type OutboxResult,
} from "./phoneCompanion";
import {
  applyAddLine,
  applySetState,
  applyStateAtLine,
  lineWithState,
  parseInbox,
  validateRequest,
  type AddLineRequest,
  type ApplyOutcome,
  type InboxRequest,
  type SetStateRequest,
} from "./phoneInboxApply";
import { notesDir, tabs } from "./stores";
import * as api from "./tauriApi";

export interface LedgerEntry {
  result: "applied" | "conflict" | "rejected";
  reason?: string;
  /** Local time with offset. */
  at: string;
  request: InboxRequest;
}

/** The requests handled by one run: only those that were new in it. */
export interface PhoneInboxRun {
  at: string;
  applied: LedgerEntry[];
  conflicts: LedgerEntry[];
  rejected: LedgerEntry[];
}

/** The latest run, for the toast. */
export const phoneInboxRun = writable<PhoneInboxRun | null>(null);
/** Every request held back as a conflict, for the conflict dialog. */
export const phoneConflicts = writable<LedgerEntry[]>([]);

export type ConflictChoice = "skip" | "add" | { line: number; text: string };
export type ResolveResult = "done" | "noteChanged" | "failed" | "gone";

/** The note's current text for the dialog: the open (non-scratchpad) tab's content, else the file ("" when missing). */
export async function phoneConflictNote(date: string): Promise<string> {
  const filename = `${date}.txt`;
  const open = get(tabs).find((t) => !t.isScratchpad && t.filename === filename);
  if (open) return open.content;
  try {
    const { content } = await api.readNoteWithMetadata(filename);
    return content ?? "";
  } catch {
    return "";
  }
}


/** Request id to what became of it. A Map: ids come from a file we don't control (`__proto__` is a valid key there). */
type Ledger = Map<string, LedgerEntry>;

const RESULTS = ["applied", "conflict", "rejected"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The ledger as this session last read or wrote it, for its notes folder. The disk copy can lag behind (a failed
 * save): the session never re-applies a request it handled itself, and saves again on its next run. */
let memory: { dir: string; ledger: Ledger; dirty: boolean } | null = null;

async function loadLedger(): Promise<Ledger> {
  const dir = get(notesDir);
  if (memory && memory.dir === dir) return new Map(memory.ledger);
  const ledger: Ledger = new Map();
  try {
    const text = await api.readPhoneLedger();
    const value: unknown = text === null ? null : JSON.parse(text);
    if (isRecord(value) && value.format === 1 && isRecord(value.handled)) {
      for (const [id, e] of Object.entries(value.handled)) {
        if (isRecord(e) && typeof e.result === "string" && RESULTS.includes(e.result) && typeof e.at === "string") {
          ledger.set(id, e as unknown as LedgerEntry);
        }
      }
    }
  } catch {
    // Unreadable is empty: the notes are the truth, and a lost ledger costs at worst a repeated request.
  }
  memory = { dir, ledger: new Map(ledger), dirty: false };
  return ledger;
}

async function saveLedger(ledger: Ledger): Promise<void> {
  memory = { dir: get(notesDir), ledger: new Map(ledger), dirty: true };
  await api.writePhoneLedger(JSON.stringify({ format: 1, handled: Object.fromEntries(ledger) }, null, 2) + "\n");
  memory.dirty = false;
}

/** Runs and conflict choices change the ledger one at a time. */
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

function conflictsOf(ledger: Ledger): LedgerEntry[] {
  return [...ledger.values()].filter((e) => e.result === "conflict");
}

/** The outbox's results: one per distinct request id of the inbox, in inbox order, for those the ledger knows. */
function resultsFor(ledger: Ledger, order: string[]): OutboxResult[] {
  const out: OutboxResult[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const e = ledger.get(id);
    if (seen.has(id) || !e) continue;
    seen.add(id);
    out.push({ id, result: e.result, ...(e.reason !== undefined ? { reason: e.reason } : {}), at: e.at });
  }
  return out;
}

type InboxRead =
  | { kind: "ok"; inbox: { format: number; requests: unknown[] }; key: string }
  | { kind: "missing"; key: string }
  | { kind: "broken"; key: string; why: string };

/** Reads the inbox. `key` tells two readings apart (the text's hash), so the poll can skip a file it already handled. */
async function readInbox(): Promise<InboxRead> {
  let text: string | null;
  try {
    text = await api.readPhoneInbox();
  } catch (e) {
    return { kind: "broken", key: `error: ${e}`, why: String(e) };
  }
  if (text === null) return { kind: "missing", key: "missing" };
  const key = await sha256Hex(text);
  const inbox = parseInbox(text);
  return inbox ? { kind: "ok", inbox, key } : { kind: "broken", key, why: "not a valid inbox file" };
}

interface Outcome {
  result: LedgerEntry["result"];
  reason?: string;
}

/** Applies a note's requests in order to its text, recording each outcome; returns the resulting text. */
function applyAll(note: string, reqs: InboxRequest[], agenda: string[], outcomes: Map<string, Outcome>): string {
  let text = note;
  for (const req of reqs) {
    const out: ApplyOutcome = req.type === "addLine" ? applyAddLine(text, req, agenda) : applySetState(text, req);
    if (out.result === "applied") {
      outcomes.set(req.id, { result: "applied" });
      text = out.text;
    } else {
      outcomes.set(req.id, { result: out.result, reason: out.reason });
    }
  }
  return text;
}

/** Shared helper for writing note content to open tab or closed disk file. */
async function writeNoteWithUpdate<T>(
  date: string,
  change: (current: string) => { text: string; data: T },
): Promise<{ ok: true; data: T } | { ok: false }> {
  const filename = `${date}.txt`;
  try {
    const open = get(tabs).find((t) => !t.isScratchpad && t.filename === filename);
    if (open) {
      await flushAllPendingSaves();
      const tab = get(tabs).find((t) => t.id === open.id);
      if (!tab) return { ok: false };
      const { text, data } = change(tab.content);
      if (text !== tab.content) {
        await writeTabContentAndWait(tab.id, text, tab.content, { keepVersion: true });
      }
      return { ok: true, data };
    } else {
      let resultData: T;
      await updateNoteOnDisk(
        filename,
        (current) => {
          const res = change(current);
          resultData = res.data;
          return res.text;
        },
        { keepVersion: true },
      );
      return { ok: true, data: resultData! };
    }
  } catch (e) {
    logWarn(`phone companion: applying to ${filename} failed: ${e}`);
    return { ok: false };
  }
}

/** Applies one note's requests, to the open tab or to the file. Null when writing failed (nothing is recorded then,
 * so the requests are tried again). The earlier text stays as an earlier version, so the run can be undone. */
async function applyToNote(date: string, reqs: InboxRequest[]): Promise<Map<string, Outcome> | null> {
  const outcomes = new Map<string, Outcome>();
  let agenda: string[] = [];
  if (reqs.some((r) => r.type === "addLine")) {
    try {
      agenda = (await api.readAgendaForDate(date)) ?? [];
    } catch {
      agenda = [];
    }
  }
  const res = await writeNoteWithUpdate(date, (current) => {
    outcomes.clear();
    const text = applyAll(current, reqs, agenda, outcomes);
    return { text, data: undefined };
  });
  if (!res.ok) return null;
  return outcomes;
}

/** The key of the inbox text the last run handled (null: none yet, or a note could not be written and a retry is due). */
let lastKey: string | null = null;
let warnedBroken = false;

async function runOnce(): Promise<PhoneInboxRun> {
  const at = localIsoWithOffset(new Date());
  const run: PhoneInboxRun = { at, applied: [], conflicts: [], rejected: [] };
  const ledger = await loadLedger();
  const read = await readInbox();

  if (read.kind !== "ok") {
    lastKey = read.key;
    // Handle nothing and keep the ledger and results as they are: OneDrive can hide a file for a moment while it
    // syncs, and forgetting the ledger then would apply its requests a second time when it is back.
    if (read.kind === "broken" && !warnedBroken) {
      warnedBroken = true;
      logWarn(`phone companion: the inbox is not usable and is left alone: ${read.why}`);
    }
    setOutboxResults(resultsFor(ledger, [...ledger.keys()]));
    phoneConflicts.set(conflictsOf(ledger));
    return run;
  }
  warnedBroken = false;
  const { inbox } = read;

  const fresh: InboxRequest[] = [];
  const entries: LedgerEntry[] = [];
  const order: string[] = [];
  const claimed = new Set<string>();
  const record = (id: string, entry: LedgerEntry) => {
    ledger.set(id, entry);
    entries.push(entry);
  };
  for (const raw of inbox.requests) {
    const id = isRecord(raw) && typeof raw.id === "string" && raw.id !== "" ? raw.id : null;
    if (id === null) continue; // can't be reported
    order.push(id);
    if (ledger.has(id) || claimed.has(id)) continue; // handled before (conflicts wait for the dialog)
    claimed.add(id);
    const checked = validateRequest(raw);
    if (inbox.format > 1) {
      record(id, { result: "rejected", reason: "format", at, request: checked.ok ? checked.request : (raw as InboxRequest) });
    } else if (!checked.ok) {
      record(id, { result: "rejected", reason: "invalid", at, request: raw as InboxRequest });
    } else {
      fresh.push(checked.request);
    }
  }

  const byDate = new Map<string, InboxRequest[]>();
  for (const req of fresh) byDate.set(req.date, [...(byDate.get(req.date) ?? []), req]);
  let failed = false;
  for (const [date, reqs] of byDate) {
    const outcomes = await applyToNote(date, reqs);
    if (!outcomes) {
      failed = true;
      continue;
    }
    for (const req of reqs) {
      const o = outcomes.get(req.id);
      if (!o) continue;
      record(req.id, { result: o.result, ...(o.reason !== undefined ? { reason: o.reason } : {}), at, request: req });
    }
  }

  // Tab writes are debounced or in flight: the results go out only once the notes are on disk.
  await flushAllPendingSaves();

  const inInbox = new Set(order);
  let dropped = false;
  for (const id of [...ledger.keys()]) {
    if (!inInbox.has(id)) {
      ledger.delete(id);
      dropped = true;
    }
  }
  if (entries.length > 0 || dropped || memory?.dirty) {
    // A failed save is logged, not fatal: the session remembers (see `memory`), and publishing the results lets the
    // phone take the handled requests out of the inbox, so they can't come back after a restart either.
    await saveLedger(ledger).catch((e) => logWarn(`phone companion: saving the ledger failed: ${e}`));
  }
  setOutboxResults(resultsFor(ledger, order));

  const rank = new Map<string, number>();
  order.forEach((id, i) => rank.set(id, rank.get(id) ?? i));
  entries.sort((a, b) => (rank.get(a.request.id) ?? 0) - (rank.get(b.request.id) ?? 0));
  for (const e of entries) {
    if (e.result === "applied") run.applied.push(e);
    else if (e.result === "conflict") run.conflicts.push(e);
    else run.rejected.push(e);
  }
  phoneConflicts.set(conflictsOf(ledger));
  phoneInboxRun.set(run);
  lastKey = failed ? null : read.key;
  return run;
}

let running: Promise<PhoneInboxRun | null> | null = null;
let rerun = false;

/** Applies the requests of the phone's inbox that are not in the ledger yet, then rebuilds the outbox (with the
 * window's notes re-read) so it carries the results. One run at a time; a call while one runs waits for it and then
 * runs once more. Null when the phone companion is not active. */
export async function processPhoneInbox(): Promise<PhoneInboxRun | null> {
  if (!phoneCompanionActive()) return null;
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    let last: PhoneInboxRun | null = null;
    do {
      rerun = false;
      last = await exclusive(runOnce);
    } while (rerun && phoneCompanionActive());
    await updatePhoneOutbox(true);
    return last;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** The periodic check: runs only when the inbox's text is not the one the last run handled. */
export async function pollPhoneInbox(): Promise<PhoneInboxRun | null> {
  if (!phoneCompanionActive() || running) return null;
  try {
    const read = await readInbox();
    if (read.key === lastKey) return null;
    return await processPhoneInbox();
  } catch (e) {
    logWarn(`phone companion: checking the inbox failed: ${e}`);
    return null;
  }
}

function noteToLines(note: string): string[] {
  if (note === "") return [];
  const s = note.endsWith("\n") ? note.slice(0, -1) : note;
  return s.split("\n");
}

/** Resolves a held phone conflict: skip, add as new line, or apply to a chosen line. */
export async function resolvePhoneConflict(id: string, choice: ConflictChoice): Promise<ResolveResult> {
  if (!phoneCompanionActive()) return "gone";
  let shouldUpdateOutbox = false;
  const result = await exclusive(async (): Promise<ResolveResult> => {
    const ledger = await loadLedger();
    const entry = ledger.get(id);
    if (!entry || entry.result !== "conflict") return "gone";

    const now = localIsoWithOffset(new Date());

    if (choice === "skip") {
      ledger.set(id, { result: "rejected", reason: "skipped", at: now, request: entry.request });
      await saveLedger(ledger);
      phoneConflicts.set(conflictsOf(ledger));
      const read = await readInbox();
      setOutboxResults(resultsFor(ledger, read.kind === "ok" ? inboxIds(read.inbox.requests) : [...ledger.keys()]));
      shouldUpdateOutbox = true;
      return "done";
    }

    const req = entry.request;
    if (req.type !== "setState") return "gone";

    if (choice === "add") {
      const lineToAdd = lineWithState(req.line, req.state) ?? req.line;
      const addReq: AddLineRequest = {
        id: req.id,
        type: "addLine",
        date: req.date,
        text: lineToAdd,
        ...(req.section !== undefined ? { section: req.section } : {}),
      };
      let agenda: string[] = [];
      try {
        agenda = (await api.readAgendaForDate(req.date)) ?? [];
      } catch {
        agenda = [];
      }
      const writeRes = await writeNoteWithUpdate(req.date, (current) => {
        const out = applyAddLine(current, addReq, agenda);
        const text = out.result === "applied" ? out.text : current;
        return { text, data: "done" as const };
      });
      if (!writeRes.ok) return "failed";

      ledger.set(id, { result: "applied", at: now, request: entry.request });
      await saveLedger(ledger);
      phoneConflicts.set(conflictsOf(ledger));
      const read = await readInbox();
      setOutboxResults(resultsFor(ledger, read.kind === "ok" ? inboxIds(read.inbox.requests) : [...ledger.keys()]));
      shouldUpdateOutbox = true;
      return "done";
    }

    if (typeof choice === "object" && choice !== null && "line" in choice) {
      const currentNote = await phoneConflictNote(req.date);
      const lines = noteToLines(currentNote);
      if (choice.line < 0 || choice.line >= lines.length || lines[choice.line] !== choice.text) {
        return "noteChanged";
      }
      const initialOutcome = applyStateAtLine(currentNote, choice.line, req.state);
      if (initialOutcome.result !== "applied") {
        return "noteChanged";
      }

      const writeRes = await writeNoteWithUpdate(req.date, (current) => {
        const curLines = noteToLines(current);
        if (choice.line < 0 || choice.line >= curLines.length || curLines[choice.line] !== choice.text) {
          return { text: current, data: "noteChanged" as const };
        }
        const outcome = applyStateAtLine(current, choice.line, req.state);
        if (outcome.result !== "applied") {
          return { text: current, data: "noteChanged" as const };
        }
        return { text: outcome.text, data: "done" as const };
      });

      if (!writeRes.ok) return "failed";
      if (writeRes.data === "noteChanged") return "noteChanged";

      ledger.set(id, { result: "applied", at: now, request: entry.request });
      await saveLedger(ledger);
      phoneConflicts.set(conflictsOf(ledger));
      const read = await readInbox();
      setOutboxResults(resultsFor(ledger, read.kind === "ok" ? inboxIds(read.inbox.requests) : [...ledger.keys()]));
      shouldUpdateOutbox = true;
      return "done";
    }

    return "gone";
  });

  if (shouldUpdateOutbox) await updatePhoneOutbox(true);
  return result;
}

function inboxIds(requests: unknown[]): string[] {
  const ids: string[] = [];
  for (const raw of requests) if (isRecord(raw) && typeof raw.id === "string" && raw.id !== "") ids.push(raw.id);
  return ids;
}

/** Test hook: forget what this session handled. */
export function resetPhoneInboxForTests(): void {
  lastKey = null;
  warnedBroken = false;
  memory = null;
  queue = Promise.resolve();
  running = null;
  rerun = false;
  phoneInboxRun.set(null);
  phoneConflicts.set([]);
}

/** Phone companion, phase 2: applies the requests the phone app leaves in `.chrononote-mobile/inbox.json` to the
 * notes, remembers what it did with each in a ledger (so a request is never applied twice), and reports the results
 * in the outbox. Rules: `docs/design/mobile-companion-design.md` §5-6 and spec §6.7; the per-note text rules are the
 * pure functions in `phoneInboxApply.ts`. No UI here: the stores below are what a later toast and conflict dialog read. */
import { get, writable } from "svelte/store";
import { logWarn } from "./appLog";
import { sha256Hex } from "./hash";
import { flushAllPendingSaves, updateNoteOnDisk, writeTabContent } from "./persistence";
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
  parseInbox,
  validateRequest,
  type ApplyOutcome,
  type InboxRequest,
} from "./phoneInboxApply";
import { tabs } from "./stores";
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

/** Request id to what became of it. A Map: ids come from a file we don't control (`__proto__` is a valid key there). */
type Ledger = Map<string, LedgerEntry>;

const RESULTS = ["applied", "conflict", "rejected"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function loadLedger(): Promise<Ledger> {
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
  return ledger;
}

async function saveLedger(ledger: Ledger): Promise<void> {
  await api.writePhoneLedger(JSON.stringify({ format: 1, handled: Object.fromEntries(ledger) }, null, 2) + "\n");
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

/** Applies one note's requests, to the open tab or to the file. Null when writing failed (nothing is recorded then,
 * so the requests are tried again). The earlier text stays as an earlier version, so the run can be undone. */
async function applyToNote(date: string, reqs: InboxRequest[]): Promise<Map<string, Outcome> | null> {
  const filename = `${date}.txt`;
  const outcomes = new Map<string, Outcome>();
  try {
    let agenda: string[] = [];
    if (reqs.some((r) => r.type === "addLine")) {
      try {
        agenda = (await api.readAgendaForDate(date)) ?? [];
      } catch {
        agenda = []; // no agenda file or a broken one: the section simply goes at the end
      }
    }
    const tab = get(tabs).find((t) => !t.isScratchpad && t.filename === filename);
    if (tab) {
      const text = applyAll(tab.content, reqs, agenda, outcomes);
      if (text !== tab.content) tabs.set(writeTabContent(tab.id, text, get(tabs), { keepVersion: true }));
    } else {
      await updateNoteOnDisk(
        filename,
        (current) => {
          outcomes.clear(); // retried when the file changed in between
          return applyAll(current, reqs, agenda, outcomes);
        },
        { keepVersion: true },
      );
    }
    return outcomes;
  } catch (e) {
    logWarn(`phone companion: applying requests to ${filename} failed: ${e}`);
    return null;
  }
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
    if (read.kind === "missing") {
      warnedBroken = false;
      // Nothing is in the inbox any more, so nothing is handled any more; the results stay as they were.
      if (ledger.size > 0) {
        ledger.clear();
        await saveLedger(ledger).catch((e) => logWarn(`phone companion: saving the ledger failed: ${e}`));
      }
      phoneConflicts.set([]);
    } else if (!warnedBroken) {
      warnedBroken = true;
      logWarn(`phone companion: the inbox is not usable and is left alone: ${read.why}`);
    }
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
  if (entries.length > 0 || dropped) {
    await saveLedger(ledger).catch((e) => logWarn(`phone companion: saving the ledger failed: ${e}`));
  }
  setOutboxResults(resultsFor(ledger, order));
  await updatePhoneOutbox(true);

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

/** Applies the requests of the phone's inbox that are not in the ledger yet. One run at a time; a call while one runs
 * waits for it and then runs once more. Null when the phone companion is not active. */
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
      last = await runOnce();
    } while (rerun && phoneCompanionActive());
    return last;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** The periodic check: runs only when the inbox's text is not the one the last run handled. */
export async function pollPhoneInbox(): Promise<PhoneInboxRun | null> {
  if (!phoneCompanionActive()) return null;
  try {
    const read = await readInbox();
    if (read.key === lastKey) return null;
    return await processPhoneInbox();
  } catch (e) {
    logWarn(`phone companion: checking the inbox failed: ${e}`);
    return null;
  }
}

/** For the conflict dialog: leaves a held request alone for good (the phone sees it as rejected, reason `skipped`). */
export async function resolvePhoneConflict(id: string, choice: "skip"): Promise<void> {
  if (choice !== "skip" || !phoneCompanionActive()) return;
  if (running) await running.catch(() => {});
  const ledger = await loadLedger();
  const entry = ledger.get(id);
  if (!entry || entry.result !== "conflict") return;
  ledger.set(id, { result: "rejected", reason: "skipped", at: localIsoWithOffset(new Date()), request: entry.request });
  await saveLedger(ledger);
  phoneConflicts.set(conflictsOf(ledger));
  const read = await readInbox();
  setOutboxResults(resultsFor(ledger, read.kind === "ok" ? inboxIds(read.inbox.requests) : [...ledger.keys()]));
  await updatePhoneOutbox(true);
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
  running = null;
  rerun = false;
  phoneInboxRun.set(null);
  phoneConflicts.set([]);
}

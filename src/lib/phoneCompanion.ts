/** Phone companion, phase 1: keeps `.chrononote-mobile/outbox.json` up to date, the meeting index a phone app (a
 * Power App reading the notes folder through OneDrive) uses to browse meetings and their earlier occurrences.
 * Format: `docs/phone-companion-file-guide.md`; design: `docs/design/mobile-companion-design.md`.
 *
 * Desktop only, off by default (`AppConfig.phoneCompanion`). The outbox is written at start, when the day changes,
 * and when the window's meetings change; it is rebuilt after edits and on focus, but only written when its content
 * (apart from `generatedAt`) differs from what this session last wrote. */
import { get, writable } from "svelte/store";
import { logWarn } from "./appLog";
import { addDaysISO } from "./date";
import { refreshAllNotesCache } from "./persistence";
import { allNotesCache, appVersion, backendKind, currentDateISO, showToast, tabs } from "./stores";
import { t } from "./i18n";
import * as api from "./tauriApi";
import { isSetextUnderline, normalizeHeaderTitle, titleForMatching } from "./tokens";

/** Days before and after today that the outbox covers (Marien's decision 1, 2026-10-29). */
export const WINDOW_DAYS = 14;
/** Earlier occurrences listed per meeting, before the window. */
export const EARLIER_OCCURRENCES = 5;

export interface OutboxOccurrence {
  date: string;
  title: string;
}

export interface OutboxMeeting {
  key: string;
  title: string;
  occurrences: OutboxOccurrence[];
}

export interface Outbox {
  format: 1;
  generatedAt: string;
  appVersion: string;
  window: { from: string; to: string };
  meetings: OutboxMeeting[];
  results: [];
}

const DATED_NOTE = /^(\d{4}-\d{2}-\d{2})\.txt$/;

/** `m-` plus the first 6 hex digits of the 32-bit FNV-1a hash of the lower-cased matching title (UTF-8): stable
 * across runs and machines, and the same for every title Section History treats as one meeting. */
export function meetingKey(matchTitle: string): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(matchTitle.toLowerCase())) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return "m-" + h.toString(16).padStart(8, "0").slice(0, 6);
}

/** A section title's matching form (as Section History compares titles), or null when it is no meeting: an ad-hoc
 * section (`'` or `’`) or a title that is only a date or a time range. */
function meetingTitle(rawTitle: string): string | null {
  const normalized = normalizeHeaderTitle(rawTitle);
  if (/^['’]/.test(normalized)) return null;
  return titleForMatching(normalized) || null;
}

/** Parsed titles per note, reused while its text is the same string: a rebuild after an edit re-parses only the
 * notes that changed, not the whole folder. */
const titleCache = new Map<string, { content: string; titles: string[] }>();

/** The section titles of one note, trimmed, in order (as `listSections` finds them). */
function sectionTitles(filename: string, content: string): string[] {
  const cached = titleCache.get(filename);
  if (cached && cached.content === content) return cached.titles;
  const lines = content.split("\n");
  const titles: string[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (isSetextUnderline(lines[i + 1]) && !isSetextUnderline(lines[i]) && lines[i].trim() !== "") {
      titles.push(lines[i].trim());
    }
  }
  titleCache.set(filename, { content, titles });
  return titles;
}

/** Local time with its offset, e.g. `2026-10-29T08:40:12+01:00`. */
export function localIsoWithOffset(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Builds the outbox from every note (`filename -> content`) and the agenda's live meetings (`[date, title]`, already
 * cleaned by the agenda's own title rules). Pure, so it is tested without a backend. */
export function buildOutbox(input: {
  notes: Record<string, string>;
  agenda: [string, string][];
  today: string;
  appVersion: string;
  now: Date;
}): Outbox {
  const from = addDaysISO(input.today, -WINDOW_DAYS);
  const to = addDaysISO(input.today, WINDOW_DAYS);
  const inWindow = (date: string) => date >= from && date <= to;

  // Every occurrence of every meeting, by lower-cased matching title.
  const all = new Map<string, { latestTitle: string; occurrences: OutboxOccurrence[] }>();
  const dated = Object.keys(input.notes)
    .map((f) => [f, DATED_NOTE.exec(f)?.[1]] as const)
    .filter((x): x is readonly [string, string] => !!x[1])
    .sort((a, b) => (a[1] < b[1] ? -1 : 1));
  for (const [filename, date] of dated) {
    const seenToday = new Set<string>();
    for (const raw of sectionTitles(filename, input.notes[filename])) {
      const match = meetingTitle(raw);
      if (!match) continue;
      const id = match.toLowerCase();
      if (seenToday.has(id)) continue; // one occurrence per day, its first section
      seenToday.add(id);
      const entry = all.get(id) ?? { latestTitle: match, occurrences: [] };
      entry.latestTitle = match;
      entry.occurrences.push({ date, title: raw });
      all.set(id, entry);
    }
  }

  // The window's meetings: section titles in the window's notes, and the agenda's meetings in the window.
  const listed = new Map<string, string>();
  for (const [id, entry] of all) {
    if (entry.occurrences.some((o) => inWindow(o.date))) listed.set(id, entry.latestTitle);
  }
  for (const [date, title] of input.agenda) {
    if (!inWindow(date)) continue;
    const match = meetingTitle(title);
    if (!match) continue;
    const id = match.toLowerCase();
    if (!listed.has(id)) listed.set(id, all.get(id)?.latestTitle ?? match);
  }

  const meetings: OutboxMeeting[] = [...listed].map(([id, title]) => {
    const occurrences = all.get(id)?.occurrences ?? [];
    const before = occurrences.filter((o) => o.date < from).slice(-EARLIER_OCCURRENCES);
    return { key: meetingKey(title), title, occurrences: [...before, ...occurrences.filter((o) => inWindow(o.date))] };
  });
  meetings.sort((a, b) => {
    const x = a.title.toLowerCase();
    const y = b.title.toLowerCase();
    return x < y ? -1 : x > y ? 1 : a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
  });

  return {
    format: 1,
    generatedAt: localIsoWithOffset(input.now),
    appVersion: input.appVersion,
    window: { from, to },
    meetings,
    results: [],
  };
}

/** The file's text: two-space JSON with a final newline. */
export function outboxJson(outbox: Outbox): string {
  return JSON.stringify(outbox, null, 2) + "\n";
}

/** The outbox's content apart from `generatedAt`, for "did anything change". */
function contentOf(outbox: Outbox): string {
  return JSON.stringify({ ...outbox, generatedAt: "" });
}

// --- Keeping the file up to date ---

/** Setting: keep the outbox up to date (Settings → Notes & Sync). */
export const phoneCompanionEnabled = writable(false);

/** How long after the last edit the outbox is rebuilt; edits rarely change the meetings, so there is no hurry. */
const EDIT_DEBOUNCE_MS = 5000;

/** Waits this long after boot before the first build, so it doesn't compete with the editor's first paint. */
const BOOT_DELAY_MS = 3000;

let lastWritten: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let rerun = false;
let freshPending = false;
let wired = false;
let warned = false;
/** The window's notes as last read from disk (null: no such file). The folder-wide cache is read once per session,
 * so notes that OneDrive changes underneath (edited on another device) only show up through this. */
let windowDisk: Record<string, string | null> = {};

function active(): boolean {
  return get(phoneCompanionEnabled) && get(backendKind) === "desktop";
}

/** Rebuilds the outbox and writes it when its content changed. `fresh` re-reads the window's notes from disk first
 * (start, focus, day change); a rebuild after an edit uses what is loaded. Runs one at a time; a request while one
 * runs makes it run once more afterwards. */
export async function updatePhoneOutbox(fresh = true): Promise<void> {
  if (!active()) return;
  freshPending ||= fresh;
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    do {
      rerun = false;
      const readDisk = freshPending;
      freshPending = false;
      await writeIfChanged(readDisk);
    } while (rerun && active());
  })().finally(() => {
    running = null;
  });
  return running;
}

async function readWindowFromDisk(today: string): Promise<void> {
  const names: string[] = [];
  for (let d = -WINDOW_DAYS; d <= WINDOW_DAYS; d++) names.push(`${addDaysISO(today, d)}.txt`);
  const read = await Promise.all(names.map(async (n) => [n, await api.readNote(n).catch(() => null)] as const));
  windowDisk = Object.fromEntries(read);
}

async function writeIfChanged(readDisk: boolean): Promise<void> {
  try {
    const today = get(currentDateISO);
    await refreshAllNotesCache();
    if (readDisk) await readWindowFromDisk(today);
    const notes: Record<string, string> = { ...get(allNotesCache) };
    for (const [name, content] of Object.entries(windowDisk)) {
      if (content === null) delete notes[name];
      else notes[name] = content;
    }
    for (const tab of get(tabs)) if (!tab.isScratchpad) notes[tab.filename] = tab.content;
    // Agenda trouble (no file, a broken file) just means no agenda meetings in the index.
    const agenda = await api.readAgendaAfter(addDaysISO(today, -WINDOW_DAYS - 1)).catch(() => [] as [string, string][]);
    const outbox = buildOutbox({ notes, agenda, today, appVersion: get(appVersion), now: new Date() });
    const content = contentOf(outbox);
    // Turned off while this was reading: write nothing.
    if (content === lastWritten || !active()) return;
    await api.writePhoneOutbox(outboxJson(outbox));
    lastWritten = content;
    warned = false;
  } catch (e) {
    // Logged once per failure streak: a folder that stays unwritable should not flood the log on every edit.
    if (!warned) logWarn(`phone companion: writing the outbox failed: ${e}`);
    warned = true;
  }
}

/** Asks for a rebuild after a delay: after edits (debounced, from what is loaded) or on window focus (`fresh`, with
 * the window's notes re-read from disk). A pending fresh request stays fresh when an edit reschedules it. */
export function schedulePhoneOutbox(delayMs = EDIT_DEBOUNCE_MS, fresh = false): void {
  if (!active()) return;
  freshPending ||= fresh;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void updatePhoneOutbox(false);
  }, delayMs);
}

/** Called once at boot (desktop): builds the outbox shortly after boot when the setting is on, and keeps it up to
 * date. */
export function wirePhoneCompanion(): void {
  if (wired) return;
  wired = true;
  // Svelte stores call a subscriber at once with the current value; the first call of each is the boot itself.
  let booted = false;
  phoneCompanionEnabled.subscribe((on) => {
    if (on) {
      if (booted) void updatePhoneOutbox();
      else schedulePhoneOutbox(BOOT_DELAY_MS, true);
    }
    booted = true;
  });
  let day: string | null = null;
  currentDateISO.subscribe((today) => {
    if (day !== null && today !== day) void updatePhoneOutbox();
    day = today;
  });
  let first = true;
  tabs.subscribe(() => {
    if (!first) schedulePhoneOutbox();
    first = false;
  });
}

export async function setPhoneCompanion(enabled: boolean): Promise<void> {
  if (!enabled) {
    // Turned on again later, it writes afresh: the file may have been removed or changed meanwhile.
    if (timer) clearTimeout(timer);
    timer = null;
    lastWritten = null;
  }
  phoneCompanionEnabled.set(enabled);
  try {
    await api.setPhoneCompanion(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.phoneCompanion", undefined));
  }
}

/** Test hook: forget what this session wrote and stop any pending rebuild. */
export function resetPhoneCompanionForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  lastWritten = null;
  running = null;
  rerun = false;
  freshPending = false;
  warned = false;
  windowDisk = {};
  titleCache.clear();
}

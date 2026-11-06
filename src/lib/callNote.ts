/** Peek on the meeting that is on now, or on a new ad-hoc call section (part of Peek).
 *
 * One manual action - a global shortcut (default Ctrl+Alt+J, no function key, and a letter that types nothing with AltGr), or the command palette - that works out
 * what you are probably in right now and opens Peek on it, so notes for a call are one keypress away:
 *  - today's `.agenda.json` has a meeting that is on now (or one that starts within 10 minutes: joining early): Peek
 *    opens on that meeting's section, which is created if the note does not have it yet;
 *  - otherwise a new ad-hoc section is added, titled \`'Call HH:MM\` (an apostrophe title is the existing convention for a
 *    call that is not on the agenda: calendar sync leaves it alone), and Peek opens on it.
 * New sections go where they belong in time: after the last section that starts at or before now and before the first
 * one that starts later (a section's time is its meeting's start in `.agenda.json`, or the time in an ad-hoc title).
 * Nothing here watches anything; it only runs when asked. */
import { get } from "svelte/store";
import { todayISO } from "./date";
import { extractSectionBody } from "./history";
import { t } from "./i18n";
import { createGlobalShortcutBinder } from "./globalShortcut";
import { enterPeek, leavePeek, peekMode, peekSettings, retargetPeek, startPeekRename } from "./peek";
import { writeTabContent } from "./persistence";
import { underlineFor } from "./sectionFormat";
import { isWindowMinimized, restoreAndFocusWindow } from "./windowChrome";
import { listSections, type NoteSection } from "./peekSection";
import { backendKind, tabs } from "./stores";
import { jumpToFileLine, openOrCreateDatedFile } from "./tabs";
import * as api from "./tauriApi";
import { isSetextUnderline, normalizeHeaderTitle, titleForMatching } from "./tokens";
import { whenSilentSyncSettled } from "./calendarSyncActions";

export interface AgendaEntry {
  start: string;
  end: string;
  title: string;
}

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** How long an ad-hoc call counts as "on now" after the time in its title. */
export const CALL_RECENT_MIN = 60;

export interface NowItem {
  /** The section title as it is (or will be) in the note: the agenda title for a meeting, the section title for a call. */
  title: string;
  kind: "meeting" | "call";
  /** Start in minutes since midnight. */
  minutes: number;
}

/** What is on at `nowMin` in today's note `content`:
 *  - every agenda meeting that is running (start <= nowMin < end) or starts within CALL_LOOKAHEAD_MIN (start > nowMin
 *    and start - nowMin <= CALL_LOOKAHEAD_MIN); entries whose start or end does not parse are left out; a title that
 *    appears more than once (same matching key as `sectionMinutes` uses) only once, the earliest;
 *  - every ad-hoc call section of `content` (`listSections`, title starting with ' or ’) whose `adhocMinutes` is in
 *    [nowMin - CALL_RECENT_MIN, nowMin].
 * Sorted by `minutes`, then meetings before calls, then title. Empty when nothing is on. */
export function sectionsOnNow(entries: readonly AgendaEntry[], content: string, nowMin: number): NowItem[] {
  const meetingsByKey = new Map<string, { entry: AgendaEntry; start: number }>();
  for (const e of entries) {
    const start = toMinutes(e.start);
    const end = toMinutes(e.end);
    if (start === null || end === null) continue;
    const isRunning = start <= nowMin && nowMin < end;
    const isSoon = start > nowMin && start - nowMin <= CALL_LOOKAHEAD_MIN;
    if (!isRunning && !isSoon) continue;
    const k = key(e.title);
    const existing = meetingsByKey.get(k);
    if (!existing || start < existing.start) {
      meetingsByKey.set(k, { entry: e, start });
    }
  }

  const calls: NowItem[] = [];
  const sections = listSections(content.split("\n"));
  for (const s of sections) {
    if (!/^['’]/.test(s.title.trim())) continue;
    const m = adhocMinutes(s.title);
    if (m === null) continue;
    if (m >= nowMin - CALL_RECENT_MIN && m <= nowMin) {
      calls.push({
        title: s.title,
        kind: "call",
        minutes: m,
      });
    }
  }

  const items: NowItem[] = [
    ...Array.from(meetingsByKey.values()).map(({ entry, start }) => ({
      title: entry.title,
      kind: "meeting" as const,
      minutes: start,
    })),
    ...calls,
  ];

  items.sort((a, b) => {
    if (a.minutes !== b.minutes) return a.minutes - b.minutes;
    if (a.kind !== b.kind) return a.kind === "meeting" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return items;
}

/** Minutes before a meeting's start from which pressing the shortcut counts as that meeting (joining a bit early). */
export const CALL_LOOKAHEAD_MIN = 10;

/** The meeting that is on at `nowMin` (minutes since midnight): the one going on (the latest-starting if they overlap),
 * else the next one if it starts within `CALL_LOOKAHEAD_MIN`, else none. */
export function pickMeeting(entries: AgendaEntry[], nowMin: number): AgendaEntry | null {
  const timed = entries.flatMap((e) => {
    const start = toMinutes(e.start);
    const end = toMinutes(e.end);
    return start !== null && end !== null ? [{ e, start, end }] : [];
  });
  const running = timed.filter((x) => x.start <= nowMin && nowMin < x.end);
  if (running.length > 0) return running.reduce((a, b) => (b.start >= a.start ? b : a)).e;
  const soon = timed.filter((x) => x.start > nowMin && x.start - nowMin <= CALL_LOOKAHEAD_MIN);
  if (soon.length > 0) return soon.reduce((a, b) => (b.start < a.start ? b : a)).e;
  return null;
}

/** The start time of an ad-hoc call section, from its title (`'Call 14:05`): the last HH:MM in it. */
export function adhocMinutes(title: string): number | null {
  if (!/^['’]/.test(title.trim())) return null;
  const all = [...title.matchAll(/(\d{1,2}):(\d{2})/g)];
  const last = all[all.length - 1];
  return last ? Number(last[1]) * 60 + Number(last[2]) : null;
}

export { listSections, type NoteSection };

const key = (title: string) => titleForMatching(normalizeHeaderTitle(title)).toLowerCase();

/** When a section "happens", in minutes since midnight: an ad-hoc call by the time in its title, a meeting by its
 * start in the agenda; null for a section that is neither (it does not take part in the ordering). */
export function sectionMinutes(title: string, entries: readonly AgendaEntry[]): number | null {
  const adhoc = adhocMinutes(title);
  if (adhoc !== null) return adhoc;
  const k = key(title);
  const entry = entries.find((e) => key(e.title) === k);
  return entry ? toMinutes(entry.start) : null;
}

/** `content` with a new section `title` (which happens at `minutes`) added in its place in time: just before the
 * first section that happens later, else at the end. The section gets an empty body line to type on. */
export function insertSection(content: string, title: string, minutes: number, entries: readonly AgendaEntry[]): string {
  const lines = content.split("\n");
  const next = listSections(lines).find((s) => {
    const m = sectionMinutes(s.title, entries);
    return m !== null && m > minutes;
  });
  const block = [title, underlineFor(title), ""];
  if (!next) {
    return `${content.trimEnd()}${content.trim() ? "\n\n\n" : ""}${block.join("\n")}`;
  }
  const spacer = next.titleLine > 0 && lines[next.titleLine - 1].trim() !== "" ? [""] : [];
  lines.splice(next.titleLine, 0, ...spacer, ...block, "");
  return lines.join("\n");
}

/** `title`, or when `content` already has a section with that title (compared as `insertSection`'s callers compare:
 * `titleForMatching(normalizeHeaderTitle(x)).toLowerCase()`), `title (2)`, `title (3)`, ... the first that is free. */
export function uniqueSectionTitle(content: string, title: string): string {
  const existingKeys = new Set(listSections(content.split("\n")).map((s) => key(s.title)));
  if (!existingKeys.has(key(title))) return title;
  let i = 2;
  while (existingKeys.has(key(`${title} (${i})`))) {
    i++;
  }
  return `${title} (${i})`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

let busy = false;

/** Today's agenda entries (the `api.readAgendaEntriesForDate` mapping noteCall uses; [] on error). */
export async function todayAgendaEntries(): Promise<AgendaEntry[]> {
  const date = todayISO();
  return api
    .readAgendaEntriesForDate(date)
    .then((rows) => rows.map(([start, end, title]) => ({ start, end, title })))
    .catch(() => []);
}

async function peekOnTodaySectionImpl(
  title: string,
  minutes: number,
  rename: boolean | "if-new",
  passedEntries?: readonly AgendaEntry[],
  knownWasOpened?: boolean,
): Promise<boolean> {
  const date = todayISO();
  const filename = `${date}.txt`;
  const wasAlreadyOpen = get(tabs).some((x) => x.filename === filename && !x.isScratchpad);
  await openOrCreateDatedFile(date);
  const wasOpened = knownWasOpened ?? !wasAlreadyOpen;
  let tab = get(tabs).find((x) => x.filename === filename && !x.isScratchpad);
  if (!tab) return false;
  // A brand-new day fills its meeting sections by itself (silent calendar sync); wait for any in-flight sync to settle.
  if (!tab.content.trim()) {
    await whenSilentSyncSettled(tab.id);
    tab = get(tabs).find((x) => x.id === tab!.id) ?? tab;
  }

  const entries = passedEntries ?? (await todayAgendaEntries());
  const target = titleForMatching(normalizeHeaderTitle(title));
  let content = tab.content;
  let newlyInserted = false;
  if (!extractSectionBody(content.split("\n"), target)) {
    content = insertSection(content, title, minutes, entries);
    tabs.set(writeTabContent(tab.id, content, get(tabs)));
    newlyInserted = true;
  }
  const body = extractSectionBody(content.split("\n"), target);
  await jumpToFileLine({ tabId: tab.id, filename, lineIdx: body ? body.startLineIdx : 0 });
  // Peek is told which section to show.
  let shown = false;
  if (get(peekMode)) {
    shown = retargetPeek(target, wasOpened);
  } else {
    shown = await enterPeek(target);
  }
  const shouldRename = rename === "if-new" ? newlyInserted : rename;
  if (shown && shouldRename) {
    startPeekRename();
  }
  return shown;
}

/** Shows section `title` of today's note in Peek (entering Peek, or retargeting it when already in Peek), creating the
 * section in its place in time (`minutes`) when the note does not have it. `rename`: start renaming it (new calls).
 * Desktop only; returns whether Peek now shows it. */
export async function peekOnTodaySection(title: string, minutes: number, rename: boolean): Promise<boolean> {
  if (get(backendKind) !== "desktop" || busy) return false;
  busy = true;
  try {
    return await peekOnTodaySectionImpl(title, minutes, rename);
  } finally {
    busy = false;
  }
}

/** Ctrl+Shift+M, the + button in the Peek bar, the command palette: a NEW ad-hoc call at the current time
 * (`uniqueSectionTitle(content, t("call.adhocTitle", { time }))`), always new even when a meeting is on, shown in Peek
 * with its name selected for typing (as noteCall does for a new call). Works in and outside Peek. Desktop only. */
export async function newCall(now: Date = new Date()): Promise<boolean> {
  if (get(backendKind) !== "desktop" || busy) return false;
  busy = true;
  try {
    const date = todayISO();
    const filename = `${date}.txt`;
    const wasAlreadyOpen = get(tabs).some((x) => x.filename === filename && !x.isScratchpad);
    await openOrCreateDatedFile(date);
    let tab = get(tabs).find((x) => x.filename === filename && !x.isScratchpad);
    if (!tab) return false;
    if (!tab.content.trim()) {
      await whenSilentSyncSettled(tab.id);
      tab = get(tabs).find((x) => x.id === tab!.id) ?? tab;
    }
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const baseTitle = get(t)("call.adhocTitle", { time: hhmm(now) });
    const title = uniqueSectionTitle(tab.content, baseTitle);
    return await peekOnTodaySectionImpl(title, nowMin, true, undefined, !wasAlreadyOpen);
  } finally {
    busy = false;
  }
}

/** The shortcut: Peek on the meeting that is on now, or on a new ad-hoc call section; pressed again it leaves Peek.
 * Returns whether Peek was entered. */
export async function noteCall(now: Date = new Date()): Promise<boolean> {
  if (get(backendKind) !== "desktop" || busy) return false;
  if (get(peekMode)) {
    if (await isWindowMinimized()) {
      await restoreAndFocusWindow();
      return true;
    }
    leavePeek();
    return false;
  }
  busy = true;
  try {
    const entries = await todayAgendaEntries();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const meeting = pickMeeting(entries, nowMin);
    const title = meeting ? meeting.title : get(t)("call.adhocTitle", { time: hhmm(now) });
    const minutes = meeting ? (toMinutes(meeting.start) ?? nowMin) : nowMin;
    return await peekOnTodaySectionImpl(title, minutes, !meeting ? "if-new" : false, entries);
  } finally {
    busy = false;
  }
}

/** Registers the global shortcut (works while another app, the call, has the focus) and keeps it in step with the
 * setting. Desktop only. Call once at startup; returns a cleanup. */
export function wireCallNote(): () => void {
  if (get(backendKind) !== "desktop") return () => {};
  const shortcut = createGlobalShortcutBinder(() => void noteCall());
  const unsubscribe = peekSettings.subscribe((s) => shortcut.bind(s.callShortcut));
  return () => {
    unsubscribe();
    shortcut.dispose();
  };
}

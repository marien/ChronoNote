/** Peek on the meeting that is on now, or on a new ad-hoc call section (part of Peek).
 *
 * One manual action - a global shortcut (default Ctrl+Alt+J, no function key), or the command palette - that works out
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
import { enterPeek, leavePeek, peekMode, peekSettings } from "./peek";
import { writeTabContent } from "./persistence";
import { underlineFor } from "./sectionFormat";
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

export interface NoteSection {
  titleLine: number;
  title: string;
}

/** Every section (Setext title + underline) of a note, in order. */
export function listSections(lines: readonly string[]): NoteSection[] {
  const out: NoteSection[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].trim() !== "" && isSetextUnderline(lines[i + 1]) && !isSetextUnderline(lines[i])) {
      out.push({ titleLine: i, title: lines[i].trim() });
    }
  }
  return out;
}

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

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

let busy = false;

/** The shortcut: Peek on the meeting that is on now, or on a new ad-hoc call section; pressed again it leaves Peek.
 * Returns whether Peek was entered. */
export async function noteCall(now: Date = new Date()): Promise<boolean> {
  if (get(backendKind) !== "desktop" || busy) return false;
  if (get(peekMode)) {
    leavePeek();
    return false;
  }
  busy = true;
  try {
    const date = todayISO();
    const entries: AgendaEntry[] = await api
      .readAgendaEntriesForDate(date)
      .then((rows) => rows.map(([start, end, title]) => ({ start, end, title })))
      .catch(() => []);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const meeting = pickMeeting(entries, nowMin);
    const title = meeting ? meeting.title : get(t)("call.adhocTitle", { time: hhmm(now) });
    const minutes = meeting ? (toMinutes(meeting.start) ?? nowMin) : nowMin;

    await openOrCreateDatedFile(date);
    const filename = `${date}.txt`;
    let tab = get(tabs).find((x) => x.filename === filename && !x.isScratchpad);
    if (!tab) return false;
    // A brand-new day fills its meeting sections by itself (silent calendar sync); wait for any in-flight sync to settle.
    if (!tab.content.trim()) {
      await whenSilentSyncSettled(tab.id);
      tab = get(tabs).find((x) => x.id === tab!.id) ?? tab;
    }

    const target = titleForMatching(normalizeHeaderTitle(title));
    let content = tab.content;
    if (!extractSectionBody(content.split("\n"), target)) {
      content = insertSection(content, title, minutes, entries);
      tabs.set(writeTabContent(tab.id, content, get(tabs)));
    }
    const body = extractSectionBody(content.split("\n"), target);
    await jumpToFileLine({ tabId: tab.id, filename, lineIdx: body ? body.startLineIdx : 0 });
    // Peek is told which section to show. Reading it back from where the caret landed showed the NEXT meeting
    // whenever a section had no empty line under its title (the first body line was the next title).
    return await enterPeek(target);
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

/** How a meeting title in `.agenda.json` is read (#74/#78). The desktop app does this in Rust
 * (`src-tauri/src/agenda.rs`, `classify_title`, with its own tests); the web app and the test
 * mock read the same file in TypeScript and share this one implementation, so they cannot drift
 * from each other. Keep all three in step.
 *
 *  - A title starting with "Canceled:", "Cancelled:", "Declined:", "Followed:" or "Following:" is a
 *    *removed* meeting: the rest is its real title, and it never creates or matches a section.
 *  - "Placeholder" or "Confirmed" followed by a separator (":", "-" or "--") is a status stamp; the
 *    rest is the real title. Without a separator the word belongs to the title and is kept.
 *
 * Case-sensitive, exact prefix at the very start: fixed, syncer-generated text. */
export const REMOVED_TITLE_PREFIXES = ["Canceled:", "Cancelled:", "Declined:", "Followed:", "Following:"];

export function stripStatusWord(title: string): string {
  for (const word of ["Placeholder", "Confirmed"]) {
    if (!title.startsWith(word)) continue;
    let rest = title.slice(word.length).trimStart();
    if (rest.startsWith("--")) rest = rest.slice(2);
    else if (rest.startsWith(":") || rest.startsWith("-")) rest = rest.slice(1);
    else continue;
    rest = rest.trim();
    if (rest) return rest;
  }
  return title;
}

/** `null` for a removed marker with no title left. */
export function classifyTitle(raw: string): { title: string; removed: boolean } | null {
  for (const p of REMOVED_TITLE_PREFIXES) {
    if (raw.startsWith(p)) {
      const title = stripStatusWord(raw.slice(p.length).trim());
      return title ? { title, removed: true } : null;
    }
  }
  return { title: stripStatusWord(raw.trim()), removed: false };
}

import type { AgendaDetails, AppError } from "./types";

export interface AgendaMeeting {
  date: string;
  start: string;
  end: string;
  title: string;
  joinUrl?: string | null;
  attendees?: string[];
}

function isRawAgendaMeeting(x: unknown): x is Record<string, unknown> & {
  date: string;
  start: string;
  end: string;
  title: string;
} {
  const m = x as Record<string, unknown> | null;
  return (
    !!m &&
    typeof m === "object" &&
    typeof m.date === "string" &&
    typeof m.start === "string" &&
    typeof m.end === "string" &&
    typeof m.title === "string"
  );
}

function parseJoinUrl(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("https://") ? value : null;
}

function parseAttendees(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return out;
}

/** Parses `.agenda.json` (plain array or `{ timezone, meetings }`), mirroring `src-tauri/src/agenda.rs`.
 * Required fields (`date`, `start`, `end`, `title`) are strict; `joinUrl` and `attendees` are lenient and any
 * other field (such as `seriesId`) is ignored. Throws `{ code: "agendaInvalid" }` on any invalid file. */
export function parseAgendaMeetings(raw: string | undefined): AgendaMeeting[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse((raw ?? "").trim());
  } catch {
    throw { code: "agendaInvalid" } satisfies AppError;
  }
  let zone: string | null = null;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const file = parsed as { timezone?: unknown; meetings?: unknown };
    if (typeof file.timezone !== "string") throw { code: "agendaInvalid" } satisfies AppError;
    zone = file.timezone;
    parsed = file.meetings;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isRawAgendaMeeting)) {
    throw { code: "agendaInvalid" } satisfies AppError;
  }
  const meetings: AgendaMeeting[] = parsed.map((m) => ({
    date: m.date,
    start: m.start,
    end: m.end,
    title: m.title,
    joinUrl: parseJoinUrl(m.joinUrl),
    attendees: parseAttendees(m.attendees),
  }));
  if (zone === null) return meetings;
  try {
    return toLocalMeetings(meetings, zone);
  } catch {
    throw { code: "agendaInvalid" } satisfies AppError;
  }
}

/** The day's live meeting titles: sorted by start (then end, then title), exact duplicates dropped. */
export function activeTitlesForDate(meetings: AgendaMeeting[], date: string): string[] {
  const day = meetings
    .filter((m) => m.date === date)
    .flatMap((m) => {
      const c = typeof m.title === "string" ? classifyTitle(m.title) : null;
      return c && !c.removed ? [{ start: m.start, end: m.end, title: c.title }] : [];
    });
  day.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title));
  const seen = new Set<string>();
  return day
    .filter((m) => {
      const key = `${m.start}|${m.end}|${m.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m) => m.title);
}

/** The day's live meetings with their times, `[start, end, title]`, sorted and de-duplicated like `activeTitlesForDate`
 * (mirrors `agenda.rs`'s `entries_for_date`): for Peek's "notes for the meeting that is on now" shortcut. */
export function activeEntriesForDate(meetings: AgendaMeeting[], date: string): [string, string, string][] {
  return activeDetailsForDate(meetings, date).map((d): [string, string, string] => [d.start, d.end, d.title]);
}

/** F9: the day's live meetings in the same order as `activeEntriesForDate`, with optional `joinUrl` and `attendees`. */
export function activeDetailsForDate(meetings: AgendaMeeting[], date: string): AgendaDetails[] {
  const day = meetings
    .filter((m) => m.date === date)
    .flatMap((m) => {
      const c = typeof m.title === "string" ? classifyTitle(m.title) : null;
      return c && !c.removed
        ? [
            {
              start: m.start,
              end: m.end,
              title: c.title,
              joinUrl: m.joinUrl ?? null,
              attendees: m.attendees ?? [],
            },
          ]
        : [];
    });
  day.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title));
  const seen = new Set<string>();
  return day.filter((m) => {
    const key = `${m.start}|${m.end}|${m.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The real titles of the day's removed meetings, sorted and de-duplicated. */
export function removedTitlesForDate(meetings: AgendaMeeting[], date: string): string[] {
  const out = meetings
    .filter((m) => m.date === date)
    .flatMap((m) => {
      const c = typeof m.title === "string" ? classifyTitle(m.title) : null;
      return c && c.removed ? [c.title] : [];
    });
  return [...new Set(out)].sort();
}

/** Every `[date, title]` for a date strictly after `afterDate`, live meetings only. */
export function activeTitlesAfterDate(meetings: AgendaMeeting[], afterDate: string): [string, string][] {
  const future = meetings
    .filter((m) => m.date > afterDate)
    .flatMap((m) => {
      const c = typeof m.title === "string" ? classifyTitle(m.title) : null;
      return c && !c.removed ? [{ date: m.date, start: m.start, end: m.end, title: c.title }] : [];
    });
  future.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.start.localeCompare(b.start) ||
      a.end.localeCompare(b.end) ||
      a.title.localeCompare(b.title),
  );
  const seen = new Set<string>();
  return future
    .filter((m) => {
      const key = `${m.date}|${m.start}|${m.end}|${m.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m) => [m.date, m.title] as [string, string]);
}

/** Distinct dates having at least one active meeting, sorted in chronological order. */
export function activeAgendaDates(meetings: AgendaMeeting[]): string[] {
  const dates = new Set<string>();
  for (const m of meetings) {
    if (!m.date) continue;
    const c = typeof m.title === "string" ? classifyTitle(m.title) : null;
    if (c && !c.removed) {
      dates.add(m.date);
    }
  }
  return Array.from(dates).sort();
}


/** The `"timezone"` of a `.agenda.json` written as `{ "timezone": "GMT", "meetings": [...] }` (mirrors `agenda.rs`'s
 * `parse_agenda_in`): the meetings' times are converted to local time (`localZone`: the machine's, unless a test fixes
 * it). Throws for a zone name that does not exist, like the desktop app's error. */
export function toLocalMeetings(meetings: AgendaMeeting[], zone: string, localZone?: string): AgendaMeeting[] {
  const name = zone.trim().toUpperCase() === "Z" ? "UTC" : zone.trim();
  const offsetMinutes = (instant: number, tz: string | undefined): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(instant));
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return (Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute")) - Math.floor(instant / 60000) * 60000) / 60000;
  };
  new Intl.DateTimeFormat("en-US", { timeZone: name }); // RangeError for an unknown zone
  /** A wall-clock time in `name` as local [date, HH:mm]; null when it is not a time. */
  const toLocal = (date: string, time: string): [string, string] | null => {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
    const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!d || !t) return null;
    const wall = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
    let instant = wall - offsetMinutes(wall, name) * 60000;
    instant = wall - offsetMinutes(instant, name) * 60000;
    const local = new Date(instant + offsetMinutes(instant, localZone) * 60000);
    const pad = (x: number) => String(x).padStart(2, "0");
    return [
      `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
      `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
    ];
  };
  return meetings.map((m) => {
    const start = toLocal(m.date, m.start);
    if (!start) return m;
    const end = toLocal(m.date, m.end);
    const endTime = end && end[0] === start[0] ? end[1] : end && end[0] > start[0] ? "24:00" : m.end;
    return { ...m, date: start[0], start: start[1], end: endTime };
  });
}

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

export interface AgendaMeeting {
  date: string;
  start: string;
  end: string;
  title: string;
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

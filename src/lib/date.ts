import { countActions } from "./tokens";

export function formatISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function todayISO(): string {
  return formatISO(new Date());
}

/** Parse a `YYYY-MM-DD` string into a **local-time** `Date` at midnight.
 * `new Date("2026-09-10")` parses as UTC per spec, which then disagrees
 * with `formatISO`/`getDate` (both local) by up to a day in non-UTC
 * timezones — every date the calendar popover round-trips through a
 * `Date` must go through here, not the `Date` string constructor. */
export function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** `iso` shifted by `deltaDays`, still `YYYY-MM-DD`, all in local time. */
export function addDaysISO(iso: string, deltaDays: number): string {
  const d = parseISODateLocal(iso);
  d.setDate(d.getDate() + deltaDays);
  return formatISO(d);
}

/** Mirrors the date-jump grammar from the reference prototype's date picker. */
export function parseDateQuery(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const base = new Date();

  if (trimmed === "today" || trimmed === "t") return formatISO(base);
  if (trimmed === "yesterday" || trimmed === "y") {
    const d = new Date(base);
    d.setDate(d.getDate() - 1);
    return formatISO(d);
  }
  if (trimmed === "tomorrow") {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return formatISO(d);
  }
  if (/^-\d+$/.test(trimmed)) {
    const offset = parseInt(trimmed, 10);
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    return formatISO(d);
  }
  const weekMatch = trimmed.match(/^(?:wk|w|week)\s*(\d{1,2})$/i);
  if (weekMatch) {
    const w = parseInt(weekMatch[1], 10);
    if (w >= 1 && w <= 53) {
      return isoWeekToMonday(base.getFullYear(), w);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}-\d{2}$/.test(trimmed)) return `${base.getFullYear()}-${trimmed}`;
  return null;
}

const EN_WEEKDAYS: Record<string, number> = {
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 7,
  sunday: 7,
};

function nextWeekdayISO(todayISO: string, targetDay: number): string {
  const todayDate = parseISODateLocal(todayISO);
  const dayOfWeek = todayDate.getDay();
  const currentDay = dayOfWeek === 0 ? 7 : dayOfWeek;
  let delta = (targetDay - currentDay) % 7;
  if (delta <= 0) delta += 7;
  return addDaysISO(todayISO, delta);
}

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function dueWordExtra(todayWords: string, tomorrowWords: string): { today: string[]; tomorrow: string[] } {
  return {
    today: todayWords.split(",").map((s) => s.trim()).filter(Boolean),
    tomorrow: tomorrowWords.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

/** Parses a due-date word (by:fri, by:+3, by:wk44, etc.) into an ISO date string or null. */
export function parseDueWord(
  word: string,
  todayISO: string,
  locale: string,
  extra?: { today: string[]; tomorrow: string[] },
): string | null {
  const trimmed = word.trim().toLowerCase();
  if (!trimmed) return null;
  // Words are compared without a trailing dot (`fri.`, `ven.`, `morgen.`): locale abbreviations carry one.
  const undotted = trimmed.replace(/\.$/, "");

  // English words always win over a locale word that is spelled the same.
  if (undotted === "today" || undotted === "t") return todayISO;
  if (undotted === "tomorrow" || undotted === "tm") return addDaysISO(todayISO, 1);

  if (extra?.today && extra.today.some((w) => w.trim().toLowerCase() === undotted)) {
    return todayISO;
  }
  if (extra?.tomorrow && extra.tomorrow.some((w) => w.trim().toLowerCase() === undotted)) {
    return addDaysISO(todayISO, 1);
  }

  if (EN_WEEKDAYS[undotted] !== undefined) {
    return nextWeekdayISO(todayISO, EN_WEEKDAYS[undotted]);
  }

  // Locale weekdays: long and short from Intl.DateTimeFormat
  const shortFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const longFmt = new Intl.DateTimeFormat(locale, { weekday: "long" });
  for (let i = 0; i < 7; i++) {
    const refDate = new Date(2024, 0, 1 + i); // 2024-01-01 was Monday
    const s = shortFmt.format(refDate).toLowerCase().replace(/\.$/, "");
    const l = longFmt.format(refDate).toLowerCase().replace(/\.$/, "");
    if (undotted === s || undotted === l) {
      return nextWeekdayISO(todayISO, i + 1);
    }
  }

  // +N (N = 1..999)
  const plusMatch = /^\+([1-9]\d{0,2})$/.exec(trimmed);
  if (plusMatch) {
    return addDaysISO(todayISO, Number(plusMatch[1]));
  }

  // wkN, wN, weekN (also with a space, N = 1..53)
  const weekMatch = /^(?:wk|w|week)\s*(\d{1,2})$/.exec(trimmed);
  if (weekMatch) {
    const w = Number(weekMatch[1]);
    if (w >= 1 && w <= 53) {
      const todayYear = Number(todayISO.slice(0, 4));
      const monThisYear = isoWeekToMonday(todayYear, w);
      const friThisYear = addDaysISO(monThisYear, 4);
      const validThisYear = isoWeek(friThisYear) === w;

      if (!validThisYear) {
        return null;
      }

      if (friThisYear < todayISO) {
        const nextYear = todayYear + 1;
        const monNextYear = isoWeekToMonday(nextYear, w);
        const friNextYear = addDaysISO(monNextYear, 4);
        const validNextYear = isoWeek(friNextYear) === w;
        return validNextYear ? friNextYear : null;
      }

      return friThisYear;
    }
    return null;
  }

  // MM-DD
  const mmDdMatch = /^(\d{2})-(\d{2})$/.exec(trimmed);
  if (mmDdMatch) {
    const month = Number(mmDdMatch[1]);
    const day = Number(mmDdMatch[2]);
    const todayYear = Number(todayISO.slice(0, 4));

    const candidateThisYear = `${todayYear}-${mmDdMatch[1]}-${mmDdMatch[2]}`;
    if (candidateThisYear < todayISO) {
      const nextYear = todayYear + 1;
      if (isValidCalendarDate(nextYear, month, day)) {
        return `${nextYear}-${mmDdMatch[1]}-${mmDdMatch[2]}`;
      }
      return null;
    }

    if (isValidCalendarDate(todayYear, month, day)) {
      return candidateThisYear;
    }
    return null;
  }

  // YYYY-MM-DD valid
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (isValidCalendarDate(y, m, d)) {
      return trimmed;
    }
    return null;
  }

  return null;
}

/** Computes the ISO 8601 week number (1–53) for a YYYY-MM-DD date string.
 * Weeks start on Monday, and week 1 is the week with the year's first Thursday. */
export function isoWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dateUtc = new Date(Date.UTC(y, m - 1, d));
  const day = dateUtc.getUTCDay() === 0 ? 7 : dateUtc.getUTCDay();
  dateUtc.setUTCDate(dateUtc.getUTCDate() + 4 - day);
  const thursdayYear = dateUtc.getUTCFullYear();
  const jan4 = new Date(Date.UTC(thursdayYear, 0, 4));
  const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const firstThursday = new Date(Date.UTC(thursdayYear, 0, 4 + 4 - jan4Day));
  return 1 + Math.round((dateUtc.getTime() - firstThursday.getTime()) / 604800000);
}

/** Returns the Monday (YYYY-MM-DD) of a given ISO week in a given year. */
export function isoWeekToMonday(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const mon = new Date(Date.UTC(year, 0, 4 - (jan4Day - 1) + (week - 1) * 7));
  const y = mon.getUTCFullYear();
  const m = String(mon.getUTCMonth() + 1).padStart(2, "0");
  const d = String(mon.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- Month-grid helpers for the anchored calendar popover (§104) -------

export interface CalCell {
  /** `YYYY-MM-DD`. */
  iso: string;
  /** Day-of-month number (1–31). */
  day: number;
  /** False for the leading/trailing days borrowed from the adjacent
   * month to square off the grid. */
  inMonth: boolean;
}

/** `{ year, month }` shifted by `delta` whole months, month 0-indexed
 * (0 = January) — the shape `Date` itself uses. */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** A Monday-first calendar grid for the given month: always whole weeks,
 * with adjacent-month days filling the edges (`inMonth: false`). Six rows
 * only when the month genuinely spans six weeks, otherwise five (four for
 * a non-leap February starting on a Monday). */
export function monthGrid(year: number, month: number): CalCell[] {
  const first = new Date(year, month, 1);
  // JS: 0 = Sunday. Shift so Monday = 0.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  const daysInThisMonth = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((lead + daysInThisMonth) / 7) * 7;
  const cells: CalCell[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ iso: formatISO(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return cells;
}

/** i18n roadmap: locale-aware month/weekday names via `Intl.DateTimeFormat`
 * instead of a hand-translated array — less translation surface, and it
 * gets grammatically correct forms for free (some languages need a
 * different month-name form depending on context, which a flat array
 * can't express). `locale` is a `SupportedLocale` (`./i18n`) but typed as
 * `string` here to avoid `date.ts` depending on the i18n module. */
export function monthName(locale: string, month: number): string {
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, month, 1));
}

/** A `YYYY-MM-DD` date written out in `locale` ("September 8, 2026", "8 september 2026"): the date picker's day
 * buttons use it as their name, so the number they show is part of what a screen reader or voice control says
 * (WCAG 2.5.3, label in name). */
export function longDate(locale: string, iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(y, m - 1, d));
}

/** `weekdayIndex` is 0 = Monday ... 6 = Sunday, matching `monthGrid`'s own
 * Monday-first convention. 2024-01-01 was a Monday — used as a fixed,
 * arbitrary reference date purely to land on the right day of the week. */
export function weekdayAbbrev(locale: string, weekdayIndex: number): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 1 + weekdayIndex));
}

export type DayHeatState = "done" | "pending" | "log";

/** Evaluates the 3-tier completion heatmap state for a note body (Decision 3 / R7).
 * - Empty string or whitespace only: `null` (no content written)
 * - Has content and 0 action items: `"log"` (journal entry / reference notes)
 * - Has ≥1 open `#` item (`open > 0`): `"pending"` (outstanding tasks)
 * - Has ≥1 action item and `open === 0` (`closed > 0 || forwarded > 0`): `"done"` (deferred counts as resolved)
 */
export function computeDayHeat(content: string): DayHeatState | null {
  if (content.trim() === "") return null;
  const counts = countActions(content);
  if (counts.open > 0) return "pending";
  if (counts.closed > 0 || counts.forwarded > 0) return "done";
  return "log";
}

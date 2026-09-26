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
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}-\d{2}$/.test(trimmed)) return `${base.getFullYear()}-${trimmed}`;
  return null;
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

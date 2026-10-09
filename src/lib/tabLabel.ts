/** Labels for dated tabs (§B3). Pure on purpose: today's ISO date, the translated
 * words and the date formatter all come in as arguments, so nothing here reads a store. */
import { addDaysISO } from "./date";
import type { TabLabelStyle } from "./generated/tauri-types";

export interface TabLabelWords {
  today: string;
  yesterday: string;
  tomorrow: string;
}

/** Formats a calendar day for the friendly label (e.g. "do 9 okt"). */
export type DayFormatter = (day: Date) => string;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The text on a dated tab. `iso` is the note's date as `YYYY-MM-DD`; anything else (a name that is
 * not a plain date) is returned unchanged. The ISO date is the tab's tooltip in both styles. */
export function datedTabLabel(
  iso: string,
  style: TabLabelStyle,
  todayISO: string,
  words: TabLabelWords,
  format: DayFormatter,
): string {
  const match = ISO_DAY.exec(iso);
  if (style === "iso" || !match || !ISO_DAY.test(todayISO)) return iso;
  if (iso === todayISO) return words.today;
  if (iso === addDaysISO(todayISO, -1)) return words.yesterday;
  if (iso === addDaysISO(todayISO, 1)) return words.tomorrow;
  // Noon, not midnight: a formatter that converts time zones can then never land on the neighbouring day.
  return format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

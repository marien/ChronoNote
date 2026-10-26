/** Labels for dated tabs (§B3, §433). Pure on purpose: today's ISO date, the translated
 * words and the date formatter all come in as arguments, so nothing here reads a store. */
import type { TabLabelStyle } from "./generated/tauri-types";
import {
  formatNoteDate,
  type TabLabelWords,
  type DayFormatter,
} from "./noteDateLabel";

export type { TabLabelWords, DayFormatter };

/** The text on a dated tab. `iso` is the note's date as `YYYY-MM-DD`; anything else (a name that is
 * not a plain date) is returned unchanged. The ISO date is the tab's tooltip in both styles. */
export function datedTabLabel(
  iso: string,
  style: TabLabelStyle,
  todayISO: string,
  words: TabLabelWords,
  format: DayFormatter,
): string {
  return formatNoteDate(iso, style, todayISO, words, format);
}

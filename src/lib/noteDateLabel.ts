/** Pure date label formatting and shared store for dated notes and lists (§433).
 * Turns a note's date or filename into a friendly label or ISO date string,
 * depending on `tabLabelStyle`. Scratchpads (names that are not dates) are returned unchanged.
 */
import { derived } from "svelte/store";
import { tabLabelStyle, currentDateISO } from "./stores";
import { locale, t } from "./i18n";
import { addDaysISO } from "./date";
import type { TabLabelStyle } from "./generated/tauri-types";

export interface TabLabelWords {
  today: string;
  yesterday: string;
  tomorrow: string;
}

export type DayFormatter = (day: Date) => string;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** If filenameOrDate represents a valid ISO date (e.g. "2026-10-20" or "2026-10-20.txt"),
 * returns the 10-char ISO date string "YYYY-MM-DD". Otherwise returns null. */
export function noteISODate(filenameOrDate: string): string | null {
  const base = filenameOrDate.replace(/\.txt$/, "");
  return ISO_DAY.test(base) ? base : null;
}

/** Pure formatter: formats a note's date according to style, todayISO, words and locale/formatter.
 * Scratchpads or non-dates are returned unchanged. */
export function formatNoteDate(
  filenameOrDate: string,
  style: TabLabelStyle,
  todayISO: string,
  words: TabLabelWords,
  localeOrFormatter: string | DayFormatter,
): string {
  const iso = noteISODate(filenameOrDate);
  if (!iso) return filenameOrDate;
  if (style === "iso" || !ISO_DAY.test(todayISO)) return iso;
  if (iso === todayISO) return words.today;
  if (iso === addDaysISO(todayISO, -1)) return words.yesterday;
  if (iso === addDaysISO(todayISO, 1)) return words.tomorrow;

  const match = ISO_DAY.exec(iso)!;
  // Noon, not midnight: timezone conversions can never land on neighbouring day.
  const dateObj = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (typeof localeOrFormatter === "function") {
    return localeOrFormatter(dateObj);
  }
  return new Intl.DateTimeFormat(localeOrFormatter, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(dateObj);
}

/** Reactive derived store returning a formatter function `(filenameOrDate: string) => string`. */
export const noteDateLabel = derived(
  [tabLabelStyle, currentDateISO, locale, t],
  ([$style, $today, $loc, $t]) => {
    const dayFormat = new Intl.DateTimeFormat($loc, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const words: TabLabelWords = {
      today: $t("phoneNav.today"),
      yesterday: $t("phoneNav.yesterday"),
      tomorrow: $t("phoneNav.tomorrow"),
    };
    return (filenameOrDate: string): string => {
      return formatNoteDate(filenameOrDate, $style, $today, words, (d) => dayFormat.format(d));
    };
  },
);

import { addDaysISO } from "./date";

/**
 * Finds the nearest date in `dates` strictly before (`dir === -1`) or strictly after (`dir === 1`) `current`.
 * Dates can be in any order. Returns null if no such date exists.
 */
export function adjacentNoteDate(current: string, dates: string[], dir: 1 | -1): string | null {
  if (dir === 1) {
    let nearest: string | null = null;
    for (const d of dates) {
      if (d > current) {
        if (nearest === null || d < nearest) {
          nearest = d;
        }
      }
    }
    return nearest;
  } else {
    let nearest: string | null = null;
    for (const d of dates) {
      if (d < current) {
        if (nearest === null || d > nearest) {
          nearest = d;
        }
      }
    }
    return nearest;
  }
}

/**
 * Returns "today", "yesterday", "tomorrow" if `iso` matches the corresponding offset from `todayIso`, else null.
 */
export function relativeDay(iso: string, todayIso: string): "today" | "yesterday" | "tomorrow" | null {
  if (iso === todayIso) return "today";
  if (iso === addDaysISO(todayIso, -1)) return "yesterday";
  if (iso === addDaysISO(todayIso, 1)) return "tomorrow";
  return null;
}

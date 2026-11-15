import { get } from "svelte/store";
import { autoAddedMeetings } from "./stores";
import { writeTabSessionNow } from "./boot";

/** Merges `titles` into the `autoAddedMeetings` store for `date` (deduped after `trim().toLowerCase()`)
 * and persists the tab session immediately through `boot.ts`'s shared writer. */
export function recordAutoAddedMeetings(date: string, titles: string[]): void {
  const current = get(autoAddedMeetings);
  const existing = current[date] ?? [];
  const seen = new Set(existing.map((title) => title.trim().toLowerCase()));
  const merged = [...existing];
  for (const raw of titles) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  if (merged.length > 0) {
    autoAddedMeetings.set({ ...current, [date]: merged });
  }
  writeTabSessionNow();
}

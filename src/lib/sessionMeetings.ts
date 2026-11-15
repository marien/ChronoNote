/** Pure helpers for `TabSession.autoAddedMeetings`, shared across backends and boot. */

/** Converts an optional/nullable `TabSession.autoAddedMeetings` map into a clean `Record<string, string[]>`. */
export function normalizeAutoAddedMeetings(
  raw: Record<string, string[] | undefined> | null | undefined,
): Record<string, string[]> {
  if (!raw) return {};
  const out: Record<string, string[]> = {};
  for (const [date, titles] of Object.entries(raw)) {
    if (Array.isArray(titles)) {
      out[date] = [...titles];
    }
  }
  return out;
}

/** Drops entries whose `YYYY-MM-DD` key is strictly before `today`, returning `undefined` when nothing remains. */
export function pruneAutoAddedMeetings(
  meetings: Record<string, string[] | undefined> | null | undefined,
  today: string | null | undefined,
): Record<string, string[]> | undefined {
  if (!meetings) return undefined;
  const out: Record<string, string[]> = {};
  for (const [date, titles] of Object.entries(meetings)) {
    if (!Array.isArray(titles)) continue;
    if (today && date < today) continue;
    out[date] = [...titles];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

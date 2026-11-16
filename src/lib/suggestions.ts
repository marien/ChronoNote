/** Pure suggestion builder for `@name`, `(topic)`, and recurring / today's section titles (F3). */
import { addDaysISO, todayISO } from "./date";
import type { NoteEntry } from "./notesIndex";
import { dateISOOfFilename, isScratchpadKey } from "./notesIndex/entries";
import { namesOf, sectionsOf, topicTagsOf, type NameCountsFacet } from "./notesIndex/facets";
import { normalizeHeaderTitle, titleForMatching } from "./tokens";

export type SuggestionKind = "name" | "topic" | "title";

export interface Suggestion {
  insert: string;
  label: string;
  lastUsed: string | null;
  meetingToday?: boolean;
  invited?: boolean;
}

export interface SuggestionsContext {
  noteDate: string | null;
  entries: ReadonlyMap<string, NoteEntry>;
  meetingsToday: readonly string[];
  attendees?: readonly string[];
}

const MAX_SUGGESTIONS = 8;
const RECURRING_TITLE_DAYS = 90;

interface SpellingEntry {
  count: number;
  lastDate: string | null;
}

interface NameOrTopicBucket {
  lower: string;
  lastUsed: string | null;
  totalCount: number;
  spellings: Map<string, SpellingEntry>;
}

function compareDatesDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b > a ? 1 : -1;
}

function bestSpelling(spellings: Map<string, SpellingEntry>): string {
  let best = "";
  let bestEntry: SpellingEntry | null = null;
  for (const [spelling, entry] of spellings) {
    if (!bestEntry) {
      best = spelling;
      bestEntry = entry;
      continue;
    }
    if (entry.count !== bestEntry.count) {
      if (entry.count > bestEntry.count) {
        best = spelling;
        bestEntry = entry;
      }
      continue;
    }
    const dateCmp = compareDatesDesc(entry.lastDate, bestEntry.lastDate);
    if (dateCmp !== 0) {
      if (dateCmp < 0) {
        best = spelling;
        bestEntry = entry;
      }
      continue;
    }
    if (spelling < best) {
      best = spelling;
      bestEntry = entry;
    }
  }
  return best;
}

function buildNameOrTopicSuggestions(
  kind: "name" | "topic",
  prefix: string,
  entries: ReadonlyMap<string, NoteEntry>,
  attendees: readonly string[] = [],
): Suggestion[] {
  const lowerPrefix = prefix.toLowerCase();
  const buckets = new Map<string, NameOrTopicBucket>();
  const readFacet: (e: NoteEntry) => NameCountsFacet = kind === "name" ? namesOf : topicTagsOf;

  for (const [key, entry] of entries) {
    if (isScratchpadKey(key)) continue;
    const noteDate = entry.dateISO ?? dateISOOfFilename(key);
    const facet = readFacet(entry);

    for (const [lower, spellingCounts] of facet) {
      if (!lower.startsWith(lowerPrefix) || lower === lowerPrefix) continue;

      let bucket = buckets.get(lower);
      if (!bucket) {
        bucket = { lower, lastUsed: noteDate, totalCount: 0, spellings: new Map() };
        buckets.set(lower, bucket);
      } else if (noteDate !== null && (bucket.lastUsed === null || noteDate > bucket.lastUsed)) {
        bucket.lastUsed = noteDate;
      }

      for (const [spelling, count] of spellingCounts) {
        bucket.totalCount += count;
        const existing = bucket.spellings.get(spelling);
        if (!existing) {
          bucket.spellings.set(spelling, { count, lastDate: noteDate });
        } else {
          existing.count += count;
          if (noteDate !== null && (existing.lastDate === null || noteDate > existing.lastDate)) {
            existing.lastDate = noteDate;
          }
        }
      }
    }
  }

  const results: Suggestion[] = [];
  const listedLower = new Set<string>();

  if (kind === "name" && attendees.length > 0) {
    for (const raw of attendees) {
      const name = raw.trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (!lower.startsWith(lowerPrefix) || lower === lowerPrefix) continue;
      if (listedLower.has(lower)) continue;
      listedLower.add(lower);
      const bucket = buckets.get(lower);
      const insert = `@${name}`;
      results.push({
        insert,
        label: insert,
        lastUsed: bucket?.lastUsed ?? null,
        invited: true,
      });
      if (results.length >= MAX_SUGGESTIONS) {
        return results;
      }
    }
  }

  const sorted = [...buckets.values()]
    .filter((b) => !listedLower.has(b.lower))
    .sort((a, b) => {
      const dateCmp = compareDatesDesc(a.lastUsed, b.lastUsed);
      if (dateCmp !== 0) return dateCmp;
      if (a.totalCount !== b.totalCount) return b.totalCount - a.totalCount;
      return a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0;
    });

  for (const bucket of sorted) {
    if (results.length >= MAX_SUGGESTIONS) break;
    const spelling = bestSpelling(bucket.spellings);
    const insert = kind === "name" ? `@${spelling}` : `(${spelling})`;
    results.push({ insert, label: insert, lastUsed: bucket.lastUsed });
  }

  return results;
}

interface TitleBucket {
  lower: string;
  spelling: string;
  lastUsed: string;
  noteKeys: Set<string>;
}

function buildTitleSuggestions(prefix: string, ctx: SuggestionsContext): Suggestion[] {
  const lowerPrefix = prefix.toLowerCase();
  const results: Suggestion[] = [];
  const listedLower = new Set<string>();

  for (const raw of ctx.meetingsToday) {
    const title = raw.trim();
    if (!title) continue;
    const lower = title.toLowerCase();
    if (!lower.includes(lowerPrefix)) continue;
    results.push({ insert: title, label: title, lastUsed: null, meetingToday: true });
    listedLower.add(lower);
    const normalized = titleForMatching(normalizeHeaderTitle(title)).toLowerCase();
    if (normalized) listedLower.add(normalized);
  }

  if (results.length >= MAX_SUGGESTIONS) {
    return results.slice(0, MAX_SUGGESTIONS);
  }

  const anchorDate = ctx.noteDate ?? todayISO();
  const minDate = addDaysISO(anchorDate, -RECURRING_TITLE_DAYS);
  const buckets = new Map<string, TitleBucket>();

  for (const [key, entry] of ctx.entries) {
    if (isScratchpadKey(key)) continue;
    const noteDate = entry.dateISO ?? dateISOOfFilename(key);
    if (!noteDate || noteDate < minDate || noteDate > anchorDate) continue;

    for (const sec of sectionsOf(entry)) {
      const matching = titleForMatching(sec.normalized);
      if (!matching) continue;
      const lower = matching.toLowerCase();
      if (!lower.includes(lowerPrefix) || lower === lowerPrefix) continue;
      if (listedLower.has(lower)) continue;

      let bucket = buckets.get(lower);
      if (!bucket) {
        bucket = { lower, spelling: matching, lastUsed: noteDate, noteKeys: new Set([key]) };
        buckets.set(lower, bucket);
      } else {
        bucket.noteKeys.add(key);
        if (noteDate > bucket.lastUsed) {
          bucket.lastUsed = noteDate;
          bucket.spelling = matching;
        }
      }
    }
  }

  const recurring = [...buckets.values()]
    .filter((b) => b.noteKeys.size >= 2)
    .sort((a, b) => {
      const dateCmp = compareDatesDesc(a.lastUsed, b.lastUsed);
      if (dateCmp !== 0) return dateCmp;
      return a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0;
    });

  for (const rec of recurring) {
    if (results.length >= MAX_SUGGESTIONS) break;
    results.push({ insert: rec.spelling, label: rec.spelling, lastUsed: rec.lastUsed });
  }

  return results;
}

export function buildSuggestions(
  kind: SuggestionKind,
  prefix: string,
  ctx: SuggestionsContext,
): Suggestion[] {
  if (kind === "title") {
    return buildTitleSuggestions(prefix, ctx);
  }
  return buildNameOrTopicSuggestions(kind, prefix, ctx.entries, ctx.attendees);
}

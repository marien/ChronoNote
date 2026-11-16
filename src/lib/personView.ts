/** Pure model and openers for the Person view (F5). */
import { get } from "svelte/store";
import { nodeText } from "./actionDrawerRows";
import { addDaysISO } from "./date";
import { NAME_CHAR } from "./grammar/symbols";
import { isSetextUnderline, tokenizeLine, tokenizeNoteLine, type TokenizeOptions } from "./grammar/tokenize";
import { ensureLoaded, notesIndex, type NoteEntry } from "./notesIndex";
import { dateISOOfFilename, isScratchpadKey } from "./notesIndex/entries";
import { actionsOf, linesOf, namesOf, sectionsOf, type SectionFacet } from "./notesIndex/facets";
import { escapeRegExp } from "./search";
import { modal, personViewName } from "./stores";
import type { ActionSnapshotItem } from "./types";

const WINDOW_DAYS = 56;

export interface PersonActionRow {
  filename: string;
  dateISO: string | null;
  lineIdx: number;
  text: string;
  section: string;
  line: string;
  partFrom: number;
  partTo: number;
  whole: boolean;
  state: "#" | "v" | ">" | "x" | null;
  delegated: boolean;
}

export interface PersonMentionRow {
  filename: string;
  dateISO: string;
  title: string;
  lineIdx: number;
  count: number;
}

export interface PersonViewModel {
  name: string;
  openActions: PersonActionRow[];
  delegated: PersonActionRow[];
  mentions: PersonMentionRow[];
  hasOlder: boolean;
}

/** True when `line` has an `"assignee"` token equal to `name` (case-insensitively) or contains `name` as a whole
 *  word delimited by start/end of line or non-`NAME_CHAR` characters. */
export function personMatches(line: string, name: string): boolean {
  const target = name.startsWith("@") ? name.slice(1) : name;
  if (!target) return false;
  const targetLower = target.toLowerCase();

  if (line.includes("@")) {
    for (const tok of tokenizeLine(line)) {
      if (tok.kind === "assignee" && line.slice(tok.from + 1, tok.to).toLowerCase() === targetLower) {
        return true;
      }
    }
  }

  const wordRe = new RegExp(String.raw`(?<!${NAME_CHAR})${escapeRegExp(target)}(?!${NAME_CHAR})`, "iu");
  return wordRe.test(line);
}

interface SpellingStats {
  count: number;
  lastDate: string | null;
}

interface PersonBucket {
  lower: string;
  lastUsed: string | null;
  totalCount: number;
  spellings: Map<string, SpellingStats>;
}

function compareDatesDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b > a ? 1 : -1;
}

function pickBestSpelling(spellings: Map<string, SpellingStats>): string {
  let best = "";
  let bestStats: SpellingStats | null = null;
  for (const [spelling, stats] of spellings) {
    if (!bestStats) {
      best = spelling;
      bestStats = stats;
      continue;
    }
    if (stats.count !== bestStats.count) {
      if (stats.count > bestStats.count) {
        best = spelling;
        bestStats = stats;
      }
      continue;
    }
    const dateCmp = compareDatesDesc(stats.lastDate, bestStats.lastDate);
    if (dateCmp !== 0) {
      if (dateCmp < 0) {
        best = spelling;
        bestStats = stats;
      }
      continue;
    }
    if (spelling < best) {
      best = spelling;
      bestStats = stats;
    }
  }
  return best;
}

/** All `@name`s from `namesOf` across non-scratchpad entries: most-used spelling, ordered most recently used first. */
export function knownPeople(entries: ReadonlyMap<string, NoteEntry>): string[] {
  const buckets = new Map<string, PersonBucket>();

  for (const [key, entry] of entries) {
    if (isScratchpadKey(key)) continue;
    const noteDate = entry.dateISO ?? dateISOOfFilename(entry.filename);
    for (const [lower, spellingCounts] of namesOf(entry)) {
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

  return [...buckets.values()]
    .sort((a, b) => {
      const dateCmp = compareDatesDesc(a.lastUsed, b.lastUsed);
      if (dateCmp !== 0) return dateCmp;
      if (a.totalCount !== b.totalCount) return b.totalCount - a.totalCount;
      return a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0;
    })
    .map((bucket) => pickBestSpelling(bucket.spellings));
}

/** Returns the most-used spelling of `name` from `knownPeople`, or `name` (without `@`) when unseen. */
export function preferredPersonSpelling(name: string, entries: ReadonlyMap<string, NoteEntry>): string {
  const clean = name.startsWith("@") ? name.slice(1) : name;
  if (!clean) return "";
  const lower = clean.toLowerCase();
  return knownPeople(entries).find((p) => p.toLowerCase() === lower) ?? clean;
}

function sectionForLine(
  sections: readonly SectionFacet[],
  lineIdx: number,
): { sectionLineIdx: number; title: string } {
  let found: SectionFacet | undefined;
  for (const s of sections) {
    if (s.lineIdx <= lineIdx) found = s;
    else break;
  }
  return found ? { sectionLineIdx: found.lineIdx, title: found.normalized } : { sectionLineIdx: -1, title: "" };
}

function rowTextForNode(
  filename: string,
  line: string,
  section: string,
  node: {
    lineIdx: number;
    kind: "line" | "step";
    from: number;
    to: number;
    symbolCol: number | null;
    delegated: boolean;
    depth: number;
    whole: boolean;
  },
): string {
  const item: ActionSnapshotItem = {
    id: "",
    filename,
    lineIdx: node.lineIdx,
    line,
    header: section,
    kind: node.kind,
    partFrom: node.from,
    partTo: node.to,
    symbolCol: node.symbolCol,
    delegated: node.delegated,
    depth: node.depth,
    whole: node.whole,
  };
  return nodeText(item);
}

/** Build the read-only snapshot for `name` across `entries`. */
export function buildPersonView(
  name: string,
  entries: ReadonlyMap<string, NoteEntry>,
  todayISO: string,
  showOlder: boolean,
): PersonViewModel {
  const cleanName = name.startsWith("@") ? name.slice(1) : name;
  const targetLower = cleanName.toLowerCase();
  const minDateISO = addDaysISO(todayISO, -WINDOW_DAYS);

  const openActions: PersonActionRow[] = [];
  const delegated: PersonActionRow[] = [];
  const mentions: PersonMentionRow[] = [];
  let hasOlder = false;

  if (!cleanName) {
    return { name: cleanName, openActions, delegated, mentions, hasOlder };
  }

  const orderedEntries: Array<{ entry: NoteEntry; dateISO: string | null }> = [];
  for (const [key, entry] of entries) {
    if (isScratchpadKey(key)) continue;
    const dateISO = entry.dateISO ?? dateISOOfFilename(entry.filename);
    orderedEntries.push({ entry, dateISO });
  }
  orderedEntries.sort((a, b) => {
    const dateCmp = compareDatesDesc(a.dateISO, b.dateISO);
    if (dateCmp !== 0) return dateCmp;
    return a.entry.filename < b.entry.filename ? -1 : a.entry.filename > b.entry.filename ? 1 : 0;
  });

  for (const { entry, dateISO } of orderedEntries) {
    const isDated = dateISO !== null;
    const inWindow = isDated && dateISO >= minDateISO;
    const lines = linesOf(entry);
    const sections = sectionsOf(entry);
    const nodes = actionsOf(entry).flat;
    const usedLines = new Set<number>();

    for (const node of nodes) {
      const line = lines[node.lineIdx] ?? "";
      if (node.state === "#" && !node.delegated) {
        const part = line.slice(node.from, node.to);
        if (personMatches(part, cleanName)) {
          const section = sectionForLine(sections, node.lineIdx).title;
          openActions.push({
            filename: entry.filename,
            dateISO,
            lineIdx: node.lineIdx,
            text: rowTextForNode(entry.filename, line, section, node),
            section,
            line,
            partFrom: node.from,
            partTo: node.to,
            whole: node.whole,
            state: node.state,
            delegated: node.delegated,
          });
          usedLines.add(node.lineIdx);
        }
        continue;
      }

      if (isDated && node.delegated) {
        const hasAssignee = tokenizeNoteLine(lines, node.lineIdx).some(
          (tok) =>
            tok.kind === "assignee" &&
            tok.from >= node.from &&
            tok.to <= node.to &&
            line.slice(tok.from + 1, tok.to).toLowerCase() === targetLower,
        );
        if (hasAssignee) {
          if (inWindow || showOlder) {
            const section = sectionForLine(sections, node.lineIdx).title;
            delegated.push({
              filename: entry.filename,
              dateISO,
              lineIdx: node.lineIdx,
              text: rowTextForNode(entry.filename, line, section, node),
              section,
              line,
              partFrom: node.from,
              partTo: node.to,
              whole: node.whole,
              state: node.state,
              delegated: node.delegated,
            });
            usedLines.add(node.lineIdx);
          } else {
            hasOlder = true;
          }
        }
      }
    }

    if (!isDated) continue;

    if (inWindow || showOlder) {
      const bySection = new Map<number, PersonMentionRow>();
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        if (usedLines.has(lineIdx)) continue;
        const line = lines[lineIdx];
        if (isSetextUnderline(line)) continue;
        if (!personMatches(line, cleanName)) continue;

        const sec = sectionForLine(sections, lineIdx);
        const existing = bySection.get(sec.sectionLineIdx);
        if (existing) {
          existing.count++;
        } else {
          const row: PersonMentionRow = {
            filename: entry.filename,
            dateISO,
            title: sec.title,
            lineIdx,
            count: 1,
          };
          bySection.set(sec.sectionLineIdx, row);
          mentions.push(row);
        }
      }
    } else if (!hasOlder) {
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        if (usedLines.has(lineIdx)) continue;
        const line = lines[lineIdx];
        if (isSetextUnderline(line)) continue;
        if (personMatches(line, cleanName)) {
          hasOlder = true;
          break;
        }
      }
    }
  }

  return { name: cleanName, openActions, delegated, mentions, hasOlder };
}

/** Assignee name at `col`, or else the line's first assignee token, or `null` when the line has none. */
export function personForLineMenu(line: string, col?: number, options?: TokenizeOptions): string | null {
  if (!line.includes("@")) return null;
  const assignees = tokenizeLine(line, options).filter((t) => t.kind === "assignee");
  if (assignees.length === 0) return null;
  const picked =
    col !== undefined
      ? assignees.find((t) => col >= t.from && col <= t.to) ?? assignees[0]
      : assignees[0];
  return line.slice(picked.from + 1, picked.to);
}

/** Open the Person view for `name` (resolving the preferred spelling after loading the index). */
export async function openPersonView(name: string): Promise<void> {
  const clean = name.startsWith("@") ? name.slice(1) : name;
  if (!clean) return;
  await ensureLoaded();
  const resolved = preferredPersonSpelling(clean, get(notesIndex).entries);
  personViewName.set(resolved);
  modal.set("person");
}

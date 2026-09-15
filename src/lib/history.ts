/** Section history (Ctrl/Cmd+Shift+H): aggregate every action and follow-up
 * under the cursor's section across all dated notes, deduped,
 * most-recent-first — one row per action, so a line carrying both a
 * leading action and a mid-line `=> ` follow-up (#41) contributes two.
 * Plus (#27/#33) a glyph-rendered snapshot of the section's previous
 * occurrence before today. §150 also builds `historyOccurrences` — one
 * entry per dated note that has the section at all, whether or not it
 * contributed any rows to the flat `historyItems` list, so the drawer can
 * show (and let you browse into) every occurrence, empty or not, past or
 * future. Split out of `controller.ts` in the v0.5.0 refactor. Depends on
 * stores + persistence + tabs (`jumpToFileLine`) + tokens. */
import { get } from "svelte/store";
import { todayISO } from "./date";
import {
  activeTabId,
  allNotesCache,
  editorApi,
  historyItems,
  historyLoading,
  historyOccurrences,
  historyPreviousOccurrence,
  historyTargetHeader,
  modal,
  showToast,
  tabs,
} from "./stores";
import { refreshAllNotesCache } from "./persistence";
import { jumpToFileLine } from "./tabs";
import { getSectionHeaderForLine, isSetextUnderline, normalizeHeaderTitle, titleForMatching } from "./tokens";
import type { HistoryItem, PreviousSectionOccurrence, SectionOccurrence } from "./types";

/** #62: opens the drawer immediately (right after the fast, synchronous
 * "is the cursor on a section" check — no disk read needed for that part
 * at all), rather than blocking on `refreshAllNotesCache()`'s full read
 * of the notes folder first. That read is usually already warm by now
 * (`boot.ts` kicks it off in the background right after startup), but on
 * a large notes folder — or a very fast keypress right after launch — it
 * can still be genuinely in flight; `historyLoading` lets the drawer show
 * a spinner for that window instead of the app appearing to not have
 * responded to the shortcut at all. */
export async function openMeetingHistory() {
  const tab = get(tabs).find((t) => t.id === get(activeTabId));
  if (!tab) return;
  const lines = tab.content.split("\n");
  const cursorLineIdx = editorApi ? editorApi.getCursorLineIdx() : 0;
  const rawHeader = getSectionHeaderForLine(lines, cursorLineIdx);
  // Matching (not display) ignores a date embedded in the title, so
  // "Weekly Sync - 2026-08-08" and "...- 2026-08-09" are recognized as
  // the same recurring section (§37) — the drawer's own heading shows
  // this canonical form too, since it now aggregates entries from many
  // different dates under one topic.
  const targetHeader = titleForMatching(normalizeHeaderTitle(rawHeader));
  if (!targetHeader) {
    showToast("Cursor is not on or inside a named section.");
    return;
  }

  historyTargetHeader.set(targetHeader);
  historyItems.set([]);
  historyOccurrences.set([]);
  historyPreviousOccurrence.set(null);
  historyLoading.set(true);
  modal.set("history");

  await refreshAllNotesCache();
  const allSources = get(allNotesCache);
  const sortedFiles = Object.keys(allSources).sort().reverse();
  const items: HistoryItem[] = [];
  const occurrences: SectionOccurrence[] = [];
  const seen = new Set<string>();

  for (const filename of sortedFiles) {
    const flines = allSources[filename].split("\n");
    const body = extractSectionBody(flines, targetHeader);
    if (!body) continue;
    const date = filename.replace(/\.txt$/, "");
    const occurrenceItems: HistoryItem[] = [];
    body.lines.forEach((line, i) => {
      const idx = body.startLineIdx + i;
      // #41: one source line can carry more than one action — a leading
      // `# `/`v `/`> `/`x ` *and* a mid-line `=> <symbol>` follow-up —
      // and each becomes its own row, showing only that action's text.
      for (const action of historyActionsForLine(line)) {
        const key = normalizeActionText(action);
        if (seen.has(key)) continue;
        seen.add(key);
        const item: HistoryItem = { filename, lineIdx: idx, line, action, date };
        items.push(item);
        occurrenceItems.push(item);
      }
    });
    occurrences.push({ filename, date, lines: body.lines, startLineIdx: body.startLineIdx, items: occurrenceItems });
  }

  historyItems.set(items);
  historyOccurrences.set(occurrences);
  // #27: alongside the all-dates list, a snapshot of the section's body
  // as it stood at its previous occurrence — the most recent dated note
  // *before today* that has this section (§150: always today, not the
  // date of whichever note the drawer happened to be opened from).
  historyPreviousOccurrence.set(findPreviousSectionOccurrence(allSources, targetHeader));
  historyLoading.set(false);
}

/** §150: is this action row "open" — a leading `# ` action, or a `=> #`
 * consequence-action's inner `# text` (already flattened to that form by
 * `historyActionsForLine`)? Everything else (`v`/`>`/`x`/a plain `=> `
 * follow-up) is not. Used by the drawer's "Only Open" toggle to filter
 * both individual rows and, when an occurrence's rows are filtered down
 * to none, the occurrence's header itself. */
export function isOpenHistoryAction(action: string): boolean {
  return action.startsWith("# ");
}

/** #41: the action(s) a Section-History line contributes to the list.
 *
 *  - A leading `# `/`v `/`> `/`x ` line contributes that action, its text
 *    taken **up to the first ` => `** (so the follow-up part is split off).
 *  - The **last** `=> ` on the line contributes its follow-up: `=> <symbol>
 *    text` → the inner action `<symbol> text`; a plain `=> text` (or
 *    `=> @name text`) → the follow-up itself, `=> text`. Earlier `=> `s on
 *    the same line are ignored ("take only the last one").
 *
 * So `# do X => # do Y` → `["# do X", "# do Y"]`, `a => b => # c` →
 * `["# c"]`, `Talked to Sam => let's regroup` → `["=> let's regroup"]`,
 * `# solo task` → `["# solo task"]`. Lines with neither contribute
 * nothing. */
export function historyActionsForLine(line: string): string[] {
  const out: string[] = [];

  const lead = line.match(/^\s*([#vx>])\s+(.+?)(?:\s+=>\s|\s*$)/);
  if (lead && lead[2].trim()) out.push(`${lead[1]} ${lead[2].trim()}`);

  const li = line.lastIndexOf("=> ");
  if (li !== -1) {
    const after = line.slice(li + 3).trim();
    const sym = after.match(/^([#vx>])\s+(.+)$/);
    if (sym) out.push(`${sym[1]} ${sym[2].trim()}`);
    else if (after) out.push(`=> ${after}`);
  }
  return out;
}

/** Dedup key for an action produced by `historyActionsForLine` — drop the
 * leading symbol / `=> ` / `=> @name` so the same action reworded with
 * different leading context collapses to one row. */
function normalizeActionText(action: string): string {
  return action
    .replace(/^([#vx>]\s+|=>\s+(@[\w-]+\s+)?)/, "")
    .trim()
    .toLowerCase();
}

const DATED_FILE = /^\d{4}-\d{2}-\d{2}\.txt$/;

/** #27/#33/§150: the body of `targetHeader`'s previous occurrence — the
 * newest dated file strictly before *today* (not the note Section History
 * happened to be opened from — a scratchpad, or a future-dated note,
 * shouldn't change what "previous" means) that contains the section.
 * Returns `null` when there's no such occurrence with any content.
 * Filenames are compared as plain strings, which orders `YYYY-MM-DD.txt`
 * names chronologically. */
export function findPreviousSectionOccurrence(
  allSources: Record<string, string>,
  targetHeader: string,
): PreviousSectionOccurrence | null {
  const cutoff = `${todayISO()}.txt`;
  const candidates = Object.keys(allSources)
    .filter((f) => DATED_FILE.test(f) && f < cutoff)
    .sort()
    .reverse();
  for (const filename of candidates) {
    const body = extractSectionBody(allSources[filename].split("\n"), targetHeader);
    if (body && body.lines.some((l) => l.trim() !== "")) {
      return { filename, date: filename.replace(/\.txt$/, ""), lines: body.lines, startLineIdx: body.startLineIdx };
    }
  }
  return null;
}

/** The lines between a section's setext underline and the next section
 * header (or end of file), trailing blanks trimmed. `null` if the file
 * has no section whose title matches `targetHeader` (via the same
 * date-insensitive comparison `openMeetingHistory` matches on). */
function extractSectionBody(
  fileLines: string[],
  targetHeader: string,
): { lines: string[]; startLineIdx: number } | null {
  for (let i = 0; i + 1 < fileLines.length; i++) {
    if (!isSetextUnderline(fileLines[i + 1])) continue;
    const h = titleForMatching(normalizeHeaderTitle(fileLines[i].trim()));
    if (h.toLowerCase() !== targetHeader.toLowerCase()) continue;

    const start = i + 2;
    let end = fileLines.length;
    for (let j = start; j + 1 < fileLines.length; j++) {
      if (isSetextUnderline(fileLines[j + 1])) {
        end = j; // the next section's title line
        break;
      }
    }
    let sliceEnd = end;
    while (sliceEnd > start && fileLines[sliceEnd - 1].trim() === "") sliceEnd--;
    return { lines: fileLines.slice(start, sliceEnd), startLineIdx: start };
  }
  return null;
}

export async function jumpToHistoryItem(item: HistoryItem) {
  await jumpToFileLine({ filename: item.filename, lineIdx: item.lineIdx });
}

/** §150: open the file behind a selected occurrence's *header* row (no
 * specific action selected), cursor on the section's first body line —
 * the same jump `jumpToPreviousOccurrence` does for its own pane, now
 * available for any occurrence in the main list. */
export async function jumpToHistoryOccurrence(occurrence: SectionOccurrence) {
  await jumpToFileLine({ filename: occurrence.filename, lineIdx: occurrence.startLineIdx });
}

/** #27: open the file behind the "Previous occurrence" pane, cursor on
 * the section's first body line. */
export async function jumpToPreviousOccurrence() {
  const po = get(historyPreviousOccurrence);
  if (po) await jumpToFileLine({ filename: po.filename, lineIdx: po.startLineIdx });
}

/** What a Section-History entry turns into when imported: a deferred
 * `> ` action comes across as a fresh open `# ` action (you're re-adopting
 * it), everything else is inserted verbatim. §109's preview and
 * `importHistoricalItem` both go through this so they can't disagree.
 * #41: operates on the row's `action` (the follow-up/action itself), not
 * the whole source line. */
export function historyInsertText(action: string): string {
  return action.startsWith("> ") ? "# " + action.slice(2) : action;
}

export function importHistoricalItem(action: string) {
  const toInsert = historyInsertText(action);
  editorApi?.insertAtCursor(toInsert + "\n");
  showToast(`Imported "${toInsert.slice(0, 30)}..." into note`);
}

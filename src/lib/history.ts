/** Section history (Ctrl/Cmd+Shift+H) — 2026-09-24 redesign
 * (docs/design/section-history-browse-and-carry-forward-roadmap.md):
 * browse every occurrence of the section under the cursor, glyph-rendered
 * exactly like the editor, and carry one or more lines from whatever
 * you're reading forward to a destination fixed by where the drawer was
 * opened from. Replaces the earlier flat, deduped action list — this file
 * no longer extracts individual action fragments out of context, it hands
 * the drawer full section bodies to render as-is. Split out of
 * `controller.ts` in the v0.5.0 refactor. Depends on stores + persistence +
 * tabs (`jumpToFileLine`) + tokens + copyForward. */
import { get } from "svelte/store";
import { t } from "./i18n";
import { computeDayHeat, todayISO, type DayHeatState } from "./date";
import {
  activeTabId,
  allNotesCache,
  editorApi,
  historyDestinations,
  historyLoading,
  historyOccurrences,
  historyOpenedFromTabId,
  historyTargetHeader,
  modal,
  showToast,
  tabs,
} from "./stores";
import { refreshAllNotesCache } from "./persistence";
import { jumpToFileLine } from "./tabs";
import { findNextOccurrenceTarget } from "./copyForward";
import { getSectionHeaderForLine, isSetextUnderline, normalizeHeaderTitle, reopenDeferredAction, titleForMatching } from "./tokens";
import type { HistoryDestination, NoteTab, SectionOccurrence } from "./types";

const DATED_FILE = /^\d{4}-\d{2}-\d{2}\.txt$/;

async function buildOccurrences(targetHeader: string): Promise<SectionOccurrence[]> {
  await refreshAllNotesCache();
  const allSources = get(allNotesCache);
  // Chronological, oldest first — the occurrence strip reads left-to-right
  // like a calendar (and like the main tab strip it's modeled on), newest
  // date at the right end.
  const sortedFiles = Object.keys(allSources).sort();
  const occurrences: SectionOccurrence[] = [];
  for (const filename of sortedFiles) {
    const flines = allSources[filename].split("\n");
    const body = extractSectionBody(flines, targetHeader);
    if (!body) continue;
    occurrences.push({ filename, date: filename.replace(/\.txt$/, ""), lines: body.lines, startLineIdx: body.startLineIdx });
  }
  return occurrences;
}

/** Where a take-over from this drawer session can land (`HistoryDestination`
 * in `types.ts`) — computed once, from the opened-from tab's own date, not
 * re-decided per occurrence browsed. A scratchpad has no date of its own,
 * so it's treated the same as "today or later": there's nowhere else
 * sensible to thread a next-occurrence search from.
 *
 * Labels spell out the actual destination ("Add to today" / `Add to
 * 2026-09-10` / `Add to "Scratchpad 1"`) rather than a generic "Insert
 * here" — chat feedback that the vague original left it unclear what the
 * button actually did or where "here" was. */
async function computeHistoryDestinations(
  openedFromTab: NoteTab,
  targetHeader: string,
  sourceHeaderDisplay: string,
): Promise<HistoryDestination[]> {
  const translate = get(t);
  const today = todayISO();
  const openedFromDate = openedFromTab.isScratchpad ? null : openedFromTab.filename.replace(/\.txt$/, "");
  if (openedFromDate === null || openedFromDate >= today) {
    // Non-null: `openedFromDate` is only ever `null` when `isScratchpad` is
    // true (see its own assignment above), so the two other branches here
    // — reached only when `isScratchpad` is false — always have a real date.
    const label = openedFromTab.isScratchpad
      ? translate("history.destination.addToQuoted", { name: openedFromTab.filename })
      : openedFromDate === today
        ? translate("history.destination.addToToday", undefined)
        : translate("history.destination.addToDate", { date: openedFromDate! });
    return [{ kind: "here", tabId: openedFromTab.id, label }];
  }

  const destinations: HistoryDestination[] = [
    {
      kind: "today",
      date: today,
      headerText: sourceHeaderDisplay,
      label: translate("history.destination.addToToday", undefined),
    },
  ];
  try {
    const next = await findNextOccurrenceTarget(openedFromTab.filename, targetHeader, sourceHeaderDisplay);
    if (next && next.date !== today) {
      destinations.push({
        kind: "next",
        date: next.date,
        headerText: next.headerText,
        label: translate("history.destination.addToNextOccurrence", { date: next.date }),
      });
    }
  } catch {
    // No calendar available, or a read failure — "Today" alone still works;
    // this is a quiet degrade, not worth a toast while just browsing.
  }
  return destinations;
}

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
  const sourceHeaderDisplay = normalizeHeaderTitle(rawHeader);
  const targetHeader = titleForMatching(sourceHeaderDisplay);
  if (!targetHeader) {
    showToast(get(t)("toast.history.cursorNotInSection", undefined));
    return;
  }

  historyTargetHeader.set(targetHeader);
  historyOpenedFromTabId.set(tab.id);
  historyOccurrences.set([]);
  historyDestinations.set([]);
  historyLoading.set(true);
  modal.set("history");

  historyOccurrences.set(await buildOccurrences(targetHeader));
  historyDestinations.set(await computeHistoryDestinations(tab, targetHeader, sourceHeaderDisplay));
  historyLoading.set(false);
}

/** Re-scans every note for the current `historyTargetHeader` — called
 * after a successful take-over so the drawer (kept open for continued
 * browsing) reflects the source line's new deferred state and any newly
 * created target section, without needing to close and reopen it. Costs a
 * full disk re-read, same as opening the drawer in the first place — an
 * acceptable, infrequent cost (once per deliberate take-over, not a
 * per-keystroke concern). Destinations are untouched: where a take-over
 * can land doesn't change within one drawer session. */
export async function refreshHistoryOccurrences(): Promise<void> {
  const targetHeader = get(historyTargetHeader);
  if (!targetHeader) return;
  historyOccurrences.set(await buildOccurrences(targetHeader));
}

/** #4 of the design doc: the action/follow-up fragment of a single line
 * with a "prose => action" shape (`Talked to Sam => # follow up` → `# follow
 * up`), for the take-over's "Action only" choice. `null` when there's
 * nothing to strip — no `=> ` at all, or nothing before it — since then
 * "whole line" and "action only" would be identical and the choice isn't
 * offered. */
export function historyActionOnlyText(line: string): string | null {
  const li = line.lastIndexOf("=> ");
  if (li === -1) return null;
  const prose = line.slice(0, li).trim();
  if (!prose) return null;
  const after = line.slice(li + 3).trim();
  const m = after.match(/^([#vx>])\s+(.+)$/);
  return m ? `${m[1]} ${m[2].trim()}` : null;
}

/** What actually lands in the target for a take-over — the selected
 * source lines verbatim, or (a single line with a "prose => action"
 * shape, "Action only" chosen) just the extracted action — with any
 * deferred (`>`) line re-adopted as a fresh open one, decision #3 of the
 * design doc: matches the old `historyInsertText`'s rewrite, done/won't-do/
 * already-open lines are untouched. */
export function historyTakeOverLines(sourceLines: string[], mode: "whole" | "action-only"): string[] {
  if (mode === "action-only" && sourceLines.length === 1) {
    const only = historyActionOnlyText(sourceLines[0]);
    if (only) return [reopenDeferredAction(only) ?? only];
  }
  return sourceLines.map((l) => reopenDeferredAction(l) ?? l);
}

/** #66: the earliest dated file strictly after `afterFilename` that has a
 * section matching `targetHeader` at all — unlike a "previous occurrence"
 * search, an empty-but-present section still counts here: "copy to next
 * occurrence" wants somewhere to put the copied content, not evidence it
 * already has some. Ascending order. Shared by the live editor's
 * `Ctrl+Shift+.` (via `copyForward.ts`) and Section History's own
 * destination computation above, so both agree on what "next occurrence"
 * means for the same section/anchor. */
export function findNextSectionOccurrenceOnDisk(
  allSources: Record<string, string>,
  targetHeader: string,
  afterFilename: string,
): { filename: string; date: string; startLineIdx: number } | null {
  const candidates = Object.keys(allSources)
    .filter((f) => DATED_FILE.test(f) && f > afterFilename)
    .sort();
  for (const filename of candidates) {
    const body = extractSectionBody(allSources[filename].split("\n"), targetHeader);
    if (body) {
      return { filename, date: filename.replace(/\.txt$/, ""), startLineIdx: body.startLineIdx };
    }
  }
  return null;
}

/** The lines between a section's setext underline and the next section
 * header (or end of file), trailing blanks trimmed. `null` if the file
 * has no section whose title matches `targetHeader` (via the same
 * date-insensitive comparison `openMeetingHistory` matches on). */
export function extractSectionBody(
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

/** The occurrence strip's per-date dot (2026-09-25 redesign, chat
 * feedback): reuses the exact same 3-tier completion heat the date
 * picker's `.cal-day` dots already show for a whole note
 * (`computeDayHeat`), just scoped to one section's own lines instead of
 * the whole file — "open actions" / "all actions closed" / "no actions"
 * is the same distinction either way. `null` (no dot at all) means the
 * section genuinely has no content yet. */
export function occurrenceHeat(occ: SectionOccurrence): DayHeatState | null {
  return computeDayHeat(occ.lines.join("\n"));
}

/** Open the file behind a browsed occurrence, cursor on a specific line —
 * its first body line by default (`Enter` with nothing selected), or a
 * line within it the user had selected for take-over. */
export async function jumpToHistoryLine(occurrence: SectionOccurrence, lineIdx?: number) {
  await jumpToFileLine({ filename: occurrence.filename, lineIdx: lineIdx ?? occurrence.startLineIdx });
}

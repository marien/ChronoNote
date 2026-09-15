/** Calendar sync reconciliation. Pure
 * string-in/string-out, source-agnostic: the caller hands it an ordered
 * list of agenda titles (from `.agenda.json` or from the manual "Sync from
 * a list" paste) and gets back the note's new content plus what changed,
 * for the review UI to show before anything is committed.
 * No sidecar file, no ID, no persisted memory of past syncs — every sync
 * re-derives the calendar block from scratch by title-matching against the
 * note's existing sections (normalizeHeaderTitle/titleForMatching, the same
 * identity rule Section History already uses). */

import { isSetextUnderline, normalizeHeaderTitle, titleForMatching } from "./tokens";
import { underlineFor } from "./sectionFormat";

export interface RemovedSection {
  header: string;
  lines: string[];
}

export interface CalendarSyncResult {
  content: string;
  newTitles: string[];
  reorderedTitles: string[];
  removedEmpty: string[];
  removedWithContent: RemovedSection[];
}

interface ParsedSection {
  header: string;
  matchKey: string;
  lines: string[];
}

function matchKey(title: string): string {
  return titleForMatching(normalizeHeaderTitle(title.trim())).toLowerCase();
}

function parseSections(content: string): { preamble: string[]; sections: ParsedSection[] } {
  const allLines = content.split("\n");
  const headerIdxs: number[] = [];
  for (let i = 0; i + 1 < allLines.length; i++) {
    if (allLines[i].trim() !== "" && isSetextUnderline(allLines[i + 1])) {
      headerIdxs.push(i);
    }
  }
  if (headerIdxs.length === 0) {
    return { preamble: allLines, sections: [] };
  }

  const preamble = allLines.slice(0, headerIdxs[0]);
  const sections = headerIdxs.map((start, k) => {
    const end = k + 1 < headerIdxs.length ? headerIdxs[k + 1] : allLines.length;
    const lines = allLines.slice(start, end);
    while (lines.length > 2 && lines[lines.length - 1].trim() === "") lines.pop();
    const header = allLines[start].trim();
    return { header, matchKey: matchKey(header), lines };
  });
  return { preamble, sections };
}

function joinBlocks(preamble: string[], blocks: string[][]): string {
  const preambleText = preamble.join("\n").replace(/\s+$/, "");
  const blockTexts = blocks.map((lines) => lines.join("\n"));
  if (blockTexts.length === 0) return preambleText ? preambleText + "\n" : "";
  if (preambleText) return preambleText + "\n\n\n" + blockTexts.join("\n\n\n") + "\n";
  return blockTexts.join("\n\n\n") + "\n";
}

/**
 * The calendar block always runs from the first title-matched section to the
 * end of the note, not just to the last *matched* section — new sections are
 * only ever appended at the tail (first sync, or a brand-new agenda item), so
 * nothing legitimately non-calendar is expected to follow a matched section.
 * This also matches the design doc's own worked example (§2.4): "1:1 with
 * Priya", which no longer matches anything, sits after "Weekly Standup" (the
 * one match) and still gets removed, which only happens if the block extends
 * to EOF rather than stopping at the last match.
 */
export function computeCalendarSync(content: string, agendaTitles: string[]): CalendarSyncResult {
  const { preamble, sections } = parseSections(content);
  const agenda = agendaTitles
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((title) => ({ title, key: matchKey(title) }));
  const agendaKeys = new Set(agenda.map((a) => a.key));

  const matchedIdxs: number[] = [];
  sections.forEach((s, i) => {
    if (agendaKeys.has(s.matchKey)) matchedIdxs.push(i);
  });

  const blockStart = matchedIdxs.length > 0 ? matchedIdxs[0] : sections.length;
  const before = sections.slice(0, blockStart);
  const blockSections = sections.slice(blockStart);

  const consumed = new Set<number>();
  const finalBlockLines: string[][] = [];
  const newTitles: string[] = [];
  const keptEntries: { title: string; origIdx: number }[] = [];

  for (const a of agenda) {
    const foundIdx = blockSections.findIndex((s, i) => !consumed.has(i) && s.matchKey === a.key);
    if (foundIdx >= 0) {
      consumed.add(foundIdx);
      keptEntries.push({ title: a.title, origIdx: foundIdx });
      finalBlockLines.push(blockSections[foundIdx].lines);
    } else {
      newTitles.push(a.title);
      finalBlockLines.push([a.title, underlineFor(a.title)]);
    }
  }

  const sortedOrig = [...keptEntries.map((e) => e.origIdx)].sort((x, y) => x - y);
  const reorderedTitles = keptEntries
    .filter((e, pos) => sortedOrig[pos] !== e.origIdx)
    .map((e) => e.title);

  const removedEmpty: string[] = [];
  const removedWithContent: RemovedSection[] = [];
  blockSections.forEach((s, i) => {
    if (consumed.has(i)) return;
    const body = s.lines.slice(2);
    if (body.some((l) => l.trim() !== "")) {
      removedWithContent.push({ header: s.header, lines: body });
    } else {
      removedEmpty.push(s.header);
    }
  });

  const newContent = joinBlocks(preamble, [...before.map((s) => s.lines), ...finalBlockLines]);

  return { content: newContent, newTitles, reorderedTitles, removedEmpty, removedWithContent };
}

/** Sync review "Leave it, flagged" (§2.4/§3.3) — reinserts a removed section
 * at the end of the note with a [CANCELED] prefix, the marker
 * normalizeHeaderTitle() already strips, so it still surfaces correctly by
 * its real name everywhere else in the app. */
export function flagRemovedSection(content: string, removed: RemovedSection): string {
  const header = `[CANCELED] ${removed.header}`;
  return appendBlock(content, [header, underlineFor(header), ...removed.lines]);
}

/** Sync review "Move to another day" (§3.3) — appends the removed section's
 * header + body onto the *target* day's own content, same two-blank-line
 * append convention as `flagRemovedSection`. The caller is responsible for
 * writing the result to that other day's note and removing it from today's
 * (already done by computeCalendarSync, which never includes it). */
export function appendRemovedSectionTo(targetContent: string, removed: RemovedSection): string {
  return appendBlock(targetContent, [removed.header, underlineFor(removed.header), ...removed.lines]);
}

function appendBlock(content: string, block: string[]): string {
  const trimmed = content.replace(/\s+$/, "");
  const blockText = block.join("\n");
  return trimmed ? trimmed + "\n\n\n" + blockText + "\n" : blockText + "\n";
}

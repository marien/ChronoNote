/** #66: "copy to next occurrence" — copies the current selection (or,
 * with none, just the current line) into the next occurrence of the
 * section it's in, deferring whatever was open in the source the same
 * way copy/paste forwarding already does (§64/§82/#67).
 *
 * "Next" is relative to the *active tab's own date*, not today — this
 * threads forward from wherever you're reading, so catching up on an
 * old note's backlog doesn't jump straight to "next after today" and
 * skip occurrences you haven't caught up on yet. A judgment call, not
 * specified by the original request.
 *
 * Search order, confirmed with Marien: whichever source is actually in
 * use leads, and is the *only* one tried before falling back to a
 * prompt — this doesn't check the other source afterward.
 *   - Calendar sync on (and available): `.agenda.json` leads. The
 *     earliest future date with a matching meeting title, if any.
 *   - Calendar sync off (or unavailable): on-disk notes lead. The
 *     earliest already-existing dated file with a matching section, if
 *     any (via `findNextSectionOccurrenceOnDisk`).
 *   - Either way, nothing found → prompt for a date (the existing
 *     "Jump to date" picker, repurposed: see `copyForwardPending`).
 *
 * If the target file/section doesn't exist yet, it's created — a new
 * section appended at the end of the file, using the calendar's own
 * title when the target came from a calendar match (matching how the
 * reconciliation engine always uses the calendar's own title text for a
 * new section), or the source's own header text when it came from a
 * prompted date (no more-authoritative title available there). */
import { get } from "svelte/store";
import {
  activeTabId,
  agendaFileExists,
  allNotesCache,
  backendKind,
  calendarSyncEnabled,
  copyForwardPending,
  editorApi,
  modal,
  oneDriveAccount,
  oneDriveFolder,
  showToast,
  tabs,
  type CopyForwardPending,
} from "./stores";
import * as api from "./tauriApi";
import { refreshAllNotesCache, writeNoteAndInvalidateCache, writeTabContent } from "./persistence";
import { extractSectionBody, findNextSectionOccurrenceOnDisk } from "./history";
import { countOpenActionsInText, deferOpenActionsInText } from "./paste";
import { getSectionHeaderForLine, normalizeHeaderTitle, titleForMatching } from "./tokens";
import { underlineFor } from "./sectionFormat";

function matchKey(title: string): string {
  return titleForMatching(normalizeHeaderTitle(title.trim())).toLowerCase();
}

/** Where a copy-forward lands: a specific already-open tab (Section
 * History's "here" destination, 2026-09-24 — always the tab the drawer was
 * opened from, so it's never looked up by filename), or a dated file that
 * may or may not be open yet (#66's original "next occurrence", and
 * History's "Today"/"Next occurrence" destinations). */
export type CopyTarget = { kind: "tab"; tabId: string } | { kind: "date"; dateIso: string };

/** Whichever source is actually in use leads the "find the next occurrence"
 * search, and is the *only* one tried (see this module's own top-of-file
 * doc comment) — shared by `copySelectionToNextOccurrence` and Section
 * History's own destination computation (`history.ts`), so both agree on
 * what "next occurrence" means for the same section/anchor. Throws on a
 * calendar read failure so each caller can decide how to surface it. */
export async function findNextOccurrenceTarget(
  anchorFilename: string,
  targetHeader: string,
  sourceHeaderDisplay: string,
): Promise<{ date: string; headerText: string } | null> {
  if (calendarLeadsSearch()) {
    const anchorDate = anchorFilename.replace(/\.txt$/, "");
    const pairs = await api.readAgendaAfter(anchorDate);
    const match = pairs.find(([, title]) => matchKey(title) === targetHeader.toLowerCase());
    return match ? { date: match[0], headerText: match[1] } : null; // the calendar's own title, verbatim
  }
  await refreshAllNotesCache();
  const found = findNextSectionOccurrenceOnDisk(get(allNotesCache), targetHeader, anchorFilename);
  return found ? { date: found.date, headerText: sourceHeaderDisplay } : null;
}

/** Whether calendar sync should lead the search for the active tab —
 * the same three-part gate the "Sync calendar for this day" button
 * already grays itself out on (Settings toggle, desktop only, the file
 * actually exists), so "calendar is in use" means the same thing
 * everywhere in the app. */
function calendarLeadsSearch(): boolean {
  return (
    get(calendarSyncEnabled) &&
    (get(backendKind) !== "web" || (!!get(oneDriveAccount) && !!get(oneDriveFolder))) &&
    get(agendaFileExists)
  );
}

/** Inserts `newLines` into `content`'s `targetHeader` section: at the end
 * of its existing body if the section is already there, or as a brand
 * new section (header + underline) appended at the end of the file
 * otherwise — `newSectionHeaderText` is what that new header reads (see
 * this module's own doc comment for which text that is, depending on
 * where the target date came from). */
function insertIntoSection(content: string, targetHeader: string, newSectionHeaderText: string, newLines: string[]): string {
  const fileLines = content.split("\n");
  const body = extractSectionBody(fileLines, targetHeader);
  if (body) {
    const insertAt = body.startLineIdx + body.lines.length;
    const hasExistingContent = body.lines.some((l) => l.trim() !== "");
    const insertion = hasExistingContent ? ["", ...newLines] : newLines;
    const after = fileLines.slice(insertAt);
    // `body.lines` already had its own trailing blanks trimmed off by
    // `extractSectionBody`, so `after` starts with whatever's physically
    // between that trimmed content and either the next section's header
    // or the end of the file. If it's *entirely* blank, there's no next
    // section — it's just the artifact of the file's own trailing
    // newline, not meaningful content to preserve after what's being
    // inserted. If it has anything real in it (a following section's
    // header), it's left completely untouched, blank lead-in included —
    // that's the existing separator before that section, not ours to
    // touch.
    const afterIsPurelyTrailing = after.every((l) => l.trim() === "");
    return [...fileLines.slice(0, insertAt), ...insertion, ...(afterIsPurelyTrailing ? [] : after)].join("\n");
  }
  const block = [newSectionHeaderText, underlineFor(newSectionHeaderText), ...newLines];
  const trimmed = content.replace(/\s+$/, "");
  return (trimmed ? trimmed + "\n\n\n" + block.join("\n") : block.join("\n")) + "\n";
}

/** Applies the actual copy once a target is known — write into the
 * target's section (verbatim source lines, unless `insertLinesOverride`
 * gives something else — Section History's "action only" choice, §4 of
 * the design doc), and defer whatever was open in the *source* range
 * (§64/§82/#67's exact rule: the copy landing elsewhere stays open, the
 * original gets marked deferred). Never partially applies: the source
 * defer and the target write happen from the same known-good state, so a
 * failure to read the (not yet open) target file leaves the source
 * untouched too.
 *
 * `sourceFilename` is looked up among open tabs first — if it's the active
 * tab (or any open tab), the defer goes through the live editor exactly as
 * before; if it isn't open at all (2026-09-24: a Section History
 * take-over's source is often a note you're only browsing), it's read and
 * written straight from/to disk instead, without opening a tab for it. */
async function commitCopyForward(
  sourceFilename: string,
  fromLine: number,
  toLine: number,
  target: CopyTarget,
  targetHeader: string,
  newSectionHeaderText: string,
  insertLinesOverride?: string[],
): Promise<void> {
  const list0 = get(tabs);
  const srcTab = list0.find((t) => t.filename === sourceFilename);
  const srcContent = srcTab ? srcTab.content : await api.readNote(sourceFilename);
  if (srcContent === null || srcContent === undefined) return;

  const srcLines = srcContent.split("\n");
  const selectedLines = srcLines.slice(fromLine, toLine + 1);
  const selectedText = selectedLines.join("\n");
  const deferredLines = deferOpenActionsInText(selectedText).split("\n");
  const insertLines = insertLinesOverride ?? selectedLines;

  if (target.kind === "tab" && !list0.find((t) => t.id === target.tabId)) return;
  const targetFilename =
    target.kind === "tab" ? list0.find((t) => t.id === target.tabId)!.filename : `${target.dateIso}.txt`;

  let list = list0;

  // 2026-09-26: a real bug, found via Section History — the target can be
  // the very file the source range is being deferred in (e.g. browsing
  // today's own occurrence while "Today" is offered as a destination, or
  // opened from today with the "here" destination browsing that same
  // note). Handling it as two independent read-modify-writes below would
  // have each one start from the *same* pre-edit content and write back
  // over the same file — whichever finished last would win outright,
  // silently discarding the other's edit (the reported symptom was the
  // insertion vanishing, keeping only the source's own deferred-line
  // change). One combined edit on one piece of content instead: the
  // insertion always lands after the source range (it's appended at the
  // end of the section, and the source range is always lines *within*
  // that section), so the original `fromLine`/`toLine` are still valid
  // once applied to the already-inserted content.
  if (targetFilename === sourceFilename) {
    const withInsertion = insertIntoSection(srcContent, targetHeader, newSectionHeaderText, insertLines);
    const finalLines = withInsertion.split("\n");
    finalLines.splice(fromLine, toLine - fromLine + 1, ...deferredLines);
    const finalContent = finalLines.join("\n");
    if (srcTab) {
      list = writeTabContent(srcTab.id, finalContent, list);
      tabs.set(list);
      if (srcTab.id === get(activeTabId) && editorApi) {
        editorApi.jumpToLine(fromLine);
      }
    } else {
      await writeNoteAndInvalidateCache(sourceFilename, finalContent);
    }
  } else {
    if (target.kind === "tab") {
      const targetTab = list.find((t) => t.id === target.tabId)!;
      const updated = insertIntoSection(targetTab.content, targetHeader, newSectionHeaderText, insertLines);
      list = writeTabContent(targetTab.id, updated, list);
    } else {
      const targetTab = list.find((t) => t.filename === targetFilename);
      if (targetTab) {
        const updated = insertIntoSection(targetTab.content, targetHeader, newSectionHeaderText, insertLines);
        list = writeTabContent(targetTab.id, updated, list);
      } else {
        const existing = (await api.readNote(targetFilename)) ?? "";
        const updated = insertIntoSection(existing, targetHeader, newSectionHeaderText, insertLines);
        await writeNoteAndInvalidateCache(targetFilename, updated);
      }
    }

    const newSrcLines = [...srcLines];
    newSrcLines.splice(fromLine, toLine - fromLine + 1, ...deferredLines);
    if (srcTab) {
      list = writeTabContent(srcTab.id, newSrcLines.join("\n"), list);
      tabs.set(list);
      // #75: `writeTabContent` pushes the new text into the live editor via a
      // full-document replace (`EditorApi.setContent`) — CodeMirror's default
      // selection mapping for a change spanning the *entire* document
      // collapses the old cursor to the very start of the new content, so
      // without this the cursor (and the scroll position with it) jumped to
      // line 1 instead of staying on the line that just got marked deferred.
      // `deferOpenActionsInText` only ever swaps a symbol character, never
      // adds/removes lines, so `fromLine` is still exactly where the deferred
      // content landed. Only matters when the source is the active tab.
      if (srcTab.id === get(activeTabId) && editorApi) {
        editorApi.jumpToLine(fromLine);
      }
    } else {
      tabs.set(list);
      await writeNoteAndInvalidateCache(sourceFilename, newSrcLines.join("\n"));
    }
  }

  const n = countOpenActionsInText(selectedText);
  const dest = target.kind === "tab" ? "here" : `to ${target.dateIso}`;
  showToast(
    n > 0 ? `Copied ${dest} — ${n} open ${n === 1 ? "action" : "actions"} marked deferred here.` : `Copied ${dest}.`,
  );
}

/** `Ctrl/Cmd+Shift+.` — the entry point. Finds "the next occurrence" per
 * this module's own search order and either applies the copy right away
 * or (nothing found) stashes `copyForwardPending` and opens the date
 * picker, repurposed to resolve it — see `commitDatePick` in `tabs.ts`. */
export async function copySelectionToNextOccurrence(): Promise<void> {
  const tab = get(tabs).find((t) => t.id === get(activeTabId));
  if (!tab || tab.isScratchpad) {
    showToast("Not available in a scratchpad — there's no next occurrence to copy to.");
    return;
  }
  if (!editorApi) return;
  const sel = editorApi.getSelection();
  if (!sel.text.trim()) {
    showToast("Nothing to copy — nothing on this line, or in the selection.");
    return;
  }

  const lines = tab.content.split("\n");
  const rawHeader = getSectionHeaderForLine(lines, sel.fromLine);
  const sourceHeaderDisplay = normalizeHeaderTitle(rawHeader);
  const targetHeader = titleForMatching(sourceHeaderDisplay);
  if (!targetHeader) {
    showToast("The selection isn't inside a named section.");
    return;
  }

  let found: { date: string; headerText: string } | null;
  try {
    found = await findNextOccurrenceTarget(tab.filename, targetHeader, sourceHeaderDisplay);
  } catch (e) {
    showToast(e instanceof Error ? e.message : "Couldn't read the calendar.");
    return;
  }

  if (found) {
    await commitCopyForward(
      tab.filename,
      sel.fromLine,
      sel.toLine,
      { kind: "date", dateIso: found.date },
      targetHeader,
      found.headerText,
    );
    return;
  }

  const pending: CopyForwardPending = {
    sourceFilename: tab.filename,
    fromLine: sel.fromLine,
    toLine: sel.toLine,
    targetHeader,
    newSectionHeaderText: sourceHeaderDisplay,
  };
  copyForwardPending.set(pending);
  modal.set("date");
  showToast("No matching next occurrence found — pick a date.");
}

/** Called by `commitDatePick` (`tabs.ts`) when a `copyForwardPending` is
 * waiting — resolves it against the picked date instead of the picker's
 * normal "jump to this date" behavior. */
export async function resolveCopyForwardPending(dateIso: string): Promise<void> {
  const pending = get(copyForwardPending);
  if (!pending) return;
  copyForwardPending.set(null);
  await commitCopyForward(
    pending.sourceFilename,
    pending.fromLine,
    pending.toLine,
    { kind: "date", dateIso },
    pending.targetHeader,
    pending.newSectionHeaderText,
  );
}

/** Section History's "take it over" (2026-09-24 redesign,
 * docs/design/section-history-browse-and-carry-forward-roadmap.md) —
 * carries one or more lines from a browsed occurrence to a destination
 * computed once when the drawer opened (`historyDestinations`). Unlike
 * `copySelectionToNextOccurrence`, the source is a specific occurrence
 * already in hand (no header/anchor lookup needed) and the target is
 * already resolved (no search) — this only ever calls `commitCopyForward`
 * directly, never falls back to the date picker. */
export async function carryHistorySelectionForward(
  sourceFilename: string,
  fromLine: number,
  toLine: number,
  targetHeader: string,
  destination: { kind: "here"; tabId: string } | { kind: "today" | "next"; date: string; headerText: string },
  insertLinesOverride?: string[],
): Promise<void> {
  const target: CopyTarget =
    destination.kind === "here" ? { kind: "tab", tabId: destination.tabId } : { kind: "date", dateIso: destination.date };
  const newSectionHeaderText = destination.kind === "here" ? targetHeader : destination.headerText;
  await commitCopyForward(sourceFilename, fromLine, toLine, target, targetHeader, newSectionHeaderText, insertLinesOverride);
}

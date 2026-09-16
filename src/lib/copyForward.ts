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

/** Whether calendar sync should lead the search for the active tab —
 * the same three-part gate the "Sync calendar for this day" button
 * already grays itself out on (Settings toggle, desktop only, the file
 * actually exists), so "calendar is in use" means the same thing
 * everywhere in the app. */
function calendarLeadsSearch(): boolean {
  return get(calendarSyncEnabled) && get(backendKind) !== "web" && get(agendaFileExists);
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

/** Applies the actual copy once a target date is known — write the
 * (verbatim) selection into the target's section, and defer whatever
 * was open in the *source* selection (§64/§82/#67's exact rule: the
 * copy landing elsewhere stays open, the original gets marked deferred).
 * Never partially applies: the source defer and the target write happen
 * from the same known-good state, so a failure to read the (not yet
 * open) target file leaves the source untouched too. */
async function commitCopyForward(
  sourceTabId: string,
  fromLine: number,
  toLine: number,
  targetHeader: string,
  newSectionHeaderText: string,
  targetDateIso: string,
): Promise<void> {
  const list0 = get(tabs);
  const srcTab = list0.find((t) => t.id === sourceTabId);
  if (!srcTab) return;

  const srcLines = srcTab.content.split("\n");
  const selectedLines = srcLines.slice(fromLine, toLine + 1);
  const selectedText = selectedLines.join("\n");
  const deferredLines = deferOpenActionsInText(selectedText).split("\n");

  const targetFilename = `${targetDateIso}.txt`;
  let list = list0;
  const targetTab = list.find((t) => t.filename === targetFilename);
  if (targetTab) {
    const updated = insertIntoSection(targetTab.content, targetHeader, newSectionHeaderText, selectedLines);
    list = writeTabContent(targetTab.id, updated, list);
  } else {
    const existing = (await api.readNote(targetFilename)) ?? "";
    const updated = insertIntoSection(existing, targetHeader, newSectionHeaderText, selectedLines);
    await writeNoteAndInvalidateCache(targetFilename, updated);
  }

  const newSrcLines = [...srcLines];
  newSrcLines.splice(fromLine, toLine - fromLine + 1, ...deferredLines);
  list = writeTabContent(sourceTabId, newSrcLines.join("\n"), list);
  tabs.set(list);

  const n = countOpenActionsInText(selectedText);
  showToast(
    n > 0
      ? `Copied to ${targetDateIso} — ${n} open ${n === 1 ? "action" : "actions"} marked deferred here.`
      : `Copied to ${targetDateIso}.`,
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

  const anchorFilename = tab.filename;
  const anchorDate = anchorFilename.replace(/\.txt$/, "");

  let targetDate: string | null = null;
  let newSectionHeaderText = sourceHeaderDisplay;
  if (calendarLeadsSearch()) {
    let pairs: [string, string][];
    try {
      pairs = await api.readAgendaAfter(anchorDate);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't read the calendar.");
      return;
    }
    const match = pairs.find(([, title]) => matchKey(title) === targetHeader.toLowerCase());
    if (match) {
      targetDate = match[0];
      newSectionHeaderText = match[1]; // the calendar's own title, verbatim
    }
  } else {
    await refreshAllNotesCache();
    const found = findNextSectionOccurrenceOnDisk(get(allNotesCache), targetHeader, anchorFilename);
    targetDate = found?.date ?? null;
  }

  if (targetDate) {
    await commitCopyForward(tab.id, sel.fromLine, sel.toLine, targetHeader, newSectionHeaderText, targetDate);
    return;
  }

  const pending: CopyForwardPending = {
    sourceTabId: tab.id,
    fromLine: sel.fromLine,
    toLine: sel.toLine,
    targetHeader,
    newSectionHeaderText,
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
    pending.sourceTabId,
    pending.fromLine,
    pending.toLine,
    pending.targetHeader,
    pending.newSectionHeaderText,
    dateIso,
  );
}

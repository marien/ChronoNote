/** Section history (Ctrl+Shift+H): aggregate every action line under the
 * cursor's section across all dated notes, deduped, most-recent-first.
 * Split out of `controller.ts` in the v0.5.0 refactor. Depends on stores +
 * persistence + tabs (`jumpToFileLine`) + tokens. */
import { get } from "svelte/store";
import {
  activeTabId,
  allNotesCache,
  editorApi,
  historyItems,
  historyTargetHeader,
  modal,
  showToast,
  tabs,
} from "./stores";
import { refreshAllNotesCache } from "./persistence";
import { jumpToFileLine } from "./tabs";
import { getSectionHeaderForLine, isSetextUnderline, normalizeHeaderTitle, titleForMatching } from "./tokens";
import type { HistoryItem } from "./types";

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

  await refreshAllNotesCache();
  const allSources = get(allNotesCache);
  const sortedFiles = Object.keys(allSources).sort().reverse();
  const items: HistoryItem[] = [];
  const seen = new Set<string>();

  for (const filename of sortedFiles) {
    const flines = allSources[filename].split("\n");
    let inSection = false;
    flines.forEach((line, idx) => {
      if (idx + 1 < flines.length && isSetextUnderline(flines[idx + 1])) {
        const h = titleForMatching(normalizeHeaderTitle(flines[idx].trim()));
        inSection = h.toLowerCase() === targetHeader.toLowerCase();
        return;
      }
      if (!inSection) return;
      // §40/§50: `x` and indentation join the other three action symbols.
      // §41/§59: `=> ` isn't anchored to the start of the line either —
      // it can follow other text ("Talked to Sam => # follow up") — so
      // this checks for it anywhere, not just as the line's first two
      // characters, the same fix `cycleActionSymbol`/`stripLeadingToken`
      // needed for the same reason.
      const isActionOrFollow = /^\s*[#vx>]\s/.test(line) || line.includes("=> ");
      if (isActionOrFollow) {
        // Strip a plain leading symbol (still anchored — those are always
        // at the true start of the line) and, separately, a `=> ` and its
        // optional assignee/inner symbol wherever *that* falls, so two
        // occurrences of the same action reworded with different leading
        // context still dedupe as one.
        const normalizedBody = line
          .replace(/^\s*[#vx>]\s+/, "")
          .replace(/=>\s+(@\w+\s+|[#vx>]\s+)?/, "")
          .trim()
          .toLowerCase();
        if (!seen.has(normalizedBody)) {
          seen.add(normalizedBody);
          items.push({ filename, lineIdx: idx, line, date: filename.replace(/\.txt$/, "") });
        }
      }
    });
  }

  historyTargetHeader.set(targetHeader);
  historyItems.set(items);
  modal.set("history");
}

export async function jumpToHistoryItem(item: HistoryItem) {
  await jumpToFileLine({ filename: item.filename, lineIdx: item.lineIdx });
}

/** What a Section-History entry turns into when imported: a deferred
 * `> ` line comes across as a fresh open `# ` action (you're re-adopting
 * it), everything else is inserted verbatim. §109's preview and
 * `importHistoricalItem` both go through this so they can't disagree. */
export function historyInsertText(rawLine: string): string {
  return rawLine.startsWith("> ") ? "# " + rawLine.slice(2) : rawLine;
}

export function importHistoricalItem(rawLine: string) {
  const toInsert = historyInsertText(rawLine);
  editorApi?.insertAtCursor(toInsert + "\n");
  showToast(`Imported "${toInsert.slice(0, 30)}..." into note`);
}

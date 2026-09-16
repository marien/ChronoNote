/** Tab lifecycle: switching, cycling, opening dated/scratchpad tabs,
 * closing (with the §21 safety gate and a multi-level reopen history),
 * promoting a scratchpad, the date picker, and the shared
 * "jump to a line in a file" navigation. Split out of `controller.ts` in
 * the v0.5.0 refactor. Depends on stores + persistence + tabSort + paste
 * (the close hook); the drawer / search / history modules depend on this
 * one for `openOrCreateDatedFile` / `jumpToFileLine`, never the reverse. */
import { get } from "svelte/store";
import { tick } from "svelte";
import * as api from "./tauriApi";
import {
  activeTabId,
  clearEditorViewState,
  clearTabCleanHash,
  editorApi,
  markTabClean,
  modal,
  pendingCloseTabId,
  safetyMessage,
  showToast,
  tabs,
} from "./stores";
import {
  cancelScheduledSave,
  deleteNoteAndInvalidateCache,
  flushSave,
  noteClosingWithContent,
  writeNoteAndInvalidateCache,
} from "./persistence";
import { notifyTabClosed } from "./paste";
import { sha256Hex } from "./drift";
import { sortedTabsForDisplay } from "./tabSort";
import { countActions } from "./tokens";
import { todayISO } from "./date";
import type { NoteTab } from "./types";

/** #61: every tab id here used to be a bare `tab-${Date.now()}` — fine in
 * isolation, but `Date.now()`'s 1ms resolution (coarser still on some
 * Windows setups, which round it to their own timer-interrupt granularity)
 * means two tabs created close together — clicking "New Scratchpad" or the
 * reopen-closed-tab shortcut a few times in a row is enough — can get the
 * *identical* id. `{#each displayTabs as tab (tab.id)}` in `TopBar.svelte`
 * keys on exactly this id: two tabs sharing one collapse every rendered tab
 * after the first duplicate into a single DOM node, which then makes every
 * downstream width/overflow measurement `settleLayout` does wrong for that
 * tab count for as long as those tabs stay open — a plausible root cause of
 * #61's "top bar buttons behave inconsistently." `crypto.randomUUID()`
 * can't collide the way a timestamp can. (`boot.ts`'s own two id sites
 * already salt with the tab's filename, which is genuinely unique
 * per dated note, so they don't have this problem.) */
function generateTabId(): string {
  return `tab-${crypto.randomUUID()}`;
}

export function switchTab(id: string) {
  const prev = get(activeTabId);
  if (prev && prev !== id) flushSave(prev);
  activeTabId.set(id);
}

/** Ctrl/Cmd+Tab / Ctrl/Cmd+Shift+Tab: cycle to the next/previous open tab (in
 * visual/display order), wrapping around. Plain Tab stays reserved for
 * indentation inside the editor. */
export function cycleTab(direction: 1 | -1) {
  const list = sortedTabsForDisplay(get(tabs));
  if (list.length === 0) return;
  const idx = list.findIndex((t) => t.id === get(activeTabId));
  const nextIdx = ((idx === -1 ? 0 : idx) + direction + list.length) % list.length;
  switchTab(list[nextIdx].id);
}

export function createScratchpad() {
  const list = get(tabs);
  const n = list.filter((t) => t.isScratchpad).length + 1;
  const newTab: NoteTab = { id: generateTabId(), filename: `Scratchpad ${n}`, isScratchpad: true, content: "" };
  tabs.set([...list, newTab]);
  activeTabId.set(newTab.id);
}

export async function openOrCreateDatedFile(dateStr: string) {
  const filename = `${dateStr}.txt`;
  const list = get(tabs);
  const existing = list.find((t) => t.filename === filename);
  if (existing) {
    switchTab(existing.id);
    return;
  }
  const { content, metadata } = await api.readNoteWithMetadata(filename);
  const newTab: NoteTab = { id: generateTabId(), filename, isScratchpad: false, content: content ?? "" };
  tabs.set([...list, newTab]);
  markTabClean(newTab.id, metadata.contentHash); // §94 baseline
  activeTabId.set(newTab.id);
}

/** Blocks close with the safety modal for two independent reasons: unresolved
 * open actions (the original check), or a scratchpad with real content —
 * since scratchpads are never written to disk, closing one with content
 * still in it would destroy that content permanently with zero warning. */
export function requestTabClose(tabId: string) {
  const tab = get(tabs).find((t) => t.id === tabId);
  if (!tab) return;
  const counts = countActions(tab.content);
  const isNonEmptyScratchpad = tab.isScratchpad && tab.content.trim() !== "";

  if (counts.open === 0 && !isNonEmptyScratchpad) {
    closeTab(tabId);
    return;
  }

  const reasons: string[] = [];
  if (counts.open > 0) {
    reasons.push(`has ${counts.open} unresolved open action(s)`);
  }
  if (isNonEmptyScratchpad) {
    reasons.push(
      "is a scratchpad — closing it will permanently discard its content, since scratchpads are never saved to disk",
    );
  }
  pendingCloseTabId.set(tabId);
  safetyMessage.set(`Tab "${tab.filename}" ${reasons.join(" and ")}. Are you sure you want to close it?`);
  modal.set("safety");
}

interface ClosedTabSnapshot {
  filename: string;
  isScratchpad: boolean;
  content: string;
}

const closedTabHistory: ClosedTabSnapshot[] = [];
const MAX_CLOSED_HISTORY = 20;

export function closeTab(tabId: string) {
  const preCloseList = get(tabs);
  const preCloseIdx = preCloseList.findIndex((t) => t.id === tabId);
  const closingTab = preCloseIdx === -1 ? undefined : preCloseList[preCloseIdx];
  // #63: an empty dated note gets deleted rather than saved — there's
  // nothing in it worth persisting, and leaving an empty file behind
  // just because the day was opened (or typed into, then fully cleared
  // again) isn't useful. `cancelScheduledSave` drops any pending
  // debounced autosave first, so it can't resurrect the file moments
  // after this deletes it.
  if (closingTab && !closingTab.isScratchpad && closingTab.content.trim() === "") {
    cancelScheduledSave(tabId);
    deleteNoteAndInvalidateCache(closingTab.filename);
  } else {
    flushSave(tabId);
  }
  const list = get(tabs);
  const idx = list.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  // #46: this tab's disk-read-cache entry (if any) needs to end up
  // matching what `flushSave` just wrote, since the live-tab overlay that
  // was standing in for it disappears the moment it's actually closed —
  // see `noteClosingWithContent`'s own comment for the full story.
  if (!list[idx].isScratchpad) noteClosingWithContent(list[idx].filename, list[idx].content);

  clearEditorViewState(tabId);
  clearTabCleanHash(tabId); // §94: drop the drift baseline for a gone tab
  // §86 (#9): a paste-defer undo link that points at the tab being closed
  // (either end) can no longer be honoured.
  notifyTabClosed(tabId);
  closedTabHistory.push({
    filename: list[idx].filename,
    isScratchpad: list[idx].isScratchpad,
    content: list[idx].content,
  });
  if (closedTabHistory.length > MAX_CLOSED_HISTORY) closedTabHistory.shift();

  const wasActive = get(activeTabId) === tabId;
  const sortedIdx = sortedTabsForDisplay(list).findIndex((t) => t.id === tabId);

  const remaining = list.filter((t) => t.id !== tabId);
  if (remaining.length === 0) {
    tabs.set([]);
    createScratchpad();
    return;
  }
  tabs.set(remaining);
  if (wasActive) {
    const sortedAfter = sortedTabsForDisplay(remaining);
    const nextIdx = Math.max(0, Math.min(sortedIdx - 1, sortedAfter.length - 1));
    activeTabId.set(sortedAfter[nextIdx].id);
  }
}

/** Ctrl/Cmd+Shift+T / Ctrl/Cmd+Shift+N: reopen the most recently closed tab, with a
 * multi-level history so repeated presses walk further back. A real dated
 * note is reopened by rereading it from disk (via the existing open-or-
 * switch path) rather than trusting the cached snapshot, since that's
 * always correct even if the file changed while the tab was closed. A
 * scratchpad has no disk copy to fall back on, so its cached content is
 * restored verbatim into a fresh tab — this is the "I confirmed the
 * §21 warning but regret it" recovery path. */
export async function reopenLastClosedTab() {
  const snapshot = closedTabHistory.pop();
  if (!snapshot) {
    showToast("No recently closed tabs.");
    return;
  }
  if (snapshot.isScratchpad) {
    const list = get(tabs);
    const newTab: NoteTab = {
      id: generateTabId(),
      filename: snapshot.filename,
      isScratchpad: true,
      content: snapshot.content,
    };
    tabs.set([...list, newTab]);
    activeTabId.set(newTab.id);
  } else {
    await openOrCreateDatedFile(snapshot.filename.replace(/\.txt$/, ""));
  }
}

export function confirmSafetyClose() {
  const id = get(pendingCloseTabId);
  modal.set("none");
  pendingCloseTabId.set(null);
  if (id) closeTab(id);
}

export function cancelSafetyClose() {
  modal.set("none");
  pendingCloseTabId.set(null);
}

/** Spec 1.3: scratchpads stay purely in memory until explicitly promoted
 * into the storage folder, prepended into today's daily note. */
export async function promoteScratchpad(tabId: string) {
  const list = get(tabs);
  const idx = list.findIndex((t) => t.id === tabId);
  if (idx === -1 || !list[idx].isScratchpad) return;
  const scratchContent = list[idx].content.trim();
  if (!scratchContent) {
    showToast("Nothing to promote.");
    return;
  }
  const todayFilename = todayISO() + ".txt";
  const existingToday = (await api.readNote(todayFilename)) ?? "";
  const merged = existingToday ? `${existingToday}\n\n\n${scratchContent}\n` : `${scratchContent}\n`;
  await writeNoteAndInvalidateCache(todayFilename, merged);

  const remaining = list.filter((t) => t.id !== tabId);
  let todayTab = remaining.find((t) => t.filename === todayFilename);
  if (todayTab) {
    todayTab.content = merged;
  } else {
    todayTab = { id: generateTabId(), filename: todayFilename, isScratchpad: false, content: merged };
    remaining.push(todayTab);
  }
  tabs.set(remaining);
  markTabClean(todayTab.id, await sha256Hex(merged)); // §94 baseline for the promoted note
  activeTabId.set(todayTab.id);
  showToast(`Promoted scratchpad into ${todayFilename}`);
}

// --- Date picker ---

export function openDatePicker() {
  modal.set("date");
}

export async function commitDatePick(dateStr: string) {
  modal.set("none");
  await openOrCreateDatedFile(dateStr);
}

// --- Shared file navigation ---

/** Shared by the action drawer, search, and section history: jump to a
 * line in a file, opening it first (reading fresh from disk) if it isn't
 * already an open tab. */
export async function jumpToFileLine(item: { tabId?: string; filename: string; lineIdx: number }) {
  modal.set("none");
  if (item.tabId) {
    switchTab(item.tabId);
  } else {
    await openOrCreateDatedFile(item.filename.replace(/\.txt$/, ""));
  }
  await tick();
  editorApi?.jumpToLine(item.lineIdx);
  editorApi?.focus();
}

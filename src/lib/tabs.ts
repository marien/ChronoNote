/** Tab lifecycle: switching, cycling, opening dated/scratchpad tabs,
 * closing (with the §21 safety gate and a multi-level reopen history),
 * promoting a scratchpad, the date picker, and the shared
 * "jump to a line in a file" navigation. Split out of `controller.ts` in
 * the v0.5.0 refactor. Depends on stores + persistence + tabSort + paste
 * (the close hook); the drawer / search / history modules depend on this
 * one for `openOrCreateDatedFile` / `jumpToFileLine`, never the reverse. */
import { loadBaseline } from "./hash";
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
  pendingBatchCloseTabIds,
  pendingCloseTabId,
  safetyMessage,
  showToast,
  tabs,
} from "./stores";
import {
  cancelScheduledSave,
  deleteNoteAndInvalidateCache,
  flushSave,
  flushScratchpadDrafts,
  noteClosingWithContent,
  writeNoteAndInvalidateCache,
} from "./persistence";
import { notifyTabClosed } from "./paste";
import { sha256Hex } from "./drift";
import { sortedTabsForDisplay } from "./tabSort";
import { countActions } from "./tokens";
import { todayISO } from "./date";
import { t } from "./i18n";
import { isPristineOnboardingNote } from "./onboardingTemplate";
import { maybeSilentSyncEmptyNote } from "./calendarSyncActions";
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
  const target = get(tabs).find((t) => t.id === id);
  if (target) void maybeSilentSyncEmptyNote(target);
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

/** A scratchpad with content that would be lost on close/switch. The untouched
 * web-app welcome note doesn't count: nothing the user wrote is in it. */
export function isUnsavedScratchpad(tab: NoteTab): boolean {
  return tab.isScratchpad && tab.content.trim() !== "" && !isPristineOnboardingNote(tab.content);
}

export function createScratchpad() {
  createScratchpadWith("");
}

/** A new scratchpad tab, made active, starting with `content`. */
export function createScratchpadWith(content: string): NoteTab {
  const list = get(tabs);
  const n = list.filter((t) => t.isScratchpad).length + 1;
  const newTab: NoteTab = { id: generateTabId(), filename: `Scratchpad ${n}`, isScratchpad: true, content };
  tabs.set([...list, newTab]);
  activeTabId.set(newTab.id);
  return newTab;
}

export async function openOrCreateDatedFile(dateStr: string) {
  const filename = `${dateStr}.txt`;
  const list = get(tabs);
  const existing = list.find((t) => t.filename === filename);
  if (existing) {
    switchTab(existing.id);
    void maybeSilentSyncEmptyNote(existing);
    return;
  }
  const { content, metadata } = await api.readNoteWithMetadata(filename);
  const newTab: NoteTab = { id: generateTabId(), filename, isScratchpad: false, content: content ?? "" };
  tabs.set([...list, newTab]);
  markTabClean(newTab.id, loadBaseline(metadata)); // §94 baseline
  activeTabId.set(newTab.id);
  void maybeSilentSyncEmptyNote(newTab);
}

/** #76: open actions only warrant the close warning once they've come due —
 * a note dated today or earlier. A future-dated note's actions are still
 * ahead of you (you're planning, not forgetting), so it closes silently.
 * Scratchpads have no date and keep the warning. */
function hasDueOpenActions(tab: NoteTab, open: number): boolean {
  if (open === 0) return false;
  if (tab.isScratchpad) return true;
  return tab.filename.slice(0, 10) <= todayISO();
}

/** Blocks close with the safety modal for two independent reasons: unresolved
 * open actions on a note that's due (today or past — see #76), or a
 * scratchpad with real content — since scratchpads are never written to disk,
 * closing one with content still in it would destroy that content
 * permanently with zero warning. */
export function requestTabClose(tabId: string) {
  const tab = get(tabs).find((t) => t.id === tabId);
  if (!tab) return;
  if (tab.isScratchpad && isPristineOnboardingNote(tab.content)) {
    closeTab(tabId);
    return;
  }
  const counts = countActions(tab.content);
  const dueOpen = hasDueOpenActions(tab, counts.open);
  const isNonEmptyScratchpad = isUnsavedScratchpad(tab);

  if (!dueOpen && !isNonEmptyScratchpad) {
    closeTab(tabId);
    return;
  }

  const translate = get(t);
  const reasons: string[] = [];
  if (dueOpen) {
    reasons.push(translate("safetyModal.reason.dueOpen", { count: counts.open }));
  }
  if (isNonEmptyScratchpad) {
    reasons.push(translate("safetyModal.reason.scratchpad", undefined));
  }
  pendingCloseTabId.set(tabId);
  safetyMessage.set(
    translate("safetyModal.message", {
      filename: tab.filename,
      reasons: reasons.join(translate("safetyModal.reasonJoiner", undefined)),
    }),
  );
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
    flushScratchpadDrafts();
    return;
  }
  tabs.set(remaining);
  flushScratchpadDrafts();
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
    showToast(get(t)("toast.tabs.noRecentlyClosedTabs", undefined));
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

export function closeOtherTabs(keepTabId: string) {
  const list = get(tabs);
  const target = list.find((t) => t.id === keepTabId);
  if (!target) return;
  const toClose = list.filter((t) => t.id !== keepTabId);
  if (toClose.length === 0) return;
  batchCloseTabs(toClose, keepTabId);
}

export function closeTabsToTheRight(tabId: string) {
  const list = sortedTabsForDisplay(get(tabs));
  const idx = list.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  const toClose = list.slice(idx + 1);
  if (toClose.length === 0) return;
  batchCloseTabs(toClose, tabId);
}

export function closeTabsWithNoOpenActions() {
  const list = get(tabs);
  const toClose = list.filter((t) => countActions(t.content).open === 0);
  if (toClose.length === 0) return;
  const currentActive = get(activeTabId);
  const firstKept = list.find((t) => countActions(t.content).open > 0)?.id ?? "";
  const focusTabId = toClose.some((t) => t.id === currentActive) ? firstKept : (currentActive ?? firstKept);
  batchCloseTabs(toClose, focusTabId);
}

function batchCloseTabs(toClose: NoteTab[], focusTabId: string) {
  const warningTabs = toClose.filter((t) => {
    if (t.isScratchpad && isPristineOnboardingNote(t.content)) return false;
    const counts = countActions(t.content);
    return hasDueOpenActions(t, counts.open) || isUnsavedScratchpad(t);
  });

  if (warningTabs.length > 0) {
    pendingCloseTabId.set(null);
    pendingBatchCloseTabIds.set(toClose.map((t) => t.id));
    const translate = get(t);
    safetyMessage.set(
      translate("safetyModal.batchCloseMessage", {
        count: toClose.length,
      })
    );
    modal.set("safety");
    return;
  }

  for (const t of toClose) {
    closeTab(t.id);
  }
  const currentActive = get(activeTabId);
  const remaining = get(tabs);
  if (!remaining.some((t) => t.id === currentActive)) {
    if (focusTabId && remaining.some((t) => t.id === focusTabId)) {
      switchTab(focusTabId);
    }
  }
}

export function renameScratchpad(tabId: string, newName: string) {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const list = get(tabs);
  const target = list.find((t) => t.id === tabId);
  if (!target || !target.isScratchpad) return;
  target.filename = trimmed;
  tabs.set([...list]);
  flushScratchpadDrafts();
  showToast(get(t)("toast.tabs.scratchpadRenamed", { name: trimmed }));
}

export function duplicateTab(tabId: string) {
  const tab = get(tabs).find((t) => t.id === tabId);
  if (!tab) return;
  createScratchpadWith(tab.content);
  showToast(get(t)("toast.tabs.duplicatedAsScratchpad", undefined));
}

export function confirmSafetyClose() {
  const singleId = get(pendingCloseTabId);
  const batchIds = get(pendingBatchCloseTabIds);
  modal.set("none");
  pendingCloseTabId.set(null);
  pendingBatchCloseTabIds.set([]);
  if (singleId) {
    closeTab(singleId);
  } else if (batchIds.length > 0) {
    for (const id of batchIds) {
      closeTab(id);
    }
  }
}

export function cancelSafetyClose() {
  modal.set("none");
  pendingCloseTabId.set(null);
  pendingBatchCloseTabIds.set([]);
}

/** Spec 1.3: scratchpads stay purely in memory until explicitly promoted
 * into the storage folder, prepended into today's daily note. */
export async function promoteScratchpad(tabId: string) {
  const list = get(tabs);
  const idx = list.findIndex((t) => t.id === tabId);
  if (idx === -1 || !list[idx].isScratchpad) return;
  const scratchContent = list[idx].content.trim();
  if (!scratchContent) {
    showToast(get(t)("toast.tabs.nothingToPromote", undefined));
    return;
  }
  const todayFilename = todayISO() + ".txt";
  const existingTab = list.find((t) => !t.isScratchpad && t.filename === todayFilename);
  if (existingTab) {
    cancelScheduledSave(existingTab.id);
  }
  const existingToday = (existingTab ? existingTab.content : ((await api.readNote(todayFilename)) ?? "")).trimEnd();
  const merged = existingToday ? `${existingToday}\n\n\n${scratchContent}\n` : `${scratchContent}\n`;
  await writeNoteAndInvalidateCache(todayFilename, merged);

  const remaining = list.filter((t) => t.id !== tabId);
  let todayTab = remaining.find((t) => !t.isScratchpad && t.filename === todayFilename);
  if (todayTab) {
    todayTab.content = merged;
  } else {
    todayTab = { id: generateTabId(), filename: todayFilename, isScratchpad: false, content: merged };
    remaining.push(todayTab);
  }
  tabs.set(remaining);
  markTabClean(todayTab.id, await sha256Hex(merged)); // §94 baseline for the promoted note
  if (todayTab.id === get(activeTabId) && editorApi) {
    editorApi.setContent(merged);
  }
  activeTabId.set(todayTab.id);
  showToast(get(t)("toast.tabs.promotedScratchpad", { filename: todayFilename }));
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
  editorApi?.pulseLine?.(item.lineIdx);
  editorApi?.focus();
}

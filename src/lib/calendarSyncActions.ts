/** Calendar sync — reads `.agenda.json` from the notes folder (kept up to
 * date by an external process — replaces the earlier
 * Microsoft-365-via-OAuth design, see
 * `docs/design/m365-calendar-import-roadmap.md`'s status note) and
 * reconciles it against the active tab's note, the today-or-later gate,
 * and applying a reviewed sync (and, for a "move to another day" choice,
 * to whichever other day's note the user picked). The reconciliation
 * itself is pure and lives in `./calendarReconcile`; this is the
 * controller side. The manual "Sync from a list…" paste entry point this
 * once had a peer in was dropped once the file-based sync worked — see
 * `docs/CHANGELOG.md`. */
import { tick } from "svelte";
import { get } from "svelte/store";
import {
  activeTabId,
  agendaFileExists,
  calendarSyncEnabled,
  calendarSyncHasDiff,
  calendarSyncReview,
  editorApi,
  markTabClean,
  modal,
  showToast,
  tabs,
  type CalendarSyncRemoval,
  type CalendarSyncRemovalChoice,
} from "./stores";
import { writeTabContent, updateNoteOnDisk } from "./persistence";
import * as api from "./tauriApi";
import { todayISO } from "./date";
import { appendRemovedSectionTo, computeCalendarSync, flagRemovedSection } from "./calendarReconcile";
import { t } from "./i18n";
import { describeApiError } from "./apiError";
import { sha256Hex } from "./drift";
import type { NoteTab } from "./types";

/** "Today or a future date only" — a scratchpad has no date at all, and a
 * past-dated note has nothing left to reconcile against. */
export function canSyncCalendarForActiveTab(): boolean {
  const tab = get(tabs).find((t) => t.id === get(activeTabId));
  return !!tab && !tab.isScratchpad && tab.filename.slice(0, 10) >= todayISO();
}

/**
 * Evaluates whether the external agenda (.agenda.json) differs from the
 * active tab's note content (new, removed, or reordered meetings).
 * Ad-hoc calls (starting with ' or ’) are ignored and will never cause a diff.
 */
export async function checkCalendarSyncDiff(): Promise<void> {
  if (!get(calendarSyncEnabled) || !canSyncCalendarForActiveTab() || !get(agendaFileExists)) {
    calendarSyncHasDiff.set(false);
    return;
  }
  const tab = get(tabs).find((t) => t.id === get(activeTabId));
  if (!tab || tab.isScratchpad) {
    calendarSyncHasDiff.set(false);
    return;
  }
  const date = tab.filename.slice(0, 10);
  try {
    const agendaTitles = (await api.readAgendaForDate(date)).map((t) => t.trim()).filter((t) => t.length > 0);
    const removedTitles = (await api.readAgendaRemovedForDate(date)).map((t) => t.trim()).filter((t) => t.length > 0);

    const result = computeCalendarSync(tab.content, agendaTitles, removedTitles);
    const hasDiff =
      result.newTitles.length > 0 ||
      result.removedEmpty.length > 0 ||
      result.removedWithContent.length > 0 ||
      result.reorderedTitles.length > 0;

    calendarSyncHasDiff.set(hasDiff);
  } catch {
    calendarSyncHasDiff.set(false);
  }
}

let diffCheckTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleCalendarSyncDiffCheck() {
  if (diffCheckTimer) clearTimeout(diffCheckTimer);
  diffCheckTimer = setTimeout(() => {
    void checkCalendarSyncDiff();
  }, 400);
}

let lastCheckedContent: string | null = null;
let lastCheckedTabId: string | null = null;

export function initCalendarSyncDiffTracking() {
  activeTabId.subscribe((id) => {
    if (id !== lastCheckedTabId) {
      lastCheckedTabId = id;
      lastCheckedContent = null;
      void checkCalendarSyncDiff();
    }
  });

  tabs.subscribe((list) => {
    const id = get(activeTabId);
    const active = list.find((t) => t.id === id);
    if (!active || active.isScratchpad) return;
    if (active.content !== lastCheckedContent) {
      lastCheckedContent = active.content;
      scheduleCalendarSyncDiffCheck();
    }
  });
}

const silentSyncInProgress = new Map<string, Promise<boolean>>();

/** Awaits any in-flight silent calendar sync for `tabId`, resolving once completed or immediately if none is running. */
export function whenSilentSyncSettled(tabId: string): Promise<boolean> {
  return silentSyncInProgress.get(tabId) ?? Promise.resolve(false);
}

/**
 * Automatically places the editor caret on line index 2 (line 3, the blank line
 * inside the first meeting section below the Setext underline) and focuses the editor.
 */
export async function focusFirstMeetingSection(targetLineIdx = 2): Promise<void> {
  await tick();
  let attempts = 0;
  const tryFocus = () => {
    if (editorApi) {
      editorApi.jumpToLine(targetLineIdx);
      editorApi.focus();
    } else if (attempts < 10) {
      attempts++;
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(tryFocus);
      } else {
        setTimeout(tryFocus, 25);
      }
    }
  };
  tryFocus();
}

/**
 * Area 3: When an empty note is opened (or switched to) and agenda sync is enabled,
 * silently sync during opening and put the caret in the first section.
 *
 * Trigger invariants:
 * 1. Active or target tab is a dated note (not a scratchpad).
 * 2. Note date is today or future: tabDate >= todayISO().
 * 3. calendarSyncEnabled === true and agendaFileExists === true.
 * 4. Note content is empty: tab.content.trim() === "".
 * 5. External agenda contains >= 1 meetings for that date.
 */
export function maybeSilentSyncEmptyNote(tab: NoteTab): Promise<boolean> {
  if (!get(calendarSyncEnabled)) return Promise.resolve(false);
  if (!tab || tab.isScratchpad) return Promise.resolve(false);
  const dateStr = tab.filename.slice(0, 10);
  if (dateStr < todayISO()) return Promise.resolve(false);
  if (tab.content.trim() !== "") return Promise.resolve(false);
  const existing = silentSyncInProgress.get(tab.id);
  if (existing) return existing;

  const promise = (async () => {
    let exists = get(agendaFileExists);
    if (!exists) {
      try {
        exists = await api.agendaFileExists();
        if (exists) agendaFileExists.set(true);
      } catch {
        exists = false;
      }
    }
    if (!exists) return false;

    try {
      const agendaTitles = (await api.readAgendaForDate(dateStr)).map((t) => t.trim()).filter((t) => t.length > 0);
      if (agendaTitles.length === 0) return false;

      // Double check current tab content in store hasn't been edited while awaiting agenda
      const currentList = get(tabs);
      const currentTab = currentList.find((t) => t.id === tab.id);
      if (!currentTab || currentTab.content.trim() !== "") return false;

      const result = computeCalendarSync("", agendaTitles);
      if (!result.content || result.content.trim() === "") return false;

      tabs.set(writeTabContent(currentTab.id, result.content, currentList));

      const hash = await sha256Hex(result.content);
      markTabClean(currentTab.id, hash);

      if (get(activeTabId) === currentTab.id) {
        void focusFirstMeetingSection(2);
      }
      return true;
    } catch {
      return false;
    }
  })();

  silentSyncInProgress.set(tab.id, promise);
  return promise.finally(() => {
    silentSyncInProgress.delete(tab.id);
  });
}

/** Refreshes `agendaFileExists` (`stores.ts`) — called at boot, on window
 * focus, and after switching notes folders (`boot.ts`/`directory.ts`)
 * rather than polled, since the file is only expected to change while
 * ChronoNote itself is unfocused (an external process wrote it). */
export async function refreshAgendaFileExists(): Promise<void> {
  try {
    agendaFileExists.set(await api.agendaFileExists());
  } catch {
    agendaFileExists.set(false);
  }
  void checkCalendarSyncDiff();
}

/** Runs the reconciliation engine against `tab` and opens the review step
 * — never writes anything until the review is confirmed.
 *
 * Trims/filters `agendaTitles` here, once: `confirmCalendarSync` later
 * excludes an unchecked new item by exact string match between
 * `review.newItems[i].title` (which `computeCalendarSync` already trims
 * internally) and `review.agendaTitles` — if the *stored* `agendaTitles`
 * were left raw/untrimmed, a title with stray leading/trailing whitespace
 * (plausible from a real calendar export — confirmed as the actual cause
 * of a real report: unchecking a meeting did nothing) would never match,
 * so the uncheck would silently have no effect. Cleaning here once makes
 * this safe by construction regardless of what `.agenda.json` contains. */
function openCalendarSyncReview(tab: NoteTab, agendaTitles: string[], removedTitles: string[] = []) {
  const cleaned = agendaTitles.map((t) => t.trim()).filter((t) => t.length > 0);
  const removed = removedTitles.map((t) => t.trim()).filter((t) => t.length > 0);
  const result = computeCalendarSync(tab.content, cleaned, removed);
  calendarSyncReview.set({
    tabId: tab.id,
    originalContent: tab.content,
    agendaTitles: cleaned,
    removedTitles: removed,
    newItems: result.newTitles.map((title) => ({ title, checked: true })),
    reorderedTitles: result.reorderedTitles,
    removedEmpty: result.removedEmpty,
    removals: result.removedWithContent.map((r) => ({ ...r, choice: "flag" as CalendarSyncRemovalChoice, moveDate: todayISO() })),
  });
  modal.set("syncReview");
}

/** `read_agenda_for_date` reads `.agenda.json` from the notes folder and
 * already returns titles scoped to `date`, sorted, and de-duplicated
 * (Rust, `agenda.rs`) — used as-is. No-ops (rather than erroring) if the
 * feature is turned off in Settings, so a stale keyboard shortcut binding
 * or a leftover command-palette entry can never fire it unexpectedly. */
export async function syncCalendarFromFile(): Promise<void> {
  if (!get(calendarSyncEnabled) || !canSyncCalendarForActiveTab()) return;
  const tab = get(tabs).find((t) => t.id === get(activeTabId));
  if (!tab) return;
  const date = tab.filename.slice(0, 10);
  let agendaTitles: string[];
  let removedTitles: string[];
  try {
    agendaTitles = await api.readAgendaForDate(date);
    removedTitles = await api.readAgendaRemovedForDate(date);
  } catch (e) {
    showToast(describeApiError(e));
    return;
  }
  if (agendaTitles.length === 0 && removedTitles.length === 0) {
    showToast(get(t)("toast.calendarSync.noMeetingsOn", { date }));
    return;
  }
  openCalendarSyncReview(tab, agendaTitles, removedTitles);
}

export function toggleSyncNewItem(index: number) {
  calendarSyncReview.update((s) => {
    if (!s) return s;
    const newItems = s.newItems.map((it, i) => (i === index ? { ...it, checked: !it.checked } : it));
    return { ...s, newItems };
  });
}

export function setSyncRemovalChoice(index: number, choice: CalendarSyncRemovalChoice) {
  calendarSyncReview.update((s) => {
    if (!s) return s;
    const removals = s.removals.map((r, i) => (i === index ? { ...r, choice } : r));
    return { ...s, removals };
  });
}

export function setSyncRemovalMoveDate(index: number, moveDate: string) {
  calendarSyncReview.update((s) => {
    if (!s) return s;
    const removals = s.removals.map((r, i) => (i === index ? { ...r, moveDate } : r));
    return { ...s, removals };
  });
}

export function cancelCalendarSync() {
  calendarSyncReview.set(null);
  modal.set("none");
}

/** Applies the review: re-derives the sync with any unchecked "new" agenda
 * items dropped (removing an item that never matched anything can't change
 * which existing sections were found "no longer there" — see
 * `calendarReconcile.test.ts` for why that's safe), then resolves each
 * pending removal per its chosen action. */
export async function confirmCalendarSync(): Promise<void> {
  const review = get(calendarSyncReview);
  if (!review) return;

  const uncheckedCounts = new Map<string, number>();
  for (const item of review.newItems) {
    if (!item.checked) uncheckedCounts.set(item.title, (uncheckedCounts.get(item.title) ?? 0) + 1);
  }
  const finalAgenda = review.agendaTitles.filter((title) => {
    const n = uncheckedCounts.get(title);
    if (n && n > 0) {
      uncheckedCounts.set(title, n - 1);
      return false;
    }
    return true;
  });

  const result = computeCalendarSync(review.originalContent, finalAgenda, review.removedTitles);
  let content = result.content;
  const moves: { targetDate: string; removal: CalendarSyncRemoval }[] = [];
  for (const removal of review.removals) {
    if (removal.choice === "discard") continue;
    if (removal.choice === "flag") content = flagRemovedSection(content, removal);
    else moves.push({ targetDate: removal.moveDate, removal });
  }

  let list = writeTabContent(review.tabId, content, get(tabs));
  tabs.set(list);

  for (const { targetDate, removal } of moves) {
    const targetFilename = `${targetDate}.txt`;
    const targetTab = list.find((t) => t.filename === targetFilename);
    if (targetTab) {
      list = writeTabContent(targetTab.id, appendRemovedSectionTo(targetTab.content, removal), list);
      tabs.set(list);
    } else {
      await updateNoteOnDisk(targetFilename, (existing) => appendRemovedSectionTo(existing, removal));
    }
  }

  calendarSyncReview.set(null);
  calendarSyncHasDiff.set(false);
  modal.set("none");
  showToast(get(t)("toast.calendarSync.synced", undefined));
}

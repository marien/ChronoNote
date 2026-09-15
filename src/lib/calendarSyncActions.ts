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
import { get } from "svelte/store";
import {
  activeTabId,
  agendaFileExists,
  calendarSyncEnabled,
  calendarSyncReview,
  modal,
  showToast,
  tabs,
  type CalendarSyncRemoval,
  type CalendarSyncRemovalChoice,
} from "./stores";
import { writeTabContent, writeNoteAndInvalidateCache } from "./persistence";
import * as api from "./tauriApi";
import { todayISO } from "./date";
import { appendRemovedSectionTo, computeCalendarSync, flagRemovedSection } from "./calendarReconcile";
import type { NoteTab } from "./types";

/** "Today or a future date only" — a scratchpad has no date at all, and a
 * past-dated note has nothing left to reconcile against. */
export function canSyncCalendarForActiveTab(): boolean {
  const tab = get(tabs).find((t) => t.id === get(activeTabId));
  return !!tab && !tab.isScratchpad && tab.filename.slice(0, 10) >= todayISO();
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
function openCalendarSyncReview(tab: NoteTab, agendaTitles: string[]) {
  const cleaned = agendaTitles.map((t) => t.trim()).filter((t) => t.length > 0);
  const result = computeCalendarSync(tab.content, cleaned);
  calendarSyncReview.set({
    tabId: tab.id,
    originalContent: tab.content,
    agendaTitles: cleaned,
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
  let agendaTitles;
  try {
    agendaTitles = await api.readAgendaForDate(date);
  } catch (e) {
    showToast(e instanceof Error ? e.message : "Couldn't read the calendar.");
    return;
  }
  if (agendaTitles.length === 0) {
    showToast(`No meetings on ${date}.`);
    return;
  }
  openCalendarSyncReview(tab, agendaTitles);
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

  const result = computeCalendarSync(review.originalContent, finalAgenda);
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
      const existing = (await api.readNote(targetFilename)) ?? "";
      await writeNoteAndInvalidateCache(targetFilename, appendRemovedSectionTo(existing, removal));
    }
  }

  calendarSyncReview.set(null);
  modal.set("none");
  showToast("Calendar synced.");
}

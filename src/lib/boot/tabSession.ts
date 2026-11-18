import { loadBaseline } from "../hash";
import { get } from "svelte/store";
import * as api from "../tauriApi";
import { todayISO } from "../date";
import {
  activeTabId,
  agendaFileExists,
  autoAddedMeetings,
  calendarSyncEnabled,
  markTabClean,
  showToast,
  startupTabMode,
  tabs,
} from "../stores";
import { maybeSilentSyncEmptyNote } from "../calendarSyncActions";
import { t } from "../i18n";
import { normalizeAutoAddedMeetings } from "../sessionMeetings";
import type { NoteTab } from "../types";

/** Set while a session restore (or a directory switch's fresh restore) is
 * rebuilding the `tabs`/`activeTabId` stores step by step, so the
 * persistence subscribers below don't write a half-built intermediate
 * state to disk (§34). */
let restoringTabs = false;

/** A read that fails is retried a couple of times: OneDrive or a virus scanner can hold a file for a moment. */
async function readWithRetry<T>(read: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await read();
    } catch (e) {
      if (i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 300 * i));
    }
  }
}

/** Spec §34: restores the tabs and active tab this specific notes folder
 * had open last time (skipping any that no longer exist on disk), and
 * always force-opens today's dated tab as well — confirmed design
 * decisions: today's tab is always present, and it's also the fallback
 * active tab whenever the previously-active one can't be restored (its
 * file was deleted, or it was a scratchpad, which never persists). A
 * folder with no saved session yet (first time it's opened) just gets
 * today's tab, same as before this feature existed. */
export async function restoreOrBootstrapTabs() {
  restoringTabs = true;
  // A save from just before this call (e.g. performDirectorySwitch clearing
  // `tabs`/`activeTabId` ahead of the restore) may already be pending —
  // cancel it so it can't fire mid-restore and persist a half-built state.
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  try {
    const todayFilename = todayISO() + ".txt";
    const session = await api.readTabSession();
    autoAddedMeetings.set(normalizeAutoAddedMeetings(session?.autoAddedMeetings));
    const otherFilenames = (session?.openTabs ?? []).filter((f) => f !== todayFilename);

    // Fire every read concurrently (one IPC round-trip in flight per file,
    // all in parallel) rather than one-at-a-time — with several tabs open,
    // a sequential await-per-file loop was adding a full extra round-trip
    // of latency per tab before the editor became typable. §94:
    // `read_note_with_metadata` so each tab starts with a clean-hash
    // baseline for external-modification detection.
    const [otherResults, todayRead] = await Promise.all([
      Promise.allSettled(otherFilenames.map((f) => readWithRetry(() => api.readNoteWithMetadata(f)))),
      // Today's tab must open with the real content, so a failure there still stops startup.
      readWithRetry(() => api.readNoteWithMetadata(todayFilename)),
    ]);

    const restored: NoteTab[] = [];
    const cleanHashes: Array<[string, string | null]> = [];
    const unreadable: string[] = [];
    otherFilenames.forEach((filename, i) => {
      const result = otherResults[i];
      if (result.status === "rejected") {
        unreadable.push(filename);
        return;
      }
      const { content, metadata } = result.value;
      if (content === null) return; // file no longer exists — silently skip
      const id = `tab-${Date.now()}-${filename}`;
      restored.push({ id, filename, isScratchpad: false, content });
      cleanHashes.push([id, loadBaseline(metadata)]);
    });

    const todayId = `tab-${Date.now()}-${todayFilename}`;
    const todayTab: NoteTab = {
      id: todayId,
      filename: todayFilename,
      isScratchpad: false,
      content: todayRead.content ?? "",
    };
    restored.push(todayTab);
    cleanHashes.push([todayId, loadBaseline(todayRead.metadata)]);

    // Restore preserved scratchpad drafts (e.g. mobile process termination survival)
    try {
      const drafts = await api.loadScratchpadDrafts();
      if (drafts && typeof drafts === "object") {
        for (const [name, draftContent] of Object.entries(drafts)) {
          if (typeof draftContent === "string" && draftContent.trim().length > 0) {
            const scratchId = `tab-${Date.now()}-${name}`;
            restored.push({
              id: scratchId,
              filename: name,
              isScratchpad: true,
              content: draftContent,
            });
          }
        }
      }
    } catch {
      // Backend may not support scratchpad draft persistence (e.g. demo mock)
    }

    tabs.set(restored);
    for (const [id, hash] of cleanHashes) markTabClean(id, hash);
    if (unreadable.length > 0) {
      showToast(get(t)("toast.boot.couldntOpenNotes", { filenames: unreadable.join(", ") }));
    }
    // #23: on the first launch of a new day (and the very first launch
    // after install, where `session` is null), open with today's note
    // active regardless of which tab was last active — the point of a
    // daily-notes app is to land you on today when the day turns over.
    // Later launches the same day restore the last-active tab as before.
    const isFirstOpenToday = (session?.lastOpenedDate ?? null) !== todayISO();
    let finalActive: NoteTab = todayTab;
    let dropTodayTab = false;

    if (!isFirstOpenToday && session?.activeTab) {
      finalActive = restored.find((t) => t.filename === session.activeTab) ?? todayTab;
      // §430: with "Last note", a later start the same day (an update's restart, reopening the app, a web-app reload)
      // restores exactly the saved tabs: today's tab only comes back if it was open.
      if (get(startupTabMode) === "smart_last_active" && finalActive !== todayTab) {
        dropTodayTab = !(session.openTabs ?? []).includes(todayFilename);
      }
    } else if (isFirstOpenToday && session?.activeTab && get(startupTabMode) === "smart_last_active") {
      // Smart decision logic (§spec 5.3):
      // 1. Check Today's Note: If today's note has non-whitespace content, open Today.
      // 2. Check Today's Agenda: If Calendar Sync is enabled and today has agenda meetings, open Today.
      // 3. Otherwise (Today is clean & clear): restore session.activeTab.
      const todayHasContent = (todayRead.content ?? "").trim().length > 0;
      let todayHasMeetings = false;
      if (get(calendarSyncEnabled) && get(agendaFileExists)) {
        try {
          const meetings = await api.readAgendaForDate(todayISO());
          todayHasMeetings = meetings.filter((m) => m.trim().length > 0).length > 0;
        } catch {
          todayHasMeetings = false;
        }
      }

      if (!todayHasContent && !todayHasMeetings) {
        const lastActiveMatch = restored.find((t) => t.filename === session.activeTab);
        if (lastActiveMatch) {
          finalActive = lastActiveMatch;
          // #125: today's tab is only opened here when it gets the focus (or was already open last time). Today is
          // empty, so there is nothing to lose by not opening it; it is created when it is opened on purpose.
          dropTodayTab = !(session.openTabs ?? []).includes(todayFilename);
        }
      }
    }

    activeTabId.set(finalActive.id);
    if (dropTodayTab) tabs.update((list) => list.filter((x) => x.id !== todayTab.id));
    void maybeSilentSyncEmptyNote(finalActive);
  } finally {
    restoringTabs = false;
  }
  scheduleTabSessionSave();
}

let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastPersistedSessionKey = "";

export function scheduleTabSessionSave() {
  if (restoringTabs) return;
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(persistTabSession, 150);
}

function currentTabSessionSnapshot() {
  const list = get(tabs);
  const activeId = get(activeTabId);
  const openTabs = list
    .filter((t) => !t.isScratchpad)
    .map((t) => t.filename)
    .sort();
  const activeTab = list.find((t) => t.id === activeId);
  const activeFilename = activeTab && !activeTab.isScratchpad ? activeTab.filename : null;

  // #23: stamp the session with today's date so the next boot can tell
  // whether it's the first launch of a new day. Part of the dedup key so
  // the day rolling over always forces a fresh write, even if the open
  // tabs and active tab are unchanged from yesterday.
  const today = todayISO();
  const autoAdded = get(autoAddedMeetings);
  return {
    openTabs,
    activeFilename,
    today,
    autoAdded,
    key: JSON.stringify({ openTabs, activeFilename, today, autoAdded }),
  };
}

export function writeTabSessionNow(snap = currentTabSessionSnapshot()): void {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  lastPersistedSessionKey = snap.key;
  api.writeTabSession(snap.openTabs, snap.activeFilename, snap.today, snap.autoAdded).catch(() => {
    // Best-effort bookkeeping, not user note content — fail silently.
  });
}

function persistTabSession() {
  sessionSaveTimer = null;
  const snap = currentTabSessionSnapshot();
  if (snap.key === lastPersistedSessionKey) return;
  writeTabSessionNow(snap);
}

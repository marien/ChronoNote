import { get } from "svelte/store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { countActions, countWords } from "../tokens";
import { todayISO } from "../date";
import {
  activeTabId,
  backendKind,
  calendarSyncEnabled,
  currentDateISO,
  devBuild,
  modal,
  notesDir,
  oneDriveAccount,
  scratchpadGateContext,
  statusCounts,
  statusPos,
  statusSelection,
  statusWordCount,
  tabs,
  unsavedScratchpadNames,
} from "../stores";
import { flushAllPendingSaves, recomputeSaveState } from "../persistence";
import { checkActiveTabForDrift } from "../drift";
import { refreshAgendaFileExists } from "../calendarSyncActions";
import { phoneCompanionOnFocus } from "../phoneCompanion";
import type { NoteTab } from "../types";

// --- Standing subscriptions (wired once, from initApp) -----------------

/** Keep the status bar's action counts in sync with whichever tab is
 * active, including edits made through the drawers/modals rather than
 * typing. `latestTabs` is a plain cache of the last `tabs` value so the
 * `activeTabId` subscription can read it without a `get()`. */
let latestTabs: NoteTab[] = [];
let statusSyncWired = false;
export function wireStatusBarSync() {
  if (statusSyncWired) return;
  statusSyncWired = true;
  tabs.subscribe((v) => {
    latestTabs = v;
    syncActiveStatus();
  });
  activeTabId.subscribe(() => {
    syncActiveStatus();
    statusPos.set({ line: 1, col: 1 });
    statusSelection.set(null); // #37: a fresh tab starts with no selection
  });
}
function syncActiveStatus() {
  const t = latestTabs.find((x) => x.id === get(activeTabId));
  if (t) {
    statusCounts.set(countActions(t.content));
    statusWordCount.set(countWords(t.content));
  }
  // §102: the ambient save indicator describes the active tab, so it
  // re-derives whenever the active tab or the tab list changes.
  recomputeSaveState();
}

/** The folder's own last path segment, not the full path — shared by the
 * window-title sync below and (§merged-titlebar) the status bar's own
 * folder-name display, so the two can never disagree about what "the
 * folder name" means. Fires on every `notesDir` change regardless of
 * which code path caused it (initial boot, or a directory switch),
 * rather than needing a call at each call site. */
export function folderNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}
let titleSyncWired = false;
export function wireWindowTitleSync() {
  if (titleSyncWired) return;
  titleSyncWired = true;
  notesDir.subscribe((dir) => {
    if (!dir) return;
    getCurrentWindow()
      .setTitle(`ChronoNote${get(devBuild) ? " (dev)" : ""} - ${folderNameFromPath(dir)}`)
      .catch(() => {});
  });
}

/** After an in-app update the installer starts the app, and Windows keeps a process started that way from taking
 * the foreground: the window opened behind whatever was on top. Being topmost for a moment puts it at the top of the
 * window stack (Windows allows that), then the normal order resumes with this window first. Desktop app only. */
export async function bringToFrontAfterUpdate(version: string): Promise<void> {
  // §415: once per update. The "Updated to" notice now stays until it is clicked or closed (the version is not marked
  // as seen at start-up any more), so this remembers on its own that the window was raised for this version.
  const KEY = "chrononote.raisedAfterUpdate";
  try {
    if (localStorage.getItem(KEY) === version) return;
    localStorage.setItem(KEY, version);
  } catch {
    // No storage: raising again at the next start is harmless.
  }
  try {
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(true);
    await win.setAlwaysOnTop(false);
    await win.setFocus();
  } catch {
    // Cosmetic: a window that stays behind is no worse than before.
  }
}

// --- §93: zero-loss exit barrier -------------------------------------
//
// The autosave debounce (400ms) means the last burst of typing before an
// OS window close (X button, Alt+F4) could be lost. Intercept the close:
// flush every pending + in-flight disk write first, then destroy the
// window. A non-empty scratchpad has no disk file, so it goes through the
// same unsaved-scratchpads gate a notes-folder switch uses (§39) —
// close is cancelled until the user promotes or discards it.

let closeBarrierWired = false;
export function wireCloseBarrier() {
  if (closeBarrierWired) return;
  closeBarrierWired = true;
  const win = getCurrentWindow();
  win
    .onCloseRequested(async (event) => {
      // Take the close off Tauri's hands; we decide when the window dies.
      event.preventDefault();
      const unsaved = get(tabs).filter((t) => t.isScratchpad && t.content.trim() !== "");
      if (unsaved.length > 0) {
        unsavedScratchpadNames.set(unsaved.map((t) => t.filename));
        scratchpadGateContext.set("close");
        modal.set("unsavedScratchpads");
        return; // stay open; the modal's buttons resolve it
      }
      await flushThenDestroy();
    })
    .catch(() => {
      // No window handle (tests without the mock event plumbing, or a
      // non-Tauri context) — the barrier just isn't active there.
    });
}

async function flushThenDestroy() {
  try {
    await flushAllPendingSaves();
  } finally {
    await getCurrentWindow().destroy();
  }
}

// --- §94: external-modification detection triggers -------------------
//
// Check the active tab for drift whenever it becomes active, and whenever
// the OS window regains focus (the "I edited the file in another app and
// alt-tabbed back" case). The check itself is in `drift.ts` and is a
// cheap no-op when nothing changed.

let driftWired = false;
export function wireDriftDetection() {
  if (driftWired) return;
  driftWired = true;
  activeTabId.subscribe(() => {
    void checkActiveTabForDrift();
  });
  if (typeof window !== "undefined") {
    window.addEventListener("focus", () => {
      void checkActiveTabForDrift();
      refreshCurrentDate();
    });
  }
  getCurrentWindow()
    .onFocusChanged(({ payload: focused }) => {
      // §B1: Windows 11 dims an inactive window's title bar; 02-top-bar.css reads this class.
      document.body.classList.toggle("window-inactive", !focused);
      if (!focused) return;
      void checkActiveTabForDrift();
      // Same "regained focus" moment covers the sync button's gray-out
      // state too — `.agenda.json` is written by an external process,
      // which realistically only happens while ChronoNote itself is
      // unfocused. Skip the check entirely when the feature's off or
      // unavailable, rather than a wasted read every single focus.
      if (get(calendarSyncEnabled) && (get(backendKind) !== "web" || !!get(oneDriveAccount))) {
        void refreshAgendaFileExists();
      }
      // The agenda feed and OneDrive change files while ChronoNote is in the background: apply the phone's requests, then
      // rebuild the phone index with the window's notes re-read from disk.
      phoneCompanionOnFocus();
      // #72: also the fastest way to notice a midnight rollover that
      // happened while the app sat unfocused — no need to wait out the
      // rollover interval's own delay once the app is actually looked at
      // again.
      refreshCurrentDate();
    })
    .catch(() => {
      // No window handle — focus trigger just isn't active here.
    });
}

// --- #72: keep `currentDateISO` live across a midnight rollover --------
//
// A plain `todayISO()` call inside a template expression (the top bar's
// past/today/future tab colouring, before this fix) only re-evaluates
// when something else Svelte is already watching changes — usually not
// true right at midnight, so a tab left open overnight kept showing
// yesterday's colours until some unrelated interaction (switching tabs,
// resizing) happened to force a re-render. A cheap interval catches the
// rollover on its own; a window-focus check (piggybacking on the same
// hook §94's drift detection already uses) also catches it the moment the
// app is looked at again after being away, without waiting up to the
// interval's own delay.

const DATE_ROLLOVER_CHECK_MS = 30_000;
let dateRolloverWired = false;

function refreshCurrentDate() {
  const today = todayISO();
  if (get(currentDateISO) !== today) currentDateISO.set(today);
}

export function wireDateRollover() {
  if (dateRolloverWired) return;
  dateRolloverWired = true;
  // `currentDateISO`'s initial value (`stores.ts`) is only as fresh as
  // whenever that module happened to load — normally the same instant as
  // boot, but re-syncing explicitly here means `initApp()` never depends
  // on that coincidence.
  refreshCurrentDate();
  setInterval(refreshCurrentDate, DATE_ROLLOVER_CHECK_MS);
}

/** Unsaved-scratchpads gate, "close" context: Cancel — stay in the app. */
export function cancelAppClose() {
  unsavedScratchpadNames.set([]);
  scratchpadGateContext.set(null);
  modal.set("none");
}

/** Unsaved-scratchpads gate, "close" context: Discard & Quit — drop the
 * scratchpads, flush the real notes, then close. */
export async function confirmDiscardAndClose() {
  unsavedScratchpadNames.set([]);
  scratchpadGateContext.set(null);
  modal.set("none");
  await flushThenDestroy();
}

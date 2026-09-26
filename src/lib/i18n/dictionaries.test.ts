import { describe, expect, test } from "vitest";
import { en } from "./locales/en";
import { nl } from "./locales/nl";
import { de } from "./locales/de";
import type { TranslationKey } from "./schema";

/** Sample params for the (currently few) keys whose dictionary function
 * takes a real argument — everything else is called with `undefined`.
 * Add an entry here whenever a new parameterized key is added, or the
 * completeness test below throws instead of silently passing. */
const SAMPLE_PARAMS: Partial<Record<TranslationKey, unknown>> = {
  "settings.oneDrive.connectedAs.after": { email: "a@example.com" },
  "settings.data.noteCountInFile": { count: 3 },
  "shortcuts.modal.consequenceAction": { shortcutHint: "Ctrl+1-4" },
  "actionDrawer.counter": { open: 3, listed: 7 },
  "actionDrawer.empty.noMatch": { filter: "meeting" },
  "actionDrawer.item.lineTag": { line: 5 },
  "history.modal.titlePrefix": { header: "Weekly Sync" },
  "history.modal.dateCount": { count: 3 },
  "history.occ.title.hasContent": { date: "2026-09-26" },
  "history.occ.title.empty": { date: "2026-09-26" },
  "history.destination.addToQuoted": { name: "Scratchpad 1" },
  "history.destination.addToDate": { date: "2026-09-26" },
  "history.destination.addToNextOccurrence": { date: "2026-10-03" },
  "commandPalette.jumpToDate": { date: "2026-09-26" },
  "topBar.openTabsList.ariaLabel": { count: 3 },
  "topBar.activeTabAriaLabel": { label: "2026-09-26" },
  "topBar.newScratchpad.title": { combo: "Ctrl+N" },
  "topBar.openDateNote.title": { combo: "Ctrl+O" },
  "topBar.actions.title": { combo: "Ctrl+Shift+A" },
  "topBar.history.title": { combo: "Ctrl+Shift+H" },
  "topBar.search.title": { combo: "Ctrl+Shift+F" },
  "topBar.calendarSync.titleReady": { combo: "Ctrl+Shift+C" },
  "topBar.settings.title": { combo: "Ctrl+," },
  "statusBar.oneDrive.statusTitle": { path: "/Notes", status: "synced" },
  "statusBar.conflicts.count": { count: 2 },
  "statusBar.position": { line: 5, col: 12 },
  "statusBar.selection": { count: 3 },
  "statusBar.wordCount": { count: 42 },
  "statusBar.openCount": { count: 2 },
  "statusBar.closedCount": { count: 1 },
  "statusBar.forwardedCount": { count: 0 },
  "statusBar.updatedTo": { version: "0.14.2" },
  "statusBar.aboutTitleWithCombo": { combo: "Ctrl+Shift+," },
  "statusBar.shortcutsTitle": { combo: "Ctrl+/" },
  "about.checkedMinutesAgo": { minutes: 3 },
  "about.checkedHoursAgo": { hours: 2 },
  "conflictModal.title": { filename: "2026-09-26.txt" },
  "droppedNotes.keepBothHint": { keepBothLabel: "Keep both" },
  "migrateNotes.noteCount": { count: 5 },
  "findBar.countOf": { current: "2", total: 8 },
  "calendarSyncReview.reorderedItem": { title: "Weekly Sync" },
  "calendarSyncReview.removedItem": { title: "Standup" },
  "syncConflicts.keepBothHint": { keepBothLabel: "Keep both" },
  "safetyModal.reason.dueOpen": { count: 2 },
  "safetyModal.message": { filename: "2026-09-26.txt", reasons: "has 2 unresolved open action(s)" },
  "searchModal.matchCount": { count: 5 },
  "searchModal.removeFilterAriaLabel": { label: "is:open" },
  "searchModal.noMatches": { query: "meeting" },
  "syncHealth.relativeTime.justNow": { time: "14:32" },
  "syncHealth.notesCount": { count: 12 },
  "oneDrivePicker.toast.folderSet": { path: "/Notes" },
  "oneDrivePicker.toast.archivedNotes": { count: 3 },
  "oneDrivePicker.toast.movedWithConflicts": { count: 2 },
  "oneDrivePicker.toast.couldntSwitchBeforeSwitching": { folderPath: "/Notes", reason: "the sync failed" },
  "oneDrivePicker.toast.heldConflictsReason": { count: 2 },
  "mobileTabDrawer.closeTab": { label: "2026-09-26" },
  "toast.calendarSync.noMeetingsOn": { date: "2026-09-26" },
  "toast.copyForward.destToDate": { date: "2026-10-03" },
  "toast.copyForward.copied": { dest: "here" },
  "toast.copyForward.copiedWithCount": { dest: "here", count: 2 },
  "toast.directory.switched": { path: "C:/Notes" },
  "directory.folderSwitchNote": { folderName: "OneDrive" },
  "toast.drift.deletedOnDisk": { filename: "2026-09-26.txt" },
  "toast.drift.reloadedChanged": { filename: "2026-09-26.txt" },
  "toast.drift.reloadedFromDisk": { filename: "2026-09-26.txt" },
  "toast.drift.keptYourVersion": { filename: "2026-09-26.txt" },
  "toast.drift.changedAgain": { filename: "2026-09-26.txt" },
  "toast.drift.savedAs": { name: "2026-09-26-1430.txt" },
  "toast.exportImport.importedNoteCount": { count: 3 },
  "toast.exportImport.skippedCount": { count: 1 },
  "toast.exportImport.differsFromWhatYouHave": { count: 2 },
  "toast.exportImport.couldntSavePrefix": { name: "2026-09-26.txt" },
  "toast.paste.deferRestored": { count: 2, filename: "2026-09-26.txt" },
  "toast.paste.deferredAgain": { count: 1, filename: "2026-09-26.txt" },
  "toast.paste.originalMarkedDeferred": { count: 3, filename: "2026-09-26.txt" },
  "toast.tabs.promotedScratchpad": { filename: "2026-09-26.txt" },
  "toast.syncConflicts.couldntResolvePrefix": { name: "2026-09-26.txt", message: "network error" },
  "toast.syncConflicts.keptOneDriveVersion": { name: "2026-09-26.txt" },
  "toast.syncConflicts.keptBothVersions": { name: "2026-09-26.txt" },
  "toast.syncConflicts.keptThisDeviceVersion": { name: "2026-09-26.txt" },
  "toast.oneDriveSync.syncFailedPrefix": { message: "network error" },
  "toast.oneDriveSync.couldntStartSignInPrefix": { message: "network error" },
  "error.oneDriveLoopbackBindFailed": { detail: "address in use" },
  "error.oneDriveBrowserOpenFailed": { detail: "no browser found" },
  "error.oneDriveCallbackAcceptFailed": { detail: "connection reset" },
  "error.oneDriveKeychainSaveFailed": { detail: "access denied" },
  "error.oneDriveAuthStateSaveFailed": { detail: "disk full" },
  "error.oneDriveProfileFetchFailed": { detail: "network error" },
  "error.oneDriveTokenRequestFailed": { detail: "network error" },
  "error.oneDriveTokenExchangeRejected": { detail: "invalid_grant" },
  "error.oneDriveTokenResponseUnparseable": { detail: "unexpected token" },
};

/** Defense in depth beyond the `satisfies Dictionary` compile-time check
 * (`docs/design/i18n-roadmap.md`) — catches the case where a future
 * refactor loosens that type and a key silently goes missing from one
 * locale. */
describe("i18n dictionaries", () => {
  test("nl and de have exactly the same keys as en", () => {
    const keys = (d: object) => Object.keys(d).sort();
    expect(keys(nl)).toEqual(keys(en));
    expect(keys(de)).toEqual(keys(en));
  });

  test("every entry in every locale returns a non-empty string", () => {
    for (const dict of [en, nl, de]) {
      for (const [key, fn] of Object.entries(dict)) {
        const params = SAMPLE_PARAMS[key as TranslationKey];
        const result = (fn as (params: unknown) => string)(params);
        expect(result.length, `${key} returned an empty string`).toBeGreaterThan(0);
      }
    }
  });
});

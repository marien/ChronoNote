/** i18n roadmap (`docs/design/i18n-roadmap.md`): the full set of
 * translatable keys and, for any key whose text depends on a runtime
 * value, the shape of that value. `en.ts`/`nl.ts`/`de.ts` each declare
 * `satisfies Dictionary` against this — a key missing (or typed wrong)
 * in any one of them is a `svelte-check` error, not a runtime gap.
 *
 * This starts with the handful of keys needed to wire the Language
 * setting itself end to end; the rest of the app's strings move in here
 * incrementally rather than in one sweep. */

export type TranslationParams = {
  "common.system": undefined;
  "common.close": undefined;
  /** Shared by 14 modals' close (×) button `aria-label` — only
   * `ActionDrawerModal`/`ShortcutsModal`/`SettingsModal` use this key so
   * far (the other 11 pick it up as their own batches are translated). */
  "common.closeDialog": undefined;
  /** Shared spinner `aria-label`, currently used by `ActionDrawerModal`;
   * `HistoryModal` has the identical text and will pick this up in a
   * later batch. */
  "common.loading": undefined;
  "settings.modal.title": undefined;
  "settings.tabs.appearance": undefined;
  "settings.tabs.notesAndSync": undefined;
  "settings.tabs.updates": undefined;
  "settings.appearance.sectionLabel": undefined;
  "settings.appearance.theme.label": undefined;
  "settings.appearance.theme.light": undefined;
  "settings.appearance.theme.dark": undefined;
  "settings.appearance.theme.hint": undefined;
  "settings.appearance.language.label": undefined;
  "settings.appearance.language.hint": undefined;
  "settings.appearance.glyphs.label": undefined;
  "settings.appearance.glyphs.color": undefined;
  "settings.appearance.glyphs.grayscale": undefined;
  "settings.appearance.glyphs.legacy": undefined;
  "settings.appearance.glyphs.legacyHint": undefined;
  "settings.appearance.pureBlack.label": undefined;
  "settings.appearance.pureBlack.hint": undefined;
  "settings.editor.sectionLabel": undefined;
  "settings.editor.width.full": undefined;
  "settings.editor.width.wrap": undefined;
  "settings.editor.width.readingColumn": undefined;
  "settings.editor.width.hint": undefined;
  "settings.editor.fontSize.label": undefined;
  "settings.editor.fontSize.ariaLabel": undefined;
  "settings.editor.lineSpacing.label": undefined;
  "settings.editor.lineSpacing.ariaLabel": undefined;
  "settings.calendar.sectionLabel": undefined;
  "settings.calendar.showButtonToggle": undefined;
  "settings.calendar.agendaHint.before": undefined;
  "settings.calendar.agendaHint.after": undefined;
  "settings.calendar.agendaMissing.before": undefined;
  "settings.calendar.agendaMissing.after": undefined;
  "settings.oneDrive.sectionLabel": undefined;
  "settings.oneDrive.safariTip.label": undefined;
  "settings.oneDrive.safariTip.hint": undefined;
  "settings.oneDrive.connectedAs.before": undefined;
  "settings.oneDrive.connectedAs.after": { email: string };
  "settings.oneDrive.signInExpired.title": undefined;
  "settings.oneDrive.signInExpired.body": undefined;
  "settings.oneDrive.connecting": undefined;
  "settings.oneDrive.noFolderSelected": undefined;
  "settings.oneDrive.chooseFolder": undefined;
  "settings.oneDrive.syncNow": undefined;
  "settings.oneDrive.chooseFolderFirstTitle": undefined;
  "settings.oneDrive.signOut": undefined;
  "settings.oneDrive.signOutHint": undefined;
  "settings.oneDrive.removeLocalOnSignOut": undefined;
  "settings.oneDrive.noFolderYetHint": undefined;
  "settings.oneDrive.connectHint": undefined;
  "settings.oneDrive.connectHintWebSuffix": undefined;
  "settings.oneDrive.connectMicrosoftAccount": undefined;
  "settings.oneDrive.waitingForBrowser": undefined;
  "settings.oneDrive.pasteCodeHint": undefined;
  "settings.oneDrive.codeInputPlaceholder": undefined;
  "settings.oneDrive.submitCode": undefined;
  "settings.oneDrive.exchangingCode": undefined;
  "settings.oneDrive.enterCodeManually": undefined;
  "settings.oneDrive.hideAdvanced": undefined;
  "settings.oneDrive.showAdvanced": undefined;
  "settings.oneDrive.advancedHint": undefined;
  "settings.oneDrive.clientIdLabel": undefined;
  "settings.oneDrive.clientIdPlaceholder": undefined;
  "settings.oneDrive.tenantIdLabel": undefined;
  "settings.oneDrive.tenantIdPlaceholder": undefined;
  "settings.oneDrive.save": undefined;
  "settings.oneDrive.saving": undefined;
  "settings.oneDrive.savedHint": undefined;
  "settings.notesLocation.sectionLabel": undefined;
  "settings.notesLocation.hint": undefined;
  "settings.data.sectionLabel": undefined;
  "settings.data.export": undefined;
  "settings.data.exporting": undefined;
  "settings.data.import": undefined;
  "settings.data.webHint": undefined;
  "settings.data.desktopHint": undefined;
  "settings.data.couldntReadFile": undefined;
  "settings.data.noteCountInFile": { count: number };
  "settings.data.importMode.merge": undefined;
  "settings.data.importMode.replace": undefined;
  "settings.data.replaceWarning": undefined;
  "settings.data.importing": undefined;
  "settings.data.importAction": undefined;
  // The rest of this tab deliberately reuses `about.*` keys (§225) —
  // it mirrors AboutModal's own update-status block field for field
  // (§64/#64: both read the same stores, so they must always agree).
  "settings.updates.checkOnStart": undefined;
  "settings.updates.checkOnStartHint": undefined;

  // Shortcuts registry (`shortcuts.ts`) — one label per `ShortcutDef.id`,
  // plus the two literal (non-registry) `DRAWER_ROWS` rows. This is the
  // *only* consumer of these labels (command palette hints, TopBar/
  // StatusBar tooltips, and About all keep their own separately-authored
  // strings — see `docs/CHANGELOG.md` §219's investigation).
  "shortcuts.commandPalette.label": undefined;
  "shortcuts.newScratchpad.label": undefined;
  "shortcuts.reopenClosedTab.label": undefined;
  "shortcuts.openDateNote.label": undefined;
  "shortcuts.closeTab.label": undefined;
  "shortcuts.cycleTab.label": undefined;
  "shortcuts.indentDedent.label": undefined;
  "shortcuts.undoRedo.label": undefined;
  "shortcuts.cycleLineState.label": undefined;
  "shortcuts.cycleLineStateReverse.label": undefined;
  "shortcuts.markSelectionOpen.label": undefined;
  "shortcuts.setActionOpen.label": undefined;
  "shortcuts.setActionDone.label": undefined;
  "shortcuts.setActionDeferred.label": undefined;
  "shortcuts.setActionWontDo.label": undefined;
  "shortcuts.jumpAction.label": undefined;
  "shortcuts.caretLineNav.label": undefined;
  "shortcuts.convertToSection.label": undefined;
  "shortcuts.openActions.label": undefined;
  "shortcuts.openHistory.label": undefined;
  "shortcuts.findInNote.label": undefined;
  "shortcuts.crossTabSearch.label": undefined;
  "shortcuts.syncCalendar.label": undefined;
  "shortcuts.openSettings.label": undefined;
  "shortcuts.openAbout.label": undefined;
  "shortcuts.openShortcutsHelp.label": undefined;
  "shortcuts.copyToNextOccurrence.label": undefined;
  "shortcuts.toggleZenMode.label": undefined;
  "shortcuts.clickGlyph.label": undefined;
  "shortcuts.escape.label": undefined;

  // Shortcuts & Symbols drawer (`ShortcutsModal.svelte`) chrome and the
  // glyph-legend explanations. "Delegated" and the section-headers hint
  // weave `<kbd>` examples into the middle of the sentence — split into
  // `.partN` keys around each literal `<kbd>` (see their call site),
  // rather than a `{@html}` schema, since a real user flagged both as
  // still-English gaps in the original deferred version.
  "shortcuts.modal.title": undefined;
  "shortcuts.modal.tab.shortcuts": undefined;
  "shortcuts.modal.tab.glyphs": undefined;
  "shortcuts.modal.group.keyboardShortcuts": undefined;
  "shortcuts.modal.group.symbolsToGlyphs": undefined;
  "shortcuts.modal.group.sectionHeaders": undefined;
  "shortcuts.modal.glyph.open": undefined;
  "shortcuts.modal.glyph.done": undefined;
  "shortcuts.modal.glyph.deferred": undefined;
  "shortcuts.modal.glyph.wontDo": undefined;
  "shortcuts.modal.glyph.bullet": undefined;
  "shortcuts.modal.glyph.followUp": undefined;
  "shortcuts.modal.topicTag": undefined;
  "shortcuts.modal.dimmedLines": undefined;
  "shortcuts.modal.boldEmphasis": undefined;
  /** Ends at "Sub-items:" — the trailing `<kbd>1.1.</kbd>, <kbd>1.2.</kbd>`
   * examples are appended literally in the template, not part of this
   * translated string. */
  "shortcuts.modal.numberedList": undefined;
  "shortcuts.modal.consequenceAction": { shortcutHint: string };
  "shortcuts.modal.delegated.part1": undefined;
  "shortcuts.modal.delegated.part2": undefined;
  "shortcuts.modal.delegated.part3": undefined;
  "shortcuts.modal.sectionHeaderHint.part1": undefined;
  "shortcuts.modal.sectionHeaderHint.part2": undefined;
  "shortcuts.modal.sectionHeaderHint.exampleTitle": undefined;
  "shortcuts.modal.sectionHeaderHint.part3": undefined;
  "shortcuts.modal.sectionHeaderHint.part4": undefined;

  // Action Drawer (`ActionDrawerModal.svelte`, Ctrl/Cmd+Shift+A).
  "actionDrawer.modal.ariaLabel": undefined;
  "actionDrawer.filterPlaceholder": undefined;
  "actionDrawer.counter": { open: number; listed: number };
  "actionDrawer.scope.openTabs.label": undefined;
  "actionDrawer.scope.openTabs.title": undefined;
  "actionDrawer.scope.otherNotes.label": undefined;
  "actionDrawer.scope.otherNotes.title": undefined;
  "actionDrawer.scope.allFiles.label": undefined;
  "actionDrawer.scope.allFiles.title": undefined;
  "actionDrawer.onlyOpen.label": undefined;
  "actionDrawer.onlyOpen.title": undefined;
  "actionDrawer.empty.noMatch": { filter: string };
  "actionDrawer.empty.allResolved": undefined;
  "actionDrawer.item.lineTag": { line: number };
  "actionDrawer.footer.jump": undefined;
  "actionDrawer.footer.forwardToToday": undefined;
  "actionDrawer.footer.cycle": undefined;
  "actionDrawer.footer.cycleBack": undefined;

  // Section History (`HistoryModal.svelte`, Ctrl/Cmd+Shift+H).
  "history.modal.ariaLabel": undefined;
  /** `header` is the user's own section title — not translated itself,
   * only the surrounding "Section History:" chrome. */
  "history.modal.titlePrefix": { header: string };
  "history.modal.loadingCounter": undefined;
  "history.modal.dateCount": { count: number };
  "history.strip.scrollLeft": undefined;
  "history.strip.scrollRight": undefined;
  "history.strip.ariaLabel": undefined;
  "history.occ.title.hasContent": { date: string };
  "history.occ.title.empty": { date: string };
  "history.strip.loading": undefined;
  "history.strip.empty": undefined;
  "history.body.emptySection": undefined;
  "history.takeover.wholeLine": undefined;
  "history.takeover.actionOnly": undefined;
  "history.takeover.hint": undefined;
  "history.takeover.none": undefined;
  "history.body.selectPrompt": undefined;
  "history.footer.selectLine": undefined;
  "history.footer.extend": undefined;
  "history.footer.switchDate": undefined;
  "history.footer.jumpToSource": undefined;
  "history.footer.dblClickHint": undefined;

  // `history.ts`'s `HistoryDestination.label` — computed in a plain .ts
  // module (not a component), read via `get(t)(...)` at compute time
  // rather than `$t()`; see that file's own comment for why a stale
  // label until the next refresh is an acceptable tradeoff here.
  "history.destination.addToQuoted": { name: string };
  "history.destination.addToToday": undefined;
  "history.destination.addToDate": { date: string };
  "history.destination.addToNextOccurrence": { date: string };

  // Command palette (`commandPalette.ts` + `CommandPaletteModal.svelte`,
  // Ctrl/Cmd+K). Several labels reuse an existing key verbatim rather
  // than duplicating identical English text — see `COMMAND_PALETTE_
  // GROUP_KEYS`/inline reuse in `commandPalette.ts` for which.
  "commandPalette.modal.ariaLabel": undefined;
  "commandPalette.modal.queryAriaLabel": undefined;
  "commandPalette.modal.placeholder": undefined;
  "commandPalette.modal.resultsAriaLabel": undefined;
  "commandPalette.legend.commands": undefined;
  "commandPalette.legend.actions": undefined;
  "commandPalette.legend.dates": undefined;
  "commandPalette.legend.shortcuts": undefined;
  "commandPalette.footer.navigate": undefined;
  "commandPalette.footer.run": undefined;
  "commandPalette.noMatches": undefined;

  /** Internal `PaletteItem.group` values stay untranslated English
   * identifiers (compared for logic — e.g. `is-shortcut` styling — not
   * just displayed); `COMMAND_PALETTE_GROUP_KEYS` maps each to one of
   * these (or an existing key, e.g. `settings.modal.title` for the
   * "Settings" group) for display only. */
  "commandPalette.group.commands": undefined;
  "commandPalette.group.currentLine": undefined;
  "commandPalette.group.help": undefined;
  "commandPalette.group.openTabs": undefined;
  "commandPalette.group.openActions": undefined;
  "commandPalette.group.dates": undefined;

  "commandPalette.reopenLastClosedTab": undefined;
  "commandPalette.closeCurrentTab": undefined;
  "commandPalette.nextTab": undefined;
  "commandPalette.previousTab": undefined;
  "commandPalette.openDatedNote": undefined;
  "commandPalette.exportNotes.label": undefined;
  "commandPalette.exportNotes.hint": undefined;
  "commandPalette.toggleZenMode": undefined;
  "commandPalette.line.closeOpenAction": undefined;
  "commandPalette.line.reopenDoneAction": undefined;
  "commandPalette.line.setOpen": undefined;
  "commandPalette.line.setDone": undefined;
  "commandPalette.line.setDeferred": undefined;
  "commandPalette.line.setWontDo": undefined;
  "commandPalette.line.jumpNext": undefined;
  "commandPalette.line.jumpPrev": undefined;
  "commandPalette.wrap.enable": undefined;
  "commandPalette.wrap.disable": undefined;
  "commandPalette.readable.enable": undefined;
  "commandPalette.readable.disable": undefined;
  "commandPalette.color.toColor": undefined;
  "commandPalette.color.toLegacy": undefined;
  "commandPalette.color.toGrayscale": undefined;
  "commandPalette.keyboardShortcuts": undefined;
  "commandPalette.symbolsLegend": undefined;
  "commandPalette.checkForUpdates": undefined;
  "commandPalette.openTabs.scratchpadHint": undefined;
  "commandPalette.openTabs.openTabHint": undefined;
  "commandPalette.help.openShortcutsDrawer": undefined;
  "commandPalette.emptyActionFallback": undefined;
  "commandPalette.jumpToDate": { date: string };
  "commandPalette.dateHint": undefined;
  "commandPalette.existingNoteHint": undefined;

  // Top bar (`TopBar.svelte`). Several icon-label strings render in up to
  // three places at once (the live button, and two off-screen measurement
  // clones the #61 collapse-prediction logic uses) — always reuse the
  // exact same key at every occurrence, since the clones exist specifically
  // to measure the *current* language's text width, not a fixed English one.
  "topBar.openTabsList.title": undefined;
  "topBar.openTabsList.ariaLabel": { count: number };
  "topBar.activeTabAriaLabel": { label: string };
  "topBar.scrollTabsLeft": undefined;
  "topBar.scrollTabsRight": undefined;
  "topBar.tabStatus.memoryOnly": undefined;
  "topBar.tabStatus.saveFailed": undefined;
  "topBar.closeTab": undefined;
  "topBar.newScratchpad.title": { combo: string };
  "topBar.openDateNote.title": { combo: string };
  "topBar.label.date": undefined;
  "topBar.moreActions.title": undefined;
  "topBar.actions.title": { combo: string };
  "topBar.history.title": { combo: string };
  "topBar.search.title": { combo: string };
  "topBar.label.search": undefined;
  "topBar.calendarSync.titleReady": { combo: string };
  "topBar.calendarSync.titleNoAgendaFile": undefined;
  "topBar.calendarSync.titleNotAvailable": undefined;
  "topBar.label.calendarSync": undefined;
  "topBar.promote.title": undefined;
  "topBar.label.promote": undefined;
  "topBar.settings.title": { combo: string };
  "topBar.window.minimize": undefined;
  "topBar.window.restore": undefined;
  "topBar.window.maximize": undefined;
  "topBar.window.close": undefined;

  // Status bar (`StatusBar.svelte`).
  "statusBar.oneDrive.signInExpired": undefined;
  "statusBar.oneDrive.statusTitle": { path: string; status: string };
  "statusBar.oneDrive.connectPrompt": undefined;
  "statusBar.oneDrive.ariaLabel": undefined;
  "statusBar.oneDrive.syncingAriaLabel": undefined;
  "statusBar.oneDrive.syncingText": undefined;
  "statusBar.oneDrive.chooseFolder": undefined;
  "statusBar.oneDrive.signInAgain": undefined;
  "statusBar.oneDrive.syncError": undefined;
  "statusBar.oneDrive.offline": undefined;
  "statusBar.oneDrive.defaultFolderName": undefined;
  "statusBar.conflicts.title": undefined;
  "statusBar.conflicts.count": { count: number };
  "statusBar.browserStorage.title": undefined;
  "statusBar.browserStorage.label": undefined;
  "statusBar.changeFolderAriaLabel": undefined;
  "statusBar.position": { line: number; col: number };
  "statusBar.selection": { count: number };
  "statusBar.wordCount": { count: number };
  "statusBar.openCount": { count: number };
  "statusBar.closedCount": { count: number };
  "statusBar.forwardedCount": { count: number };
  "statusBar.updatedTo": { version: string };
  "statusBar.whatsNew": undefined;
  "statusBar.updateAvailableTitle": undefined;
  "statusBar.aboutTitleWithCombo": { combo: string };
  "statusBar.shortcutsTitle": { combo: string };

  // About (`AboutModal.svelte`, Ctrl/Cmd+Shift+,). The chip/status labels
  // and hint sentences below correspond 1:1 to `AboutModal`'s own state
  // machine (§update-check) — see that file for which state renders which.
  "about.updates.sectionLabel": undefined;
  "about.version.label": undefined;
  "about.chip.alwaysCurrent": undefined;
  "about.chip.checking": undefined;
  "about.chip.upToDate": undefined;
  "about.chip.updateAvailable": undefined;
  "about.chip.startingInstaller": undefined;
  "about.chip.downloading": undefined;
  "about.chip.restartToFinish": undefined;
  "about.chip.installFailed": undefined;
  "about.chip.couldntCheck": undefined;
  "about.chip.notCheckedYet": undefined;
  "about.web.hint": undefined;
  "about.releaseNotes": undefined;
  "about.checkingHint": undefined;
  "about.isAvailable": undefined;
  "about.whatsChanged": undefined;
  "about.downloadAndInstall": undefined;
  "about.downloading.startingInstaller": undefined;
  "about.downloading.downloading": undefined;
  "about.ready.installed": undefined;
  "about.ready.restartNow": undefined;
  "about.error.installFailedPrefix": undefined;
  "about.error.tryAgain": undefined;
  "about.error.downloadFromGithub": undefined;
  "about.error.couldntCheckPrefix": undefined;
  "about.upToDate.running": undefined;
  /** "Checked just now" / "Checked N minute(s)/hour(s) ago" —
   * `agoLabel()` in `AboutModal.svelte`. */
  "about.checkedJustNow": undefined;
  "about.checkedMinutesAgo": { minutes: number };
  "about.checkedHoursAgo": { hours: number };
  "about.checkAgain": undefined;
  "about.checkNow": undefined;
  "about.links.sectionLabel": undefined;
  "about.links.website": undefined;
  "about.links.project": undefined;
  "about.learnMore.sectionLabel": undefined;
  /** Both hints sit right after their own `<kbd>` combo, never mid-sentence
   * (like §220's "Numbered list" case) — no rich-text schema needed. */
  "about.learnMore.shortcutsHint": undefined;
  "about.learnMore.paletteHint": undefined;

  "common.cancel": undefined;
  "common.browse": undefined;

  // Safety modal (`SafetyModal.svelte`) — the unresolved-actions/
  // unsaved-scratchpad close warning. `tabs.ts`'s `requestTabClose`
  // composes the message from these fragments outside any component
  // (a 4th non-component translation site, after §222/§223's `t`-in-a-
  // plain-function precedent) — one reason phrase per blocking condition,
  // joined with a translated "and", not a single fixed sentence, since
  // either or both conditions can apply at once.
  "safetyModal.ariaLabel": undefined;
  "safetyModal.title": undefined;
  "safetyModal.reason.dueOpen": { count: number };
  "safetyModal.reason.scratchpad": undefined;
  "safetyModal.reasonJoiner": undefined;
  "safetyModal.message": { filename: string; reasons: string };
  "safetyModal.closeAnyway": undefined;

  // Cross-tab search (`SearchModal.svelte`, Ctrl/Cmd+Shift+F).
  "searchModal.placeholder": undefined;
  "searchModal.matchCount": { count: number };
  "searchModal.searchingAriaLabel": undefined;
  "searchModal.removeFilterAriaLabel": { label: string };
  "searchModal.noMatches": { query: string };
  "searchModal.footer.jumpToMatch": undefined;

  // Date picker (`DatePickerModal.svelte`). Month/weekday names come from
  // `Intl.DateTimeFormat` (`date.ts`'s `monthName`/`weekdayAbbrev`), not
  // this dictionary — see the design doc for why.
  "datePicker.ariaLabel": undefined;
  "datePicker.jumpPlaceholder": undefined;
  "datePicker.jumpAriaLabel": undefined;
  "datePicker.previousMonth": undefined;
  "datePicker.nextMonth": undefined;
  "datePicker.loadingOlderNotes": undefined;
  "datePicker.day.allDone": undefined;
  "datePicker.day.pending": undefined;
  "datePicker.day.log": undefined;
  "datePicker.day.hasNote": undefined;
  "datePicker.today": undefined;
  "datePicker.escToClose": undefined;

  // More Actions popover (`MoreActionsModal.svelte`, #56 top-bar overflow).
  "moreActions.promote.label": undefined;

  // Conflict modal (`ConflictModal.svelte`) — a note changed on disk
  // while it had unsaved edits open. The explanatory paragraph weaves
  // two <em>-wrapped button-name references mid-sentence, split into
  // `.partN` keys around each literal `<em>`, same shape as the
  // Shortcuts drawer's "Delegated"/section-headers cases. The em-wrapped
  // references get their own short keys rather than reusing
  // `.keepDiskVersion`/`.keepMyVersion` below — the paragraph's own
  // wording ("Keep disk"/"Keep mine") is intentionally shorter than the
  // full button labels ("Keep disk version"/"Keep my version"), not a
  // literal quote of them.
  "conflictModal.ariaLabel": undefined;
  "conflictModal.title": { filename: string };
  "conflictModal.explanation.part1": undefined;
  "conflictModal.explanation.keepDiskRef": undefined;
  "conflictModal.explanation.part2": undefined;
  "conflictModal.explanation.keepMineRef": undefined;
  "conflictModal.explanation.part3": undefined;
  "conflictModal.keepDiskVersion": undefined;
  "conflictModal.saveMineAsCopy": undefined;
  "conflictModal.keepMyVersion": undefined;

  // Unsaved scratchpads gate (`UnsavedScratchpadsModal.svelte`) — shared
  // by the app-close barrier and the notes-folder switch (§39/§93).
  "unsavedScratchpads.ariaLabel": undefined;
  "unsavedScratchpads.title": undefined;
  "unsavedScratchpads.leadClose": undefined;
  "unsavedScratchpads.leadSwitch": undefined;
  "unsavedScratchpads.confirmDiscardQuit": undefined;
  "unsavedScratchpads.confirmDiscardSwitch": undefined;

  // Dropped notes review (`DroppedNotesModal.svelte`, drag-and-drop import).
  "droppedNotes.ariaLabel": undefined;
  "droppedNotes.hasNoteHint.before": undefined;
  "droppedNotes.hasNoteHint.after": undefined;
  "droppedNotes.tab.sideBySide": undefined;
  "droppedNotes.tab.yourNote": undefined;
  "droppedNotes.tab.droppedFile": undefined;
  "droppedNotes.highlightedDiffer": undefined;
  "droppedNotes.keepMyNote": undefined;
  "droppedNotes.useDroppedFile": undefined;
  "droppedNotes.keepBoth": undefined;
  "droppedNotes.keepBothHint": { keepBothLabel: string };
  "droppedNotes.nothingToReview": undefined;

  // Migrate-to-OneDrive prompt (`MigrateNotesModal.svelte`, web app).
  // Both explanatory sentences split around their own `<strong>`-wrapped
  // dynamic value (a count, a folder name) — the same "split around
  // data, not prose" pattern `droppedNotes.hasNoteHint` established.
  "migrateNotes.ariaLabel": undefined;
  "migrateNotes.title": undefined;
  "migrateNotes.noteCount": { count: number };
  "migrateNotes.body.beforeCount": undefined;
  "migrateNotes.body.afterCount": undefined;
  "migrateNotes.body.beforeFolder": undefined;
  "migrateNotes.body.afterFolder": undefined;
  "migrateNotes.disclaimerHint": undefined;
  "migrateNotes.moving": undefined;
  "migrateNotes.moveButton": undefined;
  "migrateNotes.switchingFolder": undefined;
  "migrateNotes.keepSeparate": undefined;

  // In-document find bar (`FindBar.svelte`, Ctrl/Cmd+F).
  "findBar.placeholder": undefined;
  "findBar.ariaLabel": undefined;
  "findBar.countOf": { current: string; total: number };
  "findBar.noResults": undefined;
  "findBar.previousMatch": undefined;
  "findBar.previousTitle": undefined;
  "findBar.nextMatch": undefined;
  "findBar.nextTitle": undefined;
  "findBar.closeFind": undefined;
  "findBar.closeTitle": undefined;

  // Calendar sync review (`CalendarSyncReviewModal.svelte`, #78).
  "calendarSyncReview.ariaLabel": undefined;
  "calendarSyncReview.title": undefined;
  "calendarSyncReview.newMeetings": undefined;
  "calendarSyncReview.reordered": undefined;
  "calendarSyncReview.reorderedItem": { title: string };
  "calendarSyncReview.removed": undefined;
  "calendarSyncReview.removedItem": { title: string };
  "calendarSyncReview.noLongerOnCalendar": undefined;
  "calendarSyncReview.choice.leave": undefined;
  "calendarSyncReview.choice.discard": undefined;
  "calendarSyncReview.choice.move": undefined;
  "calendarSyncReview.nothingChanged": undefined;
  "calendarSyncReview.syncButton": undefined;

  // OneDrive sync conflicts (`SyncConflictsModal.svelte`). "OneDrive"
  // itself is left as a literal brand name in the template, same
  // treatment as the status bar's own OneDrive label (§224).
  "syncConflicts.ariaLabel": undefined;
  "syncConflicts.bodyHintAfter": undefined;
  "syncConflicts.tab.thisDevice": undefined;
  "syncConflicts.badge.thisDevice": undefined;
  "syncConflicts.keepThisDevice": undefined;
  "syncConflicts.useOneDrive": undefined;
  "syncConflicts.keepBothHint": { keepBothLabel: string };
  "syncConflicts.noConflicts": undefined;

  // Sync health popover (`SyncHealthPopover.svelte`, clicking the status
  // bar's cloud icon). Relative times ("3 minutes ago") now go through
  // `Intl.RelativeTimeFormat` (see the component) instead of 5 hand-
  // translated fragments — same reasoning as `date.ts`'s `monthName`/
  // `weekdayAbbrev` (§227). Only the "just now" case (which embeds an
  // absolute time the way no plain relative-time unit does) and "Never"
  // still need real dictionary entries.
  "syncHealth.ariaLabel": undefined;
  "syncHealth.title": undefined;
  "syncHealth.status.signInExpired": undefined;
  "syncHealth.status.syncingChanges": undefined;
  "syncHealth.status.offlineCached": undefined;
  "syncHealth.status.inSync": undefined;
  "syncHealth.label.status": undefined;
  "syncHealth.label.lastSynced": undefined;
  "syncHealth.relativeTime.never": undefined;
  "syncHealth.relativeTime.justNow": { time: string };
  "syncHealth.label.localMirror": undefined;
  "syncHealth.notesCount": { count: number };
  "syncHealth.storageKind.local": undefined;
  "syncHealth.label.pendingUploads": undefined;
  "syncHealth.label.account": undefined;
  "syncHealth.accountFallback": undefined;
  "syncHealth.label.targetFolder": undefined;
  "syncHealth.signInExpiredHint": undefined;
  "syncHealth.syncNowLabel": undefined;
  "syncHealth.openSettingsButton": undefined;

  // OneDrive folder picker (`OneDriveFolderPickerModal.svelte`, web app).
  // Toast prefixes that concatenate a Rust/API-originated error message
  // stay untranslated in that trailing part, per the design doc's Phase 2
  // deferral (§219) — only the static lead-in translates.
  "oneDrivePicker.rootBreadcrumb": undefined;
  "oneDrivePicker.ariaLabel": undefined;
  "oneDrivePicker.title": undefined;
  "oneDrivePicker.goUpFolder": undefined;
  "oneDrivePicker.loadingFolders": undefined;
  "oneDrivePicker.retry": undefined;
  "oneDrivePicker.noSubfolders": undefined;
  "oneDrivePicker.newFolderPlaceholder": undefined;
  "oneDrivePicker.creating": undefined;
  "oneDrivePicker.create": undefined;
  "oneDrivePicker.newSubfolder": undefined;
  "oneDrivePicker.currentTarget": undefined;
  "oneDrivePicker.useThisFolder": undefined;
  "oneDrivePicker.toast.createFolderFailedPrefix": undefined;
  "oneDrivePicker.toast.folderSet": { path: string };
  "oneDrivePicker.toast.setFolderFailedPrefix": undefined;
  "oneDrivePicker.toast.couldntSwitchFolders": undefined;
  "oneDrivePicker.toast.archivedNotes": { count: number };
  "oneDrivePicker.toast.switchFoldersFailedPrefix": undefined;
  "oneDrivePicker.toast.movedWithConflicts": { count: number };
  "oneDrivePicker.toast.migrationFailedPrefix": undefined;
  "oneDrivePicker.toast.couldntSwitchBeforeSwitching": { folderPath: string; reason: string };
  "oneDrivePicker.toast.heldConflictsReason": { count: number };
  "oneDrivePicker.toast.syncFailedNoDetail": undefined;

  // Mobile accessory bar (`MobileAccessoryBar.svelte`, touch devices).
  // Each button's `title` pairs a translated word with a literal token
  // glyph (untranslated — same token-vocabulary reasoning as everywhere
  // else in the app).
  "mobileAccessory.ariaLabel": undefined;
  "mobileAccessory.openTask.ariaLabel": undefined;
  "mobileAccessory.openTask.titleWord": undefined;
  "mobileAccessory.completedTask.ariaLabel": undefined;
  "mobileAccessory.completedTask.titleWord": undefined;
  "mobileAccessory.deferredTask.ariaLabel": undefined;
  "mobileAccessory.deferredTask.titleWord": undefined;
  "mobileAccessory.bulletList.ariaLabel": undefined;
  "mobileAccessory.bulletList.titleWord": undefined;
  "mobileAccessory.followUp.ariaLabel": undefined;
  "mobileAccessory.followUp.titleWord": undefined;
  "mobileAccessory.emphasis": undefined;
  "mobileAccessory.indent.ariaLabel": undefined;
  "mobileAccessory.indentWord": undefined;
  "mobileAccessory.dedent.ariaLabel": undefined;
  "mobileAccessory.dedentWord": undefined;
  "mobileAccessory.undo": undefined;
  "mobileAccessory.redo": undefined;

  // Mobile tab drawer (`MobileTabDrawer.svelte`, touch devices).
  "mobileTabDrawer.ariaLabel": undefined;
  "mobileTabDrawer.title": undefined;
  "mobileTabDrawer.closeTabList": undefined;
  "mobileTabDrawer.memoryOnly": undefined;
  "mobileTabDrawer.closeTab": { label: string };
  "mobileTabDrawer.newScratchpad": undefined;
  "mobileTabDrawer.openDateNote": undefined;

  // Toast messages (final piece of the Phase 1 sweep) — organized by
  // the source `.ts` file, mirroring how the component keys above are
  // organized by their own `.svelte` file. Toast prefixes that
  // concatenate a Rust/API-originated error message stay untranslated
  // in that trailing part, same Phase 2 deferral as everywhere else.
  "toast.actions.forwardedToToday": undefined;
  "toast.boot.oneDrive.connected": undefined;
  "toast.boot.oneDrive.connectedChooseFolder": undefined;
  "toast.boot.oneDrive.signInFailedPrefix": undefined;
  "toast.boot.oneDrive.signInErrorPrefix": undefined;
  "toast.boot.failedToSave.theme": undefined;
  "toast.boot.failedToSave.lightDark": undefined;
  "toast.boot.failedToSave.language": undefined;
  "toast.boot.failedToSave.wordWrap": undefined;
  "toast.boot.failedToSave.readingWidth": undefined;
  "toast.boot.failedToSave.updateCheck": undefined;
  "toast.boot.failedToSave.calendarSync": undefined;
  "toast.boot.failedToSave.fontSize": undefined;
  "toast.boot.failedToSave.lineHeight": undefined;
  "toast.boot.failedToSave.pureBlack": undefined;
  "toast.calendarSync.noMeetingsOn": { date: string };
  "toast.calendarSync.synced": undefined;
  "toast.copyForward.destHere": undefined;
  "toast.copyForward.destToDate": { date: string };
  "toast.copyForward.copied": { dest: string };
  "toast.copyForward.copiedWithCount": { dest: string; count: number };
  "toast.copyForward.notAvailableInScratchpad": undefined;
  "toast.copyForward.nothingToCopy": undefined;
  "toast.copyForward.notInNamedSection": undefined;
  "toast.copyForward.noMatchingOccurrence": undefined;
  "toast.directory.switched": { path: string };
  "directory.folderSwitchNote": { folderName: string };
  "toast.drift.deletedOnDisk": { filename: string };
  "toast.drift.reloadedChanged": { filename: string };
  "toast.drift.reloadedFromDisk": { filename: string };
  "toast.drift.keptYourVersion": { filename: string };
  "toast.drift.changedAgain": { filename: string };
  "toast.drift.savedAs": { name: string };
  "toast.drift.couldntSaveCopy": undefined;
  "toast.exportImport.importedNoteCount": { count: number };
  "toast.exportImport.skippedCount": { count: number };
  "toast.exportImport.couldntReadExportFile": undefined;
  "toast.exportImport.differsFromWhatYouHave": { count: number };
  "toast.exportImport.noNotesImported": undefined;
  "toast.exportImport.couldntSavePrefix": { name: string };
  "toast.history.cursorNotInSection": undefined;
  "toast.paste.deferRestored": { count: number; filename: string };
  "toast.paste.deferredAgain": { count: number; filename: string };
  "toast.paste.originalMarkedDeferred": { count: number; filename: string };
  "toast.tabs.noRecentlyClosedTabs": undefined;
  "toast.tabs.nothingToPromote": undefined;
  "toast.tabs.promotedScratchpad": { filename: string };
  "toast.syncConflicts.couldntResolvePrefix": { name: string; message: string };
  "toast.syncConflicts.keptOneDriveVersion": { name: string };
  "toast.syncConflicts.keptBothVersions": { name: string };
  "toast.syncConflicts.keptThisDeviceVersion": { name: string };
  "toast.oneDriveSync.chooseFolderFirst": undefined;
  "toast.oneDriveSync.syncFinished": undefined;
  "toast.oneDriveSync.syncFailedPrefix": { message: string };
  "toast.oneDriveSync.couldntStartSignInPrefix": { message: string };
  "toast.updates.updateAvailable": undefined;
  "toast.persistence.failedToSaveNote": undefined;
  // i18n Phase 2 (docs/design/i18n-roadmap.md): translated headlines for
  // the small set of `AppError` codes Rust authors itself as fixed
  // sentences (src-tauri/src/error.rs) — see `apiError.ts`.
  "error.agendaInvalid": undefined;
  "error.oneDriveSyncBusy": undefined;
  "error.oneDriveLoopbackBindFailed": { detail: string };
  "error.oneDriveBrowserOpenFailed": { detail: string };
  "error.oneDriveCallbackAcceptFailed": { detail: string };
  "error.oneDriveAuthTimedOut": undefined;
  "error.oneDriveNoAuthCode": undefined;
  "error.oneDriveNoPendingSession": undefined;
  "error.oneDriveKeychainSaveFailed": { detail: string };
  "error.oneDriveAuthStateSaveFailed": { detail: string };
  "error.oneDriveProfileFetchFailed": { detail: string };
  "error.oneDriveMissingRefreshTokenScope": undefined;
  "error.oneDriveTokenRequestFailed": { detail: string };
  "error.oneDriveTokenExchangeRejected": { detail: string };
  "error.oneDriveTokenResponseUnparseable": { detail: string };
};

export type TranslationKey = keyof TranslationParams;

export type Dictionary = {
  [K in TranslationKey]: (params: TranslationParams[K]) => string;
};

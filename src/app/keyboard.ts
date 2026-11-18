import { get } from "svelte/store";
import * as controller from "../lib/controller";
import {
  backendKind,
  editorApi,
  findOpen,
  findReplaceOpen,
  isMobile,
  isZenMode,
  modal,
  mobileTabDrawerOpen,
  peekMode,
  peekSwitcherOpen,
  scratchpadGateContext,
} from "../lib/controller";
import { matchesShortcut } from "../lib/shortcuts";
import { isMac } from "../lib/platform";
import { oneDriveFolderPickerOpen, syncHealthPopoverOpen } from "../lib/stores";
import { exportModalOpen, overlays, topOverlay, type Overlay } from "../lib/overlays";
import { openExportModal, printActiveNote } from "../lib/exportNotes";
import type { DockedPaneKind } from "./windowHelpers";

// `top` is the overlay to close (null = none: then Zen / Peek may end, when allowed).
export function dismissTopOverlayAndReturnTrue(top: Overlay | null, allowModeExit = true): boolean {
  if (top === null) {
    if (allowModeExit && get(isZenMode)) {
      isZenMode.set(false);
      return true;
    }
    if (allowModeExit && get(peekMode)) {
      controller.leavePeek();
      return true;
    }
    return false;
  }
  // It closed itself in its own Esc handler: that was this key press's dismissal.
  if (!get(overlays).some((o) => o.kind === top.kind)) return true;
  switch (top.kind) {
    case "folderPicker":
      oneDriveFolderPickerOpen.set(false);
      return true;
    case "export":
      exportModalOpen.set(false);
      return true;
    case "mobileTabs":
      mobileTabDrawerOpen.set(false);
      return true;
    case "find":
      // §108: close the find bar even if focus has moved back to the editor.
      editorApi?.find.clear();
      findOpen.set(false);
      return true;
    case "syncHealth":
      syncHealthPopoverOpen.set(false);
      return true;
    case "safety":
      controller.cancelSafetyClose();
      return true;
    case "conflict":
      /* a disk-vs-memory conflict needs an explicit choice — do not dismiss */
      return false;
    case "unsavedScratchpads":
      get(scratchpadGateContext) === "close"
        ? controller.cancelAppClose()
        : controller.cancelDirectorySwitch();
      return true;
    default:
      controller.closeAllModals();
      return true;
  }
}

export function createWindowKeyboardHandler(getDockedPane: () => DockedPaneKind | null) {
  // One entry per `shortcuts.ts` id that's a real window-level action
  // (as opposed to a CodeMirror-internal or display-only entry, e.g.
  // `undoRedo`/`indentDedent`/`jumpAction` — those live in EditorPane's
  // own keymap instead). Order doesn't matter: every combo across every
  // entry is disjoint by construction, so at most one ever matches a
  // given keypress. `matchesShortcut` resolves Ctrl-vs-Cmd per platform
  // (`platform.ts`) — this is the one place that logic needs to live.
  const shortcutActions: Record<string, (e: KeyboardEvent) => void> = {
    newScratchpad: () => controller.createScratchpad(),
    openDateNote: () => controller.openDatePicker(),
    closeTab: () => controller.requestTabClose(controller.getActiveTabId()),
    cycleTab: (e) => controller.cycleTab(e.shiftKey ? -1 : 1),
    reopenClosedTab: () => controller.reopenLastClosedTab(),
    openActions: () => {
      const dockedPane = getDockedPane();
      if (dockedPane === "actions") {
        if (document.querySelector(".actions-pane")?.contains(document.activeElement)) editorApi?.focus();
        else document.querySelector<HTMLElement>(".actions-pane .modal-input")?.focus();
      } else {
        controller.openActionDrawer();
      }
    },
    openWeekReview: () => {
      const dockedPane = getDockedPane();
      if (dockedPane === "weekReview") {
        if (document.querySelector(".week-review-pane")?.contains(document.activeElement)) editorApi?.focus();
        else document.querySelector<HTMLElement>(".week-review-pane .modal-list")?.focus();
      } else {
        controller.openWeekReview();
      }
    },
    openHistory: () => {
      const dockedPane = getDockedPane();
      // Docked: the shortcut switches focus between the note and the pane (as F6 does; F-keys need Fn on many
      // laptops, so this is the one to use there).
      if (dockedPane === "history") {
        if (document.querySelector(".history-pane")?.contains(document.activeElement)) editorApi?.focus();
        else document.querySelector<HTMLElement>(".history-pane .history-body")?.focus();
      } else {
        controller.openMeetingHistory();
      }
    },
    crossTabSearch: () => controller.openCrossTabSearch(),
    syncCalendar: () => controller.syncCalendarFromFile(),
    copyToNextOccurrence: () => controller.copySelectionToNextOccurrence(),
    openSettings: () => controller.openSettings(),
    openAbout: () => controller.openAbout(),
    openShortcutsHelp: () => controller.openShortcutsHelp(),
    toggleZenMode: () => isZenMode.update((v) => !v),
    togglePeekMode: () => controller.togglePeek(),
    newCall: () => void controller.newCall(),
    printNote: () => printActiveNote(),
    openExport: () => openExportModal(),
    navigateBack: () => void controller.navigateBack(),
    navigateForward: () => void controller.navigateForward(),
  };

  // A modal, the find bar or the sync-health popover handles Esc in its own handler, which runs before this
  // window-level one and has already closed itself by the time we get here. So what Esc may close here is decided
  // from the top of the overlay stack when the key went down (this capture-phase listener), not from what is on
  // top now: otherwise one Esc would close two things.
  let topAtEscape: Overlay | null = null;
  function noteEscapeStart(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    topAtEscape = get(topOverlay);
  }

  function modalOwnsKeyboard(e: KeyboardEvent): boolean {
    const dockedPane = getDockedPane();
    if (document.querySelector(".compact-picker")) return true;
    if (get(modal) === "none") return false;
    if (
      dockedPane &&
      !(e.target instanceof Element && e.target.closest(dockedPane === "weekReview" ? ".week-review-pane" : `.${dockedPane}-pane`))
    ) {
      return false;
    }
    return true;
  }

  function onKeydown(e: KeyboardEvent) {
    const dockedPane = getDockedPane();
    // F6: toggles focus between the editor and the docked pane
    if (e.key === "F6" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (dockedPane === "history") {
        e.preventDefault();
        const paneEl = document.querySelector(".history-pane");
        if (paneEl && paneEl.contains(document.activeElement)) {
          editorApi?.focus();
        } else {
          document.querySelector<HTMLElement>(".history-pane .history-body")?.focus();
        }
        return;
      }
      if (dockedPane === "actions") {
        e.preventDefault();
        const paneEl = document.querySelector(".actions-pane");
        if (paneEl && paneEl.contains(document.activeElement)) {
          editorApi?.focus();
        } else {
          document.querySelector<HTMLElement>(".actions-pane .modal-input")?.focus();
        }
        return;
      }
      if (dockedPane === "weekReview") {
        e.preventDefault();
        const paneEl = document.querySelector(".week-review-pane");
        if (paneEl && paneEl.contains(document.activeElement)) {
          editorApi?.focus();
        } else {
          document.querySelector<HTMLElement>(".week-review-pane .modal-list")?.focus();
        }
        return;
      }
      if (dockedPane === "person") {
        e.preventDefault();
        const paneEl = document.querySelector(".person-pane");
        if (paneEl && paneEl.contains(document.activeElement)) {
          editorApi?.focus();
        } else {
          document.querySelector<HTMLElement>(".person-pane .modal-list")?.focus();
        }
        return;
      }
    }

    // Alt+Left / Alt+Right: previous / next occurrence of the section the cursor is in. The editor handles the key
    // itself while it has focus (`EditorPane`); this is for the rest of the window. Peek on every platform; the main
    // window not on macOS, where Option+Arrow is the editor's word movement.
    if (
      !e.defaultPrevented &&
      e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey &&
      (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
      !modalOwnsKeyboard(e) &&
      !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
    ) {
      const direction = e.key === "ArrowLeft" ? -1 : 1;
      if (get(peekMode)) {
        e.preventDefault();
        void controller.stepPeekOccurrence(direction);
        return;
      }
      if (!isMac && controller.occurrenceKeyApplies()) {
        e.preventDefault();
        void controller.stepSectionOccurrence(direction);
        return;
      }
    }
    // Desktop app only: F11 as an alias for the Zen mode chord (see `shortcuts.ts`).
    if (e.key === "F11" && !e.ctrlKey && !e.metaKey && !e.altKey && get(backendKind) === "desktop") {
      e.preventDefault();
      isZenMode.update((v) => !v);
      return;
    }

    if (e.key === "Escape") {
      if (dismissTopOverlayAndReturnTrue(topAtEscape, topAtEscape === null)) {
        e.preventDefault();
      }
      return;
    }

    // Ctrl/Cmd+K and Ctrl/Cmd+F are top-level but ignored while any
    // modal is up (the find bar would just mount hidden behind the
    // overlay) — the one bit of behavior too bespoke for the generic
    // table below.
    if (matchesShortcut(e, "commandPalette")) {
      if (modalOwnsKeyboard(e)) return;
      e.preventDefault();
      controller.openCommandPalette();
      return;
    }
    if (matchesShortcut(e, "goToSection")) {
      if (modalOwnsKeyboard(e)) return;
      e.preventDefault();
      if (get(peekMode)) {
        peekSwitcherOpen.update((v) => !v);
        return;
      }
      controller.openCommandPalette("#");
      return;
    }
    if (matchesShortcut(e, "setDueDate")) {
      if (modalOwnsKeyboard(e)) return;
      e.preventDefault();
      controller.openDueDatePicker();
      return;
    }
    if (matchesShortcut(e, "findInNote")) {
      if (modalOwnsKeyboard(e)) return;
      // Catches Ctrl/Cmd+F when focus is in the find input or elsewhere
      // outside the editor (the editor's own keymap covers the rest).
      e.preventDefault();
      findOpen.set(true);
      findReplaceOpen.set(false);
      // The bar isn't mounted in this tick — re-select on the next frame
      // so a second Ctrl/Cmd+F re-focuses the query.
      requestAnimationFrame(() =>
        document.querySelector<HTMLInputElement>(".find-bar .find-input")?.select(),
      );
      return;
    }
    if (matchesShortcut(e, "replaceInNote")) {
      if (modalOwnsKeyboard(e)) return;
      e.preventDefault();
      findOpen.set(true);
      findReplaceOpen.set(true);
      requestAnimationFrame(() => {
        const findInput = document.querySelector<HTMLInputElement>(".find-bar .find-input");
        const replaceInput = document.querySelector<HTMLInputElement>(".find-bar .find-replace-input");
        if (findInput && findInput.value.length > 0 && replaceInput) {
          replaceInput.focus();
          replaceInput.select();
        } else if (findInput) {
          findInput.focus();
          findInput.select();
        }
      });
      return;
    }

    // Close Settings page when Ctrl+, is pressed while it is open on desktop
    if (matchesShortcut(e, "openSettings") && !get(isMobile) && get(modal) === "settings") {
      e.preventDefault();
      controller.closeAllModals();
      return;
    }

    // A modal owns the keyboard while it's open — none of these should
    // reach the app underneath (found via a real bug report: Ctrl+Tab
    // switched the active tab while Section History was open, and the
    // arrow keys then acted on that now-stale editor instead of the
    // modal). `commandPalette`/`findInNote` above already gate the same
    // way; this closes the same hole for every other entry in the table.
    // The docked pane: its own shortcut switches focus back to the note even from inside the pane.
    if (matchesShortcut(e, "openHistory") && dockedPane === "history") {
      e.preventDefault();
      shortcutActions.openHistory(e);
      return;
    }
    if (matchesShortcut(e, "openActions") && dockedPane === "actions") {
      e.preventDefault();
      shortcutActions.openActions(e);
      return;
    }
    if (matchesShortcut(e, "openWeekReview") && dockedPane === "weekReview") {
      e.preventDefault();
      shortcutActions.openWeekReview(e);
      return;
    }
    // "Ctrl+/ All keys" is in the footer of the drawers and panes, so it has to work from inside them: the Shortcuts
    // & symbols drawer takes the drawer's place (Marien, 2026-10-10: it did nothing).
    if (matchesShortcut(e, "openShortcutsHelp") && get(modal) !== "shortcuts") {
      e.preventDefault();
      shortcutActions.openShortcutsHelp(e);
      return;
    }
    if (modalOwnsKeyboard(e)) return;

    // `openShortcutsHelp`'s two combos (Ctrl/Cmd+/ and +Shift+/) both
    // land here — `openGlyphLegend` and `openShortcutsHelp` are the
    // same `modal.set("shortcuts")` today (the combined Shortcuts &
    // Symbols drawer), so there's nothing for Shift to actually pick
    // between; kept as one action rather than two identical branches.
    for (const id in shortcutActions) {
      if (matchesShortcut(e, id)) {
        e.preventDefault();
        shortcutActions[id](e);
        return;
      }
    }
  }

  return { noteEscapeStart, onKeydown };
}

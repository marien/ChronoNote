<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import * as controller from "./lib/controller";
  import {
    activeTabId,
    backendKind,
    cursorSection,
    editorApi,
    editorFocused,
    findOpen,
    fontSize,
    historyDocked,
    historyTargetHeader,
    isMobile,
    isZenMode,
    lineHeight,
    modal,
    mobileTabDrawerOpen,
    scratchpadGateContext,
    tabs,
    toastAction,
    toastMessage,
    LONG_TOAST_CHARS,
    peekMode,
    peekInFocus,
    peekSettings,
    windowWidth,
  } from "./lib/controller";
  import { matchesShortcut } from "./lib/shortcuts";
  import { isMac } from "./lib/platform";
  import { t } from "./lib/i18n";
  import { wireMobileViewport } from "./lib/mobileViewport";
  import { wireMobileBackNavigation } from "./lib/mobileNavigation";
  import { suppressesNativeContextMenu, wireContextMenuGuard } from "./lib/contextMenuGuard";
  import { invoke } from "@tauri-apps/api/core";
  import { createZenWindowController } from "./lib/zenWindow";

  const nativeZenWindow = () => {
    const w = getCurrentWindow();
    return {
      isMaximized: () => w.isMaximized(),
      setFullscreen: (on: boolean) => w.setFullscreen(on),
      coverMonitor: () => invoke<void>("zen_cover_monitor"),
      prepareLeave: () => invoke<void>("zen_prepare_leave"),
    };
  };
  import Icon from "./lib/icons/Icon.svelte";
  import TopBar from "./lib/components/TopBar.svelte";
  import KeyTips from "./lib/components/KeyTips.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import InfoBar from "./lib/components/InfoBar.svelte";
  import SyncHealthPopover from "./lib/components/SyncHealthPopover.svelte";
  import MobileAppBar from "./lib/components/mobile/MobileAppBar.svelte";
  import MobileNavBar from "./lib/components/mobile/MobileNavBar.svelte";
  import PeekBar from "./lib/components/PeekBar.svelte";
  import EditorPane from "./lib/components/EditorPane.svelte";
  import FindBar from "./lib/components/FindBar.svelte";
  import MobileAccessoryBar from "./lib/components/mobile/MobileAccessoryBar.svelte";
  import MobileTabDrawer from "./lib/components/mobile/MobileTabDrawer.svelte";
  import DatePickerModal from "./lib/components/modals/DatePickerModal.svelte";
  import ActionDrawerModal from "./lib/components/modals/ActionDrawerModal.svelte";
  import HistoryModal from "./lib/components/modals/HistoryModal.svelte";
  import SearchModal from "./lib/components/modals/SearchModal.svelte";
  import SafetyModal from "./lib/components/modals/SafetyModal.svelte";
  import SettingsModal from "./lib/components/modals/SettingsModal.svelte";
  import ShortcutsModal from "./lib/components/modals/ShortcutsModal.svelte";
  import AboutModal from "./lib/components/modals/AboutModal.svelte";
  import UnsavedScratchpadsModal from "./lib/components/modals/UnsavedScratchpadsModal.svelte";
  import ConflictModal from "./lib/components/modals/ConflictModal.svelte";
  import CommandPaletteModal from "./lib/components/modals/CommandPaletteModal.svelte";
  import MoreActionsModal from "./lib/components/modals/MoreActionsModal.svelte";
  import CalendarSyncReviewModal from "./lib/components/modals/CalendarSyncReviewModal.svelte";
  import DroppedNotesModal from "./lib/components/modals/DroppedNotesModal.svelte";
  import SyncConflictsModal from "./lib/components/modals/SyncConflictsModal.svelte";
  import OneDriveFolderPickerModal from "./lib/components/modals/OneDriveFolderPickerModal.svelte";
  import EditorContextMenu from "./lib/components/EditorContextMenu.svelte";
  import {
    actionsPaneShare,
    editorContextMenu,
    historyPaneShare,
    oneDriveFolderPickerOpen,
    statusBarVisible,
    syncHealthPopoverOpen,
  } from "./lib/stores";
  import { overlays, topOverlay, type Overlay } from "./lib/overlays";

  let ready = $state(false);
  let bootError = $state("");

  onMount(() => {
    controller.initApp().then(
      () => {
        ready = true;
      },
      (e) => {
        // The Rust side already recovers a corrupt config / session file
        // (renames it aside, falls back to a default). This only fires for
        // something rarer — an unwritable config directory, say — and a
        // readable message beats an endless "Loading…" spinner.
        bootError = e instanceof Error ? e.message : String(e);
      },
    );
    controller.initWindowChromeWatcher();

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
        if (dockedPane === "actions") {
          if (document.querySelector(".actions-pane")?.contains(document.activeElement)) editorApi?.focus();
          else document.querySelector<HTMLElement>(".actions-pane .modal-input")?.focus();
        } else {
          controller.openActionDrawer();
        }
      },
      openHistory: () => {
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
    window.addEventListener("keydown", noteEscapeStart, true);

    // `top` is the overlay to close (null = none: then Zen / Peek may end, when allowed).
    function dismissTopOverlayAndReturnTrue(top: Overlay | null, allowModeExit = true): boolean {
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

    function modalOwnsKeyboard(e: KeyboardEvent): boolean {
      if (get(modal) === "none") return false;
      if (
        dockedPane &&
        !(e.target instanceof Element && e.target.closest(`.${dockedPane}-pane`))
      ) {
        return false;
      }
      return true;
    }

    function onKeydown(e: KeyboardEvent) {
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
      if (matchesShortcut(e, "findInNote")) {
        if (modalOwnsKeyboard(e)) return;
        // Catches Ctrl/Cmd+F when focus is in the find input or elsewhere
        // outside the editor (the editor's own keymap covers the rest).
        e.preventDefault();
        findOpen.set(true);
        // The bar isn't mounted in this tick — re-select on the next frame
        // so a second Ctrl/Cmd+F re-focuses the query.
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>(".find-bar .find-input")?.select(),
        );
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
    // Touch-first devices only (any browser whose primary input is coarse —
    // phones/tablets hitting the web app or demo). Deliberately NOT
    // width-based: the desktop window's minimum width (640px) is below any
    // sensible width threshold, and a narrow desktop window has its own
    // designed behaviour (the top bar collapses into "More actions", #56)
    // that the mobile layout would otherwise replace.
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updateMobile = () => isMobile.set(mediaQuery.matches);
    const updateWidth = () => {
      const w = window.innerWidth;
      windowInnerWidth = w;
      windowWidth.set(w);
    };
    const onWindowResize = () => {
      updateMobile();
      updateWidth();
    };
    updateMobile();
    updateWidth();
    mediaQuery.addEventListener("change", updateMobile);
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("orientationchange", onWindowResize);

    const unwireViewport = wireMobileViewport();
    const unwirePeek = controller.wirePeek();
    const unwireCallNote = controller.wireCallNote();
    const unwireOccurrenceHint = controller.wireOccurrenceHint();
    const installedApp = window.matchMedia("(display-mode: standalone), (display-mode: window-controls-overlay)");
    const unwireContextMenuGuard = wireContextMenuGuard(() =>
      suppressesNativeContextMenu(get(backendKind), installedApp.matches),
    );

    // §v0.12.2: Full-screen Drag and Drop file import (Area 4)
    let dragDepth = 0;
    function onWindowDragEnter(e: DragEvent) {
      if (get(backendKind) !== "web" && get(backendKind) !== "demo") return;
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        dragDepth++;
        isDraggingFile = true;
      }
    }
    function onWindowDragLeave(e: DragEvent) {
      if (get(backendKind) !== "web" && get(backendKind) !== "demo") return;
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        dragDepth--;
        if (dragDepth <= 0) {
          dragDepth = 0;
          isDraggingFile = false;
        }
      }
    }
    function onWindowDragOver(e: DragEvent) {
      if (get(backendKind) !== "web" && get(backendKind) !== "demo") return;
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    }
    async function onWindowDrop(e: DragEvent) {
      if (get(backendKind) !== "web" && get(backendKind) !== "demo") return;
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      dragDepth = 0;
      isDraggingFile = false;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;

      const jsonFile = files.find((f) => f.name.endsWith(".json"));
      if (jsonFile) {
        await controller.handleDroppedBundle(jsonFile);
        return;
      }

      const txtFiles = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f.name));
      if (txtFiles.length > 0) {
        await controller.handleDroppedNotes(txtFiles);
        return;
      }

      controller.showToast(get(t)("toast.dragDrop.unsupportedFile", undefined));
    }

    window.addEventListener("keydown", onKeydown);
    window.addEventListener("dragenter", onWindowDragEnter);
    window.addEventListener("dragleave", onWindowDragLeave);
    // Ctrl+wheel (Cmd+wheel on macOS) over the note: font size up/down by 1px per notch, within the Settings range.
    // Saved once the wheel stops, not per notch. Also keeps the WebView from zooming the whole page.
    let wheelAcc = 0;
    let fontSaveTimer: ReturnType<typeof setTimeout> | undefined;
    const onEditorWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (!(e.target instanceof Element && e.target.closest("#editor-container"))) return;
      e.preventDefault();
      wheelAcc += e.deltaY;
      // A mouse notch is ~100; a touchpad pinch sends many small deltas, so add them up first.
      if (Math.abs(wheelAcc) < 50) return;
      const step = wheelAcc < 0 ? 1 : -1;
      wheelAcc = 0;
      const next = Math.min(18, Math.max(12, Math.round(get(fontSize)) + step));
      if (next === get(fontSize)) return;
      fontSize.set(next);
      clearTimeout(fontSaveTimer);
      fontSaveTimer = setTimeout(() => void controller.setFontSize(next), 400);
    };
    window.addEventListener("wheel", onEditorWheel, { passive: false });
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);

    const backNav = wireMobileBackNavigation({
      hasOpenOverlay: () => get(overlays).length > 0 || get(isZenMode),
      closeActiveOverlay: () => {
        dismissTopOverlayAndReturnTrue(get(topOverlay));
      },
    });

    return () => {
      unwireViewport();
      unwireOccurrenceHint();
      unwireContextMenuGuard();
      unwireCallNote();
      backNav.destroy();
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("keydown", noteEscapeStart, true);
      window.removeEventListener("dragenter", onWindowDragEnter);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("wheel", onEditorWheel);
      clearTimeout(fontSaveTimer);
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
      mediaQuery.removeEventListener("change", updateMobile);
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("orientationchange", onWindowResize);
      clearTimeout(cursorDebounceTimer);
    };
  });

  // Keep back navigation history synchronized with whether any overlay/modal is open.
  $effect(() => {
    if (typeof window !== "undefined") {
      const hasOverlay =
        $oneDriveFolderPickerOpen ||
        $mobileTabDrawerOpen ||
        $modal !== "none" ||
        $findOpen ||
        $isZenMode;
      // Only push/pop history in web/demo modes where browser back exists
      if ($backendKind !== "desktop") {
        // Dispatched to back navigation sync handler
        window.dispatchEvent(new CustomEvent("chrononote:overlaychange", { detail: { hasOverlay } }));
      }
    }
  });

  let isDraggingFile = $state(false);

  $effect.pre(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--editor-font-size", `${$fontSize}px`);
      document.documentElement.style.setProperty("--editor-line-height", `${$lineHeight}`);
    }
  });

  // Only touch the native window when Zen actually flips: on startup the value is already
  // false and there is nothing to undo (this used to force "leave fullscreen" on every launch).
  let zenFullscreenApplied = false;
  let zenWindow: ReturnType<typeof createZenWindowController> | undefined;
  $effect.pre(() => {
    if (typeof document !== "undefined") {
      document.body.classList.toggle("zen-mode", $isZenMode);
      if ($backendKind === "desktop" && $isZenMode !== zenFullscreenApplied) {
        zenFullscreenApplied = $isZenMode;
        zenWindow ??= createZenWindowController(nativeZenWindow());
        void zenWindow.set($isZenMode);
      }
    }
  });

  // Peek mode (compact note window): the body class swaps the layout and makes the background see-through.
  $effect.pre(() => {
    if (typeof document !== "undefined") {
      document.body.classList.toggle("peek-mode", $peekMode);
      // In focus (you typed or moved the pointer over it recently) the background is (usually) more solid and fades
      // back after `fadeSeconds`; the header strip is 5 points more solid than the background so it stays readable.
      document.body.classList.toggle("peek-in-focus", $peekInFocus);
      const peekOpacity = $peekInFocus ? $peekSettings.opacityHover : $peekSettings.opacity;
      document.documentElement.style.setProperty("--peek-opacity", String(peekOpacity));
      document.documentElement.style.setProperty("--peek-bar-opacity", String(Math.min(100, peekOpacity + 5)));
    }
  });

  const activeTab = $derived($tabs.find((t) => t.id === $activeTabId));
  const settingsPage = $derived(!$isMobile && $modal === "settings");

  let windowInnerWidth = $state(typeof window !== "undefined" ? window.innerWidth : 1200);
  const paneDocked = $derived(windowInnerWidth >= 1000 && !$isMobile && !$isZenMode && !$peekMode);
  const dockedPane = $derived(($modal === "history" || $modal === "actions") && paneDocked ? $modal : null);

  let isDraggingPane = $state<"history" | "actions" | null>(null);
  let previousUserSelect = "";

  function computePaneWidth(share: number, windowWidth: number): number {
    const raw = share * windowWidth;
    const minW = 300;
    const maxW = Math.max(minW, windowWidth - 420);
    return Math.min(maxW, Math.max(minW, raw));
  }

  function handlePointerDown(pane: "history" | "actions", e: PointerEvent) {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    isDraggingPane = pane;
    previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
  }

  function handlePointerMove(pane: "history" | "actions", e: PointerEvent) {
    if (isDraggingPane !== pane) return;
    const rawShare = (windowInnerWidth - e.clientX) / windowInnerWidth;
    const minShare = Math.max(0.18, 300 / windowInnerWidth);
    const maxShare = Math.min(0.60, (windowInnerWidth - 420) / windowInnerWidth);
    const clampedShare = Math.min(maxShare, Math.max(minShare, rawShare));
    if (pane === "history") {
      historyPaneShare.set(clampedShare);
    } else {
      actionsPaneShare.set(clampedShare);
    }
  }

  function handlePointerUp(pane: "history" | "actions", e: PointerEvent) {
    if (isDraggingPane !== pane) return;
    isDraggingPane = null;
    document.body.style.userSelect = previousUserSelect;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (pane === "history") {
      void controller.setHistoryPaneShare(get(historyPaneShare));
    } else {
      void controller.setActionsPaneShare(get(actionsPaneShare));
    }
  }

  function handleResizerKeyDown(pane: "history" | "actions", e: KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const current = get(pane === "history" ? historyPaneShare : actionsPaneShare);
      const delta = e.key === "ArrowLeft" ? 0.02 : -0.02;
      const rawShare = current + delta;
      const minShare = Math.max(0.18, 300 / windowInnerWidth);
      const maxShare = Math.min(0.60, (windowInnerWidth - 420) / windowInnerWidth);
      const clampedShare = Math.min(maxShare, Math.max(minShare, rawShare));
      if (pane === "history") {
        void controller.setHistoryPaneShare(clampedShare);
      } else {
        void controller.setActionsPaneShare(clampedShare);
      }
    }
  }

  function handleResizerDblClick(pane: "history" | "actions") {
    if (pane === "history") {
      void controller.setHistoryPaneShare(0.30);
    } else {
      void controller.setActionsPaneShare(0.30);
    }
  }

  $effect(() => {
    historyDocked.set(paneDocked);
  });

  let wasDockedPane: "history" | "actions" | null = null;
  $effect(() => {
    const current = dockedPane;
    if (wasDockedPane !== null && current === null && $modal === wasDockedPane) {
      controller.closeAllModals();
    }
    wasDockedPane = current;
  });

  let cursorDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const curSec = $cursorSection;
    const isDockedOpen = dockedPane === "history";
    const currentTarget = $historyTargetHeader;
    if (isDockedOpen && curSec && curSec.toLowerCase() !== currentTarget.toLowerCase()) {
      clearTimeout(cursorDebounceTimer);
      cursorDebounceTimer = setTimeout(() => {
        if (dockedPane === "history") {
          void controller.refreshHistoryForCursor();
        }
      }, 250);
    } else if (!curSec) {
      clearTimeout(cursorDebounceTimer);
    }
  });

  // §108: a modal opening over an open find bar leaves the bar stranded
  // behind the overlay — close it. (`find.clear()` is synchronous, so
  // this can't retrigger itself the way an awaited `$:` block can.)
  $effect(() => {
    if ($modal !== "none" && $findOpen) {
      editorApi?.find.clear();
      findOpen.set(false);
    }
  });

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  function handleTouchStart(e: TouchEvent) {
    if (!$isMobile || e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }

  function handleTouchEnd(e: TouchEvent) {
    if (!$isMobile || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;

    // Fast horizontal swipe: > 60px, primarily horizontal (1.6x vertical), < 450ms
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 450) {
      if (dx < 0) {
        controller.cycleTab(1);
      } else {
        controller.cycleTab(-1);
      }
    }
  }

  function handleToastClick() {
    if ($toastAction) {
      controller.runToastAction();
    } else {
      controller.dismissToast();
    }
  }

  function handleToastKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToastClick();
    }
  }
</script>

{#if ready}
  {#if $isMobile}
    <MobileAppBar />
  {:else}
    <TopBar />
  {/if}
  {#if $peekMode}
    <PeekBar />
  {/if}
  {#if $isZenMode}
    <div id="zen-banner" role="status" aria-live="polite">
      <span>Zen mode</span>
      <button class="zen-exit-btn" onclick={() => isZenMode.set(false)}>Exit</button>
    </div>
  {/if}
  {#if isDraggingFile && ($backendKind === "web" || $backendKind === "demo")}
    <div id="drop-overlay" aria-hidden="true">
      <div class="drop-banner">
        <Icon name="import" size={24} />
        <span>Drop .json export bundle or .txt notes to import</span>
      </div>
    </div>
  {/if}
  {#if !$isMobile && $toastMessage.length > LONG_TOAST_CHARS}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="long-toast"
      class:interactive={Boolean($toastAction)}
      role={$toastAction ? "button" : "status"}
      tabindex={$toastAction ? 0 : -1}
      aria-live="polite"
      onclick={handleToastClick}
      onkeydown={handleToastKeydown}
    >
      {$toastMessage}
    </div>
  {/if}
  {#if $isMobile && $toastMessage}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="mobile-toast"
      class:interactive={Boolean($toastAction)}
      role={$toastAction ? "button" : "status"}
      tabindex={$toastAction ? 0 : -1}
      aria-live="polite"
      onclick={handleToastClick}
      onkeydown={handleToastKeydown}
    >
      {$toastMessage}
    </div>
  {/if}
  {#if settingsPage}
    <SettingsModal page />
  {:else}
    <InfoBar />
  {/if}
  <!-- The Settings page covers the note area; the editor stays mounted underneath (undo history, scroll, caret). -->
  <div class="workspace-row" style:display={settingsPage ? "none" : null}>
    <div
      id="editor-container"
      role="region"
      aria-label="Editor notes area"
      ontouchstart={handleTouchStart}
      ontouchend={handleTouchEnd}
    >
      {#if activeTab}
        {#key activeTab.id}
          <EditorPane content={activeTab.content} tabId={activeTab.id} />
        {/key}
      {/if}
      {#if $findOpen}
        <FindBar />
      {/if}
    </div>
    {#if dockedPane === "history"}
      <aside
        class="history-pane"
        aria-label={$t("history.modal.ariaLabel")}
        style:width="{computePaneWidth($historyPaneShare, windowInnerWidth)}px"
      >
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="pane-resizer"
          class:dragging={isDraggingPane === "history"}
          role="separator"
          aria-orientation="vertical"
          aria-label={$t("pane.resize")}
          tabindex="0"
          onpointerdown={(e) => handlePointerDown("history", e)}
          onpointermove={(e) => handlePointerMove("history", e)}
          onpointerup={(e) => handlePointerUp("history", e)}
          onpointercancel={(e) => handlePointerUp("history", e)}
          onkeydown={(e) => handleResizerKeyDown("history", e)}
          ondblclick={() => handleResizerDblClick("history")}
        ></div>
        <HistoryModal docked />
      </aside>
    {/if}
    {#if dockedPane === "actions"}
      <aside
        class="actions-pane"
        aria-label={$t("actionDrawer.modal.ariaLabel")}
        style:width="{computePaneWidth($actionsPaneShare, windowInnerWidth)}px"
      >
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="pane-resizer"
          class:dragging={isDraggingPane === "actions"}
          role="separator"
          aria-orientation="vertical"
          aria-label={$t("pane.resize")}
          tabindex="0"
          onpointerdown={(e) => handlePointerDown("actions", e)}
          onpointermove={(e) => handlePointerMove("actions", e)}
          onpointerup={(e) => handlePointerUp("actions", e)}
          onpointercancel={(e) => handlePointerUp("actions", e)}
          onkeydown={(e) => handleResizerKeyDown("actions", e)}
          ondblclick={() => handleResizerDblClick("actions")}
        ></div>
        <ActionDrawerModal docked />
      </aside>
    {/if}
  </div>
  {#if $isMobile && $editorFocused}
    <MobileAccessoryBar />
  {/if}
  {#if $isMobile}
    {#if !$editorFocused}
      <MobileNavBar />
    {/if}
  {:else if $statusBarVisible}
    <StatusBar />
  {/if}

  {#if $mobileTabDrawerOpen}
    <MobileTabDrawer />
  {/if}

  {#if $oneDriveFolderPickerOpen}
    <OneDriveFolderPickerModal onClose={() => oneDriveFolderPickerOpen.set(false)} />
  {/if}

  {#if $syncHealthPopoverOpen}
    <SyncHealthPopover />
  {/if}

  {#if $editorContextMenu}
    <EditorContextMenu />
  {/if}

  {#if !$isMobile && !isMac}
    <KeyTips />
  {/if}


  {#if $modal === "date"}
    <DatePickerModal />
  {:else if $modal === "actions" && !paneDocked}
    <ActionDrawerModal />
  {:else if $modal === "history" && !paneDocked}
    <HistoryModal />
  {:else if $modal === "search"}
    <SearchModal />
  {:else if $modal === "safety"}
    <SafetyModal />
  {:else if $modal === "settings" && $isMobile}
    <SettingsModal />
  {:else if $modal === "shortcuts"}
    <ShortcutsModal />
  {:else if $modal === "about" && $isMobile}
    <AboutModal />
  {:else if $modal === "unsavedScratchpads"}
    <UnsavedScratchpadsModal />
  {:else if $modal === "conflict"}
    <ConflictModal />
  {:else if $modal === "commandPalette"}
    <CommandPaletteModal />
  {:else if $modal === "topBarMore"}
    <MoreActionsModal />
  {:else if $modal === "syncReview"}
    <CalendarSyncReviewModal />
  {:else if $modal === "syncConflicts"}
    <SyncConflictsModal />
  {:else if $modal === "droppedNotes"}
    <DroppedNotesModal />
  {/if}
{:else if bootError}
  <div class="boot-loading" role="alert">
    ChronoNote couldn't start.<br />
    <span style="opacity: 0.7; font-size: 12px;">{bootError}</span>
  </div>
{:else}
  <div class="boot-loading">Loading ChronoNote…</div>
{/if}

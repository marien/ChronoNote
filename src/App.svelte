<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import * as controller from "./lib/controller";
  import {
    activeTabId,
    backendKind,
    editorApi,
    findOpen,
    fontSize,
    isMobile,
    isZenMode,
    lineHeight,
    modal,
    mobileTabDrawerOpen,
    scratchpadGateContext,
    tabs,
    toastMessage,
  } from "./lib/controller";
  import { matchesShortcut } from "./lib/shortcuts";
  import { wireMobileViewport } from "./lib/mobileViewport";
  import Icon from "./lib/icons/Icon.svelte";
  import TopBar from "./lib/components/TopBar.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
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
  import { oneDriveFolderPickerOpen } from "./lib/stores";

  let ready = false;
  let bootError = "";

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
      openActions: () => controller.openActionDrawer(),
      openHistory: () => controller.openMeetingHistory(),
      crossTabSearch: () => controller.openCrossTabSearch(),
      syncCalendar: () => controller.syncCalendarFromFile(),
      copyToNextOccurrence: () => controller.copySelectionToNextOccurrence(),
      openSettings: () => controller.openSettings(),
      openAbout: () => controller.openAbout(),
      openShortcutsHelp: () => controller.openShortcutsHelp(),
      toggleZenMode: () => {
        if (get(backendKind) !== "android") isZenMode.update((v) => !v);
      },
    };

    function onKeydown(e: KeyboardEvent) {
      // Desktop app only: F11 as an alias for the Zen mode chord (see `shortcuts.ts`).
      if (e.key === "F11" && get(backendKind) === "desktop") {
        e.preventDefault();
        isZenMode.update((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        const current = get(modal);
        if (current === "none" && get(findOpen)) {
          // §108: close the find bar even if focus has moved back to the editor.
          editorApi?.find.clear();
          findOpen.set(false);
          return;
        }
        if (current === "safety") controller.cancelSafetyClose();
        else if (current === "conflict") {
          /* a disk-vs-memory conflict needs an explicit choice — Escape is a no-op */
        } else if (current === "unsavedScratchpads")
          get(scratchpadGateContext) === "close"
            ? controller.cancelAppClose()
            : controller.cancelDirectorySwitch();
        else if (current !== "none") controller.closeAllModals();
        else if (get(isZenMode)) {
          isZenMode.set(false);
          e.preventDefault();
        }
        return;
      }

      // Ctrl/Cmd+K and Ctrl/Cmd+F are top-level but ignored while any
      // modal is up (the find bar would just mount hidden behind the
      // overlay) — the one bit of behavior too bespoke for the generic
      // table below.
      if (matchesShortcut(e, "commandPalette")) {
        if (get(modal) !== "none") return;
        e.preventDefault();
        controller.openCommandPalette();
        return;
      }
      if (matchesShortcut(e, "findInNote")) {
        if (get(modal) !== "none") return;
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
    // Touch-first devices only (Android, or any browser whose primary input
    // is coarse — phones/tablets hitting the web app or demo). Deliberately
    // NOT width-based: the desktop window's minimum width (640px) is below
    // any sensible width threshold, and a narrow desktop window has its own
    // designed behaviour (the top bar collapses into "More actions", #56)
    // that the mobile layout would otherwise replace.
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updateMobile = () => {
      const isAndroidEnv = get(backendKind) === "android" || /android/i.test(navigator.userAgent);
      isMobile.set(isAndroidEnv || mediaQuery.matches);
    };
    updateMobile();
    mediaQuery.addEventListener("change", updateMobile);
    window.addEventListener("resize", updateMobile);
    window.addEventListener("orientationchange", updateMobile);

    const unwireViewport = wireMobileViewport();

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

      controller.showToast("Unsupported file. Drop a .json export bundle or YYYY-MM-DD.txt note.");
    }

    window.addEventListener("keydown", onKeydown);
    window.addEventListener("dragenter", onWindowDragEnter);
    window.addEventListener("dragleave", onWindowDragLeave);
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);

    return () => {
      unwireViewport();
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("dragenter", onWindowDragEnter);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
      mediaQuery.removeEventListener("change", updateMobile);
      window.removeEventListener("resize", updateMobile);
      window.removeEventListener("orientationchange", updateMobile);
    };
  });

  let isDraggingFile = false;

  $: if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--editor-font-size", `${$fontSize}px`);
    document.documentElement.style.setProperty("--editor-line-height", `${$lineHeight}`);
  }

  // Only touch the native window when Zen actually flips: on startup the value is already
  // false and there is nothing to undo (this used to force "leave fullscreen" on every launch).
  let zenFullscreenApplied = false;
  $: if (typeof document !== "undefined") {
    document.body.classList.toggle("zen-mode", $isZenMode);
    if ($backendKind === "desktop" && $isZenMode !== zenFullscreenApplied) {
      zenFullscreenApplied = $isZenMode;
      getCurrentWindow().setFullscreen($isZenMode).catch(() => {});
    }
  }

  $: activeTab = $tabs.find((t) => t.id === $activeTabId);

  // §108: a modal opening over an open find bar leaves the bar stranded
  // behind the overlay — close it. (`find.clear()` is synchronous, so
  // this can't retrigger itself the way an awaited `$:` block can.)
  $: if ($modal !== "none" && $findOpen) {
    editorApi?.find.clear();
    findOpen.set(false);
  }

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
</script>

{#if ready}
  <TopBar />
  {#if $isZenMode}
    <div id="zen-banner" role="status" aria-live="polite">
      <span>Zen mode</span>
      <button class="zen-exit-btn" on:click={() => isZenMode.set(false)}>Exit</button>
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
  {#if $isMobile && $toastMessage}
    <div class="mobile-toast" role="status" aria-live="polite">
      {$toastMessage}
    </div>
  {/if}
  <div
    id="editor-container"
    role="region"
    aria-label="Editor notes area"
    on:touchstart={handleTouchStart}
    on:touchend={handleTouchEnd}
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
  {#if $isMobile}
    <MobileAccessoryBar />
  {/if}
  <StatusBar />

  {#if $mobileTabDrawerOpen}
    <MobileTabDrawer />
  {/if}

  {#if $oneDriveFolderPickerOpen}
    <OneDriveFolderPickerModal onClose={() => oneDriveFolderPickerOpen.set(false)} />
  {/if}


  {#if $modal === "date"}
    <DatePickerModal />
  {:else if $modal === "actions"}
    <ActionDrawerModal />
  {:else if $modal === "history"}
    <HistoryModal />
  {:else if $modal === "search"}
    <SearchModal />
  {:else if $modal === "safety"}
    <SafetyModal />
  {:else if $modal === "settings"}
    <SettingsModal />
  {:else if $modal === "shortcuts"}
    <ShortcutsModal />
  {:else if $modal === "about"}
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

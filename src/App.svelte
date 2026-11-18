<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
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
    tabs,
    peekMode,
    peekInFocus,
    peekDocked,
    peekSettings,
    windowWidth,
  } from "./lib/controller";
  import { t } from "./lib/i18n";
  import { wireMobileViewport } from "./lib/mobileViewport";
  import { wireMobileBackNavigation } from "./lib/mobileNavigation";
  import { suppressesNativeContextMenu, wireContextMenuGuard } from "./lib/contextMenuGuard";
  import { createZenWindowController } from "./lib/zenWindow";
  import Icon from "./lib/icons/Icon.svelte";
  import TopBar from "./lib/components/TopBar.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import InfoBar from "./lib/components/InfoBar.svelte";
  import NavToast from "./lib/components/NavToast.svelte";
  import MobileAppBar from "./lib/components/mobile/MobileAppBar.svelte";
  import MobileNavBar from "./lib/components/mobile/MobileNavBar.svelte";
  import PeekBar from "./lib/components/PeekBar.svelte";
  import EditorPane from "./lib/components/EditorPane.svelte";
  import FindBar from "./lib/components/FindBar.svelte";
  import MobileAccessoryBar from "./lib/components/mobile/MobileAccessoryBar.svelte";
  import MobileTabDrawer from "./lib/components/mobile/MobileTabDrawer.svelte";
  import DueDatePickerHost from "./lib/components/DueDatePickerHost.svelte";
  import ActionDrawerModal from "./lib/components/modals/ActionDrawerModal.svelte";
  import HistoryModal from "./lib/components/modals/HistoryModal.svelte";
  import SettingsModal from "./lib/components/modals/SettingsModal.svelte";
  import WeekReviewModal from "./lib/components/modals/WeekReviewModal.svelte";
  import PersonModal from "./lib/components/modals/PersonModal.svelte";
  import {
    actionsPaneShare,
    historyPaneShare,
    oneDriveFolderPickerOpen,
    personViewName,
    statusBarVisible,
  } from "./lib/stores";
  import { overlays, topOverlay } from "./lib/overlays";
  import Toasts from "./app/Toasts.svelte";
  import ModalHosts from "./app/ModalHosts.svelte";
  import { createWindowKeyboardHandler, dismissTopOverlayAndReturnTrue } from "./app/keyboard";
  import {
    computePaneWidth,
    createEditorWheelHandler,
    nativeZenWindow,
    onMouseNav,
    type DockedPaneKind,
  } from "./app/windowHelpers";

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

    const { noteEscapeStart, onKeydown } = createWindowKeyboardHandler(() => dockedPane);
    window.addEventListener("keydown", noteEscapeStart, true);
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
    const { onEditorWheel, clearFontSaveTimer } = createEditorWheelHandler();
    window.addEventListener("wheel", onEditorWheel, { passive: false });
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);

    window.addEventListener("mouseup", onMouseNav);
    window.addEventListener("auxclick", onMouseNav);

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
      window.removeEventListener("mouseup", onMouseNav);
      window.removeEventListener("auxclick", onMouseNav);
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("keydown", noteEscapeStart, true);
      window.removeEventListener("dragenter", onWindowDragEnter);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("wheel", onEditorWheel);
      clearFontSaveTimer();
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
      // §393: docked, nothing is behind Peek, so its background is solid.
      const peekOpacity = $peekDocked ? 100 : $peekInFocus ? $peekSettings.opacityHover : $peekSettings.opacity;
      document.documentElement.style.setProperty("--peek-opacity", String(peekOpacity));
      document.documentElement.style.setProperty("--peek-bar-opacity", String(Math.min(100, peekOpacity + 5)));
    }
  });

  const activeTab = $derived($tabs.find((t) => t.id === $activeTabId));
  const settingsPage = $derived(!$isMobile && $modal === "settings");

  let windowInnerWidth = $state(typeof window !== "undefined" ? window.innerWidth : 1200);
  const paneDocked = $derived(windowInnerWidth >= 1000 && !$isMobile && !$isZenMode && !$peekMode);
  const dockedPane = $derived(($modal === "history" || $modal === "actions" || $modal === "weekReview" || $modal === "person") && paneDocked ? $modal : null);

  let isDraggingPane = $state<DockedPaneKind | null>(null);
  let previousUserSelect = "";

  function handlePointerDown(pane: DockedPaneKind, e: PointerEvent) {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    isDraggingPane = pane;
    previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
  }

  function handlePointerMove(pane: DockedPaneKind, e: PointerEvent) {
    if (isDraggingPane !== pane) return;
    const rawShare = (windowInnerWidth - e.clientX) / windowInnerWidth;
    const minShare = Math.max(0.18, 180 / windowInnerWidth);
    const maxShare = Math.min(0.60, (windowInnerWidth - 420) / windowInnerWidth);
    const clampedShare = Math.min(maxShare, Math.max(minShare, rawShare));
    if (pane === "history") {
      historyPaneShare.set(clampedShare);
    } else {
      actionsPaneShare.set(clampedShare);
    }
  }

  function handlePointerUp(pane: DockedPaneKind, e: PointerEvent) {
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

  function handleResizerKeyDown(pane: DockedPaneKind, e: KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const current = get(pane === "history" ? historyPaneShare : actionsPaneShare);
      const delta = e.key === "ArrowLeft" ? 0.02 : -0.02;
      const rawShare = current + delta;
      const minShare = Math.max(0.18, 180 / windowInnerWidth);
      const maxShare = Math.min(0.60, (windowInnerWidth - 420) / windowInnerWidth);
      const clampedShare = Math.min(maxShare, Math.max(minShare, rawShare));
      if (pane === "history") {
        void controller.setHistoryPaneShare(clampedShare);
      } else {
        void controller.setActionsPaneShare(clampedShare);
      }
    }
  }

  function handleResizerDblClick(pane: DockedPaneKind) {
    if (pane === "history") {
      void controller.setHistoryPaneShare(0.30);
    } else {
      void controller.setActionsPaneShare(0.30);
    }
  }

  $effect(() => {
    historyDocked.set(paneDocked);
  });

  let wasDockedPane: DockedPaneKind | null = null;
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
  // this effect can't retrigger itself the way one that awaits can.)
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
  <Toasts />
  {#if settingsPage}
    <SettingsModal page />
  {:else}
    <InfoBar />
  {/if}
  <NavToast />
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
          aria-valuenow={Math.round($historyPaneShare * 100)}
          aria-valuemin={18}
          aria-valuemax={60}
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
          aria-valuenow={Math.round($actionsPaneShare * 100)}
          aria-valuemin={18}
          aria-valuemax={60}
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
    {#if dockedPane === "weekReview"}
      <aside
        class="week-review-pane"
        aria-label={$t("weekReview.modal.ariaLabel")}
        style:width="{computePaneWidth($actionsPaneShare, windowInnerWidth)}px"
      >
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="pane-resizer"
          class:dragging={isDraggingPane === "weekReview"}
          role="separator"
          aria-orientation="vertical"
          aria-label={$t("pane.resize")}
          aria-valuenow={Math.round($actionsPaneShare * 100)}
          aria-valuemin={18}
          aria-valuemax={60}
          tabindex="0"
          onpointerdown={(e) => handlePointerDown("weekReview", e)}
          onpointermove={(e) => handlePointerMove("weekReview", e)}
          onpointerup={(e) => handlePointerUp("weekReview", e)}
          onpointercancel={(e) => handlePointerUp("weekReview", e)}
          onkeydown={(e) => handleResizerKeyDown("weekReview", e)}
          ondblclick={() => handleResizerDblClick("weekReview")}
        ></div>
        <WeekReviewModal docked />
      </aside>
    {/if}
    {#if dockedPane === "person"}
      <aside
        class="person-pane"
        aria-label={$t("personView.ariaLabel", { name: $personViewName ?? "" })}
        style:width="{computePaneWidth($actionsPaneShare, windowInnerWidth)}px"
      >
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="pane-resizer"
          class:dragging={isDraggingPane === "person"}
          role="separator"
          aria-orientation="vertical"
          aria-label={$t("pane.resize")}
          aria-valuenow={Math.round($actionsPaneShare * 100)}
          aria-valuemin={18}
          aria-valuemax={60}
          tabindex="0"
          onpointerdown={(e) => handlePointerDown("person", e)}
          onpointermove={(e) => handlePointerMove("person", e)}
          onpointerup={(e) => handlePointerUp("person", e)}
          onpointercancel={(e) => handlePointerUp("person", e)}
          onkeydown={(e) => handleResizerKeyDown("person", e)}
          ondblclick={() => handleResizerDblClick("person")}
        ></div>
        <PersonModal docked />
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

  <ModalHosts {paneDocked} />

  <DueDatePickerHost />
{:else if bootError}
  <div class="boot-loading" role="alert">
    ChronoNote couldn't start.<br />
    <span style="opacity: 0.7; font-size: 12px;">{bootError}</span>
  </div>
{:else}
  <div class="boot-loading">Loading ChronoNote…</div>
{/if}

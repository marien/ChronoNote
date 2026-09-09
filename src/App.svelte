<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import * as controller from "./lib/controller";
  import { activeTabId, modal, scratchpadGateContext, tabs } from "./lib/controller";
  import TopBar from "./lib/components/TopBar.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import EditorPane from "./lib/components/EditorPane.svelte";
  import DatePickerModal from "./lib/components/modals/DatePickerModal.svelte";
  import ActionDrawerModal from "./lib/components/modals/ActionDrawerModal.svelte";
  import HistoryModal from "./lib/components/modals/HistoryModal.svelte";
  import SearchModal from "./lib/components/modals/SearchModal.svelte";
  import SafetyModal from "./lib/components/modals/SafetyModal.svelte";
  import SectionImportModal from "./lib/components/modals/SectionImportModal.svelte";
  import SettingsModal from "./lib/components/modals/SettingsModal.svelte";
  import ShortcutsModal from "./lib/components/modals/ShortcutsModal.svelte";
  import GlyphLegendModal from "./lib/components/modals/GlyphLegendModal.svelte";
  import AboutModal from "./lib/components/modals/AboutModal.svelte";
  import UnsavedScratchpadsModal from "./lib/components/modals/UnsavedScratchpadsModal.svelte";
  import ConflictModal from "./lib/components/modals/ConflictModal.svelte";
  import CommandPaletteModal from "./lib/components/modals/CommandPaletteModal.svelte";

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

    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const current = get(modal);
        if (current === "safety") controller.cancelSafetyClose();
        else if (current === "conflict") {
          /* a disk-vs-memory conflict needs an explicit choice — Escape is a no-op */
        } else if (current === "unsavedScratchpads")
          get(scratchpadGateContext) === "close"
            ? controller.cancelAppClose()
            : controller.cancelDirectorySwitch();
        else controller.closeAllModals();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        controller.openCommandPalette();
      } else if (e.ctrlKey && !e.shiftKey && (e.code === "KeyN" || e.code === "KeyT")) {
        e.preventDefault();
        controller.createScratchpad();
      } else if (e.ctrlKey && !e.shiftKey && e.code === "KeyO") {
        e.preventDefault();
        controller.openDatePicker();
      } else if (e.ctrlKey && !e.shiftKey && e.code === "KeyW") {
        e.preventDefault();
        controller.requestTabClose(controller.getActiveTabId());
      } else if (e.ctrlKey && e.code === "Tab") {
        e.preventDefault();
        controller.cycleTab(e.shiftKey ? -1 : 1);
      } else if (e.ctrlKey && e.shiftKey && (e.code === "KeyT" || e.code === "KeyN")) {
        e.preventDefault();
        controller.reopenLastClosedTab();
      } else if (e.ctrlKey && e.shiftKey && e.code === "KeyA") {
        e.preventDefault();
        controller.openActionDrawer();
      } else if (e.ctrlKey && e.shiftKey && e.code === "KeyH") {
        e.preventDefault();
        controller.openMeetingHistory();
      } else if (e.ctrlKey && e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        controller.openCrossTabSearch();
      } else if (e.ctrlKey && e.shiftKey && e.code === "KeyI") {
        e.preventDefault();
        controller.openSectionImport();
      } else if (e.ctrlKey && !e.shiftKey && e.code === "Comma") {
        e.preventDefault();
        controller.openSettings();
      } else if (e.ctrlKey && e.shiftKey && e.code === "Comma") {
        e.preventDefault();
        controller.openAbout();
      } else if (e.ctrlKey && !e.shiftKey && e.code === "Slash") {
        e.preventDefault();
        controller.openShortcutsHelp();
      } else if (e.ctrlKey && e.shiftKey && e.code === "Slash") {
        e.preventDefault();
        controller.openGlyphLegend();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });

  $: activeTab = $tabs.find((t) => t.id === $activeTabId);
</script>

{#if ready}
  <TopBar />
  <div id="editor-container">
    {#if activeTab}
      {#key activeTab.id}
        <EditorPane content={activeTab.content} tabId={activeTab.id} />
      {/key}
    {/if}
  </div>
  <StatusBar />

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
  {:else if $modal === "sectionImport"}
    <SectionImportModal />
  {:else if $modal === "settings"}
    <SettingsModal />
  {:else if $modal === "shortcuts"}
    <ShortcutsModal />
  {:else if $modal === "glyphLegend"}
    <GlyphLegendModal />
  {:else if $modal === "about"}
    <AboutModal />
  {:else if $modal === "unsavedScratchpads"}
    <UnsavedScratchpadsModal />
  {:else if $modal === "conflict"}
    <ConflictModal />
  {:else if $modal === "commandPalette"}
    <CommandPaletteModal />
  {/if}
{:else if bootError}
  <div class="boot-loading" role="alert">
    ChronoNote couldn't start.<br />
    <span style="opacity: 0.7; font-size: 12px;">{bootError}</span>
  </div>
{:else}
  <div class="boot-loading">Loading ChronoNote…</div>
{/if}

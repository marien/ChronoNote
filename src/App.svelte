<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import * as controller from "./lib/controller";
  import { activeTabId, modal, tabs } from "./lib/controller";
  import TopBar from "./lib/components/TopBar.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import EditorPane from "./lib/components/EditorPane.svelte";
  import Toast from "./lib/components/Toast.svelte";
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

  let ready = false;

  onMount(() => {
    controller.initApp().then(() => {
      ready = true;
    });
    controller.initWindowChromeWatcher();

    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const current = get(modal);
        if (current === "safety") controller.cancelSafetyClose();
        else if (current === "unsavedScratchpads") controller.cancelDirectorySwitch();
        else controller.closeAllModals();
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.code === "KeyN" || e.code === "KeyT")) {
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
  <Toast />

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
  {/if}
{:else}
  <div class="boot-loading">Loading ChronoNote…</div>
{/if}

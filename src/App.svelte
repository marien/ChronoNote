<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import * as controller from "./lib/controller";
  import { activeTabId, editorApi, findOpen, modal, scratchpadGateContext, tabs } from "./lib/controller";
  import { matchesShortcut } from "./lib/shortcuts";
  import TopBar from "./lib/components/TopBar.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import EditorPane from "./lib/components/EditorPane.svelte";
  import FindBar from "./lib/components/FindBar.svelte";
  import DatePickerModal from "./lib/components/modals/DatePickerModal.svelte";
  import ActionDrawerModal from "./lib/components/modals/ActionDrawerModal.svelte";
  import HistoryModal from "./lib/components/modals/HistoryModal.svelte";
  import SearchModal from "./lib/components/modals/SearchModal.svelte";
  import SafetyModal from "./lib/components/modals/SafetyModal.svelte";
  import SectionImportModal from "./lib/components/modals/SectionImportModal.svelte";
  import SettingsModal from "./lib/components/modals/SettingsModal.svelte";
  import ShortcutsModal from "./lib/components/modals/ShortcutsModal.svelte";
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
      importSections: () => controller.openSectionImport(),
      openSettings: () => controller.openSettings(),
      openAbout: () => controller.openAbout(),
      openShortcutsHelp: () => controller.openShortcutsHelp(),
    };

    function onKeydown(e: KeyboardEvent) {
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
        else controller.closeAllModals();
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
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });

  $: activeTab = $tabs.find((t) => t.id === $activeTabId);

  // §108: a modal opening over an open find bar leaves the bar stranded
  // behind the overlay — close it. (`find.clear()` is synchronous, so
  // this can't retrigger itself the way an awaited `$:` block can.)
  $: if ($modal !== "none" && $findOpen) {
    editorApi?.find.clear();
    findOpen.set(false);
  }
</script>

{#if ready}
  <TopBar />
  <div id="editor-container">
    {#if activeTab}
      {#key activeTab.id}
        <EditorPane content={activeTab.content} tabId={activeTab.id} />
      {/key}
    {/if}
    {#if $findOpen}
      <FindBar />
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

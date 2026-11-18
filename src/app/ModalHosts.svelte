<script lang="ts">
  import { isMobile, modal } from "../lib/controller";
  import { isMac } from "../lib/platform";
  import KeyTips from "../lib/components/KeyTips.svelte";
  import SyncHealthPopover from "../lib/components/SyncHealthPopover.svelte";
  import DatePickerModal from "../lib/components/modals/DatePickerModal.svelte";
  import ActionDrawerModal from "../lib/components/modals/ActionDrawerModal.svelte";
  import HistoryModal from "../lib/components/modals/HistoryModal.svelte";
  import SearchModal from "../lib/components/modals/SearchModal.svelte";
  import SafetyModal from "../lib/components/modals/SafetyModal.svelte";
  import SettingsModal from "../lib/components/modals/SettingsModal.svelte";
  import ShortcutsModal from "../lib/components/modals/ShortcutsModal.svelte";
  import AboutModal from "../lib/components/modals/AboutModal.svelte";
  import UnsavedScratchpadsModal from "../lib/components/modals/UnsavedScratchpadsModal.svelte";
  import ConflictModal from "../lib/components/modals/ConflictModal.svelte";
  import CommandPaletteModal from "../lib/components/modals/CommandPaletteModal.svelte";
  import MoreActionsModal from "../lib/components/modals/MoreActionsModal.svelte";
  import WeekReviewModal from "../lib/components/modals/WeekReviewModal.svelte";
  import PersonModal from "../lib/components/modals/PersonModal.svelte";
  import RenameModal from "../lib/components/modals/RenameModal.svelte";
  import CalendarSyncReviewModal from "../lib/components/modals/CalendarSyncReviewModal.svelte";
  import DroppedNotesModal from "../lib/components/modals/DroppedNotesModal.svelte";
  import SyncConflictsModal from "../lib/components/modals/SyncConflictsModal.svelte";
  import PhoneChangesModal from "../lib/components/modals/PhoneChangesModal.svelte";
  import OneDriveFolderPickerModal from "../lib/components/modals/OneDriveFolderPickerModal.svelte";
  import ExportModal from "../lib/components/modals/ExportModal.svelte";
  import VersionsModal from "../lib/components/modals/VersionsModal.svelte";
  import EditorContextMenu from "../lib/components/EditorContextMenu.svelte";
  import {
    editorContextMenu,
    oneDriveFolderPickerOpen,
    syncHealthPopoverOpen,
  } from "../lib/stores";
  import { exportModalOpen } from "../lib/overlays";

  let { paneDocked }: { paneDocked: boolean } = $props();
</script>

{#if $oneDriveFolderPickerOpen}
  <OneDriveFolderPickerModal onClose={() => oneDriveFolderPickerOpen.set(false)} />
{/if}

{#if $exportModalOpen}
  <ExportModal />
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
{:else if $modal === "weekReview" && !paneDocked}
  <WeekReviewModal />
{:else if $modal === "person" && !paneDocked}
  <PersonModal />
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
{:else if $modal === "phoneChanges"}
  <PhoneChangesModal />
{:else if $modal === "droppedNotes"}
  <DroppedNotesModal />
{:else if $modal === "versions"}
  <VersionsModal />
{:else if $modal === "rename"}
  <RenameModal />
{/if}

<script lang="ts">
  import {
    appVersion,
    backendKind,
    justUpdatedToVersion,
    statusCounts,
    statusPos,
    statusSelection,
    statusWordCount,
    toastMessage,
    updateStatus,
  } from "../controller";
  import * as controller from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { formatCombo, shortcutById } from "../shortcuts";

  // #37/#38: how many lines the selection covers (not a character count).
  $: selectionLabel = $statusSelection
    ? `${$statusSelection.lines} ${$statusSelection.lines === 1 ? "line" : "lines"} selected`
    : "";
</script>

<div id="status-bar">
  <div class="status-zone status-left">
    <span id="stat-pos">Ln {$statusPos.line}, Col {$statusPos.col}</span>
    {#if selectionLabel}
      <span class="status-sep">·</span>
      <span id="stat-selection">{selectionLabel}</span>
    {/if}
    <span class="status-sep">·</span>
    <span id="stat-words">{$statusWordCount} {$statusWordCount === 1 ? "word" : "words"}</span>
    <span class="status-sep">·</span>
    <span id="stat-open">Open {$statusCounts.open}</span>
    <span class="status-sep">·</span>
    <span id="stat-closed">Closed {$statusCounts.closed}</span>
    <span class="status-sep">·</span>
    <span id="stat-forwarded">Forwarded {$statusCounts.forwarded}</span>
  </div>

  <div class="status-zone status-centre">
    {#if $justUpdatedToVersion}
      <span id="stat-updated" role="status">
        Updated to v{$justUpdatedToVersion} —
        <button type="button" class="status-link" on:click={controller.openJustUpdatedReleaseNotes}>
          What's new
        </button>
      </span>
    {:else if $toastMessage}
      <span id="stat-message" role="status">{$toastMessage}</span>
    {/if}
  </div>

  <div class="status-zone status-right">
    {#if $updateStatus === "available" && $backendKind !== "web"}
      <button type="button" class="status-update-btn" title="Update available — see About" on:click={controller.openAbout}>
        <Icon name="update" size={12} />
      </button>
    {/if}
    {#if $backendKind === "web"}
      <span
        id="stat-storage-tier"
        title="Your notes are stored in this browser only. Export a backup, or install the desktop app for notes that live on your disk."
      >
        Browser storage
      </span>
      <span class="status-sep">·</span>
    {/if}
    {#if $appVersion}<span id="stat-version">v{$appVersion}</span>{/if}
    <button
      type="button"
      class="status-help"
      title="Shortcuts & symbols ({formatCombo(shortcutById('openShortcutsHelp').combos[0])})"
      on:click={controller.openShortcutsHelp}
    >
      ?
    </button>
  </div>
</div>

<script lang="ts">
  import {
    appVersion,
    backendKind,
    folderNameFromPath,
    justUpdatedToVersion,
    notesDir,
    statusCounts,
    statusPos,
    statusSelection,
    statusWordCount,
    toastMessage,
    UPDATE_AVAILABLE_TOAST,
    updateStatus,
  } from "../controller";
  import * as controller from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { formatCombo, shortcutById } from "../shortcuts";

  // #37/#38: how many lines the selection covers (not a character count).
  $: selectionLabel = $statusSelection
    ? `${$statusSelection.lines} ${$statusSelection.lines === 1 ? "line" : "lines"} selected`
    : "";

  // §merged-titlebar: which notes folder is active — moved here from
  // "Settings-only" now that the window title itself no longer renders
  // visibly (the merged title bar has no title text). Meaningless for the
  // web backend (no `notesDir`, IndexedDB-backed instead — the "Browser
  // storage" badge in the right zone already covers that case).
  $: folderName = $notesDir ? folderNameFromPath($notesDir) : "";
</script>

<div id="status-bar">
  <div class="status-zone status-left">
    {#if folderName}
      <span id="stat-folder" class="stat-tier0" title={$notesDir}>{folderName}</span>
      <span class="status-sep stat-tier0">·</span>
    {/if}
    <span id="stat-pos" class="stat-tier2">Ln {$statusPos.line}, Col {$statusPos.col}</span>
    {#if selectionLabel}
      <span class="status-sep stat-tier2">·</span>
      <span id="stat-selection" class="stat-tier2">{selectionLabel}</span>
    {/if}
    <span class="status-sep stat-tier1">·</span>
    <span id="stat-words" class="stat-tier1">{$statusWordCount} {$statusWordCount === 1 ? "word" : "words"}</span>
    <span class="status-sep stat-tier2">·</span>
    <span id="stat-open" class="stat-full">Open {$statusCounts.open}</span>
    <span class="stat-compact">☐ {$statusCounts.open}</span>
    <span class="status-sep">·</span>
    <span id="stat-closed" class="stat-full">Closed {$statusCounts.closed}</span>
    <span class="stat-compact">☑ {$statusCounts.closed}</span>
    <span class="status-sep">·</span>
    <span id="stat-forwarded" class="stat-full">Forwarded {$statusCounts.forwarded}</span>
    <span class="stat-compact">» {$statusCounts.forwarded}</span>
  </div>

  <div class="status-zone status-centre">
    {#if $justUpdatedToVersion}
      <span id="stat-updated" role="status">
        Updated to v{$justUpdatedToVersion} —
        <button type="button" class="status-link" on:click={controller.openJustUpdatedReleaseNotes}>
          What's new
        </button>
      </span>
    {:else if $toastMessage === UPDATE_AVAILABLE_TOAST && $updateStatus === "available"}
      <!-- §update-check follow-up: this specific toast is a shortcut to
           About, not the generic "read and forget" toast — matched by
           exact text (not just `updateStatus === "available"`, which
           persists long after the toast itself fades) so an unrelated
           toast firing while an update happens to be available doesn't
           also render as a misleading link. -->
      <button type="button" id="stat-message" class="status-link" on:click={controller.openAbout}>
        {$toastMessage}
      </button>
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
        class="stat-full"
        title="Your notes are stored in this browser only. Export a backup, or install the desktop app for notes that live on your disk."
      >
        Browser storage
      </span>
      <span
        class="status-storage-dot"
        title="Your notes are stored in this browser only. Export a backup, or install the desktop app for notes that live on your disk."
      ></span>
      <span class="status-sep">·</span>
    {/if}
    {#if $appVersion}
      <button type="button" id="stat-version" title="About ChronoNote" on:click={controller.openAbout}>
        v{$appVersion}
      </button>
    {/if}
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

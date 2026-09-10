<script lang="ts">
  import { appVersion, statusCounts, statusPos, statusSelection, statusWordCount, toastMessage } from "../controller";
  import * as controller from "../controller";

  // #37: "N selected" (chars), with the line span when it's more than one.
  $: selectionLabel = $statusSelection
    ? $statusSelection.lines > 1
      ? `${$statusSelection.lines} lines, ${$statusSelection.chars} selected`
      : `${$statusSelection.chars} selected`
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
    <span id="stat-closed">Closed {$statusCounts.closed}</span>
    <span id="stat-forwarded">Fwd {$statusCounts.forwarded}</span>
  </div>

  <div class="status-zone status-centre">
    {#if $toastMessage}
      <span id="stat-message" role="status">{$toastMessage}</span>
    {/if}
  </div>

  <div class="status-zone status-right">
    {#if $appVersion}<span id="stat-version">v{$appVersion}</span>{/if}
    <button
      type="button"
      class="status-help"
      title="Shortcuts & symbols (Ctrl+/)"
      on:click={controller.openShortcutsHelp}
    >
      ?
    </button>
  </div>
</div>

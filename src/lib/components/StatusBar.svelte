<script lang="ts">
  import {
    activeTabId,
    appVersion,
    saveState,
    statusCounts,
    statusPos,
    statusWordCount,
    tabs,
    toastMessage,
  } from "../controller";
  import * as controller from "../controller";

  $: activeTab = $tabs.find((t) => t.id === $activeTabId);
  $: isScratchpad = activeTab?.isScratchpad ?? false;

  // §100: centre-zone save indicator. Scratchpads never touch disk, so
  // they get their own honest label rather than a stale "saved".
  $: save = isScratchpad
    ? { cls: "mem", label: "In memory only" }
    : $saveState === "saving"
      ? { cls: "saving", label: "Saving…" }
      : $saveState === "error"
        ? { cls: "error", label: "Save failed" }
        : $saveState === "saved"
          ? { cls: "saved", label: "All changes saved" }
          : { cls: "idle", label: "Saved" };
</script>

<div id="status-bar">
  <div class="status-zone status-left">
    <span id="stat-pos">Ln {$statusPos.line}, Col {$statusPos.col}</span>
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
    {:else}
      <span id="stat-save" data-state={save.cls}>
        <span class="save-dot" class:spin={save.cls === "saving"}></span>
        <span>{save.label}</span>
      </span>
    {/if}
  </div>

  <div class="status-zone status-right">
    {#if $appVersion}<span id="stat-version">v{$appVersion}</span>{/if}
    <button
      type="button"
      class="status-help"
      title="Keyboard shortcuts (Ctrl+/)"
      on:click={controller.openShortcutsHelp}
    >
      ?
    </button>
  </div>
</div>

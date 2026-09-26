<script lang="ts">
  import * as controller from "../../controller";
  import { syncConflicts } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import type { SyncConflictResolution } from "../../tauriCommands";
  import { diffLines } from "../../lineDiff";
  import { t } from "../../i18n";

  // The note being shown; falls back to the first when the selected one has
  // just been resolved and dropped out of the list.
  let selectedName = "";
  $: current = $syncConflicts.find((c) => c.name === selectedName) ?? $syncConflicts[0];

  $: diff = current ? diffLines(current.local, current.remote) : { left: [], right: [] };
  $: changedCount = diff.left.filter((r) => r.changed).length + diff.right.filter((r) => r.changed).length;

  let busy = false;
  let viewMode: "both" | "mine" | "theirs" = "both";
  async function choose(resolution: SyncConflictResolution) {
    if (!current || busy) return;
    busy = true;
    try {
      await controller.resolveSyncConflict(current.name, resolution);
    } finally {
      busy = false;
    }
  }

  const label = (name: string) => name.replace(/\.txt$/, "");
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card modal-md" role="dialog" aria-modal="true" use:focusTrap aria-label={$t("syncConflicts.ariaLabel")}>
    <div class="modal-input-wrap modal-title">
      <Icon name="cloud" size={15} />
      <span>{$t("syncConflicts.ariaLabel")}</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label={$t("common.closeDialog")}
        on:click={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>

    {#if current}
      <div class="settings-hint" style="padding: 12px 12px 8px; margin: 0;">
        <strong style="color: var(--text);">{label(current.name)}</strong> {$t("syncConflicts.bodyHintAfter")}
      </div>

      {#if $syncConflicts.length > 1}
        <div class="settings-toggle-row" style="padding: 0 12px 8px; gap: 6px; flex-wrap: wrap;">
          {#each $syncConflicts as c (c.name)}
            <button
              class="icon-btn"
              class:active={c.name === current.name}
              on:click={() => (selectedName = c.name)}>{label(c.name)}</button
            >
          {/each}
        </div>
      {/if}

      <!-- §194: Responsive view switcher for viewports <= 520px -->
      <div class="conflict-view-tabs">
        <button
          type="button"
          class="conflict-view-btn"
          class:active={viewMode === "both"}
          on:click={() => (viewMode = "both")}
        >
          {$t("droppedNotes.tab.sideBySide")}
        </button>
        <button
          type="button"
          class="conflict-view-btn"
          class:active={viewMode === "mine"}
          on:click={() => (viewMode = "mine")}
        >
          {$t("syncConflicts.tab.thisDevice")}
        </button>
        <button
          type="button"
          class="conflict-view-btn"
          class:active={viewMode === "theirs"}
          on:click={() => (viewMode = "theirs")}
        >
          OneDrive
        </button>
      </div>

      <div class="conflict-versions" class:show-both={viewMode === "both"} class:show-mine={viewMode === "mine"} class:show-theirs={viewMode === "theirs"}>
        <div class="conflict-version">
          <div class="conflict-version-label"><span class="conflict-badge">{$t("syncConflicts.badge.thisDevice")}</span></div>
          <div class="conflict-text" data-testid="conflict-local">{#each diff.left as row}<div class="conflict-line" class:changed={row.changed}>{row.text}</div>{/each}</div>
        </div>
        <div class="conflict-version">
          <div class="conflict-version-label"><span class="conflict-badge">OneDrive</span></div>
          <div class="conflict-text" data-testid="conflict-remote">{#each diff.right as row}<div class="conflict-line" class:changed={row.changed}>{row.text}</div>{/each}</div>
        </div>
      </div>
      {#if changedCount > 0}
        <div class="settings-hint" style="padding: 6px 12px 0; margin: 0;">{$t("droppedNotes.highlightedDiffer")}</div>
      {/if}

      <div class="conflict-actions">
        <button class="icon-btn btn-primary" disabled={busy} on:click={() => choose("mine")}>
          {$t("syncConflicts.keepThisDevice")}
        </button>
        <button class="icon-btn" disabled={busy} on:click={() => choose("theirs")}> {$t("syncConflicts.useOneDrive")} </button>
        <button class="icon-btn" disabled={busy} on:click={() => choose("both")}> {$t("droppedNotes.keepBoth")} </button>
      </div>
      <div class="settings-hint" style="padding: 0 12px 12px; margin: 0;">
        {$t("syncConflicts.keepBothHint", { keepBothLabel: $t("droppedNotes.keepBoth") })}
      </div>
    {:else}
      <div class="settings-hint" style="padding: 16px;">{$t("syncConflicts.noConflicts")}</div>
    {/if}

    <div class="modal-footer" style="padding: 8px 12px; display: flex; justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>{$t("common.close")}</button>
    </div>
  </div>
</div>

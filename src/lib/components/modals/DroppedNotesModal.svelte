<script lang="ts">
  import { onDestroy } from "svelte";
  import * as controller from "../../controller";
  import { droppedConflicts } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import { diffLines } from "../../lineDiff";
  import type { DroppedResolution } from "../../exportImport";
  import { t } from "../../i18n";

  // Dropped notes whose date already has a different note. The note being shown falls back to
  // the first one when the selected one has just been settled and dropped out of the list.
  let selectedName = "";
  $: current = $droppedConflicts.find((c) => c.name === selectedName) ?? $droppedConflicts[0];
  $: diff = current ? diffLines(current.existing, current.dropped) : { left: [], right: [] };
  $: changedCount = diff.left.filter((r) => r.changed).length + diff.right.filter((r) => r.changed).length;

  let busy = false;
  let viewMode: "both" | "mine" | "theirs" = "both";
  async function choose(resolution: DroppedResolution) {
    if (!current || busy) return;
    busy = true;
    try {
      await controller.resolveDroppedNote(current.name, resolution);
    } finally {
      busy = false;
    }
  }

  // Closing the dialog keeps every remaining note as it is: nothing was written.
  onDestroy(() => droppedConflicts.set([]));

  const label = (name: string) => name.replace(/\.txt$/, "");
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card modal-md" role="dialog" aria-modal="true" use:focusTrap aria-label={$t("droppedNotes.ariaLabel")}>
    <div class="modal-input-wrap modal-title">
      <Icon name="import" size={15} />
      <span>{$t("droppedNotes.ariaLabel")}</span>
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
        {$t("droppedNotes.hasNoteHint.before")} <strong style="color: var(--text);">{label(current.name)}</strong>{$t("droppedNotes.hasNoteHint.after")}
      </div>

      {#if $droppedConflicts.length > 1}
        <div class="settings-toggle-row" style="padding: 0 12px 8px; gap: 6px; flex-wrap: wrap;">
          {#each $droppedConflicts as c (c.name)}
            <button
              class="icon-btn"
              class:active={c.name === current.name}
              on:click={() => (selectedName = c.name)}>{label(c.name)}</button
            >
          {/each}
        </div>
      {/if}

      <div class="conflict-view-tabs">
        <button type="button" class="conflict-view-btn" class:active={viewMode === "both"} on:click={() => (viewMode = "both")}>
          {$t("droppedNotes.tab.sideBySide")}
        </button>
        <button type="button" class="conflict-view-btn" class:active={viewMode === "mine"} on:click={() => (viewMode = "mine")}>
          {$t("droppedNotes.tab.yourNote")}
        </button>
        <button type="button" class="conflict-view-btn" class:active={viewMode === "theirs"} on:click={() => (viewMode = "theirs")}>
          {$t("droppedNotes.tab.droppedFile")}
        </button>
      </div>

      <div class="conflict-versions" class:show-both={viewMode === "both"} class:show-mine={viewMode === "mine"} class:show-theirs={viewMode === "theirs"}>
        <div class="conflict-version">
          <div class="conflict-version-label"><span class="conflict-badge">{$t("droppedNotes.tab.yourNote")}</span></div>
          <div class="conflict-text" data-testid="dropped-existing">{#each diff.left as row}<div class="conflict-line" class:changed={row.changed}>{row.text}</div>{/each}</div>
        </div>
        <div class="conflict-version">
          <div class="conflict-version-label"><span class="conflict-badge">{$t("droppedNotes.tab.droppedFile")}</span></div>
          <div class="conflict-text" data-testid="dropped-new">{#each diff.right as row}<div class="conflict-line" class:changed={row.changed}>{row.text}</div>{/each}</div>
        </div>
      </div>
      {#if changedCount > 0}
        <div class="settings-hint" style="padding: 6px 12px 0; margin: 0;">{$t("droppedNotes.highlightedDiffer")}</div>
      {/if}

      <div class="conflict-actions">
        <button class="icon-btn btn-primary" disabled={busy} on:click={() => choose("keep")}>{$t("droppedNotes.keepMyNote")}</button>
        <button class="icon-btn" disabled={busy} on:click={() => choose("replace")}>{$t("droppedNotes.useDroppedFile")}</button>
        <button class="icon-btn" disabled={busy} on:click={() => choose("both")}>{$t("droppedNotes.keepBoth")}</button>
      </div>
      <div class="settings-hint" style="padding: 0 12px 12px; margin: 0;">
        {$t("droppedNotes.keepBothHint", { keepBothLabel: $t("droppedNotes.keepBoth") })}
      </div>
    {:else}
      <div class="settings-hint" style="padding: 16px;">{$t("droppedNotes.nothingToReview")}</div>
    {/if}

    <div class="modal-footer" style="padding: 8px 12px; display: flex; justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>{$t("common.close")}</button>
    </div>
  </div>
</div>

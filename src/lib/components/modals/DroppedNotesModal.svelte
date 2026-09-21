<script lang="ts">
  import { onDestroy } from "svelte";
  import * as controller from "../../controller";
  import { droppedConflicts } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import { diffLines } from "../../lineDiff";
  import type { DroppedResolution } from "../../exportImport";

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
  <div class="modal-card modal-md" role="dialog" aria-modal="true" use:focusTrap aria-label="Dropped notes differ">
    <div class="modal-input-wrap modal-title">
      <Icon name="import" size={15} />
      <span>Dropped notes differ</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label="Close dialog"
        on:click={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>

    {#if current}
      <div class="settings-hint" style="padding: 12px 12px 8px; margin: 0;">
        You already have a note for <strong style="color: var(--text);">{label(current.name)}</strong>, and the file you
        dropped is different. Nothing has been overwritten — pick what to keep.
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
          Side-by-Side
        </button>
        <button type="button" class="conflict-view-btn" class:active={viewMode === "mine"} on:click={() => (viewMode = "mine")}>
          Your note
        </button>
        <button type="button" class="conflict-view-btn" class:active={viewMode === "theirs"} on:click={() => (viewMode = "theirs")}>
          Dropped file
        </button>
      </div>

      <div class="conflict-versions" class:show-both={viewMode === "both"} class:show-mine={viewMode === "mine"} class:show-theirs={viewMode === "theirs"}>
        <div class="conflict-version">
          <div class="conflict-version-label"><span class="conflict-badge">Your note</span></div>
          <div class="conflict-text" data-testid="dropped-existing">{#each diff.left as row}<div class="conflict-line" class:changed={row.changed}>{row.text}</div>{/each}</div>
        </div>
        <div class="conflict-version">
          <div class="conflict-version-label"><span class="conflict-badge">Dropped file</span></div>
          <div class="conflict-text" data-testid="dropped-new">{#each diff.right as row}<div class="conflict-line" class:changed={row.changed}>{row.text}</div>{/each}</div>
        </div>
      </div>
      {#if changedCount > 0}
        <div class="settings-hint" style="padding: 6px 12px 0; margin: 0;">Highlighted lines are the ones that differ.</div>
      {/if}

      <div class="conflict-actions">
        <button class="icon-btn btn-primary" disabled={busy} on:click={() => choose("keep")}>Keep my note</button>
        <button class="icon-btn" disabled={busy} on:click={() => choose("replace")}>Use the dropped file</button>
        <button class="icon-btn" disabled={busy} on:click={() => choose("both")}>Keep both</button>
      </div>
      <div class="settings-hint" style="padding: 0 12px 12px; margin: 0;">
        "Keep both" puts the dropped text under a marker line at the end so you can tidy it up. Closing this
        dialog keeps every note as it is.
      </div>
    {:else}
      <div class="settings-hint" style="padding: 16px;">Nothing left to review.</div>
    {/if}

    <div class="modal-footer" style="padding: 8px 12px; display: flex; justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

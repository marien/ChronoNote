<script lang="ts">
  import * as controller from "../../controller";
  import { calendarSyncReview } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";

  $: review = $calendarSyncReview;

  function cancel() {
    controller.cancelCalendarSync();
  }
  function confirm() {
    void controller.confirmCalendarSync();
  }
</script>

{#if review}
  <div class="overlay" role="presentation" use:closeOnOutsideClick={cancel}>
    <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Sync review">
      <div class="modal-input-wrap modal-title">
        <Icon name="import" size={15} /> Sync Review
      </div>
      <div class="modal-list">
        {#if review.newItems.length}
          <div class="modal-group-header">New meetings</div>
          {#each review.newItems as item, i (item.title + i)}
            <div class="modal-item" style="cursor: default;">
              <label class="sync-review-check">
                <input type="checkbox" checked={item.checked} on:change={() => controller.toggleSyncNewItem(i)} />
                {item.title}
              </label>
            </div>
          {/each}
        {/if}

        {#if review.reorderedTitles.length}
          <div class="modal-group-header">Reordered</div>
          {#each review.reorderedTitles as title}
            <div class="modal-empty-inline">{title} — moved earlier/later today</div>
          {/each}
        {/if}

        {#if review.removedEmpty.length}
          <div class="modal-group-header">Removed</div>
          {#each review.removedEmpty as title}
            <div class="modal-empty-inline">{title} — no longer on the calendar, was empty</div>
          {/each}
        {/if}

        {#if review.removals.length}
          <div class="modal-group-header">No longer on the calendar</div>
          {#each review.removals as removal, i (removal.header)}
            <div class="modal-item sync-review-removal" style="cursor: default;">
              <span class="modal-item-main">{removal.header}</span>
              <div class="sync-review-removal-controls">
                <Segmented
                  options={[
                    { value: "flag", label: "Leave" },
                    { value: "discard", label: "Discard" },
                    { value: "move", label: "Move…" },
                  ]}
                  value={removal.choice}
                  onChange={(v) => controller.setSyncRemovalChoice(i, v as "flag" | "discard" | "move")}
                />
                {#if removal.choice === "move"}
                  <input
                    type="date"
                    class="sync-review-date"
                    value={removal.moveDate}
                    on:change={(e) => controller.setSyncRemovalMoveDate(i, e.currentTarget.value)}
                  />
                {/if}
              </div>
            </div>
          {/each}
        {/if}

        {#if !review.newItems.length && !review.reorderedTitles.length && !review.removedEmpty.length && !review.removals.length}
          <div class="modal-empty">Nothing changed since the last sync.</div>
        {/if}
      </div>
      <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
        <button class="icon-btn" on:click={cancel}>Cancel</button>
        <button class="icon-btn btn-primary" on:click={confirm}>Sync</button>
      </div>
    </div>
  </div>
{/if}

<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { calendarSyncReview } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";
  import { t } from "../../i18n";

  $: review = $calendarSyncReview;

  let syncBtn: HTMLButtonElement | undefined;
  let listEl: HTMLDivElement | undefined;

  // #78: opening the review puts focus on the Sync button, so Enter accepts the review as it stands.
  onMount(() => {
    const id = requestAnimationFrame(() => syncBtn?.focus());
    return () => cancelAnimationFrame(id);
  });

  // #78: Up/Down move between the meeting checkboxes (wrapping); from anywhere else, Down goes to the
  // first and Up to the last. Tab still cycles through every control as usual, and the arrows are left
  // alone inside the date field and the Leave/Discard/Move choice, which use them themselves.
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const target = e.target as HTMLElement;
    if (target.matches('input[type="date"], [role="radio"], select')) return;
    const boxes = [...(listEl?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])];
    if (boxes.length === 0) return;
    e.preventDefault();
    const down = e.key === "ArrowDown";
    const at = boxes.indexOf(target as HTMLInputElement);
    const next = at < 0 ? (down ? 0 : boxes.length - 1) : (at + (down ? 1 : -1) + boxes.length) % boxes.length;
    boxes[next].focus();
  }

  function cancel() {
    controller.cancelCalendarSync();
  }
  function confirm() {
    void controller.confirmCalendarSync();
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if review}
  <div class="overlay" role="presentation" use:closeOnOutsideClick={cancel}>
    <div class="modal-card modal-lg" role="dialog" aria-modal="true" use:focusTrap aria-label={$t("calendarSyncReview.ariaLabel")}>
      <div class="modal-input-wrap modal-title">
        <Icon name="import" size={15} />
        <span>{$t("calendarSyncReview.title")}</span>
        <button
          type="button"
          class="icon-btn modal-close-btn"
          aria-label={$t("common.closeDialog")}
          on:click={cancel}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      <div class="modal-list" bind:this={listEl}>
        {#if review.newItems.length}
          <div class="modal-group-header">{$t("calendarSyncReview.newMeetings")}</div>
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
          <div class="modal-group-header">{$t("calendarSyncReview.reordered")}</div>
          {#each review.reorderedTitles as title}
            <div class="modal-empty-inline">{$t("calendarSyncReview.reorderedItem", { title })}</div>
          {/each}
        {/if}

        {#if review.removedEmpty.length}
          <div class="modal-group-header">{$t("calendarSyncReview.removed")}</div>
          {#each review.removedEmpty as title}
            <div class="modal-empty-inline">{$t("calendarSyncReview.removedItem", { title })}</div>
          {/each}
        {/if}

        {#if review.removals.length}
          <div class="modal-group-header">{$t("calendarSyncReview.noLongerOnCalendar")}</div>
          {#each review.removals as removal, i (removal.header)}
            <div class="modal-item sync-review-removal" style="cursor: default;">
              <span class="modal-item-main">{removal.header}</span>
              <div class="sync-review-removal-controls">
                <Segmented
                  options={[
                    { value: "flag", label: $t("calendarSyncReview.choice.leave") },
                    { value: "discard", label: $t("calendarSyncReview.choice.discard") },
                    { value: "move", label: $t("calendarSyncReview.choice.move") },
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
          <div class="modal-empty">{$t("calendarSyncReview.nothingChanged")}</div>
        {/if}
      </div>
      <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
        <button class="icon-btn" on:click={cancel}>{$t("common.cancel")}</button>
        <button class="icon-btn btn-primary" bind:this={syncBtn} on:click={confirm}>{$t("calendarSyncReview.syncButton")}</button>
      </div>
    </div>
  </div>
{/if}

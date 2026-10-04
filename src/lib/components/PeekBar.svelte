<script lang="ts">
  import * as controller from "../controller";
  import { activeTabId, currentDateISO, tabs } from "../controller";
  import { peekDateClass, peekHeaderExpanded, peekPosition, peekSettings, peekTarget } from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { t } from "../i18n";
  import { findSectionRange } from "../peekSection";
  import { normalizeHeaderTitle } from "../tokens";

  // The header strip of the compact window: drag handle, which occurrence is showing (coloured like the tab strip:
  // grey = past, blue = today, green = future), previous/next occurrence, and the way back to the full window.
  $: tab = $tabs.find((x) => x.id === $activeTabId);
  $: dateClass = peekDateClass(tab?.filename, $currentDateISO);
  $: label = tab ? tab.filename.replace(/\.txt$/, "") : "";
  // The thin strip: always when hidden; in "on hover" mode until the pointer is over the window.
  $: hidden = $peekSettings.header === "never" || ($peekSettings.header === "hover" && !$peekHeaderExpanded);
  // The section's title as written in this note (without a date), since the title line itself is not drawn in Peek.
  $: title = (() => {
    if (!tab || !$peekTarget) return "";
    const lines = tab.content.split("\n");
    const range = findSectionRange(lines, $peekTarget);
    return range ? normalizeHeaderTitle(lines[range.titleLine].trim()) : $peekTarget;
  })();
</script>

<!-- `data-tauri-drag-region` only applies to the element itself, so every non-interactive child carries it too. -->
<div
  id="peek-bar"
  class="peek-bar {dateClass}"
  class:thin={hidden}
  class:hover-strip={$peekSettings.header === "hover"}
  data-tauri-drag-region
  role="toolbar"
  aria-label="Peek"
>
  {#if !hidden}
    <button
      type="button"
      class="peek-btn"
      aria-label={$t("peek.prev")}
      title="{$t('peek.prev')} (Alt+←)"
      disabled={!$peekPosition || $peekPosition.index <= 1}
      on:click={() => controller.stepPeekOccurrence(-1)}>‹</button
    >
    <span class="peek-date" data-tauri-drag-region>{label}</span>
    {#if $peekPosition}
      <span class="peek-count" data-tauri-drag-region>{$peekPosition.index}/{$peekPosition.total}</span>
    {/if}
    <button
      type="button"
      class="peek-btn"
      aria-label={$t("peek.next")}
      title="{$t('peek.next')} (Alt+→)"
      disabled={!$peekPosition || $peekPosition.index >= $peekPosition.total}
      on:click={() => controller.stepPeekOccurrence(1)}>›</button
    >
    <span class="peek-title" data-tauri-drag-region>{title}</span>
    <button
      type="button"
      class="peek-btn"
      aria-label={$t("peek.expand")}
      title={$t("peek.expand")}
      on:click={() => controller.leavePeek()}><Icon name="maximize" size={13} /></button
    >
  {/if}
</div>

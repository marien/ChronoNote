<script lang="ts">
  import { get } from "svelte/store";
  import * as controller from "../controller";
  import { activeTabId, currentDateISO, tabs } from "../controller";
  import {
    cancelPeekRename,
    editorApi,
    leavePeek,
    minimizeWindow,
    peekDateClass,
    peekHeaderExpanded,
    peekPosition,
    peekRenaming,
    peekSettings,
    peekTarget,
    renamePeekSection,
    startPeekRename,
    stepPeekOccurrence,
  } from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { t } from "../i18n";
  import { adhocSubjectRange, findSectionRange } from "../peekSection";
  import { normalizeHeaderTitle } from "../tokens";

  // The header strip of the compact window: drag handle, which occurrence is showing (coloured like the tab strip:
  // grey = past, blue = today, green = future), previous/next occurrence, and the way back to the full window.
  const tab = $derived($tabs.find((x) => x.id === $activeTabId));
  const dateClass = $derived(peekDateClass(tab?.filename, $currentDateISO));
  const label = $derived(tab ? tab.filename.replace(/\.txt$/, "") : "");

  // Visible: always in "always" mode, or whenever pointer is over window or actively renaming.
  const visible = $derived($peekSettings.header === "always" || $peekHeaderExpanded || $peekRenaming);
  // Overlay: in "hover" and "never" modes the bar/strip is drawn over content.
  const overlay = $derived($peekSettings.header !== "always");
  // Thin strip: in "never" mode unless actively renaming (which expands the full bar).
  const thin = $derived($peekSettings.header === "never" && !$peekRenaming);

  // The section's title as written in this note (without a date), since the title line itself is not drawn in Peek.
  const title = $derived.by(() => {
    if (!tab || !$peekTarget) return "";
    const lines = tab.content.split("\n");
    const range = findSectionRange(lines, $peekTarget);
    return range ? normalizeHeaderTitle(lines[range.titleLine].trim()) : $peekTarget;
  });

  const isAdhoc = $derived(/^['’]/.test(title.trim()));

  let inputValue = $state("");

  function initInput(node: HTMLInputElement) {
    const rawSubject = title.trim().replace(/^['’]/, "");
    inputValue = rawSubject;
    node.value = rawSubject;
    const focusAndSelect = () => {
      node.focus();
      const [start, end] = adhocSubjectRange(node.value);
      node.setSelectionRange(start, end);
    };
    focusAndSelect();
    queueMicrotask(focusAndSelect);
  }

  // Enter, Tab, Escape and leaving the field all end the rename; whichever comes first clears `peekRenaming`, so the
  // blur that moving the focus to the editor causes right after is a no-op. (No separate "cancelling" flag: the browser
  // does not fire blur when the input is removed, so such a flag could stay set and swallow the next rename.)
  function commitRename() {
    if (!get(peekRenaming)) return;
    renamePeekSection(inputValue);
    editorApi?.focus();
  }

  function cancelRename() {
    cancelPeekRename();
    editorApi?.focus();
  }

  // F2: name the call (ad-hoc call sections only). The editor no longer binds F2 (open-action jumps are Ctrl+J).
  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key !== "F2" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (!isAdhoc || $peekRenaming) return;
    e.preventDefault();
    startPeekRename();
  }

  function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelRename();
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- `data-tauri-drag-region` only applies to the element itself, so every non-interactive child carries it too. -->
{#if visible}
  <div
    id="peek-bar"
    class="peek-bar {dateClass}"
    class:thin
    class:overlay
    data-tauri-drag-region
    role="toolbar"
    aria-label="Peek"
  >
    {#if thin}
      <button
        type="button"
        class="peek-btn tiny"
        aria-label={$t("peek.minimize")}
        title={$t("peek.minimize")}
        onclick={() => minimizeWindow()}><Icon name="minimize" size={10} /></button
      >
      <button
        type="button"
        class="peek-btn tiny"
        aria-label={$t("peek.expand")}
        title={$t("peek.expand")}
        onclick={() => leavePeek()}><Icon name="maximize" size={10} /></button
      >
    {:else}
      <button
        type="button"
        class="peek-btn"
        aria-label={$t("peek.prev")}
        title="{$t('peek.prev')} (Alt+←)"
        disabled={!$peekPosition || $peekPosition.index <= 1}
        onclick={() => stepPeekOccurrence(-1)}>‹</button
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
        onclick={() => stepPeekOccurrence(1)}>›</button
      >
      <!-- An ad-hoc call's title (and its field) only takes the width it needs: the rest of the bar is free space to
           drag the window by. -->
      {#if $peekRenaming || isAdhoc}
        <span class="peek-drag-fill" data-tauri-drag-region></span>
      {/if}
      {#if $peekRenaming}
        <input
          use:initInput
          type="text"
          class="peek-title-input"
          bind:value={inputValue}
          onkeydown={handleInputKeydown}
          onblur={commitRename}
        />
      {:else}
        {#if isAdhoc}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span
            class="peek-title adhoc"
            title="{$t('peek.rename')} (F2)"
            onclick={() => startPeekRename()}>{title}</span
          >
        {:else}
          <span class="peek-title" data-tauri-drag-region>{title}</span>
        {/if}
      {/if}
      <button
        type="button"
        class="peek-btn"
        aria-label={$t("peek.minimize")}
        title={$t("peek.minimize")}
        onclick={() => minimizeWindow()}><Icon name="minimize" size={13} /></button
      >
      <button
        type="button"
        class="peek-btn"
        aria-label={$t("peek.expand")}
        title={$t("peek.expand")}
        onclick={() => leavePeek()}><Icon name="maximize" size={13} /></button
      >
    {/if}
  </div>
{/if}

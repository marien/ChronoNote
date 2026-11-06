<script lang="ts">
  import { get } from "svelte/store";
  import * as controller from "../controller";
  import { activeTabId, allNotesCache, currentDateISO, tabs } from "../controller";
  import {
    cancelPeekRename,
    editorApi,
    leavePeek,
    minimizeWindow,
    newCall,
    peekDateClass,
    peekDocked,
    peekHeaderExpanded,
    peekOnTodaySection,
    peekPosition,
    peekRenaming,
    peekSettings,
    peekSwitcherOpen,
    peekTarget,
    renamePeekSection,
    sectionsOnNow,
    startPeekRename,
    stepPeekOccurrence,
    todayAgendaEntries,
    togglePeekDock,
    type NowItem,
  } from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { t } from "../i18n";
  import { formatShortcut } from "../shortcuts";
  import { todayISO } from "../date";
  import { adhocSubjectRange, findSectionRange } from "../peekSection";
  import { normalizeHeaderTitle, titleForMatching } from "../tokens";

  // The header strip of the compact window: drag handle, which occurrence is showing (coloured like the tab strip:
  // grey = past, blue = today, green = future), previous/next occurrence, and the way back to the full window.
  const tab = $derived($tabs.find((x) => x.id === $activeTabId));
  const dateClass = $derived(peekDateClass(tab?.filename, $currentDateISO));
  const label = $derived(tab ? tab.filename.replace(/\.txt$/, "") : "");

  // Visible: always in "always" mode, or whenever pointer is over window, actively renaming, or switcher open.
  const visible = $derived(
    $peekSettings.header === "always" || $peekHeaderExpanded || $peekRenaming || $peekSwitcherOpen,
  );
  // Overlay: in "hover" and "never" modes the bar/strip is drawn over content.
  const overlay = $derived($peekSettings.header !== "always");
  // Thin strip: in "never" mode unless actively renaming or switcher open (which expands the full bar).
  const thin = $derived($peekSettings.header === "never" && !$peekRenaming && !$peekSwitcherOpen);

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
  // blur that moving the focus to the editor causes right after is a no-op.
  function commitRename() {
    if (!get(peekRenaming)) return;
    renamePeekSection(inputValue);
    editorApi?.focus();
  }

  function cancelRename() {
    cancelPeekRename();
    editorApi?.focus();
  }

  // F2: name the call (ad-hoc call sections only).
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

  // --- "On now" and Switcher ---
  let onNowItems = $state<NowItem[]>([]);
  let highlightIndex = $state(0);
  const totalItemsCount = $derived(onNowItems.length + 1);

  function getTodayContent(): string {
    const todayFilename = `${todayISO()}.txt`;
    const todayTab = get(tabs).find((x) => x.filename === todayFilename && !x.isScratchpad);
    return todayTab?.content ?? get(allNotesCache)[todayFilename] ?? "";
  }

  async function refreshOnNow() {
    const entries = await todayAgendaEntries();
    const content = getTodayContent();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    onNowItems = sectionsOnNow(entries, content, nowMin);
  }

  function scrollHighlightedIntoView() {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`#peek-switcher [role="option"][aria-selected="true"]`);
      el?.scrollIntoView({ block: "nearest" });
    });
  }

  function chooseItem(idx: number) {
    peekSwitcherOpen.set(false);
    if (idx < onNowItems.length) {
      const item = onNowItems[idx];
      void peekOnTodaySection(item.title, item.minutes, false);
    } else {
      void newCall();
    }
    editorApi?.focus();
  }

  // Compute "on now" on mount and every 60s
  $effect(() => {
    void refreshOnNow();
    const interval = setInterval(() => {
      void refreshOnNow();
    }, 60_000);
    return () => clearInterval(interval);
  });

  // Re-compute when shown section changes
  $effect(() => {
    const _t = $peekTarget;
    void refreshOnNow();
  });

  // Re-compute when switcher opens and set initial highlight
  $effect(() => {
    if ($peekSwitcherOpen) {
      void refreshOnNow().then(() => {
        const currentKey = $peekTarget?.toLowerCase();
        const idx = onNowItems.findIndex(
          (it) => titleForMatching(normalizeHeaderTitle(it.title)).toLowerCase() === currentKey,
        );
        highlightIndex = idx >= 0 ? idx : 0;
        scrollHighlightedIntoView();
      });
    }
  });

  // Keyboard navigation & click outside for switcher
  $effect(() => {
    if (!$peekSwitcherOpen) return;

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        peekSwitcherOpen.set(false);
        editorApi?.focus();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        highlightIndex = (highlightIndex + 1) % totalItemsCount;
        scrollHighlightedIntoView();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        highlightIndex = (highlightIndex - 1 + totalItemsCount) % totalItemsCount;
        scrollHighlightedIntoView();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        chooseItem(highlightIndex);
        return;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const switcherEl = document.getElementById("peek-switcher");
      const switchBtn = document.querySelector('[data-testid="peek-switch"]');
      if (switcherEl?.contains(target) || switchBtn?.contains(target)) {
        return;
      }
      peekSwitcherOpen.set(false);
      editorApi?.focus();
    };

    window.addEventListener("keydown", onKeyDownCapture, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDownCapture, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  });

  const shownOnNowIdx = $derived.by(() => {
    if (!$peekTarget) return -1;
    const currentKey = $peekTarget.toLowerCase();
    return onNowItems.findIndex(
      (it) => titleForMatching(normalizeHeaderTitle(it.title)).toLowerCase() === currentKey,
    );
  });

  const switchLabel = $derived(
    shownOnNowIdx >= 0 ? `‹${shownOnNowIdx + 1}/${onNowItems.length}›` : `‹${onNowItems.length}›`,
  );
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
        data-testid="peek-new-call"
        aria-label="{$t('peek.newCall')} ({formatShortcut('newCall')})"
        title="{$t('peek.newCall')} ({formatShortcut('newCall')})"
        onclick={() => void newCall()}
      >+</button>
      <button
        type="button"
        class="peek-btn tiny"
        aria-label={$peekDocked ? $t("peek.float") : $t("peek.dock")}
        title={$peekDocked ? $t("peek.float") : $t("peek.dock")}
        onclick={() => togglePeekDock()}><Icon name={$peekDocked ? "peek-float" : "peek-dock"} size={10} /></button
      >
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
      {#if onNowItems.length >= 2}
        <button
          type="button"
          class="peek-btn"
          data-testid="peek-switch"
          aria-haspopup="listbox"
          aria-expanded={$peekSwitcherOpen}
          aria-label="{$t('peek.switch')} (Ctrl+G)"
          title="{$t('peek.switch')} (Ctrl+G)"
          onclick={() => peekSwitcherOpen.update((v) => !v)}
        >{switchLabel}</button>
      {/if}
      <button
        type="button"
        class="peek-btn"
        data-testid="peek-new-call"
        aria-label="{$t('peek.newCall')} ({formatShortcut('newCall')})"
        title="{$t('peek.newCall')} ({formatShortcut('newCall')})"
        onclick={() => void newCall()}
      >+</button>
      <button
        type="button"
        class="peek-btn"
        aria-label={$peekDocked ? $t("peek.float") : $t("peek.dock")}
        title={$peekDocked ? $t("peek.float") : $t("peek.dock")}
        onclick={() => togglePeekDock()}><Icon name={$peekDocked ? "peek-float" : "peek-dock"} size={13} /></button
      >
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
  {#if $peekSwitcherOpen}
    <div id="peek-switcher" role="listbox" aria-label={$t("peek.switch")}>
      {#each onNowItems as item, i}
        {@const isCurrent = $peekTarget?.toLowerCase() === titleForMatching(normalizeHeaderTitle(item.title)).toLowerCase()}
        {@const hh = String(Math.floor(item.minutes / 60)).padStart(2, "0")}
        {@const mm = String(item.minutes % 60).padStart(2, "0")}
        {@const displayTitle = item.title.replace(/^['’]/, "")}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="peek-switch-item"
          class:selected={highlightIndex === i}
          class:is-current={isCurrent}
          role="option"
          tabindex="-1"
          aria-selected={highlightIndex === i}
          onpointerenter={() => (highlightIndex = i)}
          onclick={() => chooseItem(i)}
        >
          <span class="peek-switch-time">{hh}:{mm}</span>
          <span class="peek-switch-title">{displayTitle}</span>
          {#if isCurrent}
            <span class="peek-switch-mark">✓</span>
          {/if}
        </div>
      {/each}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="peek-switch-item"
        class:selected={highlightIndex === onNowItems.length}
        role="option"
        tabindex="-1"
        data-testid="peek-switch-new-call"
        aria-selected={highlightIndex === onNowItems.length}
        onpointerenter={() => (highlightIndex = onNowItems.length)}
        onclick={() => chooseItem(onNowItems.length)}
      >
        <span class="peek-switch-title">{$t("peek.newCall")}</span>
        <span class="peek-switch-hint">{formatShortcut("newCall")}</span>
      </div>
    </div>
  {/if}
{/if}

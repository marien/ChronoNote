<script lang="ts">
  import { tick } from "svelte";
  import * as controller from "../../controller";
  import Icon from "../../icons/Icon.svelte";
  import { formatShortcut } from "../../shortcuts";
  import { t } from "../../i18n";
  import { focusTrap } from "../../actions/focusTrap";
  import { NEW_MENU_MAX_WIDTH } from "./topbarHelpers";

  let {
    newSplitEl,
    newMenuOpen = $bindable(false),
  }: {
    newSplitEl?: HTMLElement;
    newMenuOpen?: boolean;
  } = $props();

  // §B2: the + button's menu (New scratchpad / Open date / Reopen closed tab).
  let newMenuPos = $state({ x: 0, y: 0 });
  let newMenuEl = $state<HTMLDivElement>();

  export function toggleNewMenu() {
    if (newMenuOpen) {
      newMenuOpen = false;
      return;
    }
    if (!newSplitEl) return;
    const r = newSplitEl.getBoundingClientRect();
    newMenuPos = { x: Math.max(8, Math.min(r.left, window.innerWidth - NEW_MENU_MAX_WIDTH - 8)), y: r.bottom + 6 };
    newMenuOpen = true;
    tick().then(() => newMenuEl?.querySelector<HTMLElement>("button")?.focus());
  }

  function runNewMenuItem(action: () => unknown) {
    newMenuOpen = false;
    void action();
  }
</script>

{#if newMenuOpen}
  <!-- §B2: the + menu — same look as the More popover (`.more-actions-pop`), opened under the split button. -->
  <div
    class="more-actions-pop"
    bind:this={newMenuEl}
    role="menu"
    aria-label={$t("topBar.newTabMenu")}
    use:focusTrap
    style="top: {newMenuPos.y}px; left: {newMenuPos.x}px;"
  >
    <button type="button" class="more-actions-item" role="menuitem" onclick={() => runNewMenuItem(controller.createScratchpad)}>
      <Icon name="new-scratchpad" size={14} /><span>{$t("shortcuts.newScratchpad.label")}</span>
      <kbd>{formatShortcut("newScratchpad")}</kbd>
    </button>
    <button type="button" class="more-actions-item" role="menuitem" onclick={() => runNewMenuItem(controller.openDatePicker)}>
      <Icon name="date-note" size={14} /><span>{$t("shortcuts.openDateNote.label")}</span>
      <kbd>{formatShortcut("openDateNote")}</kbd>
    </button>
    <div class="more-actions-sep" role="separator"></div>
    <button type="button" class="more-actions-item" role="menuitem" onclick={() => runNewMenuItem(controller.reopenLastClosedTab)}>
      <Icon name="undo" size={14} /><span>{$t("shortcuts.reopenClosedTab.label")}</span>
      <kbd>{formatShortcut("reopenClosedTab")}</kbd>
    </button>
  </div>
{/if}

<svelte:window
  onmousedown={(e) => {
    // The chevron toggles the menu itself, so a press on the split button is not an outside click.
    if (newMenuOpen && !newMenuEl?.contains(e.target as Node) && !newSplitEl?.contains(e.target as Node)) {
      newMenuOpen = false;
    }
  }}
  onkeydown={(e) => {
    if (e.key === "Escape" && newMenuOpen) {
      newMenuOpen = false;
    }
  }}
  onresize={() => (newMenuOpen = false)}
/>

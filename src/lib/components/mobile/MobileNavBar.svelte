<script lang="ts">
  import * as controller from "../../controller";
  import { statusCounts } from "../../controller";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";
  import { dismissTop, overlays } from "../../overlays";

  const top = $derived($overlays[$overlays.length - 1]?.kind);
  const activeDestination = $derived.by(() => {
    if (top === "actions") return "actions";
    if (top === "history") return "history";
    if (top === "search") return "search";
    return "note";
  });

  function onNoteClick() {
    while (dismissTop()) {}
  }
</script>

<nav class="mobile-nav-bar" aria-label="Main Navigation">
  <button
    type="button"
    class="mobile-nav-dest"
    class:active={activeDestination === "note"}
    onclick={onNoteClick}
    aria-label={$t("phoneNav.note")}
  >
    <div class="mobile-nav-pill">
      <Icon name="tab-daily" size={20} />
    </div>
    <span class="mobile-nav-label">{$t("phoneNav.note")}</span>
  </button>

  <button
    type="button"
    class="mobile-nav-dest"
    class:active={activeDestination === "actions"}
    onclick={controller.openActionDrawer}
    aria-label={$t("actionDrawer.modal.ariaLabel")}
  >
    <div class="mobile-nav-pill">
      <Icon name="actions" size={20} />
      {#if $statusCounts.open > 0}
        <span class="mobile-nav-badge">{$statusCounts.open}</span>
      {/if}
    </div>
    <span class="mobile-nav-label">{$t("actionDrawer.modal.ariaLabel")}</span>
  </button>

  <button
    type="button"
    class="mobile-nav-dest"
    class:active={activeDestination === "history"}
    onclick={controller.openMeetingHistory}
    aria-label={$t("history.modal.ariaLabel")}
  >
    <div class="mobile-nav-pill">
      <Icon name="section-history" size={20} />
    </div>
    <span class="mobile-nav-label">{$t("history.modal.ariaLabel")}</span>
  </button>

  <button
    type="button"
    class="mobile-nav-dest"
    class:active={activeDestination === "search"}
    onclick={controller.openCrossTabSearch}
    aria-label={$t("topBar.label.search")}
  >
    <div class="mobile-nav-pill">
      <Icon name="search" size={20} />
    </div>
    <span class="mobile-nav-label">{$t("topBar.label.search")}</span>
  </button>
</nav>

<style>
  .mobile-nav-bar {
    display: flex;
    align-items: center;
    justify-content: space-around;
    height: calc(64px + env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--surface-chrome);
    border-top: 1px solid var(--edge-soft);
    box-sizing: border-box;
    flex-shrink: 0;
    width: 100%;
    position: relative;
    z-index: 30;
  }

  .mobile-nav-dest {
    flex: 1;
    min-width: 0;
    height: 64px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-secondary, var(--muted));
    cursor: pointer;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-nav-dest.active {
    color: var(--text);
  }

  .mobile-nav-pill {
    width: 56px;
    height: 30px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: background-color 0.15s ease;
  }

  .mobile-nav-dest.active .mobile-nav-pill {
    background: color-mix(in srgb, var(--selected-bg) 22%, transparent);
  }

  .mobile-nav-label {
    font-size: 11px;
    margin-top: 4px;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .mobile-nav-badge {
    position: absolute;
    top: -4px;
    right: 4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--surface-raised);
    border: 1px solid var(--edge-strong);
    color: var(--text);
    font-size: 10px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
</style>

<script lang="ts">
  import { backStack, forwardStack, navToastVisible, editorApi } from "../stores";
  import * as controller from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { formatShortcut } from "../shortcuts";
  import { t } from "../i18n";

  $effect(() => {
    if ($navToastVisible && $backStack.length === 0 && $forwardStack.length === 0) {
      navToastVisible.set(false);
    }
  });

  function dismiss() {
    navToastVisible.set(false);
    editorApi?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    }
  }
</script>

{#if $navToastVisible && ($backStack.length > 0 || $forwardStack.length > 0)}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="nav-toast"
    role="region"
    aria-label={$t("navToast.ariaLabel")}
    onkeydown={handleKeydown}
  >
    {#if $backStack.length > 0}
      {@const backTarget = $backStack[$backStack.length - 1]}
      {@const backDate = backTarget.filename.replace(/\.txt$/, "")}
      {@const backLabel = $t("statusBar.backTo", { date: backDate })}
      {@const shortcutText = formatShortcut("navigateBack")}
      <button
        type="button"
        class="nav-toast-btn nav-toast-back"
        aria-label={backLabel}
        title={shortcutText ? `${backLabel} (${shortcutText})` : backLabel}
        onclick={controller.navigateBack}
      >
        <Icon name="chevron-left" size={14} />
        <span>{backLabel}</span>
      </button>
    {/if}
    {#if $forwardStack.length > 0}
      {@const forwardTarget = $forwardStack[$forwardStack.length - 1]}
      {@const forwardDate = forwardTarget.filename.replace(/\.txt$/, "")}
      {@const forwardLabel = $t("statusBar.forwardTo", { date: forwardDate })}
      {@const shortcutText = formatShortcut("navigateForward")}
      <button
        type="button"
        class="nav-toast-btn nav-toast-forward"
        aria-label={forwardLabel}
        title={shortcutText ? `${forwardLabel} (${shortcutText})` : forwardLabel}
        onclick={controller.navigateForward}
      >
        <span>{forwardLabel}</span>
        <Icon name="chevron-right" size={14} />
      </button>
    {/if}
    <button
      type="button"
      class="nav-toast-dismiss"
      aria-label={$t("navToast.dismiss")}
      title={$t("navToast.dismiss")}
      onclick={dismiss}
    >
      <Icon name="close" size={14} />
    </button>
  </div>
{/if}

<style>
  .nav-toast {
    position: fixed;
    top: calc(env(titlebar-area-height, 40px) + 8px);
    right: 14px;
    z-index: 200;
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px;
    box-sizing: border-box;
    background: var(--surface-overlay);
    background: color-mix(in srgb, var(--surface-overlay) 88%, transparent);
    backdrop-filter: blur(20px) saturate(125%);
    border: 1px solid var(--edge-strong);
    border-radius: var(--radius-overlay);
    box-shadow: var(--shadow-flyout);
    color: var(--text);
    animation: nav-toast-slide-in 0.15s ease-out;
  }

  @keyframes nav-toast-slide-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-toast {
      animation: nav-toast-fade-in 0.15s ease-out;
    }
  }

  @keyframes nav-toast-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (pointer: coarse), (max-width: 600px) {
    .nav-toast {
      top: calc(56px + env(safe-area-inset-top, 0px) + 8px);
      right: 12px;
    }
  }

  .nav-toast-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 6px;
    background: transparent;
    border: none;
    border-radius: var(--radius-control);
    color: var(--text);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .nav-toast-btn:hover {
    background: var(--surface-hover);
  }

  .nav-toast-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .nav-toast-dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-control);
    color: var(--muted);
    cursor: pointer;
    flex-shrink: 0;
  }

  .nav-toast-dismiss:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .nav-toast-dismiss:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>

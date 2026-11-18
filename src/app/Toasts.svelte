<script lang="ts">
  import * as controller from "../lib/controller";
  import {
    isMobile,
    toastAction,
    toastMessage,
    LONG_TOAST_CHARS,
  } from "../lib/controller";

  function handleToastClick() {
    if ($toastAction) {
      controller.runToastAction();
    } else {
      controller.dismissToast();
    }
  }

  function handleToastKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToastClick();
    }
  }
</script>

{#if !$isMobile && $toastMessage.length > LONG_TOAST_CHARS}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="long-toast"
    class:interactive={Boolean($toastAction)}
    role={$toastAction ? "button" : "status"}
    tabindex={$toastAction ? 0 : -1}
    aria-live="polite"
    onclick={handleToastClick}
    onkeydown={handleToastKeydown}
  >
    {$toastMessage}
  </div>
{/if}
{#if $isMobile && $toastMessage}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="mobile-toast"
    class:interactive={Boolean($toastAction)}
    role={$toastAction ? "button" : "status"}
    tabindex={$toastAction ? 0 : -1}
    aria-live="polite"
    onclick={handleToastClick}
    onkeydown={handleToastKeydown}
  >
    {$toastMessage}
  </div>
{/if}

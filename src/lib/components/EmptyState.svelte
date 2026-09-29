<script lang="ts">
  import Icon from "../icons/Icon.svelte";
  import type { IconName } from "../icons/paths";

  export let icon: IconName;
  export let title: string;
  export let subtitle: string = "";
</script>

<div class="modal-empty empty-state" role="status">
  <div class="empty-state-icon" aria-hidden="true">
    <Icon name={icon} size={28} />
  </div>
  <div class="empty-state-title">{title}</div>
  {#if subtitle}
    <div class="empty-state-subtitle">{subtitle}</div>
  {/if}
  <slot />
</div>

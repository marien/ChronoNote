<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "../icons/Icon.svelte";
  import type { IconName } from "../icons/paths";

  interface Props {
    icon: IconName;
    title: string;
    subtitle?: string;
    children?: Snippet;
  }

  let { icon, title, subtitle = "", children }: Props = $props();
</script>

<div class="modal-empty empty-state" role="status">
  <div class="empty-state-icon" aria-hidden="true">
    <Icon name={icon} size={28} />
  </div>
  <div class="empty-state-title">{title}</div>
  {#if subtitle}
    <div class="empty-state-subtitle">{subtitle}</div>
  {/if}
  {@render children?.()}
</div>

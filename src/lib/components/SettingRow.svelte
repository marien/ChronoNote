<script lang="ts">
  import type { Snippet } from "svelte";

  /** One setting in the Settings dialog: the label (and an optional one-line
   * description) on the left, the control on the right. `stack` puts the
   * control on its own line under the text instead, for controls that need
   * the full width (the language grid). On a phone every row stacks. Every
   * setting uses this, so label, description and control line up the same way
   * wherever they sit. */
  interface Props {
    label?: string;
    stack?: boolean;
    description?: Snippet;
    children?: Snippet;
  }
  let { label = "", stack = false, description, children }: Props = $props();
</script>

<div class="s-row" class:stack>
  <div class="s-text">
    {#if label}<div class="s-label">{label}</div>{/if}
    {#if description}<div class="s-desc">{@render description()}</div>{/if}
  </div>
  {#if children}<div class="s-control">{@render children()}</div>{/if}
</div>

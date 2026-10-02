<script lang="ts">
  /** One setting in the Settings dialog: the label (and an optional one-line
   * description) on the left, the control on the right. `stack` puts the
   * control on its own line under the text instead, for controls that need
   * the full width (the language grid). On a phone every row stacks. Every
   * setting uses this, so label, description and control line up the same way
   * wherever they sit. */
  export let label: string = "";
  export let stack: boolean = false;
</script>

<div class="s-row" class:stack>
  <div class="s-text">
    {#if label}<div class="s-label">{label}</div>{/if}
    {#if $$slots.description}<div class="s-desc"><slot name="description" /></div>{/if}
  </div>
  {#if $$slots.default}<div class="s-control"><slot /></div>{/if}
</div>

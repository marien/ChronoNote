<script lang="ts">
  /** A "pick one of N modes" control (§127, finding D) — visually and
   * semantically distinct from `.toggle-switch` (a single on/off). Used
   * wherever the app offers a small fixed set of mutually-exclusive modes:
   * scan scope (Open Tabs / All Files), the glyph palette (Color /
   * Grayscale / Legacy), and the editor-width control (Full / Wrap /
   * Reading column). One bordered container with hairline dividers and a
   * filled selected segment, rather than N independent `.icon-btn.active`
   * buttons sitting side by side with no shared edge. */
  export let options: { value: string; label: string }[];
  export let value: string;
  export let onChange: (value: string) => void;
</script>

<div class="segmented" role="radiogroup">
  {#each options as opt (opt.value)}
    <button
      type="button"
      class="segmented-option {opt.value === value ? 'active' : ''}"
      role="radio"
      aria-checked={opt.value === value}
      on:click={() => opt.value !== value && onChange(opt.value)}
    >
      {opt.label}
    </button>
  {/each}
</div>

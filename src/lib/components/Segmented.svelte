<script lang="ts">
  /** A "pick one of N modes" control (§127, finding D) — visually and
   * semantically distinct from `.toggle-switch` (a single on/off). Used
   * wherever the app offers a small fixed set of mutually-exclusive modes:
   * scan scope (Open Tabs / All Files), the glyph palette (Color /
   * Grayscale), and the editor-width control (Full / Wrap /
   * Reading column). One bordered container with hairline dividers and a
   * filled selected segment, rather than N independent `.icon-btn.active`
   * buttons sitting side by side with no shared edge. */
  interface Props {
    options: { value: string; label: string; title?: string }[];
    value: string;
    onChange: (value: string) => void;
    grid?: boolean;
  }
  let { options, value, onChange, grid = false }: Props = $props();
</script>

<div class="segmented {grid ? 'segmented-grid' : ''}" role="radiogroup">
  {#each options as opt (opt.value)}
    <button
      type="button"
      class="segmented-option {opt.value === value ? 'active' : ''}"
      role="radio"
      aria-checked={opt.value === value}
      title={opt.title}
      onclick={() => opt.value !== value && onChange(opt.value)}
    >
      {opt.label}
    </button>
  {/each}
</div>

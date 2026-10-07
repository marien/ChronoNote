<script lang="ts">
  import type { Snippet } from "svelte";

  /** An on/off setting laid out like `SettingRow`: label and description on
   * the left, the switch on the right, the whole row clickable. Keeps the
   * `.toggle-switch` class so the switch looks and behaves like every other. */
  interface Props {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    description?: Snippet;
  }
  let { label, checked, onChange, description }: Props = $props();
  const id = `s-toggle-${Math.random().toString(36).slice(2, 9)}`;
</script>

<label class="s-row toggle-switch">
  <span class="s-text">
    <span class="s-label" {id}>{label}</span>
    {#if description}<span class="s-desc">{@render description()}</span>{/if}
  </span>
  <input type="checkbox" {checked} aria-labelledby={id} onchange={(e) => onChange(e.currentTarget.checked)} />
  <span class="toggle-switch-track"></span>
</label>

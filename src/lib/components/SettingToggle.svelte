<script lang="ts">
  /** An on/off setting laid out like `SettingRow`: label and description on
   * the left, the switch on the right, the whole row clickable. Keeps the
   * `.toggle-switch` class so the switch looks and behaves like every other. */
  export let label: string;
  export let checked: boolean;
  export let onChange: (checked: boolean) => void;
  const id = `s-toggle-${Math.random().toString(36).slice(2, 9)}`;
</script>

<label class="s-row toggle-switch">
  <span class="s-text">
    <span class="s-label" {id}>{label}</span>
    {#if $$slots.description}<span class="s-desc"><slot name="description" /></span>{/if}
  </span>
  <input type="checkbox" {checked} aria-labelledby={id} on:change={(e) => onChange(e.currentTarget.checked)} />
  <span class="toggle-switch-track"></span>
</label>

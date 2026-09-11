<script lang="ts">
  import { ICONS, type IconName } from "./paths";

  /** One monoline SVG icon set for the whole app (§127) — see `paths.ts`
   * for the design rationale. `size` is the rendered box in px; the
   * viewBox is always 24×24 so every icon shares one grid regardless of
   * where it's used (a 16px top-bar button, a 15px modal header). Colour
   * is deliberately never set here — it's `currentColor`, so the icon
   * follows whatever `color` the surrounding button/heading already has,
   * the same way the editor glyphs follow their `--glyph-*` tokens. */
  export let name: IconName;
  export let size = 16;
</script>

<svg
  class="cn-icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {@html ICONS[name]}
</svg>

<style>
  .cn-icon {
    display: block;
    flex-shrink: 0;
  }
</style>

<script lang="ts">
  /** §merged-titlebar: the real app icon (the "dated page" mark,
   * `docs/design/icon-A-master.svg` — same shape `src-tauri/icons/*` and
   * the in-app "Open date note" toolbar button already draw), for the
   * title bar's far-left corner. Deliberately its own component, not an
   * entry in `icons/paths.ts`'s `ICONS` map: everything in that set
   * renders in `currentColor` so it follows the app's own theme/glyph-
   * mode settings, but a title bar's app icon is a fixed brand mark —
   * same accent tile + white knockout regardless of theme, exactly like
   * a taskbar icon never re-themes itself. Colors are copied verbatim
   * from the master SVG rather than referencing `--accent`-style tokens,
   * on purpose. */
  export let size = 16;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 1024 1024"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
  class="app-icon-svg"
>
  <rect x="32" y="32" width="960" height="960" rx="232" fill="#007acc" />
  <g fill="none" stroke="#ffffff" stroke-width="46.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="300" y="300" width="424" height="424" rx="53" />
    <path d="M392.75 432.5H551.75" />
    <path d="M392.75 512H631.25" />
    <path d="M392.75 554.4H631.25" />
    <path d="M392.75 644.5H525.25" />
  </g>
</svg>

<style>
  .app-icon-svg {
    display: block;
    flex-shrink: 0;
  }
</style>

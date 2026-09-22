<script lang="ts">
  /** §merged-titlebar: the real app icon (the "daily agenda" mark on Obsidian Slate,
   * `docs/design/icon-A-master.svg` — same shape `src-tauri/icons/*` and
   * the desktop taskbar icon draw), for the title bar's far-left corner.
   * Deliberately its own component, not an entry in `icons/paths.ts`'s `ICONS` map:
   * everything in that set renders in `currentColor` so it follows the app's own
   * theme/glyph-mode settings, but a title bar's app icon is a fixed brand mark —
   * same obsidian tile + high-contrast knockout regardless of theme, exactly like
   * a taskbar icon never re-themes itself. Colors are copied verbatim from the
   * master SVG rather than referencing `--accent`-style tokens, on purpose. */
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
  <rect x="32" y="32" width="960" height="960" rx="232" fill="#18181b" stroke="#27272a" stroke-width="16" />
  <g fill="none" stroke="#fafafa" stroke-width="68" stroke-linecap="round" stroke-linejoin="round">
    <rect x="182" y="210" width="660" height="630" rx="130" />
    <path d="M182 390H842" />
    <path d="M350 135V275M674 135V275" />
    <path d="M330 600L450 720L700 470" />
  </g>
</svg>

<style>
  .app-icon-svg {
    display: block;
    flex-shrink: 0;
  }
</style>

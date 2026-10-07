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
  interface Props {
    size?: number;
  }

  let { size = 16 }: Props = $props();
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
  <defs>
    <linearGradient id="appIconBgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2c2c32" />
      <stop offset="100%" stop-color="#121214" />
    </linearGradient>
    <linearGradient id="appIconStrokeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255, 255, 255, 0.45)" />
      <stop offset="50%" stop-color="rgba(255, 255, 255, 0.15)" />
      <stop offset="100%" stop-color="rgba(255, 255, 255, 0.05)" />
    </linearGradient>
  </defs>
  <rect x="36" y="36" width="952" height="952" rx="232" fill="url(#appIconBgGrad)" stroke="url(#appIconStrokeGrad)" stroke-width="28" />
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

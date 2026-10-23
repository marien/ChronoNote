<script lang="ts">
  /** §merged-titlebar, §416: the real app icon (the "daily agenda" mark, no tile), for the
   * title bar's far-left corner and the About panel. Drawn from `appIconGeometry.ts`, the
   * same source as `src-tauri/icons/*` and the taskbar icon. Deliberately its own component,
   * not an entry in `icons/paths.ts`'s `ICONS` map: everything in that set renders in
   * `currentColor` so it follows the app's own theme/glyph-mode settings, but a title bar's
   * app icon is a fixed brand mark, exactly like a taskbar icon never re-themes itself.
   *
   * The drawing is made for the icon's size in device pixels (16 px at 125 % is 20), so the
   * pixel-fitted small sizes stay sharp at any display scale. */
  import { onMount } from "svelte";
  import { appIconInner } from "../appIconGeometry";

  interface Props {
    size?: number;
  }

  let { size = 16 }: Props = $props();

  let dpr = $state(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  const pixels = $derived(Math.max(1, Math.round(size * dpr)));

  // A move to a screen with another scale (or a zoom) changes the ratio without
  // necessarily resizing the window; a resolution query fires exactly then.
  onMount(() => {
    let query: MediaQueryList | undefined;
    const watch = () => {
      dpr = window.devicePixelRatio || 1;
      query?.removeEventListener("change", watch);
      query = window.matchMedia(`(resolution: ${dpr}dppx)`);
      query.addEventListener("change", watch);
    };
    watch();
    return () => query?.removeEventListener("change", watch);
  });
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 {pixels} {pixels}"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
  class="app-icon-svg"
>
  {@html appIconInner(pixels)}
</svg>

<style>
  .app-icon-svg {
    display: block;
    flex-shrink: 0;
  }
</style>

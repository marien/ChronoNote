/** §B1: Windows 11 Snap Layouts for the page-drawn maximize button. The native side (`snap_overlay.rs`) puts an
 * invisible child window over the button that tells Windows "this is the maximize button"; this module keeps that
 * window on the button (it reports the button's rectangle whenever the layout changes) and mirrors its hover state
 * onto the button, because the page no longer sees the pointer there. Desktop app only. */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The button's rectangle in client-area physical pixels, or a zero rect when it should not be covered (hidden,
 * zero-sized, or the bars are away in Zen/Peek). */
export function overlayRect(r: { left: number; top: number; width: number; height: number }, dpr: number, hidden: boolean): OverlayRect {
  if (hidden || r.width <= 0 || r.height <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: Math.round(r.left * dpr),
    y: Math.round(r.top * dpr),
    width: Math.round(r.width * dpr),
    height: Math.round(r.height * dpr),
  };
}

/** Starts following `button`. Returns a cleanup that hides the overlay and stops listening. */
export function wireSnapOverlay(button: HTMLElement): () => void {
  let last = "";
  let frame = 0;
  const send = (rect: OverlayRect) => {
    const key = `${rect.x},${rect.y},${rect.width},${rect.height}`;
    if (key === last) return;
    last = key;
    void invoke("snap_overlay_set_rect", { ...rect }).catch(() => {});
  };
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const hidden =
        !button.isConnected ||
        document.body.classList.contains("zen-mode") ||
        document.body.classList.contains("peek-mode");
      send(overlayRect(button.getBoundingClientRect(), window.devicePixelRatio || 1, hidden));
    });
  };

  const ro = new ResizeObserver(update);
  ro.observe(button);
  ro.observe(document.body);
  window.addEventListener("resize", update);
  // Zen/Peek toggle classes on <body>; the bars move away without resizing the button itself.
  const mo = new MutationObserver(update);
  mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  update();

  let unlisten: (() => void) | null = null;
  let disposed = false;
  void listen<boolean>("snap-overlay-hover", (e) => button.classList.toggle("snap-hover", e.payload)).then((u) => {
    if (disposed) u();
    else unlisten = u;
  });

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    ro.disconnect();
    mo.disconnect();
    window.removeEventListener("resize", update);
    unlisten?.();
    button.classList.remove("snap-hover");
    void invoke("snap_overlay_set_rect", { x: 0, y: 0, width: 0, height: 0 }).catch(() => {});
  };
}

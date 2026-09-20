/** Keeps the app above a phone's on-screen keyboard.
 *
 * Chrome on Android honours `interactive-widget=resizes-content` in the viewport
 * meta tag (the layout shrinks with the keyboard, so nothing needs doing here).
 * iOS Safari ignores it: the keyboard covers the layout viewport and only the
 * *visual* viewport shrinks, so the bottom bar and the last lines of the note end
 * up under the keyboard. There we size the app to the visual viewport ourselves
 * (`--app-vvh`, read by the height rules in app.css) and keep the caret in view. */
import { get } from "svelte/store";
import { editorApi, isMobile } from "./stores";

/** Below this much lost height the visual viewport is just browser chrome
 * showing/hiding, not a keyboard. */
const KEYBOARD_MIN_PX = 120;

export function keyboardHeight(innerHeight: number, viewportHeight: number): number {
  const lost = innerHeight - viewportHeight;
  return lost >= KEYBOARD_MIN_PX ? lost : 0;
}

export function wireMobileViewport(): () => void {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return () => {};

  const root = document.documentElement;

  // CodeMirror only scrolls the caret into view when the selection changes, not
  // when the editor's box shrinks under it - so once the keyboard has resized the
  // layout the caret line can sit below the visible part of the editor. The
  // keyboard animates in over a few hundred ms and fires several resizes, so keep
  // re-checking until things have settled.
  let caretTimers: ReturnType<typeof setTimeout>[] = [];
  const editorFocused = () => !!(document.activeElement as HTMLElement | null)?.closest?.(".cm-editor");
  const keepCaretVisible = () => {
    for (const t of caretTimers) clearTimeout(t);
    caretTimers = [60, 250, 500].map((ms) =>
      setTimeout(() => {
        if (get(isMobile) && editorFocused()) editorApi?.scrollCaretIntoView?.();
      }, ms),
    );
  };

  const update = () => {
    if (!get(isMobile)) {
      root.style.removeProperty("--app-vvh");
      return;
    }
    const open = keyboardHeight(window.innerHeight, vv.height) > 0;
    if (open) {
      root.style.setProperty("--app-vvh", `${Math.round(vv.height)}px`);
      // iOS also pans the page up to reveal the focused field; the app is
      // sized to the visual viewport, so undo the pan.
      if (vv.offsetTop > 0) window.scrollTo(0, 0);
    } else {
      root.style.removeProperty("--app-vvh");
    }
  };

  const onViewportChange = () => {
    update();
    keepCaretVisible();
  };
  vv.addEventListener("resize", onViewportChange);
  vv.addEventListener("scroll", update);
  // Chrome (interactive-widget=resizes-content) resizes the layout itself, which
  // shows up as a plain window resize.
  window.addEventListener("resize", onViewportChange);
  // Tapping into the editor is what raises the keyboard; it arrives a moment later.
  document.addEventListener("focusin", keepCaretVisible);
  update();
  return () => {
    vv.removeEventListener("resize", onViewportChange);
    vv.removeEventListener("scroll", update);
    window.removeEventListener("resize", onViewportChange);
    document.removeEventListener("focusin", keepCaretVisible);
    for (const t of caretTimers) clearTimeout(t);
    root.style.removeProperty("--app-vvh");
  };
}

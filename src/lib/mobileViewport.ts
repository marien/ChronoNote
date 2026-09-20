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
  let wasOpen = false;

  const update = () => {
    if (!get(isMobile)) {
      root.style.removeProperty("--app-vvh");
      wasOpen = false;
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
    if (open !== wasOpen) {
      wasOpen = open;
      // The layout just changed height under the caret: bring it back into view.
      requestAnimationFrame(() => editorApi?.scrollCaretIntoView?.());
    }
  };

  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
  return () => {
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
    root.style.removeProperty("--app-vvh");
  };
}

import { dismissTop } from "../overlays";

/** Decides whether a swipe gesture should close the bottom sheet.
 * Moved > 80px downwards or flicked downwards at > 0.5 px/ms. */
export function shouldClose(dy: number, ms: number): boolean {
  if (dy <= 0) return false;
  if (dy > 80) return true;
  if (ms > 0 && dy / ms > 0.5) return true;
  return false;
}

export interface SheetSwipeOptions {
  onClose?: () => void;
}

export type SheetSwipeParam = SheetSwipeOptions | (() => void) | undefined;

/** Svelte action for phone bottom sheets: swipe down on the top 48px (handle/title area)
 * translates the sheet with the finger and closes on release when moved > 80px or flicked (> 0.5 px/ms).
 * Mouse pointers are ignored so desktop remains unaffected. */
export function sheetSwipe(node: HTMLElement, param?: SheetSwipeParam) {
  let onClose: () => void = resolveOnClose(param);

  function resolveOnClose(p?: SheetSwipeParam): () => void {
    if (typeof p === "function") return p;
    if (p && typeof p.onClose === "function") return p.onClose;
    return dismissTop;
  }

  let activePointerId: number | null = null;
  let startY = 0;
  let startTime = 0;
  let currentDy = 0;
  let handledMoveEvent: PointerEvent | null = null;
  let handledUpEvent: PointerEvent | null = null;
  let handledCancelEvent: PointerEvent | null = null;

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse") return;

    const rect = node.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    if (relY < 0 || relY > 48) return;

    activePointerId = e.pointerId;
    startY = e.clientY;
    startTime = Date.now();
    currentDy = 0;

    node.style.transition = "none";

    try {
      node.setPointerCapture?.(e.pointerId);
    } catch {
      // jsdom or unsupported
    }

    // Once a swipe has started, keep the browser from turning the drag into a scroll: it would cancel the pointer
    // (the sheet stopped after a few pixels) and a drag over the filter field would focus it (Marien, 2026-10-10).
    window.addEventListener("touchmove", blockTouchScroll, { passive: false });
    node.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointermove", handlePointerMove);
    node.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointerup", handlePointerUp);
    node.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  function blockTouchScroll(e: TouchEvent) {
    if (activePointerId !== null && e.cancelable) e.preventDefault();
  }

  function handlePointerMove(e: PointerEvent) {
    if (e === handledMoveEvent) return;
    handledMoveEvent = e;
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    const dy = Math.max(0, e.clientY - startY);
    currentDy = dy;
    node.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
  }

  function handlePointerUp(e: PointerEvent) {
    if (e === handledUpEvent) return;
    handledUpEvent = e;
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    const dy = Math.max(0, e.clientY - startY, currentDy);
    const ms = Math.max(1, Date.now() - startTime);

    cleanup();

    if (shouldClose(dy, ms)) {
      node.style.transition = "";
      node.style.transform = "";
      onClose();
    } else {
      node.style.transition = "transform var(--motion-normal, 0.2s) var(--ease-decelerate, ease-out)";
      node.style.transform = "";
    }
  }

  function handlePointerCancel(e: PointerEvent) {
    if (e === handledCancelEvent) return;
    handledCancelEvent = e;
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    cleanup();
    node.style.transition = "transform var(--motion-normal, 0.2s) var(--ease-decelerate, ease-out)";
    node.style.transform = "";
  }

  function cleanup() {
    if (activePointerId !== null) {
      try {
        node.releasePointerCapture?.(activePointerId);
      } catch {
        // ignore
      }
      activePointerId = null;
    }
    window.removeEventListener("touchmove", blockTouchScroll);
    node.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointermove", handlePointerMove);
    node.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointerup", handlePointerUp);
    node.removeEventListener("pointercancel", handlePointerCancel);
    window.removeEventListener("pointercancel", handlePointerCancel);
  }

  node.addEventListener("pointerdown", onPointerDown);

  return {
    update(newParam?: SheetSwipeParam) {
      onClose = resolveOnClose(newParam);
    },
    destroy() {
      node.removeEventListener("pointerdown", onPointerDown);
      cleanup();
    },
  };
}

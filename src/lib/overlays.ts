// The overlay stack: everything open on top of the editor, in order.
// See docs/design/overlay-state-design.md. Not wired in yet (refactor step 1).
import { derived, get, writable, type Readable } from "svelte/store";
import type { ModalKind } from "./stores";

export type NonModalOverlayKind = "find" | "mobileTabs" | "folderPicker" | "syncHealth";
export type OverlayKind = Exclude<ModalKind, "none"> | NonModalOverlayKind;

export interface Overlay {
  kind: OverlayKind;
  dismissable: boolean; // false for "conflict": needs an explicit choice
  onDismiss?: () => void;
}

const NON_MODAL: ReadonlySet<OverlayKind> = new Set<OverlayKind>([
  "find",
  "mobileTabs",
  "folderPicker",
  "syncHealth",
]);

export const overlays = writable<Overlay[]>([]);

/** Push on top; an existing entry of the same kind is moved, not duplicated. */
export function openOverlay(o: Overlay): void {
  overlays.update((s) => [...s.filter((x) => x.kind !== o.kind), o]);
}

/** Remove that kind wherever it is in the stack. No-op if absent. */
export function closeOverlay(kind: OverlayKind): void {
  overlays.update((s) => (s.some((x) => x.kind === kind) ? s.filter((x) => x.kind !== kind) : s));
}

/** What Escape and mobile Back call. True when something was closed. */
export function dismissTop(): boolean {
  const stack = get(overlays);
  const top = stack[stack.length - 1];
  if (!top || !top.dismissable) return false;
  overlays.set(stack.slice(0, -1)); // pop first, then notify
  top.onDismiss?.();
  return true;
}

export const topOverlay: Readable<Overlay | null> = derived(
  overlays,
  (s) => s[s.length - 1] ?? null,
);

/** Kind of the top-most entry that is a ModalKind, or "none". */
export const modalFromStack: Readable<ModalKind> = derived(overlays, (s) => {
  for (let i = s.length - 1; i >= 0; i--) {
    if (!NON_MODAL.has(s[i].kind)) return s[i].kind as ModalKind;
  }
  return "none";
});

export function isOpen(kind: OverlayKind): Readable<boolean> {
  return derived(overlays, (s) => s.some((x) => x.kind === kind));
}

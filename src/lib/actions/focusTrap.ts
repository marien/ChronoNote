/** §95: applied to every modal's `.modal-card`. Two jobs:
 *
 *  1. **Trap** — while the modal is open, `Tab` / `Shift+Tab` stay within
 *     its own focusable controls and never reach the editor (or a tab, or
 *     the top bar) behind the overlay. If focus somehow starts outside the
 *     card, the first Tab pulls it in. A modal with no focusables just
 *     swallows Tab.
 *  2. **Restore** — on close, focus returns to the editor. It only goes
 *     back to the *exact* pre-modal element when that was already the
 *     editor, another still-open overlay (a chained modal), or `<body>`:
 *     a modal opened from a top-bar button or a tab shouldn't strand
 *     focus on that control afterwards — the reviews' Task 8 wants the
 *     caret back where the writing was. CodeMirror keeps its own
 *     selection across the focus loss, so the caret lands exactly where
 *     it was.
 *
 * The keydown listener is on `document` in the capture phase (not on the
 * card) so it works regardless of where focus currently is — a card-only
 * listener never fires while focus is still on the editor. Nothing here
 * touches Escape; App.svelte's global handlers still close the modal. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function focusTrap(node: HTMLElement) {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  function focusables(): HTMLElement[] {
    // Svelte's `{#if}` already removes absent controls from the DOM, so a
    // plain attribute/`disabled` filter covers the realistic cases; no
    // layout-based visibility check (which jsdom can't do anyway).
    return [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true",
    );
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const items = focusables();
    const active = document.activeElement;
    const inside = node.contains(active);

    if (items.length === 0) {
      if (!inside) e.preventDefault(); // don't let Tab wander off to the editor
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];

    if (!inside) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  document.addEventListener("keydown", onKeydown, true);

  return {
    destroy() {
      document.removeEventListener("keydown", onKeydown, true);
      const editor = document.querySelector<HTMLElement>(".cm-content");
      const prev = previouslyFocused;
      const restorePrev =
        prev &&
        document.contains(prev) &&
        (prev === document.body ||
          prev.closest(".cm-editor") !== null ||
          // A chained modal is already open — its own focusTrap will take
          // over; don't yank focus to the editor between the two.
          prev.closest(".overlay") !== null);
      (restorePrev ? prev : editor)?.focus();
    },
  };
}

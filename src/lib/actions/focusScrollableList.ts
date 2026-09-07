/** §71: used by the Keyboard Shortcuts and Symbols & Sections drawers,
 * neither of which has a text input to focus (unlike the Date picker,
 * Action Drawer, History, and Search modals) — without moving focus
 * somewhere, it never leaves the background editor when one of these
 * opens, so every key (arrows included) kept reaching CodeMirror instead
 * of scrolling the drawer's own list.
 *
 * Focusing the list element is necessary but, in practice, not reliably
 * sufficient on its own — the browser's *default* arrow-key/Page Up/Page
 * Down/Home/End scroll action for a focused, `overflow: auto` element
 * couldn't be confirmed to fire consistently, so this handles those keys
 * itself rather than depending on that default action happening. Nothing
 * here stops propagation: the app's global shortcuts (bound on `window`
 * in App.svelte, Escape included) keep working exactly as if focus were
 * still on the editor. */
export function focusScrollableList(node: HTMLElement) {
  node.tabIndex = -1;
  node.focus();

  function onKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        node.scrollBy({ top: 40 });
        break;
      case "ArrowUp":
        node.scrollBy({ top: -40 });
        break;
      case "PageDown":
        node.scrollBy({ top: node.clientHeight });
        break;
      case "PageUp":
        node.scrollBy({ top: -node.clientHeight });
        break;
      case "Home":
        node.scrollTo({ top: 0 });
        break;
      case "End":
        node.scrollTo({ top: node.scrollHeight });
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  node.addEventListener("keydown", onKeydown);

  return {
    destroy() {
      node.removeEventListener("keydown", onKeydown);
    },
  };
}

// A plain `on:click|self` closes the modal if a drag started inside it (e.g.
// resizing a textarea, or selecting text) ends with the mouse released over
// the overlay — the browser's click target is the overlay even though the
// gesture never intended to leave the modal. Only close when the mousedown
// that started the gesture also landed on the overlay itself.
export function closeOnOutsideClick(node: HTMLElement, callback: () => void) {
  let downOnSelf = false;

  function onMouseDown(e: MouseEvent) {
    downOnSelf = e.target === node;
  }

  function onClick(e: MouseEvent) {
    if (downOnSelf && e.target === node) callback();
    downOnSelf = false;
  }

  node.addEventListener("mousedown", onMouseDown);
  node.addEventListener("click", onClick);

  return {
    destroy() {
      node.removeEventListener("mousedown", onMouseDown);
      node.removeEventListener("click", onClick);
    },
  };
}

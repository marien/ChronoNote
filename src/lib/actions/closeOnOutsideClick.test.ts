import { describe, it, expect, vi } from "vitest";
import { closeOnOutsideClick } from "./closeOnOutsideClick";

/** Mirrors the real markup: `node` is the overlay, `child` is the modal
 * card sitting inside it — clicking the card itself should never close
 * the modal, only a click that both starts and ends on the bare overlay. */
function setup() {
  const node = document.createElement("div");
  const child = document.createElement("div");
  node.appendChild(child);
  document.body.appendChild(node);
  const callback = vi.fn();
  const action = closeOnOutsideClick(node, callback);
  return { node, child, callback, action };
}

function fire(target: HTMLElement, type: "mousedown" | "click") {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true }));
}

describe("closeOnOutsideClick", () => {
  it("fires the callback when both mousedown and click land on the overlay itself", () => {
    const { node, callback } = setup();
    fire(node, "mousedown");
    fire(node, "click");
    expect(callback).toHaveBeenCalledOnce();
  });

  it("does not fire when the click's target is a child (clicking inside the modal card)", () => {
    const { child, callback } = setup();
    fire(child, "mousedown");
    fire(child, "click");
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not fire for a drag that starts inside the card but is released over the overlay", () => {
    // The scenario §7d401a6 fixed: selecting text or resizing a textarea
    // inside the modal, with the mouse ending up over the overlay on
    // release — a plain mousedown-anywhere/click-on-overlay check would
    // wrongly treat this as "outside click" and close the modal.
    const { node, child, callback } = setup();
    fire(child, "mousedown");
    fire(node, "click");
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not fire for a drag that starts on the overlay but ends on the card", () => {
    const { node, child, callback } = setup();
    fire(node, "mousedown");
    fire(child, "click");
    expect(callback).not.toHaveBeenCalled();
  });

  it("resets after each click, requiring a fresh mousedown+click pair to fire again", () => {
    const { node, callback } = setup();
    fire(node, "mousedown");
    fire(node, "click");
    fire(node, "click"); // no mousedown before this one
    expect(callback).toHaveBeenCalledOnce();
  });

  it("stops responding after destroy()", () => {
    const { node, callback, action } = setup();
    action.destroy();
    fire(node, "mousedown");
    fire(node, "click");
    expect(callback).not.toHaveBeenCalled();
  });
});

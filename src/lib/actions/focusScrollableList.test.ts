import { describe, it, expect, vi } from "vitest";
import { focusScrollableList } from "./focusScrollableList";

/** jsdom implements `Element.scrollBy`/`scrollTo` as no-ops that don't
 * actually move `scrollTop` (it has no real layout engine) — spying on
 * them instead of asserting `scrollTop` afterward tests the actual
 * dispatch logic (which key does what) independently of that limitation,
 * the same reasoning that led §71/§73 to verify this behavior against a
 * real browser rather than trust it in isolation. */
function setup() {
  const node = document.createElement("div");
  Object.defineProperty(node, "clientHeight", { value: 300, configurable: true });
  Object.defineProperty(node, "scrollHeight", { value: 900, configurable: true });
  node.scrollBy = vi.fn();
  node.scrollTo = vi.fn();
  const focusSpy = vi.spyOn(node, "focus");
  document.body.appendChild(node);
  const action = focusScrollableList(node);
  return { node, action, focusSpy };
}

function keydown(node: HTMLElement, key: string) {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  node.dispatchEvent(event);
  return event;
}

describe("focusScrollableList", () => {
  it("focuses the node and makes it programmatically focusable on setup", () => {
    const { node, focusSpy } = setup();
    expect(node.tabIndex).toBe(-1);
    expect(focusSpy).toHaveBeenCalledOnce();
  });

  it("scrolls down/up by a fixed step on ArrowDown/ArrowUp", () => {
    const { node } = setup();
    keydown(node, "ArrowDown");
    expect(node.scrollBy).toHaveBeenCalledWith({ top: 40 });
    keydown(node, "ArrowUp");
    expect(node.scrollBy).toHaveBeenCalledWith({ top: -40 });
  });

  it("scrolls by a full page on PageDown/PageUp", () => {
    const { node } = setup();
    keydown(node, "PageDown");
    expect(node.scrollBy).toHaveBeenCalledWith({ top: 300 });
    keydown(node, "PageUp");
    expect(node.scrollBy).toHaveBeenCalledWith({ top: -300 });
  });

  it("jumps to the top/bottom on Home/End", () => {
    const { node } = setup();
    keydown(node, "Home");
    expect(node.scrollTo).toHaveBeenCalledWith({ top: 0 });
    keydown(node, "End");
    expect(node.scrollTo).toHaveBeenCalledWith({ top: 900 });
  });

  it("prevents the default action for keys it handles", () => {
    const { node } = setup();
    const event = keydown(node, "ArrowDown");
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores keys it doesn't handle, without preventing their default", () => {
    const { node } = setup();
    const event = keydown(node, "a");
    expect(node.scrollBy).not.toHaveBeenCalled();
    expect(node.scrollTo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("stops handling keys after destroy() (no leaked listener)", () => {
    const { node, action } = setup();
    action.destroy();
    keydown(node, "ArrowDown");
    expect(node.scrollBy).not.toHaveBeenCalled();
  });
});

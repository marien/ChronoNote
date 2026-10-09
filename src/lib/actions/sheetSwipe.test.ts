import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sheetSwipe, shouldClose } from "./sheetSwipe";

describe("shouldClose", () => {
  it("returns false for non-positive dy", () => {
    expect(shouldClose(0, 10)).toBe(false);
    expect(shouldClose(-20, 10)).toBe(false);
    expect(shouldClose(0, 0)).toBe(false);
    expect(shouldClose(-100, 50)).toBe(false);
  });

  it("returns true when moved > 80px regardless of speed", () => {
    expect(shouldClose(81, 1000)).toBe(true);
    expect(shouldClose(120, 500)).toBe(true);
    expect(shouldClose(80.5, 2000)).toBe(true);
  });

  it("returns false when dy <= 80px and speed <= 0.5 px/ms", () => {
    expect(shouldClose(80, 200)).toBe(false);
    expect(shouldClose(50, 150)).toBe(false);
    expect(shouldClose(30, 100)).toBe(false);
  });

  it("returns true when flicked > 0.5 px/ms even if dy <= 80px", () => {
    // 50px in 50ms = 1.0 px/ms > 0.5
    expect(shouldClose(50, 50)).toBe(true);
    // 40px in 60ms = 0.667 px/ms > 0.5
    expect(shouldClose(40, 60)).toBe(true);
    // 20px in 30ms = 0.667 px/ms > 0.5
    expect(shouldClose(20, 30)).toBe(true);
  });

  it("handles ms <= 0 edge cases safely", () => {
    expect(shouldClose(100, 0)).toBe(true);
    expect(shouldClose(50, 0)).toBe(false);
    expect(shouldClose(0, 0)).toBe(false);
  });
});

describe("sheetSwipe action", () => {
  let node: HTMLElement;

  beforeEach(() => {
    node = document.createElement("div");
    // Mock getBoundingClientRect: top = 100, bottom = 600, height = 500
    vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 600,
      left: 0,
      right: 390,
      width: 390,
      height: 500,
      x: 0,
      y: 100,
      toJSON: () => {},
    });
    document.body.appendChild(node);
  });

  afterEach(() => {
    node.remove();
    vi.restoreAllMocks();
  });

  it("ignores mouse pointers", () => {
    const onClose = vi.fn();
    const action = sheetSwipe(node, onClose);

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "mouse",
        clientY: 110,
        pointerId: 1,
      }),
    );

    node.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientY: 250,
        pointerId: 1,
      }),
    );

    node.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerType: "mouse",
        clientY: 250,
        pointerId: 1,
      }),
    );

    expect(node.style.transform).toBe("");
    expect(onClose).not.toHaveBeenCalled();
    action.destroy();
  });

  it("ignores pointerdown below top 48px", () => {
    const onClose = vi.fn();
    const action = sheetSwipe(node, onClose);

    // rect.top is 100, so clientY 160 is 60px down (> 48px)
    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientY: 160,
        pointerId: 1,
      }),
    );

    node.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "touch",
        clientY: 300,
        pointerId: 1,
      }),
    );

    expect(node.style.transform).toBe("");
    expect(onClose).not.toHaveBeenCalled();
    action.destroy();
  });

  it("tracks vertical movement downwards within top 48px and translates the node", () => {
    const onClose = vi.fn();
    const action = sheetSwipe(node, onClose);

    // pointerdown at clientY = 120 (relY = 20 <= 48)
    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientY: 120,
        pointerId: 1,
      }),
    );

    // move downwards 50px to clientY = 170
    node.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "touch",
        clientY: 170,
        pointerId: 1,
      }),
    );

    expect(node.style.transform).toBe("translateY(50px)");

    // move upwards above start to clientY = 100 (dy clamped to 0)
    node.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "touch",
        clientY: 100,
        pointerId: 1,
      }),
    );

    expect(node.style.transform).toBe("");
    action.destroy();
  });

  it("closes on release when moved > 80px", () => {
    const onClose = vi.fn();
    const action = sheetSwipe(node, onClose);

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientY: 110,
        pointerId: 1,
      }),
    );

    node.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "touch",
        clientY: 210,
        pointerId: 1,
      }),
    );

    node.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerType: "touch",
        clientY: 210,
        pointerId: 1,
      }),
    );

    expect(onClose).toHaveBeenCalledOnce();
    action.destroy();
  });

  it("animates back on release when threshold is not reached", () => {
    const onClose = vi.fn();
    const action = sheetSwipe(node, onClose);

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientY: 110,
        pointerId: 1,
      }),
    );

    node.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "touch",
        clientY: 130, // 20px move
        pointerId: 1,
      }),
    );

    // Simulate elapsed time > 40ms so speed is <= 0.5
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 200);

    node.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerType: "touch",
        clientY: 130,
        pointerId: 1,
      }),
    );

    expect(onClose).not.toHaveBeenCalled();
    expect(node.style.transform).toBe("");
    expect(node.style.transition).toContain("transform");
    action.destroy();
  });

  it("animates back on pointercancel", () => {
    const onClose = vi.fn();
    const action = sheetSwipe(node, onClose);

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientY: 110,
        pointerId: 1,
      }),
    );

    node.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "touch",
        clientY: 180,
        pointerId: 1,
      }),
    );

    node.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        pointerType: "touch",
        clientY: 180,
        pointerId: 1,
      }),
    );

    expect(onClose).not.toHaveBeenCalled();
    expect(node.style.transform).toBe("");
    expect(node.style.transition).toContain("transform");
    action.destroy();
  });
});

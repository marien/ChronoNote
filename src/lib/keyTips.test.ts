import { describe, expect, it } from "vitest";
import { initialKeyTipState, next } from "./keyTips";

describe("keyTips reducer", () => {
  it("Alt tap toggles on", () => {
    let { state, action } = next(initialKeyTipState, { type: "altDown" });
    expect(state.active).toBe(false);
    expect(state.armed).toBe(true);
    expect(action.type).toBe("none");

    ({ state, action } = next(state, { type: "altUp" }));
    expect(state.active).toBe(true);
    expect(state.armed).toBe(false);
    expect(action.type).toBe("show");

    // Tapping Alt again while on toggles off
    ({ state, action } = next(state, { type: "altDown" }));
    expect(state.active).toBe(false);
    expect(state.armed).toBe(false);
    expect(action.type).toBe("off");

    ({ state, action } = next(state, { type: "altUp" }));
    expect(state.active).toBe(false);
    expect(action.type).toBe("none");
  });

  it("Alt+Left (altDown, otherKeyDown) never turns on", () => {
    let { state, action } = next(initialKeyTipState, { type: "altDown" });
    expect(state.armed).toBe(true);

    ({ state, action } = next(state, { type: "otherKeyDown", key: "ArrowLeft" }));
    expect(state.armed).toBe(false);
    expect(state.active).toBe(false);
    expect(action.type).toBe("none");

    ({ state, action } = next(state, { type: "altUp" }));
    expect(state.active).toBe(false);
    expect(state.armed).toBe(false);
    expect(action.type).toBe("none");
  });

  it("AltRight never turns on", () => {
    let { state, action } = next(initialKeyTipState, { type: "altDown", code: "AltRight" });
    expect(state.armed).toBe(false);
    expect(state.active).toBe(false);
    expect(action.type).toBe("none");

    ({ state, action } = next(state, { type: "altUp", code: "AltRight" }));
    expect(state.active).toBe(false);
    expect(action.type).toBe("none");
  });

  it("a letter while on returns click with that letter", () => {
    const activeState = { active: true, armed: false };
    const { state, action } = next(activeState, { type: "otherKeyDown", key: "a" });
    expect(state.active).toBe(false);
    expect(action).toEqual({ type: "click", letter: "A", key: "A" });
  });

  it("Escape returns off", () => {
    const activeState = { active: true, armed: false };
    const { state, action } = next(activeState, { type: "otherKeyDown", key: "Escape" });
    expect(state.active).toBe(false);
    expect(action).toEqual({ type: "off" });
  });

  it("mouseDown and blur turn tips off without running anything", () => {
    const activeState = { active: true, armed: false };
    let res = next(activeState, { type: "mouseDown" });
    expect(res.state.active).toBe(false);
    expect(res.action.type).toBe("off");

    res = next(activeState, { type: "blur" });
    expect(res.state.active).toBe(false);
    expect(res.action.type).toBe("off");
  });

  it("ignores AltDown with modifiers held", () => {
    let res = next(initialKeyTipState, { type: "altDown", ctrlKey: true });
    expect(res.state.armed).toBe(false);

    res = next(initialKeyTipState, { type: "altDown", shiftKey: true });
    expect(res.state.armed).toBe(false);

    res = next(initialKeyTipState, { type: "altDown", metaKey: true });
    expect(res.state.armed).toBe(false);
  });
});

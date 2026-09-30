import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { get } from "svelte/store";
import * as stores from "./stores";

describe("toast system and actionable toasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stores.dismissToast();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets toastMessage and clears toastAction for simple toasts", () => {
    stores.showToast("Plain informational message");
    expect(get(stores.toastMessage)).toBe("Plain informational message");
    expect(get(stores.toastAction)).toBeNull();
  });

  it("stores action callback when passed as function or ToastOptions", () => {
    const fn1 = vi.fn();
    stores.showToast("Actionable toast 1", fn1);
    expect(get(stores.toastMessage)).toBe("Actionable toast 1");
    expect(get(stores.toastAction)).toBe(fn1);

    const fn2 = vi.fn();
    stores.showToast("Actionable toast 2", { action: fn2 });
    expect(get(stores.toastMessage)).toBe("Actionable toast 2");
    expect(get(stores.toastAction)).toBe(fn2);
  });

  it("dismissToast clears message and action immediately", () => {
    const fn = vi.fn();
    stores.showToast("Notice", { action: fn });
    expect(get(stores.toastMessage)).toBe("Notice");
    expect(get(stores.toastAction)).toBe(fn);

    stores.dismissToast();
    expect(get(stores.toastMessage)).toBe("");
    expect(get(stores.toastAction)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("runToastAction dismisses toast and executes the action", () => {
    const fn = vi.fn();
    stores.showToast("Please sign in", { action: fn });

    stores.runToastAction();
    expect(get(stores.toastMessage)).toBe("");
    expect(get(stores.toastAction)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("clears both toastMessage and toastAction on timer expiry", () => {
    const fn = vi.fn();
    stores.showToast("Quick toast", { action: fn });

    vi.advanceTimersByTime(2400);
    expect(get(stores.toastMessage)).toBe("");
    expect(get(stores.toastAction)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("replaces previous action when a new toast is shown", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    stores.showToast("First", { action: fn1 });
    stores.showToast("Second", { action: fn2 });

    stores.runToastAction();
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});

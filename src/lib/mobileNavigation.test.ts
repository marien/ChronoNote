import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { wireMobileBackNavigation } from "./mobileNavigation";

describe("wireMobileBackNavigation", () => {
  let pushStateSpy: any;
  let backSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pushes history state when overlay opens", () => {
    let open = false;
    const nav = wireMobileBackNavigation({
      hasOpenOverlay: () => open,
      closeActiveOverlay: () => {
        open = false;
      },
    });

    open = true;
    nav.sync(true);
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith({ chrononoteOverlay: true }, "");

    // Calling sync(true) again while already pushed doesn't push a second time
    nav.sync(true);
    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    nav.destroy();
  });

  it("calls history.back() when overlay closes programmatically", () => {
    let open = true;
    const nav = wireMobileBackNavigation({
      hasOpenOverlay: () => open,
      closeActiveOverlay: () => {
        open = false;
      },
    });

    nav.sync(true);
    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    // Mock history.state indicating our overlay was pushed
    Object.defineProperty(window.history, "state", {
      value: { chrononoteOverlay: true },
      configurable: true,
      writable: true,
    });

    open = false;
    nav.sync(false);
    expect(backSpy).toHaveBeenCalledTimes(1);

    nav.destroy();
  });

  it("closes active overlay when popstate event fires", () => {
    let open = true;
    let closed = false;
    const nav = wireMobileBackNavigation({
      hasOpenOverlay: () => open,
      closeActiveOverlay: () => {
        open = false;
        closed = true;
      },
    });

    nav.sync(true);

    // Fire popstate (user pressed Android back)
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    expect(closed).toBe(true);
    expect(open).toBe(false);

    nav.destroy();
  });

  it("does not close overlay when popstate was triggered by internal history.back() unwind", () => {
    let open = true;
    let closeCallCount = 0;
    const nav = wireMobileBackNavigation({
      hasOpenOverlay: () => open,
      closeActiveOverlay: () => {
        closeCallCount++;
      },
    });

    nav.sync(true);

    Object.defineProperty(window.history, "state", {
      value: { chrononoteOverlay: true },
      configurable: true,
      writable: true,
    });

    // Programmatically close overlay
    open = false;
    nav.sync(false);
    expect(backSpy).toHaveBeenCalledTimes(1);

    // The popstate caused by history.back() arrives
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    expect(closeCallCount).toBe(0);

    nav.destroy();
  });

  it("responds to chrononote:overlaychange events", () => {
    let open = false;
    const nav = wireMobileBackNavigation({
      hasOpenOverlay: () => open,
      closeActiveOverlay: () => {
        open = false;
      },
    });

    window.dispatchEvent(new CustomEvent("chrononote:overlaychange", { detail: { hasOverlay: true } }));
    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(window.history, "state", {
      value: { chrononoteOverlay: true },
      configurable: true,
      writable: true,
    });

    window.dispatchEvent(new CustomEvent("chrononote:overlaychange", { detail: { hasOverlay: false } }));
    expect(backSpy).toHaveBeenCalledTimes(1);

    nav.destroy();
  });
});

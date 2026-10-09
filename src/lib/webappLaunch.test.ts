import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  shouldApplyMobileDefaults,
  parseWebappLaunchOpen,
  readMobileDefaultsApplied,
  writeMobileDefaultsApplied,
  handleWebappLaunch,
  resetWebappLaunchHandledForTesting,
  MOBILE_DEFAULTS_KEY,
} from "./webappLaunch";
import * as tabs from "./tabs";
import * as actions from "./actions";
import * as search from "./search";
import * as date from "./date";
import { applyThemeModeToDom } from "./boot";

describe("shouldApplyMobileDefaults (D1)", () => {
  it("applies on web backend, on mobile, when not already applied and at factory defaults", () => {
    const config = { wordWrap: false, fontSize: 13 };
    expect(shouldApplyMobileDefaults(config, true, "web", false)).toBe(true);
  });

  it("applies when fontSize is undefined (factory default)", () => {
    const config = { wordWrap: false };
    expect(shouldApplyMobileDefaults(config, true, "web", false)).toBe(true);
  });

  it("does not apply if already applied in this browser", () => {
    const config = { wordWrap: false, fontSize: 13 };
    expect(shouldApplyMobileDefaults(config, true, "web", true)).toBe(false);
  });

  it("does not apply on desktop backend", () => {
    const config = { wordWrap: false, fontSize: 13 };
    expect(shouldApplyMobileDefaults(config, true, "desktop", false)).toBe(false);
  });

  it("does not apply on demo backend", () => {
    const config = { wordWrap: false, fontSize: 13 };
    expect(shouldApplyMobileDefaults(config, true, "demo", false)).toBe(false);
  });

  it("does not apply when not on mobile (desktop web)", () => {
    const config = { wordWrap: false, fontSize: 13 };
    expect(shouldApplyMobileDefaults(config, false, "web", false)).toBe(false);
  });

  it("does not apply when user already customized wordWrap to true", () => {
    const config = { wordWrap: true, fontSize: 13 };
    expect(shouldApplyMobileDefaults(config, true, "web", false)).toBe(false);
  });

  it("does not apply when user already customized fontSize away from 13", () => {
    expect(shouldApplyMobileDefaults({ wordWrap: false, fontSize: 14 }, true, "web", false)).toBe(false);
    expect(shouldApplyMobileDefaults({ wordWrap: false, fontSize: 16 }, true, "web", false)).toBe(false);
  });

  it("does not apply when config is null or undefined", () => {
    expect(shouldApplyMobileDefaults(null, true, "web", false)).toBe(false);
    expect(shouldApplyMobileDefaults(undefined, true, "web", false)).toBe(false);
  });

  it("leaves readableLineLength intact (applies regardless of its value)", () => {
    const config1 = { wordWrap: false, fontSize: 13, readableLineLength: false };
    expect(shouldApplyMobileDefaults(config1, true, "web", false)).toBe(true);

    const config2 = { wordWrap: false, fontSize: 13, readableLineLength: true };
    expect(shouldApplyMobileDefaults(config2, true, "web", false)).toBe(true);
  });
});

describe("localStorage helpers for mobile defaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads false when key is absent", () => {
    expect(readMobileDefaultsApplied()).toBe(false);
  });

  it("reads true after writing", () => {
    writeMobileDefaultsApplied();
    expect(localStorage.getItem(MOBILE_DEFAULTS_KEY)).toBe("true");
    expect(readMobileDefaultsApplied()).toBe(true);
  });

  it("handles storage exceptions gracefully", () => {
    const originalGetItem = localStorage.getItem;
    localStorage.getItem = vi.fn().mockImplementation(() => {
      throw new Error("SecurityError: Access is denied");
    });
    expect(readMobileDefaultsApplied()).toBe(false);
    localStorage.getItem = originalGetItem;
  });
});

describe("parseWebappLaunchOpen (D7.2)", () => {
  it("parses 'today'", () => {
    expect(parseWebappLaunchOpen("?open=today")).toBe("today");
    expect(parseWebappLaunchOpen("open=today")).toBe("today");
    expect(parseWebappLaunchOpen(new URLSearchParams("open=today"))).toBe("today");
  });

  it("parses 'actions'", () => {
    expect(parseWebappLaunchOpen("?open=actions")).toBe("actions");
    expect(parseWebappLaunchOpen("open=actions")).toBe("actions");
    expect(parseWebappLaunchOpen(new URLSearchParams("open=actions"))).toBe("actions");
  });

  it("parses 'search'", () => {
    expect(parseWebappLaunchOpen("?open=search")).toBe("search");
    expect(parseWebappLaunchOpen("open=search")).toBe("search");
    expect(parseWebappLaunchOpen(new URLSearchParams("open=search"))).toBe("search");
  });

  it("ignores unknown values", () => {
    expect(parseWebappLaunchOpen("?open=settings")).toBeNull();
    expect(parseWebappLaunchOpen("?open=other")).toBeNull();
    expect(parseWebappLaunchOpen("?open=123")).toBeNull();
  });

  it("returns null for empty or missing query", () => {
    expect(parseWebappLaunchOpen("")).toBeNull();
    expect(parseWebappLaunchOpen("?open=")).toBeNull();
    expect(parseWebappLaunchOpen("?other=val")).toBeNull();
    expect(parseWebappLaunchOpen(null)).toBeNull();
    expect(parseWebappLaunchOpen(undefined)).toBeNull();
  });

  it("parses correctly when additional query parameters exist", () => {
    expect(parseWebappLaunchOpen("?ref=pwa&open=today&debug=true")).toBe("today");
    expect(parseWebappLaunchOpen("?foo=bar&open=actions")).toBe("actions");
  });
});

describe("handleWebappLaunch (D7.2)", () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;
  let commitDatePickSpy: ReturnType<typeof vi.spyOn>;
  let openActionDrawerSpy: ReturnType<typeof vi.spyOn>;
  let openCrossTabSearchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetWebappLaunchHandledForTesting();
    replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    commitDatePickSpy = vi.spyOn(tabs, "commitDatePick").mockImplementation(async () => {});
    openActionDrawerSpy = vi.spyOn(actions, "openActionDrawer").mockImplementation(() => {});
    openCrossTabSearchSpy = vi.spyOn(search, "openCrossTabSearch").mockImplementation(() => {});
    vi.spyOn(date, "todayISO").mockReturnValue("2026-10-09");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens today's note for ?open=today and removes query from history", async () => {
    history.pushState({ testState: 123 }, "", "/webapp/?open=today#hash1");

    await handleWebappLaunch();

    expect(commitDatePickSpy).toHaveBeenCalledWith("2026-10-09");
    expect(replaceStateSpy).toHaveBeenCalledWith(
      { testState: 123 },
      document.title,
      "/webapp/#hash1",
    );
  });

  it("opens actions drawer for ?open=actions and cleans query", async () => {
    history.pushState({ chrononoteOverlay: true }, "", "/webapp/?open=actions");

    await handleWebappLaunch();

    expect(openActionDrawerSpy).toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledWith(
      { chrononoteOverlay: true },
      document.title,
      "/webapp/",
    );
  });

  it("opens search drawer for ?open=search and cleans query", async () => {
    history.pushState({}, "", "/webapp/?open=search");

    await handleWebappLaunch();

    expect(openCrossTabSearchSpy).toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledWith({}, document.title, "/webapp/");
  });

  it("ignores unknown values without calling drawers", async () => {
    history.pushState({}, "", "/webapp/?open=invalid");

    await handleWebappLaunch();

    expect(commitDatePickSpy).not.toHaveBeenCalled();
    expect(openActionDrawerSpy).not.toHaveBeenCalled();
    expect(openCrossTabSearchSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledWith({}, document.title, "/webapp/");
  });

  it("only runs once per session", async () => {
    history.pushState({}, "", "/webapp/?open=today");

    await handleWebappLaunch();
    expect(commitDatePickSpy).toHaveBeenCalledTimes(1);

    await handleWebappLaunch();
    expect(commitDatePickSpy).toHaveBeenCalledTimes(1);
  });
});

describe("applyThemeModeToDom theme-color meta tag sync (D7.1)", () => {
  let darkMeta: HTMLMetaElement;
  let lightMeta: HTMLMetaElement;

  beforeEach(() => {
    darkMeta = document.createElement("meta");
    darkMeta.setAttribute("name", "theme-color");
    darkMeta.setAttribute("media", "(prefers-color-scheme: dark)");
    darkMeta.setAttribute("content", "#252526");
    document.head.appendChild(darkMeta);

    lightMeta = document.createElement("meta");
    lightMeta.setAttribute("name", "theme-color");
    lightMeta.setAttribute("media", "(prefers-color-scheme: light)");
    lightMeta.setAttribute("content", "#f3f3f3");
    document.head.appendChild(lightMeta);
  });

  afterEach(() => {
    darkMeta.remove();
    lightMeta.remove();
    delete document.documentElement.dataset.theme;
  });

  it("sets both meta tags to light chrome color (#f3f3f3) when explicit light mode", () => {
    applyThemeModeToDom("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(darkMeta.content).toBe("#f3f3f3");
    expect(lightMeta.content).toBe("#f3f3f3");
  });

  it("sets both meta tags to dark chrome color (#252526) when explicit dark mode", () => {
    applyThemeModeToDom("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(darkMeta.content).toBe("#252526");
    expect(lightMeta.content).toBe("#252526");
  });

  it("restores original media-query colors for system mode", () => {
    // First set explicit
    applyThemeModeToDom("light");
    expect(darkMeta.content).toBe("#f3f3f3");

    // Then restore system
    applyThemeModeToDom("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(darkMeta.content).toBe("#252526");
    expect(lightMeta.content).toBe("#f3f3f3");
  });

  it("works when meta tags are absent (desktop mode)", () => {
    darkMeta.remove();
    lightMeta.remove();

    expect(() => applyThemeModeToDom("light")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");

    expect(() => applyThemeModeToDom("system")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

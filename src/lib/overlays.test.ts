import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import {
  closeOverlay,
  dismissTop,
  isOpen,
  modalFromStack,
  openOverlay,
  overlays,
  topOverlay,
} from "./overlays";

const kinds = () => get(overlays).map((o) => o.kind);

beforeEach(() => overlays.set([]));

describe("overlay stack", () => {
  it("pushes in order", () => {
    openOverlay({ kind: "settings", dismissable: true });
    openOverlay({ kind: "folderPicker", dismissable: true });
    expect(kinds()).toEqual(["settings", "folderPicker"]);
    expect(get(topOverlay)?.kind).toBe("folderPicker");
  });

  it("re-opening the same kind moves it to the top without duplicating", () => {
    openOverlay({ kind: "settings", dismissable: true });
    openOverlay({ kind: "find", dismissable: true });
    openOverlay({ kind: "settings", dismissable: true });
    expect(kinds()).toEqual(["find", "settings"]);
  });

  it("closes from the middle and ignores absent kinds", () => {
    openOverlay({ kind: "settings", dismissable: true });
    openOverlay({ kind: "find", dismissable: true });
    openOverlay({ kind: "syncHealth", dismissable: true });
    closeOverlay("find");
    expect(kinds()).toEqual(["settings", "syncHealth"]);
    closeOverlay("find");
    expect(kinds()).toEqual(["settings", "syncHealth"]);
  });

  it("dismisses top first, one at a time, then reports false when empty", () => {
    openOverlay({ kind: "settings", dismissable: true });
    openOverlay({ kind: "folderPicker", dismissable: true });
    expect(dismissTop()).toBe(true);
    expect(kinds()).toEqual(["settings"]);
    expect(dismissTop()).toBe(true);
    expect(dismissTop()).toBe(false);
    expect(get(topOverlay)).toBeNull();
  });

  it("a non-dismissable top blocks dismissal and changes nothing", () => {
    const onDismiss = vi.fn();
    openOverlay({ kind: "settings", dismissable: true });
    openOverlay({ kind: "conflict", dismissable: false, onDismiss });
    expect(dismissTop()).toBe(false);
    expect(kinds()).toEqual(["settings", "conflict"]);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("runs onDismiss exactly once, after the entry is removed", () => {
    let seen: string[] = [];
    const onDismiss = vi.fn(() => {
      seen = kinds();
    });
    openOverlay({ kind: "settings", dismissable: true });
    openOverlay({ kind: "unsavedScratchpads", dismissable: true, onDismiss });
    dismissTop();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["settings"]);
    dismissTop();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("closeOverlay does not run onDismiss", () => {
    const onDismiss = vi.fn();
    openOverlay({ kind: "settings", dismissable: true, onDismiss });
    closeOverlay("settings");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("isOpen tracks one kind", () => {
    const open = isOpen("find");
    expect(get(open)).toBe(false);
    openOverlay({ kind: "find", dismissable: true });
    expect(get(open)).toBe(true);
  });
});

describe("modalFromStack", () => {
  it("is none when empty", () => {
    expect(get(modalFromStack)).toBe("none");
  });

  it("skips non-modal kinds on top", () => {
    openOverlay({ kind: "settings", dismissable: true });
    openOverlay({ kind: "find", dismissable: true });
    expect(get(modalFromStack)).toBe("settings");
  });

  it("is none when only non-modal kinds are open", () => {
    openOverlay({ kind: "find", dismissable: true });
    openOverlay({ kind: "mobileTabs", dismissable: true });
    expect(get(modalFromStack)).toBe("none");
  });

  it("gives the top-most modal", () => {
    openOverlay({ kind: "settings", dismissable: true });
    openOverlay({ kind: "search", dismissable: true });
    expect(get(modalFromStack)).toBe("search");
  });
});

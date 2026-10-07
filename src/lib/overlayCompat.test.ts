import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { overlays } from "./overlays";
import {
  findOpen,
  modal,
  mobileTabDrawerOpen,
  oneDriveFolderPickerOpen,
  syncHealthPopoverOpen,
} from "./stores";

beforeEach(() => overlays.set([]));

describe("modal and the overlay flags are views of the overlay stack", () => {
  it("a modal and the find bar are two entries; modal reads the modal", () => {
    modal.set("settings");
    findOpen.set(true);
    expect(get(overlays).map((o) => o.kind)).toEqual(["settings", "find"]);
    expect(get(modal)).toBe("settings");
    expect(get(findOpen)).toBe(true);
  });

  it('modal.set("none") leaves find open', () => {
    modal.set("settings");
    findOpen.set(true);
    modal.set("none");
    expect(get(modal)).toBe("none");
    expect(get(findOpen)).toBe(true);
    expect(get(overlays).map((o) => o.kind)).toEqual(["find"]);
  });

  it("a second modal replaces the first (one modal entry)", () => {
    modal.set("settings");
    modal.set("about");
    expect(get(modal)).toBe("about");
    expect(get(overlays).map((o) => o.kind)).toEqual(["about"]);
  });

  it("modal.update maps the current value; conflict is not dismissable", () => {
    modal.set("about");
    modal.update((k) => (k === "about" ? "conflict" : k));
    expect(get(modal)).toBe("conflict");
    expect(get(overlays)[0].dismissable).toBe(false);
    modal.update(() => "none");
    expect(get(overlays)).toEqual([]);
  });

  it("modal subscribers only hear real changes", () => {
    const seen: string[] = [];
    const unsub = modal.subscribe((k) => seen.push(k));
    modal.set("about");
    modal.set("about");
    findOpen.set(true);
    modal.set("none");
    unsub();
    expect(seen).toEqual(["none", "about", "none"]);
  });

  it.each([
    ["findOpen", findOpen, "find"],
    ["mobileTabDrawerOpen", mobileTabDrawerOpen, "mobileTabs"],
    ["oneDriveFolderPickerOpen", oneDriveFolderPickerOpen, "folderPicker"],
    ["syncHealthPopoverOpen", syncHealthPopoverOpen, "syncHealth"],
  ] as const)("%s reads back what was set and maps to its overlay kind", (_n, store, kind) => {
    expect(get(store)).toBe(false);
    store.set(true);
    expect(get(store)).toBe(true);
    expect(get(overlays).map((o) => o.kind)).toEqual([kind]);
    store.update((v) => !v);
    expect(get(store)).toBe(false);
    expect(get(overlays)).toEqual([]);
    store.set(false); // closing when closed is a no-op
    expect(get(overlays)).toEqual([]);
  });
});

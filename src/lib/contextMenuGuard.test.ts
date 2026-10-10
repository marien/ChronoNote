import { describe, it, expect } from "vitest";
import { allowsNativeContextMenu, suppressesNativeContextMenu } from "./contextMenuGuard";

describe("contextMenuGuard", () => {
  it("keeps the browser menu only in text fields outside the note", () => {
    document.body.innerHTML = `
      <div id="bar"><span id="label">x</span></div>
      <input id="field" /><textarea id="area"></textarea>
      <div class="cm-editor"><div contenteditable="true"><span id="line">a</span></div></div>`;
    const el = (id: string) => document.getElementById(id);
    expect(allowsNativeContextMenu(el("label"))).toBe(false);
    expect(allowsNativeContextMenu(el("bar"))).toBe(false);
    expect(allowsNativeContextMenu(el("field"))).toBe(true);
    expect(allowsNativeContextMenu(el("area"))).toBe(true);
    expect(allowsNativeContextMenu(el("line"))).toBe(false);
    expect(allowsNativeContextMenu(null)).toBe(false);
  });

  it("applies to the desktop app and the installed web app, not a browser tab", () => {
    expect(suppressesNativeContextMenu("desktop", false)).toBe(true);
    expect(suppressesNativeContextMenu("web", true)).toBe(true);
    expect(suppressesNativeContextMenu("web", false)).toBe(false);
    expect(suppressesNativeContextMenu("demo", false)).toBe(false);
  });
});

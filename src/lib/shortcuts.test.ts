import { describe, expect, it } from "vitest";
import { SHORTCUTS } from "./shortcuts";

/** On the US-International layout (and others) AltGr is Ctrl+Alt, and AltGr+letter types a character: p is o with a
 * diaeresis, n is n with a tilde, and so on. An in-app shortcut on Ctrl+Alt+<letter> swallows that letter in the
 * editor, which is exactly what happened to Peek's Ctrl+Alt+P. */
describe("in-app shortcuts and AltGr", () => {
  it("Peek's in-app toggle is Ctrl+Shift+P, not a Ctrl+Alt chord", () => {
    const peek = SHORTCUTS.find((s) => s.id === "togglePeekMode")!;
    expect(peek.combos).toEqual([{ mod: true, shift: true, code: "KeyP" }]);
  });

  it("no in-app shortcut is a Ctrl+Alt+letter chord (AltGr+letter must type its character)", () => {
    // The Mac-only Zen alias uses Option, which is not AltGr there; it is listed for the Mac only.
    const offenders = SHORTCUTS.flatMap((s) =>
      s.combos
        .filter((c) => c.mod && c.alt && !c.shift && /^Key[A-Z]$/.test(c.code) && !(c.platforms?.length === 1 && c.platforms[0] === "mac"))
        .map((c) => `${s.id}: ${c.code}`),
    );
    expect(offenders).toEqual([]);
  });

  it("jumpAction uses Mod+J / Mod+Shift+J, freeing F2", () => {
    const jump = SHORTCUTS.find((s) => s.id === "jumpAction")!;
    expect(jump.combos).toEqual([
      { mod: true, code: "KeyJ" },
      { mod: true, shift: true, code: "KeyJ" },
    ]);
  });

  it("no in-app shortcut uses F2 or Shift+F2 (F2 freed)", () => {
    const usingF2 = SHORTCUTS.flatMap((s) =>
      s.combos.filter((c) => c.code === "F2").map((c) => `${s.id}: ${c.code}`),
    );
    expect(usingF2).toEqual([]);
  });
});

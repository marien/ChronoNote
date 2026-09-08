import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS, currentModal, activeTabContent } from "./helpers";

test.describe("info drawers", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Ctrl+/ opens Keyboard Shortcuts", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("Control+Slash");
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeVisible();
    expect(await currentModal(page)).toBe("shortcuts");
  });

  test("Ctrl+Shift+/ opens the Symbols & Sections legend", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("Control+Shift+Slash");
    await expect(modalCard(page, MODAL_LABELS.glyphLegend)).toBeVisible();
    expect(await currentModal(page)).toBe("glyphLegend");
  });

  test("legend glyphs render as plain inline text, aligned with the row (§88 / #19)", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("Control+Shift+Slash");
    await expect(modalCard(page, MODAL_LABELS.glyphLegend)).toBeVisible();

    const info = await page.evaluate(() => {
      const g = document.querySelector<HTMLElement>(".item-tag .glyph-open");
      const kbd = g?.closest(".item-tag")?.querySelector("kbd");
      if (!g || !kbd) return null;
      const cs = getComputedStyle(g);
      const gr = g.getBoundingClientRect();
      const kr = kbd.getBoundingClientRect();
      return {
        display: cs.display,
        transform: cs.transform,
        // editor box model would force ~2ch; plain text is ~1 char.
        widthUnderOneAndAHalfCh: gr.width < parseFloat(cs.fontSize) * 1.5,
        // vertical centre tracks the token pill on the same row.
        vDelta: Math.abs(gr.top + gr.height / 2 - (kr.top + kr.height / 2)),
      };
    });
    expect(info).not.toBeNull();
    expect(info!.display).toBe("inline");
    expect(info!.transform).toBe("none");
    expect(info!.widthUnderOneAndAHalfCh).toBe(true);
    expect(info!.vDelta).toBeLessThan(4);
  });

  test("Ctrl+Shift+, opens About and shows the version from the backend", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("Control+Shift+Comma");
    const about = modalCard(page, MODAL_LABELS.about);
    await expect(about).toBeVisible();
    await expect(about).toContainText("0.3.0"); // mock's default appVersion
    await expect(about).toContainText("github.com/marien/ChronoNote");
  });

  test("the project link opens externally via the opener plugin, not the webview", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("Control+Shift+Comma");
    await modalCard(page, MODAL_LABELS.about).getByRole("button", { name: /github\.com/ }).click();

    const opened = await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls);
    expect(opened).toEqual(["https://github.com/marien/ChronoNote"]);
  });

  test("drawers capture keyboard focus — typing does not leak to the editor behind", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("Control+Slash");
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeVisible();

    await page.keyboard.type("xxxxx");
    // Editor is untouched.
    expect(await activeTabContent(page)).toBe("");

    await page.keyboard.press("Escape");
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeHidden();
  });

  test("Escape closes whichever drawer is open", async ({ page }) => {
    for (const [combo, key] of [
      ["Control+Slash", "shortcuts"],
      ["Control+Shift+Slash", "glyphLegend"],
      ["Control+Shift+Comma", "about"],
    ] as const) {
      await editor(page).click();
      await page.keyboard.press(combo);
      expect(await currentModal(page)).toBe(key);
      await page.keyboard.press("Escape");
      expect(await currentModal(page)).toBe("none");
    }
  });
});

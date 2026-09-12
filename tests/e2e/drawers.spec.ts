import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS, currentModal, activeTabContent } from "./helpers";

test.describe("info drawers", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Ctrl+/ opens the combined Shortcuts & Symbols drawer", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Slash");
    const drawer = modalCard(page, MODAL_LABELS.shortcuts);
    await expect(drawer).toBeVisible();
    expect(await currentModal(page)).toBe("shortcuts");
    // §110: one drawer now holds both halves.
    await expect(drawer).toContainText("Keyboard shortcuts");
    await expect(drawer).toContainText("Symbols → glyphs");
  });

  test("#47: shortcuts and symbols sit in two side-by-side, independently-scrolling columns", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Slash");
    const drawer = modalCard(page, MODAL_LABELS.shortcuts);
    const cols = drawer.locator(".shortcuts-col");
    await expect(cols).toHaveCount(2);

    // Side by side, not stacked: same top, left column strictly left of
    // the right one — both readable at once, the whole point of #47.
    const [left, right] = await Promise.all([cols.nth(0).boundingBox(), cols.nth(1).boundingBox()]);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
    expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x + 1);
    await expect(cols.nth(0)).toContainText("Keyboard shortcuts");
    await expect(cols.nth(1)).toContainText("Symbols → glyphs");

    // Scrolling one column leaves the other's position untouched.
    await cols.nth(1).evaluate((el) => el.scrollTo({ top: 200 }));
    const leftScrollBefore = await cols.nth(0).evaluate((el) => el.scrollTop);
    expect(leftScrollBefore).toBe(0);
  });

  test("Ctrl+Shift+/ opens the same combined drawer (§110)", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+Slash");
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeVisible();
    expect(await currentModal(page)).toBe("shortcuts");
  });

  test("legend glyphs render as plain inline text, aligned with the row (§88 / #19)", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+Slash");
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeVisible();

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
    await page.keyboard.press("ControlOrMeta+Shift+Comma");
    const about = modalCard(page, MODAL_LABELS.about);
    await expect(about).toBeVisible();
    await expect(about).toContainText("0.3.0"); // mock's default appVersion
    await expect(about).toContainText("github.com/marien/ChronoNote");
  });

  test("the project link opens externally via the opener plugin, not the webview", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+Comma");
    await modalCard(page, MODAL_LABELS.about).getByRole("button", { name: /github\.com/ }).click();

    const opened = await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls);
    expect(opened).toEqual(["https://github.com/marien/ChronoNote"]);
  });

  test("drawers capture keyboard focus — typing does not leak to the editor behind", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Slash");
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeVisible();

    await page.keyboard.type("xxxxx");
    // Editor is untouched.
    expect(await activeTabContent(page)).toBe("");

    await page.keyboard.press("Escape");
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeHidden();
  });

  test("Escape closes whichever drawer is open", async ({ page }) => {
    for (const [combo, key] of [
      ["ControlOrMeta+Slash", "shortcuts"],
      ["ControlOrMeta+Shift+Slash", "shortcuts"],
      ["ControlOrMeta+Shift+Comma", "about"],
    ] as const) {
      await editor(page).click();
      await page.keyboard.press(combo);
      expect(await currentModal(page)).toBe(key);
      await page.keyboard.press("Escape");
      expect(await currentModal(page)).toBe("none");
    }
  });
});

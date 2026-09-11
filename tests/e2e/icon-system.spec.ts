import { test, expect } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS } from "./helpers";

/** §127: the top bar and every modal header moved from emoji (📅 📋 🕒 🔎
 * 📥 ⬆ ⚙ ℹ️ ⌘ ⚠ ⌨) to one monoline SVG icon set (`src/lib/icons/`), which
 * — unlike emoji — actually follows the light/dark and colour/grayscale
 * theme. This guards against a regression sliding an emoji back into the
 * top bar or a modal title/search row. A basic Unicode emoji-range sweep,
 * not an exhaustive one. */
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

test.describe("icon system (§127)", () => {
  test("no emoji in the top bar or any modal title/search row", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });

    const topBarText = await page.locator("#top-bar").innerText();
    expect(topBarText).not.toMatch(EMOJI_RE);

    const modals: Array<[string, keyof typeof MODAL_LABELS]> = [
      ["Control+Shift+a", "actions"],
      ["Control+Shift+f", "search"],
      ["Control+Shift+i", "sectionImport"],
      ["Control+Comma", "settings"],
      ["Control+Slash", "shortcuts"],
      ["Control+Shift+Comma", "about"],
      ["Control+k", "commandPalette"],
    ];
    for (const [combo, key] of modals) {
      await editor(page).click();
      await page.keyboard.press(combo);
      const card = modalCard(page, MODAL_LABELS[key]);
      await card.waitFor();
      const headerText = await card.locator(".modal-input-wrap").first().innerText();
      expect(headerText, `${key} modal header`).not.toMatch(EMOJI_RE);
      await page.keyboard.press("Escape");
    }
  });

  test("the icon set themes with the button's own colour, not a fixed one", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    const dateBtn = page.locator('[data-datepicker-trigger]');
    const iconColor = () => dateBtn.locator("svg.cn-icon").evaluate((el) => getComputedStyle(el).color);

    const grayscale = await iconColor();
    await editor(page).click();
    await page.keyboard.press("Control+Comma");
    await modalCard(page, MODAL_LABELS.settings).getByRole("radio", { name: "Color", exact: true }).click();
    await page.keyboard.press("Escape");
    const colorMode = await iconColor();

    // Chrome icons stay `--text` in every colour mode (finding A) — the
    // toolbar's own text colour, not a semantic hue, and not a fixed
    // emoji-rendered colour either.
    const textColor = await page.evaluate(() => getComputedStyle(document.body).color);
    expect(grayscale).toBe(textColor);
    expect(colorMode).toBe(textColor);
  });
});

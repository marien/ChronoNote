/** CI renders text with Linux fonts, a little wider than Windows ones, so a Settings control that just fits locally can
 * overflow there (German Peek header choices, 4px, 2026-10-10). Widening every letter catches that on Windows too. */
import { test, expect } from "@playwright/test";
import { seedApp, editor } from "./helpers";
test.use({ viewport: { width: 375, height: 667 } });
test("the narrow Settings page keeps its controls inside their rows with wider fonts (German)", async ({ page }) => {
  await seedApp(page, { seed: { notes: {}, languageMode: "de" } as never });
  await page.addStyleTag({ content: "* { letter-spacing: 0.1em !important; }" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  await page.waitForSelector(".settings-page");
  const issues = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".settings-page .s-control, .settings-page .segmented-option")]
      .filter((el) => el.offsetParent && el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.className}: ${el.scrollWidth}>${el.clientWidth} ${el.textContent?.slice(0, 40)}`),
  );
  expect(issues).toEqual([]);
});

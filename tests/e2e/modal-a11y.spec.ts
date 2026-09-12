import { test, expect } from "@playwright/test";
import { seedApp, editor, openViaShortcut, modalCard, MODAL_LABELS, datePicker } from "./helpers";

/** §95: every modal traps Tab within its own controls and hands focus
 * back to the editor when it closes. */

test("Tab stays inside the Settings modal and never lands on the editor behind it", async ({ page }) => {
  await seedApp(page, { seed: "empty" });
  const card = await openViaShortcut(page, "ControlOrMeta+Comma", "settings");

  // Tab around a bunch — focus must always be inside the modal card.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const insideCard = await card.evaluate((el) => el.contains(document.activeElement));
    expect(insideCard).toBe(true);
  }
  // Shift+Tab too.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Shift+Tab");
    const insideCard = await card.evaluate((el) => el.contains(document.activeElement));
    expect(insideCard).toBe(true);
  }
});

test("closing a modal returns focus to the editor", async ({ page }) => {
  await seedApp(page, { seed: "empty" });
  await editor(page).click();
  await openViaShortcut(page, "ControlOrMeta+/", "shortcuts");
  await page.keyboard.press("Escape");
  await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeHidden();

  const editorHasFocus = await page.evaluate(() =>
    (document.querySelector(".cm-content") as HTMLElement | null)?.contains(document.activeElement) ||
    document.activeElement?.classList.contains("cm-content"),
  );
  expect(editorHasFocus).toBe(true);
});

test("a modal opened from a top-bar button still hands focus back to the editor", async ({ page }) => {
  await seedApp(page, { seed: "empty" });
  await editor(page).click();

  // Open the date picker by clicking its top-bar button, not the shortcut.
  await page.locator("#top-bar button[title^='Open Date Note']").click();
  await expect(datePicker(page)).toBeVisible();
  await page.keyboard.press("Escape");

  const editorHasFocus = await page.evaluate(
    () => document.activeElement?.classList.contains("cm-content") ?? false,
  );
  expect(editorHasFocus).toBe(true);
});

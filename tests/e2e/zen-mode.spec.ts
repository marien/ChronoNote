import { test, expect } from "@playwright/test";
import { modalCard, MODAL_LABELS, seedApp } from "./helpers";

test.describe("Zen mode (Area 3)", () => {
  test("toggles via shortcut and hides chrome bars", async ({ page }) => {
    await seedApp(page);

    // Initial state: not in zen mode
    await expect(page.locator("body")).not.toHaveClass(/zen-mode/);
    await expect(page.locator("#zen-banner")).toHaveCount(0);

    // Press Shift+F11
    await page.keyboard.press("Shift+F11");
    await expect(page.locator("body")).toHaveClass(/zen-mode/);
    await expect(page.locator("#zen-banner")).toBeVisible();

    // Exit button in banner exits zen mode
    await page.locator(".zen-exit-btn").click();
    await expect(page.locator("body")).not.toHaveClass(/zen-mode/);
    await expect(page.locator("#zen-banner")).toHaveCount(0);
  });

  test("can be triggered from command palette", async ({ page }) => {
    await seedApp(page);

    // Open command palette
    await page.keyboard.press("Control+k");
    const palette = modalCard(page, MODAL_LABELS.commandPalette);
    await expect(palette).toBeVisible();

    // Search for zen command
    await palette.locator(".modal-input").fill(">zen");
    const zenOption = palette.locator('.modal-item[role="option"]', { hasText: /Zen mode/i }).first();
    await expect(zenOption).toBeVisible();
    await zenOption.click();

    // Should enter zen mode
    await expect(page.locator("body")).toHaveClass(/zen-mode/);
    await expect(page.locator("#zen-banner")).toBeVisible();

    // Press Escape to exit zen mode
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/zen-mode/);
  });

  test("escape key closes find bar before exiting zen mode", async ({ page }) => {
    await seedApp(page);

    // Enter zen mode
    await page.keyboard.press("Shift+F11");
    await expect(page.locator("body")).toHaveClass(/zen-mode/);

    // Open find bar
    await page.keyboard.press("Control+f");
    const findBar = page.locator(".find-bar");
    await expect(findBar).toBeVisible();

    // First Escape closes find bar, keeps zen mode
    await page.keyboard.press("Escape");
    await expect(findBar).not.toBeVisible();
    await expect(page.locator("body")).toHaveClass(/zen-mode/);

    // Second Escape exits zen mode
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/zen-mode/);
  });
});

test.describe("Zen mode: F11 is a desktop-only alias", () => {
  test("F11 toggles Zen mode in the desktop app", async ({ page }) => {
    await seedApp(page);
    await page.keyboard.press("F11");
    await expect(page.locator("body")).toHaveClass(/zen-mode/);
    await page.keyboard.press("F11");
    await expect(page.locator("body")).not.toHaveClass(/zen-mode/);
  });

  test("F11 does nothing in the web app (browsers keep it for their own fullscreen)", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "web" } });
    await page.keyboard.press("F11");
    await expect(page.locator("body")).not.toHaveClass(/zen-mode/);
    // The chord itself still works there.
    await page.keyboard.press("Shift+F11");
    await expect(page.locator("body")).toHaveClass(/zen-mode/);
  });
});

test.describe("Zen mode uses the whole window", () => {
  test("the bars give their space back: the editor grows to fill the viewport, and shrinks back on exit", async ({ page }) => {
    await seedApp(page);
    const editorBox = async () => (await page.locator("#editor-container").boundingBox())!;
    const before = await editorBox();
    expect(before.y).toBeGreaterThan(20); // the top bar sits above it

    await page.keyboard.press("Shift+F11");
    const vp = page.viewportSize()!;
    await expect
      .poll(async () => {
        const b = await editorBox();
        return Math.round(b.y) === 0 && Math.round(b.height) === vp.height;
      })
      .toBe(true);

    await page.keyboard.press("Shift+F11");
    await expect.poll(async () => Math.round((await editorBox()).y)).toBe(Math.round(before.y));
  });
});

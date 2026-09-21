import { test, expect } from "@playwright/test";
import { modalCard, MODAL_LABELS, seedApp } from "./helpers";

test.describe("Sync health popover (Area 9)", () => {
  test.use({
    viewport: { width: 400, height: 800 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  });

  test("clicking #stat-cloud opens the telemetry popover with status details", async ({ page }) => {
    await seedApp(page);

    const cloudBtn = page.locator("#stat-cloud");
    await expect(cloudBtn).toBeVisible();

    // Click to open popover
    await cloudBtn.click();
    const popover = page.locator("#telemetry-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("OneDrive Cloud Sync");
    await expect(popover).toContainText("Status:");
    await expect(popover).toContainText("Last synced:");
    await expect(popover).toContainText("Local mirror:");
    await expect(popover).toContainText("Account:");
    await expect(popover).toContainText("Target folder:");

    // Close with close button
    await popover.locator(".modal-close-btn").click();
    await expect(popover).toHaveCount(0);
  });

  test("Escape key and outside click close the telemetry popover", async ({ page }) => {
    await seedApp(page);

    const cloudBtn = page.locator("#stat-cloud");
    await cloudBtn.click();
    const popover = page.locator("#telemetry-popover");
    await expect(popover).toBeVisible();

    // Escape closes popover
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);

    // Reopen and test outside click
    await cloudBtn.click();
    await expect(popover).toBeVisible();
    await page.locator(".cm-editor").click();
    await expect(popover).toHaveCount(0);
  });

  test("actions: Open Settings navigates to Settings modal", async ({ page }) => {
    await seedApp(page);

    const cloudBtn = page.locator("#stat-cloud");
    await cloudBtn.click();
    const popover = page.locator("#telemetry-popover");
    await expect(popover).toBeVisible();

    // Click "Open Settings"
    await popover.getByRole("button", { name: "Open Settings" }).click();
    await expect(popover).toHaveCount(0);

    const settings = modalCard(page, MODAL_LABELS.settings);
    await expect(settings).toBeVisible();
    await expect(settings).toContainText("Notes & Sync");
  });
});

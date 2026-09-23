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
    await seedApp(page, { seed: { backendKind: "web" } });

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
    await seedApp(page, { seed: { backendKind: "web" } });

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
    await seedApp(page, { seed: { backendKind: "web" } });

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

test.describe("Expired OneDrive sign-in", () => {
  test.use({
    viewport: { width: 400, height: 800 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  });

  const EXPIRED =
    "Your OneDrive sign-in has expired. Your notes are safe on this device. Choose Sign in again (in Settings or the cloud menu) to keep syncing.";

  test("the cloud button, the popover and Settings all offer Sign in again, and one click renews it", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "web", oneDriveSyncError: EXPIRED } });

    // The launch sync fails with the expiry message: the status bar says what to do.
    await expect(page.locator("#stat-cloud")).toContainText("Sign in again");

    await page.locator("#stat-cloud").click();
    const popover = page.locator("#telemetry-popover");
    await expect(popover).toContainText("Sign-in expired");
    await expect(popover.getByRole("button", { name: "Sync Now" })).toBeDisabled();

    // Settings explains it too, next to the account it belongs to.
    await popover.getByRole("button", { name: "Open Settings" }).click();
    const settings = modalCard(page, MODAL_LABELS.settings);
    await expect(settings.getByRole("alert")).toContainText("Your OneDrive sign-in has expired");
    await expect(settings.getByText("Connected as")).toBeVisible(); // still signed in as far as the app knows

    await settings.getByRole("button", { name: "Sign in again" }).click();
    await expect(settings.getByRole("alert")).toHaveCount(0);
    await expect(page.locator("#stat-cloud")).not.toContainText("Sign in again");
  });
});

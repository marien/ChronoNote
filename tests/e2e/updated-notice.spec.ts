import { test, expect } from "@playwright/test";
import { seedApp } from "./helpers";

/** §415 (Marien, on the installed web app on his phone): after an update with an expired OneDrive sign-in, the info bar
 * shows "sign-in expired" first; signing in leaves the app and reloads it, and that reload found the version already
 * marked as seen, so "Updated to vX" never appeared. Now the version counts as seen only when the notice is clicked or
 * closed. */

const EXPIRED =
  "Your OneDrive sign-in has expired. Your notes are safe on this device. Choose Sign in again (in Settings or the cloud menu) to keep syncing.";

test.describe("the 'Updated to' notice", () => {
  test("waits behind an expired sign-in and survives the reload of the sign-in round trip", async ({ page }) => {
    await seedApp(page, {
      seed: { backendKind: "web", appVersion: "0.32.5", lastSeenVersion: "0.32.4", oneDriveSyncError: EXPIRED },
    });
    const bar = page.locator(".info-bar");
    await expect(bar).toContainText("Your OneDrive sign-in has expired.");

    // The sign-in round trip: the page reloads before the notice was seen.
    await page.reload();
    await expect(bar).toContainText("Your OneDrive sign-in has expired.");
    await bar.getByRole("button", { name: "Sign in again" }).click();

    await expect(bar).toContainText("Updated to 0.32.5.");
  });

  test("a status message does not clear it", async ({ page }) => {
    await seedApp(page, { seed: { appVersion: "0.32.5", lastSeenVersion: "0.32.4" } });
    const bar = page.locator(".info-bar");
    await expect(bar).toContainText("Updated to 0.32.5.");
    await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.showToast("Saved."));
    await expect(page.locator("#stat-message")).toContainText("Saved.");
    await expect(bar).toContainText("Updated to 0.32.5.");
  });

  test("once closed it stays away, also after a reload", async ({ page }) => {
    await seedApp(page, { seed: { appVersion: "0.32.5", lastSeenVersion: "0.32.4" } });
    const bar = page.locator(".info-bar");
    await expect(bar).toContainText("Updated to 0.32.5.");
    await bar.locator(".info-bar-close").click();
    await expect(bar).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".cm-content")).toBeVisible();
    await expect(page.locator(".info-bar")).toHaveCount(0);
  });
});

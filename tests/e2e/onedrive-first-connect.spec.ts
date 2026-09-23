import { test, expect, type Page } from "@playwright/test";
import { seedApp, toast } from "./helpers";

/** First connect on a phone (found on a real Android device running the
 * since-dropped native app; the same UI is shared by the mobile web app):
 * signing in doesn't choose a OneDrive folder, but Settings used to show a
 * hardcoded "/Documents/Notes" that looked chosen; "Sync now" then failed
 * with "No OneDrive folder configured", and picking a folder started a sync
 * with no sign of it. Now: the missing folder is stated plainly, the folder
 * picker opens by itself, and every sync shows a spinner. */
test.describe("OneDrive first connect (mobile)", () => {
  test.use({
    viewport: { width: 400, height: 800 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  });

  const picker = (page: Page) => page.getByRole("dialog", { name: "Select OneDrive Folder" });
  const settings = (page: Page) => page.getByRole("dialog", { name: /Settings/ });

  test("with no folder chosen: no fake path, the picker opens by itself, Sync is unavailable", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "web", oneDriveFolder: null } });
    await expect(page.locator("#stat-cloud")).toContainText("Choose a folder");

    await page.locator("#stat-cloud").click(); // opens Settings on the notes/sync tab
    await expect(picker(page)).toBeVisible(); // opened for the user

    await picker(page).getByRole("button", { name: "Close" }).click();
    const dialog = settings(page);
    await expect(dialog).toContainText("No folder selected yet");
    await expect(dialog).not.toContainText("/Documents/Notes"); // the old hardcoded placeholder
    await expect(dialog.getByRole("button", { name: /Sync now/ })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Choose folder…" })).toBeVisible();
  });

  test("choosing a folder starts a sync you can see, and says how it ended", async ({ page }) => {
    await seedApp(page, {
      seed: { backendKind: "web", oneDriveFolder: null, delayCommands: { onedrive_sync_now: 1200 } },
    });
    await page.locator("#stat-cloud").click();
    await picker(page).getByRole("button", { name: "Use this folder" }).click();

    // A tab opened before the first sync finished would sit on a stale copy of
    // whatever it's about to download, so the web app shows a scratchpad in the
    // meantime instead — that's the visible "a sync is happening" affordance here.
    await expect(page.locator(".cm-content")).toContainText("While I sync");
    await expect(page.locator("#stat-cloud .modal-spinner")).toBeVisible();

    // …and it ends with a visible result: the notes reopen, the folder is shown as chosen.
    await expect(toast(page)).toContainText("Switched notes directory to", { timeout: 5000 });
    await expect(page.locator("#stat-cloud .modal-spinner")).toHaveCount(0);
    await expect(page.locator("#stat-cloud")).not.toContainText("Choose a folder");
  });

  test("Sync now greys out and shows a spinner while it runs", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "web", delayCommands: { onedrive_sync_now: 1200 } } });
    // Let the launch sync finish first so this is the user's own click.
    await expect(page.locator("#stat-cloud .modal-spinner")).toHaveCount(0, { timeout: 5000 });

    await page.locator("#stat-cloud").click();
    if (await page.locator("#telemetry-popover").isVisible()) {
      await page.locator("#telemetry-popover").getByRole("button", { name: "Open Settings" }).click();
    }
    const dialog = settings(page);
    const sync = dialog.getByRole("button", { name: /Sync now/ });
    await expect(sync).toBeEnabled();
    await sync.click();

    const running = dialog.getByRole("button", { name: /Syncing…/ });
    await expect(running).toBeDisabled();
    await expect(running.locator(".modal-spinner")).toBeVisible();
    await expect(page.locator("#stat-cloud .modal-spinner")).toBeVisible();

    await expect(dialog.getByRole("button", { name: /Sync now/ })).toBeEnabled({ timeout: 5000 });
    await expect(toast(page)).toContainText("OneDrive sync finished");
  });
});

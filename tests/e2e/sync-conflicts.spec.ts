import { test, expect } from "@playwright/test";
import { seedApp, mockNote, activeTabContent } from "./helpers";

/** Android OneDrive sync holds back a note whose phone and cloud versions
 * diverged in the same place (see `sync.rs`). The status bar flags it and a
 * resolve screen lets the user pick a side — nothing is overwritten first. */
test.describe("OneDrive sync conflicts (Android)", () => {
  test.use({
    viewport: { width: 400, height: 800 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  });

  const NOTE = "2030-01-01.txt";
  const seed = {
    notes: { [NOTE]: "one\nphone edit\n" },
    oneDriveConflicts: [{ name: NOTE, remote: "one\npc edit\n" }],
  };

  async function openResolveScreen(page: import("@playwright/test").Page) {
    await seedApp(page, { seed });
    await page.locator("#stat-conflicts").click();
    const dialog = page.getByRole("dialog", { name: "Sync conflicts" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("the status bar flags the conflict and the screen shows both versions", async ({ page }) => {
    await seedApp(page, { seed });
    await expect(page.locator("#stat-conflicts")).toContainText("1 sync conflict");

    await page.locator("#stat-conflicts").click();
    await expect(page.getByTestId("conflict-local")).toHaveText("one\nphone edit\n");
    await expect(page.getByTestId("conflict-remote")).toHaveText("one\npc edit\n");
  });

  test("Keep this device's leaves the phone text and clears the conflict", async ({ page }) => {
    const dialog = await openResolveScreen(page);
    await dialog.getByRole("button", { name: "Keep this device's" }).click();

    await expect(page.locator("#stat-conflicts")).toHaveCount(0);
    expect(await mockNote(page, NOTE)).toBe("one\nphone edit\n");
  });

  test("Use OneDrive's replaces the note with the cloud text", async ({ page }) => {
    const dialog = await openResolveScreen(page);
    await dialog.getByRole("button", { name: "Use OneDrive's" }).click();

    await expect(page.locator("#stat-conflicts")).toHaveCount(0);
    expect(await mockNote(page, NOTE)).toBe("one\npc edit\n");
  });

  test("Keep both keeps the phone text and appends the cloud text under a marker", async ({ page }) => {
    const dialog = await openResolveScreen(page);
    await dialog.getByRole("button", { name: "Keep both" }).click();

    await expect(page.locator("#stat-conflicts")).toHaveCount(0);
    const text = await mockNote(page, NOTE);
    expect(text).toContain("phone edit");
    expect(text).toContain("--- other version (sync conflict) ---");
    expect(text).toContain("pc edit");
  });

  test("no conflicts means no status-bar warning", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [NOTE]: "fine\n" } } });
    await expect(page.locator("#stat-conflicts")).toHaveCount(0);
    expect(await activeTabContent(page)).not.toContain("conflict");
  });
});

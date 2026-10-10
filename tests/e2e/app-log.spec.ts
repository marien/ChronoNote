import { test, expect } from "@playwright/test";
import { openViaShortcut, seedApp, todayFilename } from "./helpers";

test.describe("App log, diagnostics, and error reporting (§app-log)", () => {
  test("About shows Diagnostics and Log folder, handles errors and copies diagnostics", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedApp(page, { seed: { notes: { [todayFilename()]: "hi" } } });

    // Open About panel
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");

    // About shows Diagnostics and (desktop mock) Log folder
    await expect(about.getByText("Diagnostics")).toBeVisible();
    await expect(about.getByText("Log folder")).toBeVisible();

    // Clicking Log folder records "log-folder"
    await about.getByRole("button", { name: "Log folder" }).click();
    const opened = await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls);
    expect(opened).toContain("log-folder");

    // Clicking Copy puts text containing "ChronoNote version" on the clipboard
    await about.getByRole("button", { name: "Copy" }).click();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("ChronoNote version");

    // Trigger unexpected error
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("boom-test");
      });
    });

    // The status bar (#stat-message) shows the unexpected-error message
    const statMessage = page.locator("#stat-message");
    await expect(statMessage).toBeVisible();
    await expect(statMessage).toContainText("Something went wrong");

    // window.__CHRONO_MOCK__.logLines contains boom-test
    let logLines = await page.evaluate(() => window.__CHRONO_MOCK__!.logLines);
    expect(logLines.some((l) => l.includes("boom-test"))).toBe(true);

    // Dismiss the message
    await statMessage.click();
    await expect(statMessage).not.toBeVisible();

    // A second error right after is logged but does not show the message again
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("boom-test-2");
      });
    });

    logLines = await page.evaluate(() => window.__CHRONO_MOCK__!.logLines);
    expect(logLines.some((l) => l.includes("boom-test-2"))).toBe(true);
    await expect(statMessage).not.toBeVisible();
  });
});

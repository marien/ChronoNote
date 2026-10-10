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
    // A page script throwing at top level: seedApp pins the clock, and Playwright's clock catches errors thrown in timers.
    await page.addScriptTag({ content: 'throw new Error("boom-test");' }).catch(() => {});

    // The message is long enough for the status bar's long-message area, so look for the text, not #stat-message.
    await expect(page.getByText("Something went wrong").first()).toBeVisible();
    const logLines = () => page.evaluate(() => window.__CHRONO_MOCK__!.logLines);
    expect((await logLines()).some((l) => l.includes("boom-test"))).toBe(true);

    // A second error right after is logged, but the message is not shown again (every shown message is logged once).
    await page.addScriptTag({ content: 'throw new Error("boom-test-2");' }).catch(() => {});
    await expect.poll(async () => (await logLines()).some((l) => l.includes("boom-test-2"))).toBe(true);
    expect((await logLines()).filter((l) => l.startsWith("INFO") && l.includes("Something went wrong"))).toHaveLength(1);
  });
});

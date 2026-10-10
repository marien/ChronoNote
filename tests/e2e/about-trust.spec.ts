import { test, expect } from "@playwright/test";
import { openViaShortcut, seedApp, todayFilename } from "./helpers";

test.describe("About trust rows (§about-trust)", () => {
  test("Report a problem, Privacy and Open-source licences rows are visible and functional", async ({
    page,
  }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "hi" } } });
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");

    // The three rows are visible
    await expect(about.getByText("Report a problem")).toBeVisible();
    await expect(about.getByText("Privacy")).toBeVisible();
    await expect(about.getByText("Open-source licences")).toBeVisible();

    // Clicking Report a problem records an opened URL containing `/issues/new?template=bug.yml&version=`
    await about.getByRole("button", { name: "Report a problem" }).click();
    let opened = await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls);
    expect(opened.some((url) => url.includes("/issues/new?template=bug.yml&version="))).toBe(true);

    // Privacy opens a URL ending in `/privacy.html`
    await about.getByRole("button", { name: "Privacy" }).click();
    opened = await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls);
    expect(opened.some((url) => url.endsWith("/privacy.html"))).toBe(true);

    // Show reveals `.about-licences` with the placeholder text, Hide removes it
    const licences = about.locator(".about-licences");
    await expect(licences).not.toBeVisible();

    await about.getByRole("button", { name: "Show" }).click();
    await expect(licences).toBeVisible();
    await expect(licences).toContainText("Third-party notices are generated at release time (npm run notices).");

    await about.getByRole("button", { name: "Hide" }).click();
    await expect(licences).not.toBeVisible();
  });
});

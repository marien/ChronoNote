import { test, expect } from "@playwright/test";
import { editor, modalCard, MODAL_LABELS, openViaShortcut, seedApp, toast, todayFilename } from "./helpers";

/** §update-check (`docs/design/maturity-0.7-roadmap.md`): a GitHub-
 * releases check via `@tauri-apps/plugin-updater`, mocked in
 * `mockBackend.ts` (`MockSeed.updateCheck`/`updateCheckVersion`). */
test.describe("update check (§update-check)", () => {
  test("About reads 'up to date' when no update is available", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "hi" }, updateCheck: "none" } });
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await expect(about).toContainText(/up to date/i);
  });

  test("About shows the available version; Download & install runs it through to ready", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "hi" },
        updateCheck: "available",
        updateCheckVersion: "9.9.9",
      },
    });
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await expect(about).toContainText("9.9.9");

    await about.getByRole("button", { name: /Download & install/i }).click();
    await expect(about).toContainText(/restart/i, { timeout: 5000 });
  });

  test("About's 'What's changed' opens the releases list, not just the latest tag (§update-check follow-up)", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "hi" }, updateCheck: "available", updateCheckVersion: "9.9.9" },
    });
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await about.getByRole("button", { name: "What's changed" }).click();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls)).toContain(
      "https://github.com/marien/ChronoNote/releases",
    );
  });

  test("a failed check reads as an error, with a way to try again", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "hi" }, throwOnCommands: ["plugin:updater|check"] },
    });
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await expect(about).toContainText(/couldn.t check/i);
    await expect(about.getByRole("button", { name: /Try again/i })).toBeVisible();
  });

  test("a failed install says so (not 'couldn't check'), and offers the GitHub download", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "hi" },
        updateCheck: "available",
        updateCheckVersion: "9.9.9",
        throwOnCommands: ["install_update"],
      },
    });
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await about.getByRole("button", { name: /Download & install/i }).click();
    await expect(about).toContainText(/couldn.t install the update/i);
    await expect(about).not.toContainText(/couldn.t check/i);
    await expect(about.getByRole("button", { name: "Try again" })).toBeVisible();

    await about.getByRole("button", { name: "Download from GitHub" }).click();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls)).toContain(
      "https://github.com/marien/ChronoNote/releases",
    );
  });

  test("the launch-time check surfaces an InfoBar when it finds an update, and View update opens About", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "hi" },
        updateCheck: "available",
        updateCheckVersion: "9.9.9",
        autoCheckUpdates: true,
      },
    });
    const infoBar = page.locator(".info-bar");
    await expect(infoBar).toBeVisible({ timeout: 5000 });
    await expect(infoBar).toContainText("ChronoNote 9.9.9 is available.");

    // The editor container's top moves down by the bar's height (not covered)
    const infoBarBox = (await infoBar.boundingBox())!;
    const editorBox = (await page.locator("#editor-container").boundingBox())!;
    expect(editorBox.y).toBeGreaterThanOrEqual(infoBarBox.y + infoBarBox.height);

    await infoBar.locator(".info-bar-action").click();
    const about = modalCard(page, MODAL_LABELS.about);
    await expect(about).toBeVisible();
    await expect(about).toContainText("9.9.9");
  });

  test("the launch-time check never fires when auto-check is off", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "hi" },
        updateCheck: "available",
        updateCheckVersion: "9.9.9",
        autoCheckUpdates: false,
      },
    });
    await editor(page).click();
    await page.waitForTimeout(400); // give an errant check a chance to fire
    await expect(page.locator(".info-bar")).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__CHRONO_MOCK__!.invokeLog.some((e) => e.cmd === "plugin:updater|check")),
    ).toBe(false);
  });

  test("the Settings page has no Updates tab", async ({ page }) => {
    await seedApp(page, { seed: { notes: {} } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    const settings = modalCard(page, MODAL_LABELS.settings);
    await expect(settings.getByRole("tab", { name: "Updates" })).toHaveCount(0);
    await expect(settings.getByRole("tab", { name: "About" })).toBeVisible();
  });

  test("Settings' toggle persists the preference across a reload", async ({ page }) => {
    await seedApp(page, { seed: { notes: {} } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    const settings = modalCard(page, MODAL_LABELS.settings);
    await settings.getByRole("tab", { name: "About", exact: true }).click();
    await settings.getByText("Check for updates when ChronoNote starts").click();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.autoCheckUpdates)).toBe(false);

    await page.reload();
    await expect(page.locator("#top-bar")).toBeVisible();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.autoCheckUpdates)).toBe(false);
  });

  test("opening About checks for updates when nothing has run yet, and shows the result (§349)", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: {}, updateCheck: "available", updateCheckVersion: "7.8.9", autoCheckUpdates: false },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    const settings = modalCard(page, MODAL_LABELS.settings);
    await settings.getByRole("tab", { name: "About", exact: true }).click();
    await expect(settings).toContainText("7.8.9");
    await expect(settings.getByRole("button", { name: /Download & install/i })).toBeVisible();
  });

  test("About's 'Check for updates' runs the check again", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: {}, updateCheck: "none", autoCheckUpdates: false },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    const settings = modalCard(page, MODAL_LABELS.settings);
    await settings.getByRole("tab", { name: "About", exact: true }).click();
    await expect(settings.locator(".about-status-chip")).toContainText(/up to date/i);
    await settings.getByRole("button", { name: "Check for updates" }).click();
    await expect(settings.locator(".about-status-chip")).toContainText(/up to date/i);
  });

  test("the command palette can trigger a check and opens About", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: {}, updateCheck: "available", updateCheckVersion: "4.5.6", autoCheckUpdates: false },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("check for updates");
    await page.keyboard.press("Enter");

    const about = modalCard(page, MODAL_LABELS.about);
    await expect(about).toBeVisible();
    await expect(about).toContainText("4.5.6");
  });
});

test.describe("#50: first-launch-after-update notice", () => {
  test("shows an InfoBar when the version differs from last seen, opens the releases list, and only shows once", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: { notes: {}, appVersion: "9.9.9", lastSeenVersion: "9.9.8", updateCheck: "none" },
    });
    const infoBar = page.locator(".info-bar");
    await expect(infoBar).toBeVisible();
    await expect(infoBar).toContainText("Updated to 9.9.9.");

    await infoBar.getByRole("button", { name: "What's new" }).click();
    await expect(infoBar).toHaveCount(0);
    // §update-check follow-up: the full releases list, not a single tag —
    // a version gap (skipped a few releases) shouldn't need per-tag
    // navigation to see everything that changed.
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls)).toContain(
      "https://github.com/marien/ChronoNote/releases",
    );
    // Persisted — a reload doesn't bring it back.
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.lastSeenVersion)).toBe("9.9.9");
    await page.reload();
    await expect(page.locator("#top-bar")).toBeVisible();
    await expect(page.locator(".info-bar")).toHaveCount(0);
  });

  test("shows nothing on a fresh install — no prior version to compare against", async ({ page }) => {
    await seedApp(page, { seed: { notes: {}, appVersion: "9.9.9", updateCheck: "none" } });
    await expect(page.locator(".info-bar")).toHaveCount(0);
    // Still recorded, so a genuine future update has something to compare against.
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.lastSeenVersion)).toBe("9.9.9");
  });

  test("shows nothing when the version matches what was last seen", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: {}, appVersion: "9.9.9", lastSeenVersion: "9.9.9", updateCheck: "none" },
    });
    await expect(page.locator(".info-bar")).toHaveCount(0);
  });

  test("clicking the close button dismisses the InfoBar without opening the releases list", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: {}, appVersion: "9.9.9", lastSeenVersion: "9.9.8", updateCheck: "none" },
    });
    const infoBar = page.locator(".info-bar");
    await expect(infoBar).toBeVisible();
    await expect(infoBar).toContainText("Updated to 9.9.9.");

    // Click the close button
    await infoBar.locator(".info-bar-close").click();
    await expect(infoBar).toHaveCount(0);

    // Releases list was not opened
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls)).not.toContain(
      "https://github.com/marien/ChronoNote/releases",
    );
  });
});

/** The About dialog's version card: the running version moved out of the title bar into the Updates
 * section, next to a chip saying what the update check makes of it, and up to date it links to this
 * version's own release notes. */
test.describe("About: the version card", () => {
  const seed = (extra: Record<string, unknown> = {}) => ({ seed: { notes: { [todayFilename()]: "hi" }, ...extra } });

  test("the title bar no longer carries the version; the About header card does", async ({ page }) => {
    await seedApp(page, seed({ updateCheck: "none" }));
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await expect(about.locator(".modal-title .modal-counter")).toHaveCount(0);
    await expect(page.locator(".settings-page-title")).not.toContainText("v0.3.0");
    const card = about.locator(".about-version-card");
    await expect(card).toContainText("v0.3.0"); // the mock's default appVersion
    await expect(card).toContainText("Version");
    await expect(card).toBeVisible();
  });

  test("up to date: an ok chip, when it was checked, and a link to THIS version's release notes", async ({ page }) => {
    await seedApp(page, seed({ updateCheck: "none" }));
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await expect(about.locator(".about-status-chip")).toContainText("Up to date");
    await expect(about.locator(".about-version-card")).toHaveAttribute("data-tone", "ok");
    await expect(about).toContainText(/checked just now/i);

    await about.getByRole("button", { name: /Release notes/ }).click();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls)).toContain(
      "https://github.com/marien/ChronoNote/releases/tag/v0.3.0",
    );
  });

  test("Check for updates runs another check", async ({ page }) => {
    await seedApp(page, seed({ updateCheck: "none" }));
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await expect(about.locator(".about-status-chip")).toContainText("Up to date");
    const before = await page.evaluate(() => window.__CHRONO_MOCK__!.invokeLog.filter((e) => e.cmd === "plugin:updater|check").length);
    await about.getByRole("button", { name: "Check for updates" }).click();
    await expect
      .poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.invokeLog.filter((e) => e.cmd === "plugin:updater|check").length))
      .toBeGreaterThan(before);
  });

  test("an available update: an accent chip, the current version stays visible, release notes link present", async ({ page }) => {
    await seedApp(page, seed({ updateCheck: "available", updateCheckVersion: "9.9.9" }));
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await expect(about.locator(".about-status-chip")).toContainText("Update available");
    await expect(about.locator(".about-version-card")).toHaveAttribute("data-tone", "accent");
    await expect(about.locator(".about-version-card")).toContainText("v0.3.0");
    await expect(about).toContainText("v9.9.9");
    await expect(about.getByRole("button", { name: "What's changed" })).toBeVisible();
    await expect(about.getByRole("button", { name: /Release notes/ })).toBeVisible();
  });

  test("a failed check: a warn chip, Try again, and still a way to this version's notes", async ({ page }) => {
    await seedApp(page, seed({ throwOnCommands: ["plugin:updater|check"] }));
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await expect(about.locator(".about-version-card")).toHaveAttribute("data-tone", "warn");
    await expect(about.getByRole("button", { name: /Try again/ })).toBeVisible();
    await expect(about.getByRole("button", { name: /Release notes/ })).toBeVisible();
  });

  test("the web app: always current, with the version and its release notes", async ({ page }) => {
    await seedApp(page, seed({ backendKind: "web" }));
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await expect(about.locator(".about-status-chip")).toContainText("Always current");
    await expect(about.locator(".about-version-card")).toContainText("v0.3.0");
    await about.getByRole("button", { name: /Release notes/ }).click();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls)).toContain(
      "https://github.com/marien/ChronoNote/releases/tag/v0.3.0",
    );
    // nothing to check or install there
    await expect(about.getByRole("button", { name: /Check/ })).toHaveCount(0);
  });

  test("the card fits the dialog on a phone-width screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await seedApp(page, seed({ updateCheck: "none" }));
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    const dialog = (await about.boundingBox())!;
    const card = (await about.locator(".about-version-card").boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(dialog.x);
    expect(card.x + card.width).toBeLessThanOrEqual(dialog.x + dialog.width + 1);
  });
});

test("About: a failed install says 'Install failed' on the chip, not 'Couldn't check'", async ({ page }) => {
  await seedApp(page, {
    seed: {
      notes: { [todayFilename()]: "hi" },
      updateCheck: "available",
      updateCheckVersion: "9.9.9",
      throwOnCommands: ["install_update"],
    },
  });
  const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
  await about.getByRole("button", { name: /Download & install/i }).click();
  await expect(about.locator(".about-status-chip")).toContainText("Install failed");
});

test.describe("phone viewport", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("at a phone viewport Ctrl+Shift+, shows the About sheet with the header card", async ({ page }) => {
    await seedApp(page, { seed: { notes: {} } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+Comma");
    await expect(page.locator(".modal-card.about-modal-card")).toBeVisible();
    await expect(page.locator(".modal-card.about-modal-card .about-version-card")).toBeVisible();
  });
});


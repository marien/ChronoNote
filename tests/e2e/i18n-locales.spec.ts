import { test, expect } from "@playwright/test";
import { seedApp, editor, parkMouse } from "./helpers";
import { scenario } from "../../src/lib/testing/scenarios";

// i18n roadmap: `MODAL_LABELS`/`modalCard` (used everywhere else in the
// suite) locate a modal by its *English* aria-label — safe for every other
// spec, which all run under the default `languageMode: "system"` plus the
// pinned `en-US` browser locale, but wrong here on purpose: this file
// deliberately seeds Dutch/German, and both modals' own accessible names
// are themselves translated now. Locate by stable CSS class instead.
const settings = (page: import("@playwright/test").Page) => page.locator(".settings-modal-card");

async function openSettings(page: import("@playwright/test").Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  await expect(settings(page)).toBeVisible();
}

/** i18n roadmap (`docs/design/i18n-roadmap.md`): the display language
 * follows the system by default and can be overridden in Settings, and
 * keyboard shortcuts must be completely unaffected by either — this
 * turns those two claims into something CI actually checks, rather than
 * just a design-doc assertion. */
test.describe("multilanguage support", () => {
  test("an explicit language override renders that language and sets <html lang>, regardless of browser locale", async ({
    page,
  }) => {
    await seedApp(page, { seed: { ...scenario("empty"), languageMode: "nl" } });
    await openSettings(page);

    // The tab itself and its section heading are now both translated and
    // happen to render the identical word ("Weergave"/"Darstellung") — scope
    // to the section-label element specifically to keep this unambiguous.
    await expect(settings(page).locator(".settings-section-label").getByText("Weergave", { exact: true })).toBeVisible();
    await expect(settings(page).getByText("Taal", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("nl");

    await settings(page).getByRole("radio", { name: "Deutsch", exact: true }).click();
    await expect(settings(page).locator(".settings-section-label").getByText("Darstellung", { exact: true })).toBeVisible();
    await expect(settings(page).getByText("Sprache", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("de");

    // Survives a reload (config is read on boot, same as theme/color mode).
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test.describe("with the browser's own locale set to Dutch", () => {
    test.use({ locale: "nl-NL" });

    test("`system` (the default) follows the browser's reported language with no override set", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" }); // languageMode defaults to "system"
      await openSettings(page);
      await expect(settings(page).locator(".settings-section-label").getByText("Weergave", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.lang)).toBe("nl");
    });
  });

  test("keyboard shortcuts are unaffected by the display language", async ({ page }) => {
    await seedApp(page, {
      seed: {
        ...scenario("single-day"),
        languageMode: "de",
      },
    });
    // Ctrl+Shift+H opens Section History regardless of display language —
    // shortcuts are bound by physical key code (shortcuts.ts), never by a
    // translated label.
    await editor(page).click();
    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+Shift+h");
    const history = page.locator(".history-modal-card");
    await expect(history).toBeVisible();
    await expect(history).toHaveAttribute("aria-label", "Abschnittsverlauf");

    // A different translated modal (Settings) still opens on the same
    // physical key combo too, confirming this isn't specific to History.
    await page.keyboard.press("Escape");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    await expect(settings(page)).toHaveAttribute("aria-label", "Einstellungen");
  });
});

import { test, expect } from "@playwright/test";
import { seedApp, modalCard, MODAL_LABELS } from "./helpers";

test.describe("Alt key tips (§B6)", () => {
  test("Alt tap shows badges, pressing 'a' opens Action Drawer, Escape dismisses, Alt+ArrowLeft does not show badges", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });

    // Pressing and releasing Alt toggles key tips on
    await page.keyboard.press("Alt");
    const keytips = page.locator(".keytip");
    await expect(keytips.first()).toBeVisible();
    await expect(keytips.filter({ hasText: "A" })).toBeVisible();

    // Pressing 'a' invokes the matching command (Actions) and turns tips off
    await page.keyboard.press("a");
    const actionDrawer = modalCard(page, MODAL_LABELS.actions);
    await expect(actionDrawer).toBeVisible();
    await expect(keytips).toHaveCount(0);

    // Dismiss the action drawer with Escape
    await page.keyboard.press("Escape");
    await expect(actionDrawer).not.toBeVisible();

    // Alt then Escape shows nothing open and turns tips off
    await page.keyboard.press("Alt");
    await expect(keytips.first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(keytips).toHaveCount(0);
    await expect(actionDrawer).not.toBeVisible();

    // Alt+ArrowLeft does not trigger key tips
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(keytips).toHaveCount(0);
  });
});

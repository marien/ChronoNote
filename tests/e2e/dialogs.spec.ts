import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  MODAL_LABELS,
  currentModal,
  todayFilename,
  tab,
} from "./helpers";

test.describe("confirmation dialogs (§C2)", () => {
  test("close-with-open-actions dialog shows title heading in .dialog-body, first button Cancel is accent and focused, Escape cancels", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "# open action to block closing" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+w");

    const safety = modalCard(page, MODAL_LABELS.safety);
    await expect(safety).toBeVisible();
    await expect(safety).toHaveClass(/\bdialog-card\b/);

    // Title is a heading inside .dialog-body
    const heading = safety.locator(".dialog-body h2.dialog-title");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("Unresolved Actions Warning");

    // First button in .dialog-buttons is Cancel with class accent and has focus
    const firstBtn = safety.locator(".dialog-buttons .dialog-btn").first();
    await expect(firstBtn).toHaveText("Cancel");
    await expect(firstBtn).toHaveClass(/\baccent\b/);
    await expect(firstBtn).toBeFocused();

    // Escape cancels the dialog and the tab stays open
    await page.keyboard.press("Escape");
    expect(await currentModal(page)).toBe("none");
    await expect(tab(page, todayFilename())).toHaveCount(1);
  });
});

import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  MODAL_LABELS,
} from "./helpers";

test.describe("Expressive Empty States (Area 6.4)", () => {
  test("Search Modal displays centered monoline icon, bold title, and muted guidance subtitle on no matches", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    const searchModal = modalCard(page, MODAL_LABELS.search);
    await expect(searchModal).toBeVisible();

    await searchModal.locator(".modal-input").fill("nonexistentquery123");

    const emptyState = searchModal.locator(".empty-state");
    await expect(emptyState).toBeVisible();

    // Icon
    const icon = emptyState.locator(".empty-state-icon svg");
    await expect(icon).toBeVisible();

    // Title
    const title = emptyState.locator(".empty-state-title");
    await expect(title).toContainText("nonexistentquery123");

    // Subtitle
    const subtitle = emptyState.locator(".empty-state-subtitle");
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText("Check your spelling or try using search operators");
  });

  test("Action Drawer displays expressive empty state when all actions are resolved", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+A");
    const actionDrawer = modalCard(page, MODAL_LABELS.actions);
    await expect(actionDrawer).toBeVisible();

    const emptyState = actionDrawer.locator(".empty-state");
    await expect(emptyState).toBeVisible();

    // Icon
    await expect(emptyState.locator(".empty-state-icon svg")).toBeVisible();

    // Title & subtitle
    await expect(emptyState.locator(".empty-state-title")).toHaveText("Nothing here — every action is resolved.");
    await expect(emptyState.locator(".empty-state-subtitle")).toHaveText("No outstanding tasks. Add new actions in your notes with #.");
  });

  test("Action Drawer displays expressive empty state when filtering matches nothing", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    await editor(page).click();
    await page.keyboard.insertText("# Task 1\n# Task 2\n");

    await page.keyboard.press("ControlOrMeta+Shift+A");
    const actionDrawer = modalCard(page, MODAL_LABELS.actions);
    await expect(actionDrawer).toBeVisible();

    await actionDrawer.locator(".modal-input").fill("unmatchedword");

    const emptyState = actionDrawer.locator(".empty-state");
    await expect(emptyState).toBeVisible();
    await expect(emptyState.locator(".empty-state-title")).toContainText("unmatchedword");
    await expect(emptyState.locator(".empty-state-subtitle")).toHaveText("Try a different keyword or clear the search filter.");
  });

  test("Command Palette displays expressive empty state when no commands match", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    const palette = modalCard(page, MODAL_LABELS.commandPalette);
    await expect(palette).toBeVisible();

    await palette.locator(".modal-input").fill("nonexistentcommand999");

    const emptyState = palette.locator(".empty-state");
    await expect(emptyState).toBeVisible();
    await expect(emptyState.locator(".empty-state-icon svg")).toBeVisible();
    await expect(emptyState.locator(".empty-state-title")).toHaveText("No matches.");
    await expect(emptyState.locator(".empty-state-subtitle")).toHaveText("Try a different search term or press Esc to dismiss.");
  });
});

import { test, expect } from "@playwright/test";
import { seedApp, editor, todayFilename } from "./helpers";

test("(1) Ctrl+, -> focused element is role='tab' inside .settings-page; Escape -> focus in .cm-content", async ({
  page,
}) => {
  await seedApp(page, { seed: "empty" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");

  const settingsPage = page.locator(".settings-page");
  await expect(settingsPage).toBeVisible();

  const focusedTab = page.locator(".settings-page [role='tab'][aria-selected='true']");
  await expect(focusedTab).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(settingsPage).toBeHidden();
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("(2) at 900x700, Ctrl+Shift+H on a section line -> focused element has role listbox, aria-activedescendant resolves to option and aria-selected='true'; ArrowDown changes aria-activedescendant; 6 x Tab never leaves dialog", async ({
  page,
}) => {
  await seedApp(page, {
    seed: {
      notes: {
        [todayFilename()]: "Standup\n====\n# item 1\n# item 2\n# item 3",
      },
      session: { openTabs: [todayFilename()], activeTab: todayFilename() },
    },
  });
  await page.setViewportSize({ width: 900, height: 700 });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+Shift+H");

  const dialog = page.locator(".modal-card.history-modal-card");
  await expect(dialog).toBeVisible();

  const listbox = dialog.locator('[role="listbox"]');
  await expect(listbox).toBeFocused();

  const initialActiveId = await listbox.getAttribute("aria-activedescendant");
  expect(initialActiveId).toBeTruthy();
  const initialOption = dialog.locator(`#${initialActiveId}`);
  await expect(initialOption).toHaveAttribute("role", "option");
  await expect(initialOption).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowDown");
  const nextActiveId = await listbox.getAttribute("aria-activedescendant");
  expect(nextActiveId).toBeTruthy();
  expect(nextActiveId).not.toBe(initialActiveId);
  const nextOption = dialog.locator(`#${nextActiveId}`);
  await expect(nextOption).toHaveAttribute("role", "option");
  await expect(nextOption).toHaveAttribute("aria-selected", "true");

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const card = document.querySelector(".modal-card.history-modal-card");
      return !!card && card.contains(document.activeElement);
    });
    expect(inside).toBe(true);
  }
});

test("(3) Actions drawer input has accessible name and aria-activedescendant follows ArrowDown", async ({
  page,
}) => {
  await seedApp(page, {
    seed: {
      notes: {
        [todayFilename()]: "# first action\n# second action\n# third action",
      },
      session: { openTabs: [todayFilename()], activeTab: todayFilename() },
    },
  });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Shift+A");

  const input = page.locator(".modal-card input.modal-input, .actions-pane input.modal-input");
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("aria-label", "Filter actions");

  const initialDescendant = await input.getAttribute("aria-activedescendant");
  expect(initialDescendant).toBeTruthy();

  await page.keyboard.press("ArrowDown");
  const nextDescendant = await input.getAttribute("aria-activedescendant");
  expect(nextDescendant).toBeTruthy();
  expect(nextDescendant).not.toBe(initialDescendant);

  const selectedOpt = page.locator(`#${nextDescendant}`);
  await expect(selectedOpt).toHaveAttribute("role", "option");
  await expect(selectedOpt).toHaveAttribute("aria-selected", "true");
});

test("(4) open action glyph has aria-label 'Open action', Ctrl+2 changes glyph label to 'Done' and announces", async ({
  page,
}) => {
  await seedApp(page, {
    seed: {
      notes: {
        [todayFilename()]: "# my task",
      },
      session: { openTabs: [todayFilename()], activeTab: todayFilename() },
    },
  });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");

  const glyph = page.locator(".cm-content .glyph-cyclable").first();
  await expect(glyph).toHaveAttribute("aria-label", "Open action");

  await page.keyboard.press("ControlOrMeta+2");
  await expect(glyph).toHaveAttribute("aria-label", "Done");

  const announced = page.locator(".cm-announced");
  await expect(announced).toContainText("Line set to Done");
});

test("(5) open-count button accessible name is exactly the full label (no duplicated number)", async ({
  page,
}) => {
  await seedApp(page, {
    seed: {
      notes: {
        [todayFilename()]: "# task one\n# task two",
      },
      session: { openTabs: [todayFilename()], activeTab: todayFilename() },
    },
  });

  const openBtn = page.locator("#stat-open");
  await expect(openBtn).toBeVisible();
  await expect(openBtn).toHaveAttribute("aria-label", "2 open");

  const accessibleName = await openBtn.evaluate((el) => el.getAttribute("aria-label"));
  expect(accessibleName).toBe("2 open");
  await expect(page.getByRole("button", { name: "2 open", exact: true })).toBeVisible();
});

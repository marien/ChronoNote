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

test("(2) at 900x700, Ctrl+Shift+H: the focused History body is a named group; ArrowDown points aria-activedescendant at a line (role option); Tab stays in the dialog", async ({
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
  const body = dialog.locator(".history-body");
  await expect(body).toBeFocused();
  await expect(body).toHaveAttribute("role", "group");
  await expect(body).toHaveAttribute("aria-label", /.+/);

  await page.keyboard.press("ArrowDown");
  await expect.poll(() => body.getAttribute("aria-activedescendant")).toMatch(/^history-line-\d+$/);
  const activeId = await body.getAttribute("aria-activedescendant");
  await expect(dialog.locator(`#${activeId}`)).toHaveAttribute("role", "option");

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

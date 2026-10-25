import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  openViaShortcut,
  modalCard,
  MODAL_LABELS,
  cursorLine,
  activeTabLabel,
} from "./helpers";

test.describe("forward links navigation and modals (§428)", () => {
  const seedData = {
    notes: {
      "2026-09-07.txt": [
        "Today",
        "=====",
        "# forwarded action (>2026-09-03#Standup)",
        "# incoming action (<2026-09-01#Retro)",
      ].join("\n"),
      "2026-09-03.txt": [
        "Intro",
        "=====",
        "Some text",
        "",
        "Standup",
        "=======",
        "# target item",
      ].join("\n"),
      "2026-09-01.txt": [
        "Retro",
        "=====",
        "# retro item",
      ].join("\n"),
    },
    session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
  };

  test("Ctrl/Cmd+Click on the pill opens the target day at the section", async ({ page }) => {
    await seedApp(page, { seed: seedData });

    const link = editor(page).locator(".cm-fwd-link").first();
    await expect(link).toBeVisible();

    // Ctrl+Click (or Cmd+Click) anywhere on the pill opens that day and lands on section
    await link.click({ modifiers: ["ControlOrMeta"] });
    await expect(activeTabLabel(page)).toHaveText("2026-09-03");
    await expect.poll(() => cursorLine(page)).toBe(5);
  });

  test("the date in a pill keeps the pill's look: no link colour, no underline, no change on hover", async ({ page }) => {
    await seedApp(page, { seed: seedData });
    // Marien (0.33.0-9): the date darkened on hover and its underline disappeared and flashed back.
    const date = editor(page).locator(".cm-date-link").filter({ hasText: "2026-09-03" });
    await expect(date).toHaveCount(1);
    const look = () =>
      date.evaluate((el) => {
        const cs = getComputedStyle(el);
        const digits = el.querySelector(":scope > *") ?? el;
        return { color: getComputedStyle(digits).color, line: cs.textDecorationLine, transition: cs.transitionDuration };
      });
    await editor(page).locator(".cm-line").first().click();
    const idle = await look();
    expect(idle.line).toBe("none");
    await date.hover();
    await page.waitForTimeout(300);
    expect(await look()).toEqual(idle);
    // ...and it is still a date link.
    await date.click({ modifiers: ["ControlOrMeta"] });
    await expect(activeTabLabel(page)).toHaveText("2026-09-03");
  });

  test("Ctrl/Cmd+Click on the arrow (.cm-fwd-dir) also opens the target day", async ({ page }) => {
    await seedApp(page, { seed: seedData });

    const arrow = editor(page).locator(".cm-fwd-link .cm-fwd-dir").first();
    await expect(arrow).toBeVisible();

    await arrow.click({ modifiers: ["ControlOrMeta"] });
    await expect(activeTabLabel(page)).toHaveText("2026-09-03");
    await expect.poll(() => cursorLine(page)).toBe(5);
  });

  test("Action Drawer displays .cm-fwd-link with .cm-fwd-dir-to and .cm-fwd-dir-from", async ({ page }) => {
    await seedApp(page, { seed: seedData });
    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");

    await expect(d.locator(".cm-fwd-link").first()).toBeVisible();
    await expect(d.locator(".cm-fwd-link .cm-fwd-dir-to")).toHaveCount(1);
    await expect(d.locator(".cm-fwd-link .cm-fwd-dir-from")).toHaveCount(1);
  });

  test("Section History displays .cm-fwd-link with .cm-fwd-dir-to / .cm-fwd-dir-from", async ({ page }) => {
    await seedApp(page, { seed: seedData });

    // Place caret in "Today" section
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");

    // Open Section History with Ctrl+Shift+H
    await page.keyboard.press("ControlOrMeta+Shift+H");
    const pane = page.locator(".history-pane, .modal-card");
    await expect(pane.first()).toBeVisible();

    await expect(pane.locator(".cm-fwd-link").first()).toBeVisible();
    await expect(pane.locator(".cm-fwd-link .cm-fwd-dir-to").first()).toBeVisible();
    await expect(pane.locator(".cm-fwd-link .cm-fwd-dir-from").first()).toBeVisible();
  });
});

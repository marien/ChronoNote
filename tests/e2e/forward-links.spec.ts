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

  test("the date in a pill behaves like the due date's: subtle underline, stronger on hover, back after", async ({ page }) => {
    // Marien (0.33.0-9): the date darkened on hover and its underline disappeared and flashed back; he wants the due
    // date's behaviour.
    await seedApp(page, {
      seed: {
        ...seedData,
        notes: { ...seedData.notes, "2026-09-07.txt": `${seedData.notes["2026-09-07.txt"]}\n# due action by:2026-09-20` },
      },
    });
    const date = editor(page).locator(".cm-fwd-link .cm-date-link").filter({ hasText: "2026-09-03" });
    const dueDate = editor(page).locator(".cm-due .cm-date-link");
    await expect(date).toHaveCount(1);
    await expect(dueDate).toHaveCount(1);
    const look = (l: typeof date) =>
      l.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, line: cs.textDecorationLine, lineColor: cs.textDecorationColor };
      });
    await page.locator(".cm-line").first().click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    const idle = await look(date);
    expect(idle).toEqual(await look(dueDate));
    expect(idle.line).toBe("underline");
    await date.hover();
    await page.waitForTimeout(300);
    const hovered = await look(date);
    expect(hovered.line).toBe("underline");
    expect(hovered.color).toBe(idle.color);
    expect(hovered.lineColor).not.toBe(idle.lineColor);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    expect(await look(date)).toEqual(idle);
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

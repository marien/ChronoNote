import { test, expect, type Page } from "@playwright/test";
import {
  activeTabContent,
  editor,
  mockNote,
  seedApp,
  toast,
  todayFilename,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

test.use({ viewport: { width: 1280, height: 800 } });

function shiftISO(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const TODAY_TEXT = "Coffee rota\n===========\n# milk";
const TWO_DAYS_AGO_TEXT = "Coffee rota\n===========\n# cups";
const TOMORROW_TEXT = "Coffee rota\n===========";
const RENAMED_TODAY_TEXT = "Hospitality rota\n================\n# milk";

async function openRenameModalFromFirstLine(page: Page) {
  await editor(page).locator(".cm-line").first().click({ button: "right", position: { x: 20, y: 8 } });
  const menuItem = page
    .getByRole("menuitem", { name: "Rename everywhere…" })
    .or(page.getByRole("button", { name: "Rename everywhere…" }));
  await expect(menuItem).toBeVisible();
  await menuItem.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("rename everywhere", () => {
  test("renames selected notes, supports one-step editor undo, and undoes via toast", async ({ page }) => {
    const todayFile = todayFilename();
    const twoDaysAgoISO = shiftISO(REFERENCE_TODAY, -2);
    const twoDaysAgoFile = `${twoDaysAgoISO}.txt`;
    const tomorrowISO = shiftISO(REFERENCE_TODAY, 1);
    const tomorrowFile = `${tomorrowISO}.txt`;

    await seedApp(page, {
      seed: {
        notes: {
          [todayFile]: TODAY_TEXT,
          [twoDaysAgoFile]: TWO_DAYS_AGO_TEXT,
          [tomorrowFile]: TOMORROW_TEXT,
        },
      },
    });

    // 1. Right-click title in today's note, open dialog, type "Hospitality rota"
    const dialog = await openRenameModalFromFirstLine(page);
    const toField = dialog
      .getByLabel(/^To$/i)
      .or(dialog.locator('input:not([readonly]):not([type="checkbox"])'));
    await expect(toField).toHaveValue("Coffee rota");

    await toField.fill("Hospitality rota");
    await expect(dialog).toContainText("4 lines in 2 notes");
    await expect(dialog).toContainText(REFERENCE_TODAY);
    await expect(dialog).toContainText(twoDaysAgoISO);
    await expect(dialog).not.toContainText(tomorrowISO);
    await expect(dialog.getByRole("button", { name: "Rename in 2 notes" })).toBeVisible();

    // 2. Untick the note of two days ago and press the button
    const twoDaysAgoRow = dialog
      .locator("label, li, tr, div")
      .filter({ hasText: twoDaysAgoISO })
      .filter({ has: page.getByRole("checkbox") })
      .last();
    await twoDaysAgoRow.getByRole("checkbox").uncheck();

    const renameOneBtn = dialog.getByRole("button", { name: /^Rename in 1 notes?$/ });
    await expect(renameOneBtn).toBeVisible();
    await renameOneBtn.click();
    await expect(dialog).toBeHidden();

    // 3. Today's note shows Hospitality rota; Ctrl+Z brings Coffee rota back in one step
    await expect(editor(page)).toContainText("Hospitality rota");
    await expect.poll(() => activeTabContent(page)).toBe(RENAMED_TODAY_TEXT);

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor(page)).toContainText("Coffee rota");
    await expect.poll(() => activeTabContent(page)).toBe(TODAY_TEXT);

    // 4. Two days ago and tomorrow still read Coffee rota
    expect(await mockNote(page, twoDaysAgoFile)).toBe(TWO_DAYS_AGO_TEXT);
    expect(await mockNote(page, tomorrowFile)).toBe(TOMORROW_TEXT);

    // 5. Fresh rename of today's note, then click toast to undo
    const dialog2 = await openRenameModalFromFirstLine(page);
    const toField2 = dialog2
      .getByLabel(/^To$/i)
      .or(dialog2.locator('input:not([readonly]):not([type="checkbox"])'));
    await toField2.fill("Hospitality rota");
    await expect(dialog2).toContainText("4 lines in 2 notes");

    const twoDaysAgoRow2 = dialog2
      .locator("label, li, tr, div")
      .filter({ hasText: twoDaysAgoISO })
      .filter({ has: page.getByRole("checkbox") })
      .last();
    await twoDaysAgoRow2.getByRole("checkbox").uncheck();
    await dialog2.getByRole("button", { name: /^Rename in 1 notes?$/ }).click();
    await expect(dialog2).toBeHidden();
    await expect.poll(() => activeTabContent(page)).toBe(RENAMED_TODAY_TEXT);

    const toastEl = toast(page);
    await expect(toastEl).toBeVisible();
    await toastEl.click();

    await expect(editor(page)).toContainText("Coffee rota");
    await expect.poll(() => activeTabContent(page)).toBe(TODAY_TEXT);
  });
});

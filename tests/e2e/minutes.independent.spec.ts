import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, toast, modalCard, MODAL_LABELS } from "./helpers";

const MEETING_NOTE = [
  "Design review",
  "=============",
  ". Vendor choice => we go with Acme",
  "# ask Sam for numbers => @sam",
  "v book room",
  "o Budget 2027",
  "! No meeting next week",
].join("\n");

function expectMeetingMinutes(raw: string): void {
  const text = raw.replace(/\r\n/g, "\n"); // Review: the Windows clipboard returns CRLF line ends.
  expect(text).toContain("Design review, ");
  expect(text).toContain("Decisions\n- Vendor choice: we go with Acme");
  expect(text).toContain("Actions\n- Ask Sam for numbers: Sam");
  expect(text).toContain("Done\n- Book room");
  expect(text).toContain("Still open\n- Budget 2027");
  expect(text).toContain("Remember\n- No meeting next week");
}

async function runFromCommandPalette(page: import("@playwright/test").Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+k");
  const palette = modalCard(page, MODAL_LABELS.commandPalette);
  await expect(palette).toBeVisible();
  await palette.locator(".modal-input").fill(">Copy as minutes");
  const row = palette.locator('.modal-item[role="option"]', { hasText: /Copy as minutes/i }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(palette).toBeHidden();
}

test.describe("Copy as minutes", () => {
  test("copies minutes and shows toast from the command palette", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, MEETING_NOTE);

    await editor(page).locator(".cm-line", { hasText: "Budget 2027" }).click();
    await runFromCommandPalette(page);

    await expect(toast(page).filter({ hasText: "Minutes copied." })).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expectMeetingMinutes(clip);
  });

  test("copies minutes and shows toast from the right-click menu on a section title", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, MEETING_NOTE);

    await editor(page).locator(".cm-line", { hasText: "Design review" }).first().click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();

    const item = menu.locator(".editor-context-item", { hasText: "Copy as minutes" });
    await expect(item).toBeVisible();
    await item.click();
    await expect(menu).toBeHidden();

    await expect(toast(page).filter({ hasText: "Minutes copied." })).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expectMeetingMinutes(clip);
  });

  test("shows a message when the caret is outside any section", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(
      page,
      [
        "loose line outside any section",
        "",
        "Design review",
        "=============",
        "# send draft",
      ].join("\n"),
    );

    await editor(page).locator(".cm-line", { hasText: "loose line outside any section" }).click();
    await runFromCommandPalette(page);

    await expect(toast(page).filter({ hasText: "Put the caret in a meeting first." })).toBeVisible();
  });

  test("shows a message and copies nothing for a section with only plain text", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedApp(page, { seed: "empty" });
    await setEditorText(
      page,
      [
        "Standup",
        "=======",
        "Everyone joined on time.",
        "Just plain notes here.",
      ].join("\n"),
    );

    await editor(page).locator(".cm-line", { hasText: "Everyone joined on time." }).click();
    await page.evaluate(() => navigator.clipboard.writeText("PRIOR_CLIPBOARD"));

    await runFromCommandPalette(page);

    await expect(toast(page).filter({ hasText: "Nothing in this meeting to put in minutes." })).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe("PRIOR_CLIPBOARD");
  });
});

import { test, expect } from "@playwright/test";
import { activeTabContent, editor, MODAL_LABELS, modalCard, parkMouse, seedApp, toast } from "./helpers";

const REFERENCE_NOTE = [
  "Design review",
  "=============",
  ". Vendor choice => we go with Acme => # (contract) send draft by:2026-11-20",
  "o Budget 2027",
  ", Hiring plan",
  "# ask Sam for numbers => @sam",
  "=> @dana prepares the demo by:2026-11-24",
  "! No meeting next week",
  "v book room",
  "> move the offsite (>2026-11-23#Design review)",
  "Sam was late, started 14:10",
].join("\n");

function fmtLong(locale: string, y: number, m: number, d: number): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, d, 12));
}

function fmtShort(locale: string, y: number, m: number, d: number): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(y, m - 1, d, 12));
}

test.describe("copy a meeting as minutes (F2)", () => {
  test("command palette copies the reference meeting as minutes without changing the note", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await seedApp(page, {
      seed: {
        notes: { "2026-11-16.txt": REFERENCE_NOTE },
        session: { openTabs: ["2026-11-16.txt"], activeTab: "2026-11-16.txt" },
        minutesName: "Marien",
      },
    });

    await editor(page).locator(".cm-line", { hasText: "Budget 2027" }).click();
    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+k");

    const palette = modalCard(page, MODAL_LABELS.commandPalette);
    await expect(palette).toBeVisible();
    await palette.locator(".modal-input").fill("copy as minutes");
    const option = palette.locator('.modal-item[role="option"]', { hasText: "Copy as minutes" });
    await expect(option).toHaveCount(1);
    await option.click();

    await expect(palette).toBeHidden();
    await expect(toast(page)).toHaveText("Minutes copied.");

    const clipboardText = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
    const expected = [
      `Design review, ${fmtLong("en", 2026, 11, 16)}`,
      "",
      "Decisions",
      "- Vendor choice: we go with Acme",
      "",
      "Actions",
      `- Send draft (contract): Marien, by ${fmtShort("en", 2026, 11, 20)}`,
      "- Ask Sam for numbers: Sam",
      `- Prepares the demo: Dana, by ${fmtShort("en", 2026, 11, 24)}`,
      "",
      "Done",
      "- Book room",
      "",
      "Still open",
      "- Budget 2027",
      "- Hiring plan (not discussed)",
      "",
      "Remember",
      "- No meeting next week",
    ].join("\n");

    expect(clipboardText).toBe(expected);
    expect(await activeTabContent(page)).toBe(REFERENCE_NOTE);
  });

  test("context menu shows Copy as minutes on a title line and body line, and hides it above the first section", async ({ page }) => {
    const noteWithPreamble = ["Preamble line", "", REFERENCE_NOTE].join("\n");

    await seedApp(page, {
      seed: {
        notes: { "2026-11-16.txt": noteWithPreamble },
        session: { openTabs: ["2026-11-16.txt"], activeTab: "2026-11-16.txt" },
        minutesName: "Marien",
      },
    });

    // Above the first section: absent
    await editor(page).locator(".cm-line", { hasText: "Preamble line" }).click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Copy as minutes" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // On the section title line: present
    await editor(page).locator(".cm-line", { hasText: "Design review" }).first().click({ button: "right" });
    await expect(menu).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Copy as minutes" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // On a body line inside the section: present
    await editor(page).locator(".cm-line", { hasText: "Budget 2027" }).click({ button: "right" });
    await expect(menu).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Copy as minutes" })).toBeVisible();
  });
});

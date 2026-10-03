import { test, expect } from "@playwright/test";
import { seedApp, editor, mockNote, tab } from "./helpers";

/** Peek mode: the compact, see-through note window for calls. The native window handling (size, position,
 * transparency, always-on-top, the global shortcut) can't run in a browser — this covers the part the page owns:
 * the one-section view of the SAME editor, the header strip with the occurrence/past-today-future colour, stepping
 * between occurrences, and that edits are ordinary edits. */
const note = (extra: string) =>
  ["Standup", "=======", "# one", "", "Weekly sync", "===========", "o budget", extra, "", "Other", "=====", "x elsewhere"].join(
    "\n",
  );

test.describe("peek mode", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-01.txt": note("- last month"),
          "2026-09-07.txt": note("- today"),
          "2026-09-10.txt": note("- next week"),
        },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });
  });

  async function enterOnWeeklySync(page: import("@playwright/test").Page) {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+F11");
  }

  test("shows only the section the cursor is in", async ({ page }) => {
    await enterOnWeeklySync(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();
    const text = await editor(page).innerText();
    expect(text).toContain("Weekly sync");
    expect(text).toContain("budget");
    expect(text).not.toContain("Standup");
    expect(text).not.toContain("elsewhere");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-07");
    await expect(page.locator("#peek-bar")).toContainText("2/3");
    await expect(page.locator("#peek-bar")).toHaveClass(/\btoday\b/);
  });

  test("the shortcut again brings the full note back", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.waitForTimeout(300);
    await page.keyboard.press("ControlOrMeta+F11");
    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    expect(await editor(page).innerText()).toContain("Standup");
  });

  test("Alt+Left / Alt+Right switch occurrence; the header colour follows past / today / future", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-01");
    await expect(page.locator("#peek-bar")).toHaveClass(/\bpast\b/);
    expect(await editor(page).innerText()).toContain("last month");
    await page.keyboard.press("Alt+ArrowRight");
    await page.keyboard.press("Alt+ArrowRight");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-10");
    await expect(page.locator("#peek-bar")).toHaveClass(/\bfuture\b/);
    expect(await editor(page).innerText()).toContain("next week");
  });

  test("a past occurrence is editable and the edit lands in that note", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-01");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("added in peek");
    await expect
      .poll(async () => (await mockNote(page, "2026-09-01.txt")) ?? "")
      .toContain("added in peek");
    // The tab for that day is a normal tab now.
    await expect(tab(page, "2026-09-01.txt")).toHaveCount(1);
  });
});

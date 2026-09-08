import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, tab, mockNote } from "./helpers";

/** Spec 2.2 "Copy/paste deferral": copying a `# ` line and pasting it into
 * today's (or a later) note marks the original as `> ` in its source. The
 * branching logic is unit-tested in `controller.test.ts`; this drives it
 * through a real copy/paste in the browser. */
test.describe("copy/paste deferral", () => {
  async function copyLine(page: Page, text: string) {
    // Select the whole current line, then fire a real copy.
    await editor(page).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+C");
  }

  test("pasting a copied '# ' line into today defers the original to '>'", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": "Top priorities\n==============\n",
          "2026-09-03.txt": "Daily Standup\n=============\n# call the vendor back\n- other stuff",
        },
        session: { openTabs: ["2026-09-03.txt", "2026-09-07.txt"], activeTab: "2026-09-03.txt" },
      },
    });

    // In the source tab, put the cursor on the "# call the vendor back" line and copy it.
    await editor(page).click();
    await page.keyboard.press("Control+Home");
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+C");

    // Switch to today and paste.
    await tab(page, "2026-09-07.txt").click();
    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("ControlOrMeta+V");

    await expect.poll(() => mockNote(page, "2026-09-03.txt")).toContain("> call the vendor back");
    await expect.poll(() => mockNote(page, "2026-09-03.txt")).not.toContain("# call the vendor back");
  });

  test("pasting into a past-dated note does NOT defer the original", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": "Standup\n=======\n# review the metrics",
          "2026-09-01.txt": "Older note\n==========\n",
        },
        session: { openTabs: ["2026-09-01.txt", "2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    await editor(page).click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+C");

    await tab(page, "2026-09-01.txt").click();
    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("ControlOrMeta+V");

    // Source stays open, not deferred.
    await page.waitForTimeout(500);
    expect(await mockNote(page, "2026-09-07.txt")).toContain("# review the metrics");
  });

  test("a later copy of a plain line clears the stale record — the old tab is untouched (#8)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": "Today\n=====\nsome plain notes",
          "2026-08-20.txt": "Old meeting\n===========\n# chase the invoice\n# ping the vendor",
        },
        session: { openTabs: ["2026-08-20.txt", "2026-09-07.txt"], activeTab: "2026-08-20.txt" },
      },
    });

    // In the old tab: select the whole action block and copy it (as if to paste elsewhere).
    await editor(page).click();
    await page.keyboard.press("Control+Home");
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown"); // onto "# chase the invoice"
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+End"); // selects both `# ` lines
    await page.keyboard.press("ControlOrMeta+C");

    // Switch to today, copy a plain line there, paste it into today.
    await tab(page, "2026-09-07.txt").click();
    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End"); // "some plain notes"
    await page.keyboard.press("ControlOrMeta+C");
    await page.keyboard.press("End");
    await page.keyboard.press("ControlOrMeta+V");

    await page.waitForTimeout(500);
    // The old tab's actions are still open — the plain copy replaced the stale record.
    expect(await mockNote(page, "2026-08-20.txt")).toContain("# chase the invoice");
    expect(await mockNote(page, "2026-08-20.txt")).not.toContain("> chase the invoice");
  });
});

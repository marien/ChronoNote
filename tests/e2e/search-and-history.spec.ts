import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, modalCard, MODAL_LABELS, activeTabLabel, currentModal } from "./helpers";

const search = (page: Page) => modalCard(page, MODAL_LABELS.search);
const history = (page: Page) => modalCard(page, MODAL_LABELS.history);
const rows = (m: ReturnType<typeof search>) => m.locator('.modal-item[role="option"]');

test.describe("cross-tab search (Ctrl+Shift+F)", () => {
  test("matches lines across open tabs and jumps on Enter", async ({ page }) => {
    await seedApp(page, { seed: "delegation" });

    await editor(page).click();
    await page.keyboard.press("Control+Shift+F");
    await expect(search(page)).toBeVisible();

    await search(page).locator(".modal-input").fill("migration plan");
    await expect(rows(search(page)).first()).toBeVisible();
    await expect(search(page)).toContainText("draft the migration plan");

    await page.keyboard.press("Enter");
    expect(await currentModal(page)).toBe("none");
    await expect(editor(page)).toContainText("draft the migration plan");
  });

  test("'All Files' scope widens the result set beyond open tabs", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("Control+Shift+F");
    await search(page).locator(".modal-input").fill("the");

    const openCount = await rows(search(page)).count();
    await search(page).getByRole("button", { name: "All Files" }).click();
    await expect.poll(() => rows(search(page)).count()).toBeGreaterThanOrEqual(openCount);
  });
});

test.describe("section history (Ctrl+Shift+H)", () => {
  test("aggregates a recurring section's actions across days, deduped", async ({ page }) => {
    // Hand-built so the recurring section + its repeated line are exact.
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": ["Weekly Planning — 2026-09-07", "===========================", "# renew the TLS cert", "- notes for today"].join(
            "\n",
          ),
          "2026-09-01.txt": [
            "Weekly Planning — 2026-09-01",
            "===========================",
            "# renew the TLS cert",
            "v shipped the docs",
          ].join("\n"),
          "2026-08-25.txt": [
            "Weekly Planning — 2026-08-25",
            "===========================",
            "# renew the TLS cert",
            "> defer the audit",
          ].join("\n"),
        },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    // Put the cursor inside the recurring section.
    await editor(page).click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // onto "# renew the TLS cert"
    await page.keyboard.press("Control+Shift+H");

    await expect(history(page)).toBeVisible();
    // Title (in the readonly input) names the section being aggregated.
    await expect(history(page).locator(".modal-input")).toHaveValue(/Weekly Planning/);
    // "renew the TLS cert" appears in all three days but dedupes to one row.
    await expect(history(page).getByText("renew the TLS cert")).toHaveCount(1);
    // The other, distinct lines from earlier days are listed.
    await expect(history(page)).toContainText("shipped the docs");
    await expect(history(page)).toContainText("defer the audit");
  });

  test("cursor outside any named section shows a toast, no drawer", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "just a floating line, no header");
    await editor(page).click();
    await page.keyboard.press("Control+Shift+H");

    await expect(history(page)).toBeHidden();
    await expect(page.locator("#toast")).toContainText(/section/i);
  });
});

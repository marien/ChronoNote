import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  setEditorText,
  modalCard,
  MODAL_LABELS,
  activeTabLabel,
  currentModal,
  todayFilename,
} from "./helpers";

const search = (page: Page) => modalCard(page, MODAL_LABELS.search);
const history = (page: Page) => modalCard(page, MODAL_LABELS.history);
const rows = (m: ReturnType<typeof search>) => m.locator('.modal-item[role="option"]');

test.describe("cross-tab search (Ctrl+Shift+F)", () => {
  test("matches lines across open tabs and jumps on Enter", async ({ page }) => {
    await seedApp(page, { seed: "delegation" });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
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
    await page.keyboard.press("ControlOrMeta+Shift+F");
    await search(page).locator(".modal-input").fill("the");

    const openCount = await rows(search(page)).count();
    await search(page).getByRole("radio", { name: "All Files" }).click();
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
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // onto "# renew the TLS cert"
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await expect(history(page)).toBeVisible();
    // Title (§127: a plain heading, not a fake readonly input) names the
    // section being aggregated.
    await expect(history(page).locator(".modal-title")).toContainText(/Weekly Planning/);
    // "renew the TLS cert" appears in all three days but dedupes to one row.
    const list = history(page).locator(".modal-list");
    await expect(list.getByText("renew the TLS cert")).toHaveCount(1);
    // The other, distinct lines from earlier days are listed.
    await expect(list).toContainText("shipped the docs");
    await expect(list).toContainText("defer the audit");
  });

  test("#41: list rows show the action after a mid-line follow-up, split multi-action lines, format topics", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Sync\n====\ntoday",
          "2026-09-05.txt": [
            "Sync",
            "====",
            "Talked to Ana => # (q3) chase the invoice",
            "# draft the plan => # send it round",
          ].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const list = history(page).locator(".modal-list");
    // mid-line follow-up: only the post-arrow text, with its (q3) topic styled
    const row1 = list.locator(".modal-item", { hasText: "chase the invoice" });
    await expect(row1).toContainText("☐ (q3) chase the invoice");
    await expect(row1).not.toContainText("Talked to Ana");
    await expect(row1.locator(".glyph-topic")).toHaveText("(q3)");
    // the two-action line becomes two rows
    await expect(list.locator(".modal-item", { hasText: "draft the plan" })).toHaveCount(1);
    await expect(list.locator(".modal-item", { hasText: "send it round" })).toHaveCount(1);

    // Shift+Enter inserts the action itself, not the whole source line
    await list.locator(".modal-item", { hasText: "chase the invoice" }).hover();
    await expect(history(page).locator(".hp-insert")).toHaveText("# (q3) chase the invoice");
  });

  test("the 'Previous occurrence' pane shows that section's prior body, glyph-rendered (#27/#33)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Weekly Sync\n====\n# something new today",
          "2026-09-05.txt": [
            "Weekly Sync",
            "===========",
            "- reviewed the roadmap",
            "# chase the vendor (q3)",
            "Next section here",
            "=================",
            "not part of the sync",
          ].join("\n"),
          "2026-09-01.txt": "Weekly Sync\n====\n- older, should be ignored",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown"); // into the "Weekly Sync" section
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const panel = history(page).locator(".history-prev");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Previous occurrence · 2026-09-05");
    // Glyph-rendered (#33.1): the `#` shows as ☐, the bullet as •, stopping
    // at the next section header. The (q3) topic tag (#36) is kept.
    await expect(panel.locator(".po-body")).toContainText("☐ chase the vendor (q3)");
    await expect(panel.locator(".po-body")).toContainText("• reviewed the roadmap");
    await expect(panel.locator(".po-body")).not.toContainText("not part of the sync");
    await expect(panel.locator(".po-body")).not.toContainText("older, should be ignored");

    // "Open file" jumps to that occurrence and closes the drawer.
    await panel.getByRole("button", { name: "Open file" }).click();
    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText("2026-09-05");
  });

  test("the 'Previous occurrence' pane caps at 5 lines with a show-all toggle (#33.2)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\ntoday",
          "2026-09-05.txt": ["Standup", "=======", "one", "two", "three", "four", "five", "six", "seven"].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const pane = history(page).locator(".history-prev");
    await expect(pane.locator(".po-line")).toHaveCount(5);
    await pane.getByRole("button", { name: /show all 7 lines/i }).click();
    await expect(pane.locator(".po-line")).toHaveCount(7);
    await pane.getByRole("button", { name: /show fewer/i }).click();
    await expect(pane.locator(".po-line")).toHaveCount(5);
  });

  test("the preview pane shows the source context, insert text and target (§109)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\nnothing here yet",
          "2026-09-05.txt": "Standup\n====\n> chase the flaky test\nplain follow-up line",
        },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown"); // into the "Standup" section
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const preview = history(page).locator(".history-preview");
    await expect(preview).toBeVisible();

    // hover the deferred action from the older note to select it (a click
    // would jump to the source file instead)
    await history(page).locator('.modal-item[role="option"]', { hasText: "chase the flaky test" }).hover();

    await expect(preview).toContainText("From 2026-09-05.txt");
    await expect(preview.locator(".hp-context")).toContainText("chase the flaky test");
    // Shift+Enter rewrites a deferred `>` as a fresh open `#`
    await expect(preview.locator(".hp-insert")).toHaveText("# chase the flaky test");
    await expect(preview).toContainText(todayFilename());
  });

  test("cursor outside any named section shows a toast, no drawer", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "just a floating line, no header");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await expect(history(page)).toBeHidden();
    await expect(page.locator("#stat-message")).toContainText(/section/i);
  });
});

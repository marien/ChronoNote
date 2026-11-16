import { test, expect } from "@playwright/test";
import { seedApp, editor, cursorLine, currentModal } from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

const TODAY_FILE = `${REFERENCE_TODAY}.txt`;

test.describe("Person view (F5)", () => {
  const seedNotes = {
    [TODAY_FILE]: [
      "Board prep",
      "==========",
      "# ask @Dana about the hall key",
      "Plain note mentioning Dana once",
    ].join("\n"),
    "2026-09-04.txt": [
      "Coffee rota",
      "===========",
      "=> @Dana bring milk",
      "- Dana volunteered",
    ].join("\n"),
    "2026-06-15.txt": [
      "Old sync",
      "========",
      "=> @dana older delegation",
      "- Dana in old meeting",
    ].join("\n"),
  };

  test("Ctrl+click @Dana opens docked pane at 1280x800, row click jumps and keeps pane", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [TODAY_FILE], activeTab: TODAY_FILE },
      },
    });

    const danaToken = page.locator(".cm-line .glyph-assignee", { hasText: "@Dana" });
    await expect(danaToken).toBeVisible();
    await danaToken.click({ modifiers: ["ControlOrMeta"] });

    const pane = page.locator("aside.person-pane");
    await expect(pane).toBeVisible();
    await expect(pane.locator(".person-title")).toHaveText("@Dana");

    const bands = pane.locator(".person-band");
    await expect(bands).toHaveCount(3);
    await expect(bands.nth(0)).toContainText("Your open actions that mention Dana · 1");
    await expect(bands.nth(1)).toContainText("Delegated to Dana · 1");
    await expect(bands.nth(2)).toContainText("Last mentions · by meeting");

    const rows = pane.locator('.person-row[role="option"]');
    await expect(rows).toHaveCount(4);

    // Click the mention row in today's note (line 4, 1-based) and verify caret jumps while pane stays open
    const todayMentionRow = pane.locator(".person-mention-row", { hasText: "Board prep" });
    await expect(todayMentionRow).toContainText("1 line");
    await todayMentionRow.click();

    await expect(pane).toBeVisible();
    expect(await cursorLine(page)).toBe(4);

    // Show older brings in the 2026-06-15 delegation and mention
    const olderBtn = pane.locator(".person-show-older-btn");
    await expect(olderBtn).toBeVisible();
    await olderBtn.click();
    await expect(bands.nth(1)).toContainText("Delegated to Dana · 2");
    await expect(rows).toHaveCount(6);
    await expect(olderBtn).toBeHidden();

    // Select row 0, then ArrowDown moves to row 1 (2026-09-04 delegation) and Enter jumps to line 3
    await rows.nth(0).click();
    await pane.locator(".person-list").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(pane).toBeVisible();
    await expect(page.locator(".tab.active .tab-label")).toHaveText(/2026-09-04/);
    expect(await cursorLine(page)).toBe(3);
  });

  test("plain click on @Dana places caret without opening Person view", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [TODAY_FILE], activeTab: TODAY_FILE },
      },
    });

    const danaToken = page.locator(".cm-line .glyph-assignee", { hasText: "@Dana" });
    await danaToken.click();
    expect(await currentModal(page)).toBe("none");
    await expect(page.locator("aside.person-pane")).toBeHidden();
  });

  test("opens as a dialog at 800 px width", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 800 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [TODAY_FILE], activeTab: TODAY_FILE },
      },
    });

    const danaToken = page.locator(".cm-line .glyph-assignee", { hasText: "@Dana" });
    await danaToken.click({ modifiers: ["ControlOrMeta"] });

    await expect(page.locator("aside.person-pane")).toHaveCount(0);
    const dialog = page.locator('.modal-card[role="dialog"][aria-label="Person: Dana"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".person-title")).toHaveText("@Dana");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("line menu Show @Dana and palette @da People group open Person view", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [TODAY_FILE], activeTab: TODAY_FILE },
      },
    });

    // 1. Line menu on a line with @Dana
    const danaToken = page.locator(".cm-line .glyph-assignee", { hasText: "@Dana" });
    await danaToken.click({ button: "right" });
    const showPersonItem = page.locator(".editor-context-menu .editor-context-item", { hasText: "Show @Dana" });
    await expect(showPersonItem).toBeVisible();
    await showPersonItem.click();

    const pane = page.locator("aside.person-pane");
    await expect(pane).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pane).toBeHidden();

    // 2. Command palette @da -> People -> @Dana
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.locator('.modal-card[aria-label="Command palette"]');
    await expect(palette).toBeVisible();
    await palette.locator(".modal-input").fill("@da");

    await expect(palette.locator(".modal-group-header", { hasText: "People" })).toBeVisible();
    const personOption = palette.locator('.modal-item[role="option"]', { hasText: "@Dana" });
    await expect(personOption).toBeVisible();
    await personOption.click();

    await expect(pane).toBeVisible();
    await expect(pane.locator(".person-title")).toHaveText("@Dana");
  });
});

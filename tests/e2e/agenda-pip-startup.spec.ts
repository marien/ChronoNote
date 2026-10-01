import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS, todayFilename, activeTabLabel, mockNote } from "./helpers";
import { scenario } from "../../src/lib/testing/scenarios";

/** PR #122: the agenda notification pip, ad-hoc calls, silent sync of an empty
 * note, and the startup-tab preference. The reconciliation maths is unit
 * tested; these cover the wiring a user actually sees. */
const TODAY_FILE = todayFilename();
const today = TODAY_FILE.replace(/\.txt$/, "");
const agenda = (...titles: string[]) =>
  JSON.stringify(titles.map((title, i) => ({ date: today, start: `${9 + i}:00`, end: `${9 + i}:30`, title })));

const syncButton = (page: Page) => page.getByTitle("Sync calendar for this day", { exact: false });
const pip = (page: Page) => syncButton(page).locator(".icon-btn-pip");

async function seedToday(page: Page, content: string, titles: string[]) {
  await seedApp(page, {
    seed: {
      ...scenario("empty"),
      calendarSyncEnabled: true,
      agendaJson: agenda(...titles),
      notes: { [TODAY_FILE]: content },
      session: { openTabs: [TODAY_FILE], activeTab: TODAY_FILE },
    },
  });
}

test.describe("agenda notification pip (Area 1)", () => {
  test("shows when the calendar has a meeting the note doesn't", async ({ page }) => {
    await seedToday(page, "Standup\n=======\nnotes\n", ["Standup", "Design Review"]);
    await expect(pip(page)).toBeVisible();
  });

  test("hidden when the note already matches the calendar", async ({ page }) => {
    await seedToday(page, "Standup\n=======\nnotes\n", ["Standup"]);
    await expect(syncButton(page)).toBeEnabled();
    await expect(pip(page)).toHaveCount(0);
  });

  test("ad-hoc calls never light it up", async ({ page }) => {
    await seedToday(page, "Standup\n=======\nnotes\n\n\n'Quick call with Dave\n====================\nagreed\n", ["Standup"]);
    await expect(syncButton(page)).toBeEnabled();
    await expect(pip(page)).toHaveCount(0);
  });

  test("shows for a missing meeting and clears after syncing", async ({ page }) => {
    await seedToday(page, "Standup\n=======\nnotes\n", ["Standup", "Design Review"]);
    await expect(pip(page)).toBeVisible();
    await syncButton(page).click();
    await page.getByRole("button", { name: "Sync", exact: true }).click();
    await expect(editor(page)).toContainText("Design Review");
    await expect(pip(page)).toHaveCount(0);
  });

  test("in the collapsed More menu the pip is a small dot beside the label, not a stretched bar", async ({ page }) => {
    await seedToday(page, "Standup\n=======\nnotes\n", ["Standup", "Design Review"]);
    await page.setViewportSize({ width: 480, height: 720 });
    await page.getByTitle("More actions").click();
    const dot = page.locator(".more-actions-pip");
    await expect(dot).toBeVisible();
    const box = (await dot.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(8);
    expect(box.height).toBeLessThanOrEqual(8);
    // Right after the label text, before the shortcut chip.
    const row = page.locator(".more-actions-item", { has: dot });
    const label = (await row.locator("span").first().boundingBox())!;
    const kbd = (await row.locator("kbd").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(label.x);
    expect(box.x + box.width).toBeLessThanOrEqual(kbd.x);
  });
});

test.describe("silent sync of an empty note (Area 3)", () => {
  test("an empty note for today fills from the calendar and puts the caret on line 3", async ({ page }) => {
    await seedApp(page, {
      seed: { ...scenario("empty"), calendarSyncEnabled: true, agendaJson: agenda("Standup", "Design Review") },
    });
    await expect(editor(page)).toContainText("Standup");
    await expect(editor(page)).toContainText("Design Review");
    await expect(page.locator("#stat-pos")).toContainText("3");
    // Opening it must not have raised any prompt.
    await expect(page.locator(".modal-card")).toHaveCount(0);
  });

  test("a note that already has content is left alone", async ({ page }) => {
    await seedToday(page, "my own notes\n", ["Standup"]);
    await expect(editor(page)).toContainText("my own notes");
    await expect(editor(page)).not.toContainText("Standup");
  });

  test("nothing happens when calendar sync is off", async ({ page }) => {
    await seedApp(page, {
      seed: { ...scenario("empty"), calendarSyncEnabled: false, agendaJson: agenda("Standup") },
    });
    await expect(editor(page)).not.toContainText("Standup");
  });
});

test.describe("startup tab preference (Area 4)", () => {
  const PAST = "2026-09-01.txt";
  const base = {
    ...scenario("empty"),
    notes: { [PAST]: "an older note\n" },
    session: { openTabs: [PAST], activeTab: PAST, lastOpenedDate: "2026-09-01" },
  };

  test("default: the first launch of a day lands on today", async ({ page }) => {
    await seedApp(page, { seed: base });
    await expect(activeTabLabel(page)).toContainText(today);
  });

  test("smart: restores the last note when today is empty and has no meetings", async ({ page }) => {
    await seedApp(page, { seed: { ...base, startupTabMode: "smart_last_active" } });
    await expect(activeTabLabel(page)).toContainText("2026-09-01");
  });

  test("smart: still opens today when the calendar has meetings for it", async ({ page }) => {
    await seedApp(page, {
      seed: { ...base, startupTabMode: "smart_last_active", calendarSyncEnabled: true, agendaJson: agenda("Standup") },
    });
    await expect(activeTabLabel(page)).toContainText(today);
  });

  test("smart: still opens today when today already has notes", async ({ page }) => {
    await seedApp(page, {
      seed: { ...base, startupTabMode: "smart_last_active", notes: { ...base.notes, [TODAY_FILE]: "drafted\n" } },
    });
    await expect(activeTabLabel(page)).toContainText(today);
  });

  test("the setting lives under Settings → Notes & Sync and is remembered", async ({ page }) => {
    await seedApp(page, { seed: base });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    const settings = modalCard(page, MODAL_LABELS.settings);
    await settings.getByRole("radio", { name: "Notes & Sync" }).click();
    await expect(settings.getByText("Startup", { exact: true })).toBeVisible();
    await settings.getByRole("radio", { name: "Last note" }).click();
    await expect(settings.getByRole("radio", { name: "Last note" })).toBeChecked();
    expect(await mockNote(page, PAST)).toBe("an older note\n"); // choosing a mode touches no note
    expect(await page.evaluate(() => (window as any).__CHRONO_MOCK__.startupTabMode)).toBe("smart_last_active");
  });
});

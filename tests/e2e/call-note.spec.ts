import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, mockNote } from "./helpers";

/** Peek on the meeting that is on now, or on a new ad-hoc call section (`callNote.ts`). The global shortcut cannot be
 * pressed in a browser, so these go through the command palette entry, which runs the same action; the registration
 * of the shortcut is checked through the mock's record of what was registered. The clock is pinned to 09:00 on
 * 2026-09-07. */
const TODAY = "2026-09-07.txt";
const agenda = (...rows: [string, string, string][]) =>
  JSON.stringify(rows.map(([start, end, title]) => ({ date: "2026-09-07", start, end, title })));

const note = ["Standup", "=======", "o prepare", "", "Design review", "=============", "o slides", "- notes", "", "Other", "=====", "x elsewhere"].join(
  "\n",
);

async function seed(page: Page, opts: { enabled?: boolean; agendaJson?: string; notes?: Record<string, string> } = {}) {
  await seedApp(page, {
    seed: {
      notes: opts.notes ?? { [TODAY]: note },
      session: { openTabs: [TODAY], activeTab: TODAY },
      agendaJson: opts.agendaJson ?? agenda(["08:00", "08:30", "Standup"], ["11:00", "12:00", "Design review"]),
      peek: { enabled: opts.enabled ?? true },
    },
  });
}

async function runFromPalette(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("notes for the meeting");
  await page.keyboard.press("Enter");
}

test.describe("Peek notes for the meeting that is on now", () => {
  test("opens on the meeting that is on now, found by time", async ({ page }) => {
    await seed(page, { agendaJson: agenda(["08:00", "08:30", "Standup"], ["09:00", "10:00", "Design review"]) });
    await runFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator("#peek-bar")).toContainText("Design review");
    const text = await editor(page).innerText();
    expect(text).toContain("slides");
    expect(text).not.toContain("prepare");
  });

  test("an empty meeting section with no empty line under it still opens that meeting, not the next one", async ({ page }) => {
    const tight = ["Standup", "=======", "Design review", "=============", "o slides"].join("\n");
    await seed(page, {
      notes: { [TODAY]: tight },
      agendaJson: agenda(["08:30", "09:30", "Standup"], ["11:00", "12:00", "Design review"]),
    });
    await runFromPalette(page);
    await expect(page.locator("#peek-bar")).toContainText("Standup");
    expect(await editor(page).innerText()).not.toContain("slides");
  });

  test("a meeting that starts in a few minutes counts", async ({ page }) => {
    await seed(page, { agendaJson: agenda(["09:05", "10:00", "Design review"]) });
    await runFromPalette(page);
    await expect(page.locator("#peek-bar")).toContainText("Design review");
  });

  test("with no meeting on it adds an ad-hoc call section between the meetings, titled with the start time", async ({ page }) => {
    await seed(page);
    await runFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator("#peek-bar")).toContainText("'Call 09:00");
    expect(await editor(page).innerText()).not.toContain("slides");
    // In the note it sits after the 08:00 meeting and before the 11:00 one.
    await expect
      .poll(async () => {
        const saved = (await mockNote(page, TODAY)) ?? "";
        const i = [saved.indexOf("Standup"), saved.indexOf("'Call 09:00"), saved.indexOf("Design review")];
        return i[0] >= 0 && i[0] < i[1] && i[1] < i[2];
      })
      .toBe(true);
    // Typing goes into it.
    await page.keyboard.type("asked about the date");
    await expect.poll(() => mockNote(page, TODAY)).toMatch(/'Call 09:00\n=+\nasked about the date/);
  });

  test("a second ad-hoc call the same day is placed by its own time, after the first", async ({ page }) => {
    await seed(page, {
      notes: { [TODAY]: ["Standup", "=======", "o prepare", "", "'Call 08:40", "==========", "- a", "", "Design review", "=============", "o slides"].join("\n") },
    });
    await runFromPalette(page);
    await expect(page.locator("#peek-bar")).toContainText("'Call 09:00");
    await expect
      .poll(async () => {
        const saved = (await mockNote(page, TODAY)) ?? "";
        const i = [saved.indexOf("'Call 08:40"), saved.indexOf("'Call 09:00"), saved.indexOf("Design review")];
        return i[0] >= 0 && i[0] < i[1] && i[1] < i[2];
      })
      .toBe(true);
  });

  test("without a calendar file it still gives an ad-hoc section", async ({ page }) => {
    await seed(page, { agendaJson: "" });
    await runFromPalette(page);
    await expect(page.locator("#peek-bar")).toContainText("'Call 09:00");
  });

  test("a meeting with no section in the note gets one, in its place in time", async ({ page }) => {
    await seed(page, { agendaJson: agenda(["08:00", "08:30", "Standup"], ["09:00", "10:00", "Planning"], ["11:00", "12:00", "Design review"]) });
    await runFromPalette(page);
    await expect(page.locator("#peek-bar")).toContainText("Planning");
    await expect
      .poll(async () => {
        const saved = (await mockNote(page, TODAY)) ?? "";
        const i = [saved.indexOf("Standup"), saved.indexOf("Planning"), saved.indexOf("Design review")];
        return i[0] >= 0 && i[0] < i[1] && i[1] < i[2];
      })
      .toBe(true);
  });

  test("the first call of a day with no note yet opens today's note", async ({ page }) => {
    await seed(page, { notes: { "2026-09-01.txt": note } });
    await runFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator("#peek-bar")).toContainText("2026-09-07");
  });

  test("there is no command while Peek is off", async ({ page }) => {
    await seed(page, { enabled: false });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+K");
    await page.keyboard.type("notes for the meeting");
    await expect(page.locator(".palette-item, .modal-list [role=option]").filter({ hasText: "notes for the meeting" })).toHaveCount(0);
  });

  test("the global shortcut is registered while Peek is on (no function key), and gone when it is turned off", async ({ page }) => {
    await seed(page);
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.globalShortcuts)).toContain("CommandOrControl+Alt+J");
    // Both Peek shortcuts avoid function keys (they need Fn on a laptop).
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.globalShortcuts)).toContain("CommandOrControl+Alt+Space");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.globalShortcuts.some((k) => /F\d+$/.test(k)))).toBe(false);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    const settings = page.locator(".settings-modal-card");
    await settings.locator("label.toggle-switch", { hasText: "Enable Peek" }).click();
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.globalShortcuts.includes("CommandOrControl+Alt+J"))).toBe(false);
  });

  test("the shortcut can be changed in Settings", async ({ page }) => {
    await seed(page);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    const field = page.locator(".settings-modal-card").getByLabel("Shortcut: notes for the meeting that is on now (works from any app)");
    await field.scrollIntoViewIfNeeded();
    await field.fill("CommandOrControl+Alt+K");
    await field.blur();
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.globalShortcuts)).toContain("CommandOrControl+Alt+K");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.globalShortcuts.includes("CommandOrControl+Alt+J"))).toBe(false);
  });
});

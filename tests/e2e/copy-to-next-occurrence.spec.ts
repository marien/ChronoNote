import { test, expect } from "@playwright/test";
import { seedApp, editor, mockNote, mockFiles } from "./helpers";

/** #66 "copy to next occurrence" (`Ctrl/Cmd+Shift+.`): copies the current
 * line/selection into the next occurrence of its section, deferring
 * whatever was open in the source (§64/§82/#67's own rule — the copy
 * lands open, the original gets marked deferred). Search order and the
 * core insertion/defer logic are unit-tested in `controller.test.ts`;
 * this drives the real shortcut through the actual editor and the date
 * picker it falls back to. */
test.describe("copy to next occurrence (#66)", () => {
  test("disk-leading (no calendar sync): copies to the next on-disk occurrence and defers the source", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-01.txt": "Weekly Sync\n============\n# renew the TLS cert",
          "2026-09-08.txt": "Weekly Sync\n============\n- prior notes",
        },
        session: { openTabs: ["2026-09-01.txt", "2026-09-08.txt"], activeTab: "2026-09-01.txt" },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // onto "# renew the TLS cert"
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+Shift+Period");

    await expect.poll(() => mockNote(page, "2026-09-01.txt")).toBe("Weekly Sync\n============\n> renew the TLS cert");
    await expect
      .poll(() => mockNote(page, "2026-09-08.txt"))
      .toBe("Weekly Sync\n============\n- prior notes\n\n# renew the TLS cert");
  });

  test("nothing found (no calendar, nothing on disk) prompts for a date; picking one creates the file and section", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-01.txt": "Weekly Sync\n===========\n# renew the TLS cert" },
        session: { openTabs: ["2026-09-01.txt"], activeTab: "2026-09-01.txt" },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+Shift+Period");

    const picker = page.locator(".datepicker-pop");
    await expect(picker).toBeVisible();
    await picker.locator(".datepicker-jump").fill("2026-09-20");
    await page.keyboard.press("Enter");

    await expect.poll(() => mockNote(page, "2026-09-01.txt")).toBe("Weekly Sync\n===========\n> renew the TLS cert");
    await expect
      .poll(() => mockNote(page, "2026-09-20.txt"))
      .toBe("Weekly Sync\n===========\n# renew the TLS cert\n");
    expect(await mockFiles(page)).toContain("2026-09-20.txt");
  });

  test("calendar-leading: with calendar sync on, .agenda.json is searched instead of disk", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-01.txt": "Weekly Sync\n===========\n# renew the TLS cert" },
        session: { openTabs: ["2026-09-01.txt"], activeTab: "2026-09-01.txt" },
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([
          { date: "2026-09-03", start: "09:00", end: "09:30", title: "Unrelated Meeting" },
          { date: "2026-09-08", start: "09:00", end: "09:30", title: "Weekly Sync" },
        ]),
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+Shift+Period");

    // No note existed yet for 2026-09-08 — a brand-new section is created
    // there, titled from the calendar's own entry.
    await expect.poll(() => mockNote(page, "2026-09-01.txt")).toBe("Weekly Sync\n===========\n> renew the TLS cert");
    await expect
      .poll(() => mockNote(page, "2026-09-08.txt"))
      .toBe("Weekly Sync\n===========\n# renew the TLS cert\n");
  });

  test("cancelling the prompt (Escape) abandons the copy — the source is left untouched", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-01.txt": "Weekly Sync\n===========\n# renew the TLS cert" },
        session: { openTabs: ["2026-09-01.txt"], activeTab: "2026-09-01.txt" },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+Shift+Period");

    await expect(page.locator(".datepicker-pop")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect.poll(() => mockNote(page, "2026-09-01.txt")).toBe("Weekly Sync\n===========\n# renew the TLS cert");
  });
});

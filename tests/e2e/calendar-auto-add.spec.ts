import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, typeInEditor, setEditorText, activeTabContent, mockNote, toast, todayFilename } from "./helpers";
import { REFERENCE_TODAY, scenario } from "../../src/lib/testing/scenarios";

/** F1: with "Add new meetings automatically" on, a new meeting in `.agenda.json` becomes a section in the open note
 * by itself (an outside change: no undo step, the caret stays on its text). Anything that would move or remove text
 * the user wrote still goes to the review dialog. */

const today = REFERENCE_TODAY;
const meeting = (date: string, start: string, title: string) => ({ date, start, end: "23:59", title });
const STANDUP_ONLY = [meeting(today, "09:00", "Standup")];
const WITH_DESIGN = [meeting(today, "09:00", "Standup"), meeting(today, "14:00", "Design review")];

const NOTE = "Standup\n=======\nsome text";
const WITH_SECTION = (typed: string) => `Standup\n=======\nsome text${typed}\n\n\nDesign review\n=============\n`;

const syncButton = (page: Page) => page.getByTitle("Sync calendar for this day", { exact: false });
const pip = (page: Page) => syncButton(page).locator(".icon-btn-pip");

async function setAgenda(page: Page, meetings: object[]): Promise<void> {
  await page.evaluate((json) => {
    window.__CHRONO_MOCK__!.agendaJson = json;
  }, JSON.stringify(meetings));
}

async function seedToday(page: Page, opts: { autoAdd?: boolean; note?: string } = {}): Promise<void> {
  await seedApp(page, {
    seed: {
      ...scenario("empty"),
      calendarSyncEnabled: true,
      calendarAutoAdd: opts.autoAdd ?? true,
      agendaJson: JSON.stringify(STANDUP_ONLY),
      notes: { [todayFilename()]: opts.note ?? NOTE },
      session: { openTabs: [todayFilename()], activeTab: todayFilename() },
    },
  });
  await expect(editor(page)).toContainText("some text");
}

test.describe("calendar sync: new meetings are added by themselves", () => {
  test("a new meeting becomes a section; the caret stays at the end of the typed text; the status message names it", async ({
    page,
  }) => {
    await seedToday(page);
    await setAgenda(page, WITH_DESIGN);
    await typeInEditor(page, "!");

    await expect(editor(page)).toContainText("Design review");
    await expect.poll(() => activeTabContent(page)).toBe(WITH_SECTION("!"));
    await expect(page.locator("#stat-pos")).toContainText("Ln 3, Col 11");
    await expect(toast(page)).toContainText("Added from calendar: Design review");
    await expect(pip(page)).toHaveCount(0);
    // The file on disk got the section too.
    await expect.poll(() => mockNote(page, todayFilename())).toBe(WITH_SECTION("!"));
  });

  test("the status message jumps to the new section", async ({ page }) => {
    await seedToday(page);
    await setAgenda(page, WITH_DESIGN);
    await typeInEditor(page, "!");
    const message = page.locator("#stat-message");
    await expect(message).toContainText("Added from calendar: Design review");
    await message.click();
    await expect(page.locator("#stat-pos")).toContainText("Ln 6,");
  });

  test("Ctrl+Z undoes the typed character once; the section stays", async ({ page }) => {
    await seedToday(page);
    await setAgenda(page, WITH_DESIGN);
    await typeInEditor(page, "!");
    await expect.poll(() => activeTabContent(page)).toBe(WITH_SECTION("!"));

    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(() => activeTabContent(page)).toBe(WITH_SECTION(""));
  });

  test("a section the user deletes does not come back, does not light the dot, and is offered unchecked in the dialog", async ({
    page,
  }) => {
    await seedToday(page);
    await setAgenda(page, WITH_DESIGN);
    await typeInEditor(page, "!");
    await expect.poll(() => activeTabContent(page)).toBe(WITH_SECTION("!"));

    // The user deletes the title and its underline (and the blank lines above).
    await setEditorText(page, "Standup\n=======\nsome text!");
    await page.keyboard.press("ControlOrMeta+End");
    await page.waitForTimeout(2000);
    expect(await activeTabContent(page)).toBe("Standup\n=======\nsome text!");
    await expect(pip(page)).toHaveCount(0);

    // ... and it is still gone after a restart of the app.
    await expect.poll(() => mockNote(page, todayFilename())).toBe("Standup\n=======\nsome text!");
    await page.reload();
    await expect(page.locator(".cm-editor")).toBeVisible();
    await expect(editor(page)).toContainText("some text!");
    await page.waitForTimeout(2000);
    expect(await activeTabContent(page)).toBe("Standup\n=======\nsome text!");
    await expect(pip(page)).toHaveCount(0);

    // By hand it can be brought back: listed unchecked.
    await editor(page).click();
    await page.keyboard.press("Control+Shift+C");
    const dialog = page.getByRole("dialog", { name: "Sync review" });
    await expect(dialog).toBeVisible();
    const boxes = dialog.locator(".sync-review-check input[type=checkbox]");
    await expect(boxes).toHaveCount(1);
    await expect(dialog.getByText("Design review")).toBeVisible();
    await expect(boxes.first()).not.toBeChecked();

    // Confirming with it checked adds it as today.
    await boxes.first().check();
    await dialog.getByRole("button", { name: "Sync", exact: true }).click();
    await expect(editor(page)).toContainText("Design review");
  });

  test("with the setting off nothing is added and the dot shows", async ({ page }) => {
    await seedToday(page, { autoAdd: false });
    await setAgenda(page, WITH_DESIGN);
    await typeInEditor(page, "!");

    await expect(pip(page)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await activeTabContent(page)).toBe(NOTE + "!");
  });

  test("a caret on an empty line holds the add back until the line has text", async ({ page }) => {
    await seedToday(page, { note: NOTE + "\n" });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End"); // the empty last line
    await setAgenda(page, WITH_DESIGN);
    // A change that leaves the caret line empty still triggers a check.
    await page.keyboard.type("x");
    await page.keyboard.press("Backspace");
    await expect(pip(page)).toBeVisible();
    await page.waitForTimeout(2000);
    expect(await activeTabContent(page)).toBe(NOTE + "\n");

    await page.keyboard.type("y");
    await expect(editor(page)).toContainText("Design review");
    const content = await activeTabContent(page);
    expect(content.startsWith("Standup\n=======\nsome text\ny\n")).toBe(true);
    expect(content.endsWith("Design review\n=============\n")).toBe(true);
  });

  test("a note dated yesterday is left alone", async ({ page }) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    const file = `${yesterday}.txt`;
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([meeting(yesterday, "09:00", "Standup")]),
        notes: { [file]: NOTE },
        session: { openTabs: [file], activeTab: file },
      },
    });
    await expect(editor(page)).toContainText("some text");
    await setAgenda(page, [meeting(yesterday, "09:00", "Standup"), meeting(yesterday, "14:00", "Design review")]);
    await typeInEditor(page, "!");
    await page.waitForTimeout(2000);
    expect(await activeTabContent(page)).toBe(NOTE + "!");
  });
});

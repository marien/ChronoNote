import { test, expect, type Page } from "@playwright/test";
import type { MockSeed } from "../../src/lib/testing/mockBackend";
import { scenario } from "../../src/lib/testing/scenarios";
import {
  seedApp,
  editor,
  typeInEditor,
  activeTabContent,
  toast,
  REFERENCE_INSTANT,
  mockNote,
  todayFilename,
} from "./helpers";

interface AgendaItem {
  date: string;
  start: string;
  end: string;
  title: string;
}

const today = REFERENCE_INSTANT.toISOString().slice(0, 10);
const yesterday = new Date(REFERENCE_INSTANT.getTime() - 86_400_000).toISOString().slice(0, 10);

const meeting = (date: string, start: string, title: string): AgendaItem => ({
  date,
  start,
  end: "23:59",
  title,
});

async function setMockAgenda(page: Page, items: AgendaItem[]): Promise<void> {
  const json = JSON.stringify(items);
  await page.evaluate((j) => {
    (window.__CHRONO_MOCK__ as unknown as { agendaJson: string }).agendaJson = j;
  }, json);
}

async function hasSyncDot(page: Page): Promise<boolean> {
  const btn = page.getByTitle("Sync calendar for this day", { exact: false });
  await expect(btn).toBeVisible();
  return btn.evaluate((el) => {
    const hasDotClass = (node: Element) => {
      const cls = node.getAttribute("class") ?? "";
      return /\b(dot|badge|pending|indicator|has-dot|has-pending|has-changes|sync-dot|cal-dot)\b/i.test(cls) ||
        /\bdot\b/i.test(cls.replace(/[-_]/g, " "));
    };
    if (hasDotClass(el) || el.hasAttribute("data-dot") || el.hasAttribute("data-pending")) {
      return true;
    }
    for (const child of el.querySelectorAll("*")) {
      if (hasDotClass(child) || child.hasAttribute("data-dot") || child.hasAttribute("data-pending")) {
        return true;
      }
      if (child.tagName.toLowerCase() === "span") {
        const style = getComputedStyle(child);
        if (style.display !== "none" && style.visibility !== "hidden" && parseFloat(style.width) > 0) {
          return true;
        }
      }
    }
    const after = getComputedStyle(el, "::after");
    if (
      after.content !== "none" &&
      after.content !== "" &&
      parseFloat(after.width) > 0 &&
      parseFloat(after.width) <= 14 &&
      parseFloat(after.height) > 0 &&
      parseFloat(after.height) <= 14 &&
      after.borderRadius !== "0px"
    ) {
      return true;
    }
    return false;
  });
}

async function seedTodayNote(
  page: Page,
  content: string,
  opts: { calendarAutoAdd?: boolean; date?: string; initialAgenda?: AgendaItem[] } = {},
): Promise<void> {
  const noteDate = opts.date ?? today;
  const filename = `${noteDate}.txt`;
  const agenda = opts.initialAgenda ?? [meeting(noteDate, "09:00", "Standup")];
  const seed = {
    ...scenario("empty"),
    calendarSyncEnabled: true,
    ...(opts.calendarAutoAdd !== undefined ? { calendarAutoAdd: opts.calendarAutoAdd } : {}),
    agendaJson: JSON.stringify(agenda),
    notes: { [filename]: content },
    session: { openTabs: [filename], activeTab: filename },
  } as MockSeed;
  await seedApp(page, { seed });
}

test.describe("calendar auto-add", () => {
  test("adds new meeting after editing, keeps caret at end of typed text, and shows status message", async ({
    page,
  }) => {
    await seedTodayNote(page, "Standup\n=======\nnotes line");

    await setMockAgenda(page, [
      meeting(today, "09:00", "Standup"),
      meeting(today, "14:00", "Design review"),
    ]);
    await typeInEditor(page, "!");

    await expect.poll(() => activeTabContent(page)).toContain("Design review");
    await expect(toast(page)).toContainText("Added from calendar: Design review");
    await expect(page.locator("#stat-pos")).toContainText("Ln 3, Col 12");
  });

  test("auto-added section is not an undo step: Ctrl+Z undoes only the typed character", async ({
    page,
  }) => {
    await seedTodayNote(page, "Standup\n=======\nnotes line");

    await setMockAgenda(page, [
      meeting(today, "09:00", "Standup"),
      meeting(today, "14:00", "Design review"),
    ]);
    await typeInEditor(page, "!");
    await expect.poll(() => activeTabContent(page)).toContain("Design review");

    await page.keyboard.press("ControlOrMeta+z");

    await expect.poll(() => activeTabContent(page)).not.toContain("notes line!");
    const content = await activeTabContent(page);
    expect(content).toContain("notes line");
    expect(content).toContain("Design review");
  });

  test("deleting an auto-added section keeps it from coming back and shows no dot on the sync button", async ({
    page,
  }) => {
    await seedTodayNote(page, "Standup\n=======\nnotes line");

    await setMockAgenda(page, [
      meeting(today, "09:00", "Standup"),
      meeting(today, "14:00", "Design review"),
    ]);
    await typeInEditor(page, "!");
    await expect.poll(() => activeTabContent(page)).toContain("Design review");

    await page.locator(".cm-line", { hasText: "Design review" }).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("ControlOrMeta+Shift+End");
    await page.keyboard.press("Backspace");

    // Put caret back on a non-blank line and edit so the blank-line guard is not what suppresses re-add.
    await page.locator(".cm-line", { hasText: "notes line!" }).click();
    await page.keyboard.press("End");
    await page.keyboard.type("x");

    await page.waitForTimeout(2000);
    expect(await activeTabContent(page)).not.toContain("Design review");
    expect(await hasSyncDot(page)).toBe(false);
  });

  test("deleted auto-added section still does not come back after reloading the page", async ({
    page,
  }) => {
    await seedTodayNote(page, "Standup\n=======\nnotes line");

    await setMockAgenda(page, [
      meeting(today, "09:00", "Standup"),
      meeting(today, "14:00", "Design review"),
    ]);
    await typeInEditor(page, "!");
    await expect.poll(() => activeTabContent(page)).toContain("Design review");

    await page.locator(".cm-line", { hasText: "Design review" }).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("ControlOrMeta+Shift+End");
    await page.keyboard.press("Backspace");
    await expect.poll(() => activeTabContent(page)).not.toContain("Design review");
    // Review: wait for the deletion to be saved; a reload inside the save delay would bring back the saved text.
    await expect.poll(() => mockNote(page, todayFilename())).not.toContain("Design review");

    await page.reload();
    await expect(page.locator("#top-bar")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".cm-editor")).toBeVisible();

    await setMockAgenda(page, [
      meeting(today, "09:00", "Standup"),
      meeting(today, "14:00", "Design review"),
    ]);
    await page.locator(".cm-line", { hasText: "notes line!" }).click();
    await page.keyboard.press("End");
    await page.keyboard.type("x");

    await page.waitForTimeout(2000);
    expect(await activeTabContent(page)).not.toContain("Design review");
  });

  test("deleted auto-added section is listed unchecked in the Ctrl+Shift+C sync review dialog", async ({
    page,
  }) => {
    await seedTodayNote(page, "Standup\n=======\nnotes line");

    await setMockAgenda(page, [
      meeting(today, "09:00", "Standup"),
      meeting(today, "14:00", "Design review"),
    ]);
    await typeInEditor(page, "!");
    await expect.poll(() => activeTabContent(page)).toContain("Design review");

    await page.locator(".cm-line", { hasText: "Design review" }).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("ControlOrMeta+Shift+End");
    await page.keyboard.press("Backspace");
    await expect.poll(() => activeTabContent(page)).not.toContain("Design review");

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+C");
    const dialog = page.getByRole("dialog", { name: "Sync review" });
    await expect(dialog).toBeVisible();

    const row = dialog.locator(".sync-review-check", { hasText: "Design review" });
    await expect(row).toBeVisible();
    await expect(row.locator('input[type="checkbox"]')).not.toBeChecked();
  });

  test("when calendarAutoAdd is false, editing does not add the new meeting and shows the sync dot", async ({
    page,
  }) => {
    await seedTodayNote(page, "Standup\n=======\nnotes line", { calendarAutoAdd: false });

    await setMockAgenda(page, [
      meeting(today, "09:00", "Standup"),
      meeting(today, "14:00", "Design review"),
    ]);
    await typeInEditor(page, "!");

    await expect.poll(() => hasSyncDot(page)).toBe(true);
    expect(await activeTabContent(page)).not.toContain("Design review");
  });

  test("does not add while caret is on an empty line, then adds after typing a character on that line", async ({
    page,
  }) => {
    await seedTodayNote(page, "Standup\n=======\nnotes line\n");

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await setMockAgenda(page, [
      meeting(today, "09:00", "Standup"),
      meeting(today, "14:00", "Design review"),
    ]);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await page.waitForTimeout(2000);
    expect(await activeTabContent(page)).not.toContain("Design review");

    await page.keyboard.type("a");
    await expect.poll(() => activeTabContent(page)).toContain("Design review");
  });

  test("does nothing for a note dated yesterday", async ({ page }) => {
    await seedTodayNote(page, "Standup\n=======\nnotes line", {
      date: yesterday,
      initialAgenda: [meeting(yesterday, "09:00", "Standup")],
    });

    await setMockAgenda(page, [
      meeting(yesterday, "09:00", "Standup"),
      meeting(yesterday, "14:00", "Design review"),
    ]);
    await typeInEditor(page, "!");

    await page.waitForTimeout(2000);
    expect(await activeTabContent(page)).not.toContain("Design review");
  });
});

import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  seedApp,
  openViaShortcut,
  modalCard,
  MODAL_LABELS,
  todayFilename,
} from "./helpers";

const drawer = (page: Page): Locator => modalCard(page, MODAL_LABELS.actions);
const rows = (page: Page): Locator => drawer(page).locator('.modal-item[role="option"]');
const filterInput = (page: Page): Locator => drawer(page).locator(".modal-input");
const chips = (page: Page): Locator => drawer(page).locator(".search-chip, .chip");
const onlyOpenToggle = (page: Page): Locator =>
  drawer(page).locator(".toggle-switch").filter({ hasText: /only open/i });
const dueViewToggle = (page: Page): Locator =>
  drawer(page).locator(".toggle-switch").filter({ hasText: /by due date/i });

/**
 * Setup helper to seed notes and open the Action Drawer in "All Files" scope.
 */
async function setupDrawer(
  page: Page,
  extraNotes: Record<string, string> = {},
): Promise<Locator> {
  const notes: Record<string, string> = {
    "2026-09-01.txt": [
      "# (budget) review the budget",
      "v (budget) send the numbers",
      "# call the vendor",
    ].join("\n"),
    "2026-09-05.txt": [
      "# plan the offsite",
      "    # (budget) book the venue",
      "    # pick a date",
      "# talk to Dana => @dana prepare the slides",
    ].join("\n"),
    [todayFilename()]: "# (hiring) write the job post",
    ...extraNotes,
  };

  await seedApp(page, {
    seed: {
      notes,
      session: {
        openTabs: Object.keys(notes),
        activeTab: todayFilename(),
      },
    },
  });

  const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
  // Ensure "All Files" scope is active so notes across files are listed
  const allFilesRadio = d.getByRole("radio", { name: "All Files" });
  if (await allFilesRadio.isVisible()) {
    await allFilesRadio.click();
    const spinner = d.locator(".modal-spinner");
    if (await spinner.isVisible()) {
      await expect(spinner).toBeHidden({ timeout: 3000 });
    }
  }
  return d;
}

test.describe("Action Drawer Search Filters", () => {
  test("1. typing tag:budget shows one chip and lists only rows with (budget) plus parent context", async ({
    page,
  }) => {
    const d = await setupDrawer(page);
    const input = filterInput(page);

    await input.fill("tag:budget");

    // Shows one chip with class search-chip (or chip) and a remove button
    const chipList = chips(page);
    await expect(chipList).toHaveCount(1);
    await expect(chipList.first()).toContainText("tag:budget");
    const removeBtn = chipList.first().locator(".chip-remove-btn, button");
    await expect(removeBtn).toBeVisible();

    // Lists only rows whose own text has (budget):
    await expect(d).toContainText("review the budget");
    await expect(d).toContainText("book the venue");

    // plus "plan the offsite" as context for "book the venue" (its parent):
    await expect(d).toContainText("plan the offsite");
    const parentRow = d.locator('.modal-item[role="option"]', { hasText: "plan the offsite" });
    await expect(parentRow).toBeVisible();

    // Rows without (budget) are NOT listed:
    await expect(d).not.toContainText("send the numbers"); // done item hidden under Only Open
    await expect(d).not.toContainText("call the vendor");
    await expect(d).not.toContainText("pick a date");
    await expect(d).not.toContainText("write the job post");
    await expect(d).not.toContainText("talk to Dana");
    await expect(d).not.toContainText("prepare the slides");
  });

  test("2. removing the chip clears operator from input, restores full list, and keeps focus in filter input", async ({
    page,
  }) => {
    const d = await setupDrawer(page);
    const input = filterInput(page);

    await input.fill("tag:budget");
    const chipList = chips(page);
    await expect(chipList).toHaveCount(1);

    // Remove the chip
    const removeBtn = chipList.first().locator(".chip-remove-btn, button").first();
    await removeBtn.click();

    // Chip is removed and operator is cleared from filter input
    await expect(chips(page)).toHaveCount(0);
    await expect(input).toHaveValue("");

    // Full list is restored
    await expect(d).toContainText("call the vendor");
    await expect(d).toContainText("pick a date");
    await expect(d).toContainText("write the job post");
    await expect(d).toContainText("review the budget");

    // Focus stays in the filter input
    await expect(input).toBeFocused();
  });

  test("3. is:done lists send the numbers with Only open on and shows toggle does not apply", async ({
    page,
  }) => {
    const d = await setupDrawer(page);
    const input = filterInput(page);
    const toggle = onlyOpenToggle(page);
    const toggleInput = toggle.locator("input");

    // "Only open" is on by default and resolved item is hidden
    await expect(toggleInput).toBeChecked();
    await expect(d).not.toContainText("send the numbers");

    // Type is:done
    await input.fill("is:done");

    // is:done lists "send the numbers" although "Only open" is on
    await expect(d).toContainText("send the numbers");
    // Open items should not be listed with is:done
    await expect(d).not.toContainText("call the vendor");

    // The Only-open toggle shows that it does not apply (disabled, aria-disabled, or a title)
    await expect.poll(async () => {
      const inputDisabled = await toggleInput.isDisabled().catch(() => false);
      const inputAriaDisabled = (await toggleInput.getAttribute("aria-disabled")) === "true";
      const labelAriaDisabled = (await toggle.getAttribute("aria-disabled")) === "true";
      const classAttr = (await toggle.getAttribute("class")) ?? "";
      const hasDisabledClass = classAttr.includes("disabled");
      const title = ((await toggle.getAttribute("title")) ?? (await toggleInput.getAttribute("title")) ?? "").toLowerCase();
      const titleIndicates = /not apply|overridden|ignored|disabled|inactive|filter|is:done/i.test(title);
      return inputDisabled || inputAriaDisabled || labelAriaDisabled || hasDisabledClass || titleIndicates;
    }).toBe(true);
  });

  test("4. since: and before: date filters restrict rows to matching dates", async ({
    page,
  }) => {
    const d = await setupDrawer(page);
    const input = filterInput(page);

    // since:2026-09-05 lists only rows from 2026-09-05 and later
    await input.fill("since:2026-09-05");
    await expect(d).toContainText("plan the offsite");
    await expect(d).toContainText("book the venue");
    await expect(d).toContainText("pick a date");
    await expect(d).toContainText("write the job post");
    await expect(d).not.toContainText("review the budget");
    await expect(d).not.toContainText("call the vendor");

    // before:2026-09-01 only from that day and earlier
    await input.fill("before:2026-09-01");
    await expect(d).toContainText("review the budget");
    await expect(d).toContainText("call the vendor");
    await expect(d).not.toContainText("plan the offsite");
    await expect(d).not.toContainText("book the venue");
    await expect(d).not.toContainText("pick a date");
    await expect(d).not.toContainText("write the job post");
  });

  test("5. has:@dana shows the delegated part prepare the slides and nothing unrelated", async ({
    page,
  }) => {
    const d = await setupDrawer(page);
    const input = filterInput(page);

    await input.fill("has:@dana");

    // Shows the delegated part
    await expect(d).toContainText("prepare the slides");

    // Shows nothing unrelated
    await expect(d).not.toContainText("review the budget");
    await expect(d).not.toContainText("send the numbers");
    await expect(d).not.toContainText("call the vendor");
    await expect(d).not.toContainText("plan the offsite");
    await expect(d).not.toContainText("book the venue");
    await expect(d).not.toContainText("pick a date");
    await expect(d).not.toContainText("write the job post");
  });

  test("6. plain text filter still works as before: vendor lists call the vendor", async ({
    page,
  }) => {
    const d = await setupDrawer(page);
    const input = filterInput(page);

    await input.fill("vendor");

    // Lists "call the vendor"
    await expect(d).toContainText("call the vendor");

    // Does not list unrelated actions
    await expect(d).not.toContainText("review the budget");
    await expect(d).not.toContainText("plan the offsite");
    await expect(d).not.toContainText("write the job post");

    // Plain text produces no operator chips
    await expect(chips(page)).toHaveCount(0);
  });

  test("7. combining tag:budget since:2026-09-05 lists only book the venue with parent as context", async ({
    page,
  }) => {
    const d = await setupDrawer(page);
    const input = filterInput(page);

    await input.fill("tag:budget since:2026-09-05");

    // Both chips are displayed
    const chipList = chips(page);
    await expect(chipList).toHaveCount(2);

    // Lists only "book the venue" with its parent "plan the offsite" as context
    await expect(d).toContainText("book the venue");
    await expect(d).toContainText("plan the offsite");
    const parentRow = d.locator('.modal-item[role="option"]', { hasText: "plan the offsite" });
    await expect(parentRow).toBeVisible();

    // All other actions are excluded
    await expect(d).not.toContainText("review the budget");
    await expect(d).not.toContainText("send the numbers");
    await expect(d).not.toContainText("call the vendor");
    await expect(d).not.toContainText("pick a date");
    await expect(d).not.toContainText("write the job post");
    await expect(d).not.toContainText("talk to Dana");
    await expect(d).not.toContainText("prepare the slides");
  });

  test("8. in By due date view the operators filter actions by tag", async ({
    page,
  }) => {
    // Seed with a dated action due after today (REFERENCE_TODAY is 2026-09-07)
    const d = await setupDrawer(page, {
      [todayFilename()]: [
        "# (hiring) write the job post",
        "# (budget) pay invoice by:2026-09-15",
      ].join("\n"),
    });
    const input = filterInput(page);
    const dueToggle = dueViewToggle(page);

    // Switch to "By due date" view
    await dueToggle.click();
    await expect(dueToggle.locator("input")).toBeChecked();

    // Dated action is visible in due view
    await expect(d).toContainText("pay invoice");

    // tag:budget keeps it
    await input.fill("tag:budget");
    await expect(d).toContainText("pay invoice");

    // tag:hiring hides it
    await input.fill("tag:hiring");
    await expect(d).not.toContainText("pay invoice");
  });

  test("9. rows stay 21px tall with chips present", async ({
    page,
  }) => {
    const d = await setupDrawer(page);
    const input = filterInput(page);

    await input.fill("tag:budget");

    // Chips are present
    await expect(chips(page)).toHaveCount(1);

    // Rows stay 21px tall
    const optionRows = rows(page);
    const count = await optionRows.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const row = optionRows.nth(i);
      await expect(row).toBeVisible();
      const box = await row.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.round(box!.height)).toBe(21);
    }
  });
});

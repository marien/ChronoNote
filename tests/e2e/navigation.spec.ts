import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  datePicker,
  MODAL_LABELS,
  activeTabLabel,
  activeTabContent,
  tab,
  currentModal,
  parkMouse,
  todayFilename,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

const pop = (page: Page) => datePicker(page);

test.describe("date picker — anchored calendar popover (Ctrl/Cmd+O, §104)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+o");
    await expect(pop(page)).toBeVisible();
  });

  test("opens anchored beneath the top-bar date trigger", async ({ page }) => {
    const trigger = page.locator("[data-datepicker-trigger]");
    const tb = await trigger.boundingBox();
    const pb = await pop(page).boundingBox();
    expect(pb!.y).toBeGreaterThanOrEqual(tb!.y + tb!.height - 1);
    expect(pb!.y).toBeLessThan(tb!.y + tb!.height + 20);
    // shows the current month (busy-week's reference "today" is 2026-09-07)
    await expect(pop(page).locator(".cal-title")).toHaveText("September 2026");
  });

  test("type-to-jump: a relative query opens that note on Enter", async ({ page }) => {
    await pop(page).locator(".datepicker-jump").fill("-3");
    await page.keyboard.press("Enter");
    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText(/2026-09-04/);
  });

  test("type-to-jump: a future ISO date creates a fresh tab", async ({ page }) => {
    await pop(page).locator(".datepicker-jump").fill("2026-12-25");
    await page.keyboard.press("Enter");
    await expect(tab(page, "2026-12-25.txt")).toHaveCount(1);
    await expect(activeTabLabel(page)).toHaveText(/2026-12-25/);
  });

  test("clicking a day in the grid opens it and dismisses the popover", async ({ page }) => {
    await pop(page).locator('.cal-day[data-iso="2026-09-02"]').click();
    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText(/2026-09-02/);
  });

  test("days with open actions carry an indicator dot", async ({ page }) => {
    // busy-week seeds several notes with `# ` open actions.
    const withOpen = pop(page).locator(".cal-day.has");
    expect(await withOpen.count()).toBeGreaterThan(0);
    // a day known to have none in the seed is not marked
    await expect(pop(page).locator('.cal-day[data-iso="2026-09-20"]')).not.toHaveClass(/\bhas\b/);
  });

  test("§follow-up: a day only counts as 'has a note' once its file actually has content", async ({ page }) => {
    // A day with real content (today, from the busy-week seed) is bold.
    await expect(pop(page).locator(`.cal-day[data-iso="${REFERENCE_TODAY}"]`)).toHaveClass(/\bhasnote\b/);

    // Jumping to a brand-new future date creates a tab — but merely
    // *visiting* it (never typing anything) must not mark it "has a
    // note": before this fix, the fresh empty tab's live content still
    // overlaid the read-cache as `""`, which was still enough to count.
    await pop(page).locator(".datepicker-jump").fill("2026-12-25");
    await page.keyboard.press("Enter");
    await expect(tab(page, "2026-12-25.txt")).toHaveCount(1);

    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+o");
    await expect(pop(page).locator(".cal-title")).toHaveText("December 2026");
    await expect(pop(page).locator('.cal-day[data-iso="2026-12-25"]')).not.toHaveClass(/\bhasnote\b/);

    // Typing something into it does make it count.
    await page.keyboard.press("Escape");
    await editor(page).click();
    await page.keyboard.type("a real note now");
    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+o");
    await expect(pop(page).locator('.cal-day[data-iso="2026-12-25"]')).toHaveClass(/\bhasnote\b/);
  });

  test("month navigation and Today", async ({ page }) => {
    await pop(page).getByRole("button", { name: "Next month" }).click();
    await expect(pop(page).locator(".cal-title")).toHaveText("October 2026");
    await pop(page).getByRole("button", { name: "Previous month" }).click();
    await pop(page).getByRole("button", { name: "Previous month" }).click();
    await expect(pop(page).locator(".cal-title")).toHaveText("August 2026");
    await pop(page).getByRole("button", { name: "Today", exact: true }).click();
    await expect(pop(page).locator(".cal-title")).toHaveText("September 2026");
  });

  test("arrow keys move the focused day; Escape closes and restores editor focus", async ({ page }) => {
    // Focus opens on the jump input; ArrowDown drops into the grid on
    // today (2026-09-07). Then ArrowRight → 09-08, ArrowDown → 09-15.
    await expect(pop(page).locator(".datepicker-jump")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(pop(page).locator('.cal-day[data-iso="2026-09-07"]')).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await expect(pop(page).locator('.cal-day[data-iso="2026-09-15"]')).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(pop(page)).toBeHidden();
    expect(
      await page.evaluate(() => document.activeElement?.classList.contains("cm-content") ?? false),
    ).toBe(true);
  });

  test("the calendar follows the query as you type it (§110)", async ({ page }) => {
    await pop(page).locator(".datepicker-jump").fill("2026-11-20");
    await expect(pop(page).locator(".cal-title")).toHaveText("November 2026");
    await expect(pop(page).locator('.cal-day[data-iso="2026-11-20"]')).toHaveClass(/\btarget\b/);
    // a bare month prefix jumps too
    await pop(page).locator(".datepicker-jump").fill("2026-02");
    await expect(pop(page).locator(".cal-title")).toHaveText("February 2026");
  });

  test("an outside click closes it", async ({ page }) => {
    await editor(page).click({ position: { x: 40, y: 120 } });
    await expect(pop(page)).toBeHidden();
  });
});

test("date picker label is registered for a11y", () => {
  expect(MODAL_LABELS.date).toBe("Jump to date");
});

test.describe("#46: the date-picker dot reflects a resolved action after its tab closes", () => {
  test("resolving a note's last open action, then closing its tab, clears the dot", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "# an open action" } } });
    const dayIso = `[data-iso="${REFERENCE_TODAY}"]`;

    // Populate the all-notes cache once *while the action is still open* —
    // mirrors having opened the date picker (or Action Drawer "All Files")
    // before resolving anything.
    await editor(page).click();
    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+o");
    await expect(datePicker(page).locator(dayIso)).toHaveClass(/\bhas\b/);
    await page.keyboard.press("Escape");

    // Resolve the only action, then close the tab.
    await editor(page).click();
    await page.keyboard.press("Control+Space");
    expect(await activeTabContent(page)).toBe("v an open action");
    await page.keyboard.press("ControlOrMeta+w");

    // The dot must clear — without #46's fix, the disk-read cache still
    // held the pre-resolution content (the live-tab overlay that was
    // covering for it is gone the moment the tab closes).
    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+o");
    await expect(datePicker(page).locator(dayIso)).not.toHaveClass(/\bhas\b/);
  });
});

test.describe("date picker opens on the active tab's own date", () => {
  test("shows that month and highlights that day, instead of always today's", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-06-20.txt": "an earlier note", [todayFilename()]: "today's note" },
        session: { openTabs: ["2026-06-20.txt", todayFilename()], activeTab: "2026-06-20.txt" },
      },
    });
    await editor(page).click();
    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+o");
    await expect(pop(page).locator(".cal-title")).toHaveText("June 2026");
    await expect(pop(page).locator('.cal-day[data-iso="2026-06-20"]')).toHaveClass(/\btarget\b/);
  });

  test("a scratchpad has no date of its own — falls back to today's month", async ({ page }) => {
    // Scratchpads are memory-only and never session-restored, so the
    // realistic way to have one active is to create it fresh, in-session.
    await seedApp(page, {
      seed: { notes: { "2026-06-20.txt": "an earlier note" }, session: { openTabs: ["2026-06-20.txt"], activeTab: "2026-06-20.txt" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+n");
    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+o");
    await expect(pop(page).locator(".cal-title")).toHaveText("September 2026");
    await expect(pop(page).locator(`.cal-day[data-iso="${REFERENCE_TODAY}"]`)).toHaveClass(/\btarget\b/);
  });
});

test.describe("date picker: visible-month dots load fast, a spinner covers the rest (perf)", () => {
  test("today's dot appears well before a slow full history read finishes, and the spinner clears once it does", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "# an open action" },
        delayCommands: { read_all_notes: 1000 },
      },
    });
    await editor(page).click();
    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+o");

    // Fast path: the individually-fetched visible month lands well inside
    // the artificially slow full read's 1000ms delay.
    await expect(pop(page).locator(`.cal-day[data-iso="${REFERENCE_TODAY}"]`)).toHaveClass(/\bhas\b/, {
      timeout: 500,
    });
    // The spinner marks that the full background read (other months'
    // history) is still in flight...
    await expect(pop(page).locator(".modal-spinner")).toBeVisible();
    // ...and disappears once it lands.
    await expect(pop(page).locator(".modal-spinner")).toHaveCount(0, { timeout: 2000 });
  });
});

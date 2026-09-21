import { test, expect } from "@playwright/test";
import { seedApp, editor, REFERENCE_INSTANT, toast } from "./helpers";
import { scenario } from "../../src/lib/testing/scenarios";

/** "Sync calendar for this day" reads `.agenda.json` from the notes folder
 * via `read_agenda_for_date` (Rust, `agenda.rs`); the mock's `agendaJson`
 * seed stands in for that file's raw content, exercised through the exact
 * same `titlesForDate` mirror the mock uses at runtime.
 *
 * The button is opt-in (`calendarSyncEnabled`, off by default — hidden
 * entirely until turned on in Settings) and, once shown, grayed out
 * (not hidden) whenever `.agenda.json` doesn't exist or the active tab
 * isn't dated today or later — see the "gating" tests below. A missing/
 * blank file or a bare `[]` that the button *did* let through (the file
 * exists, just with bad content) is a hard error, not an empty calendar —
 * none of those states are ever produced by a genuine successful sync, so
 * none can be trusted as "no meetings today." Only a *valid, non-empty*
 * file with no entries for the requested date is a legitimate empty
 * result. */
test.describe("calendar sync: file-based agenda", () => {
  const today = REFERENCE_INSTANT.toISOString().slice(0, 10);

  test.describe("gating: opt-in setting, grayed-out button", () => {
    test("the button doesn't exist at all when the setting is off", async ({ page }) => {
      await seedApp(page, { seed: { ...scenario("empty"), calendarSyncEnabled: false } });
      await expect(page.getByTitle("Sync calendar for this day", { exact: false })).toHaveCount(0);
    });

    test("grayed out when .agenda.json doesn't exist, even with the setting on", async ({ page }) => {
      await seedApp(page, { seed: { ...scenario("empty"), calendarSyncEnabled: true } }); // no agendaJson seeded
      const btn = page.getByTitle(/agenda\.json/, { exact: false });
      await expect(btn).toBeVisible();
      await expect(btn).toBeDisabled();
      // Real bug report, 2026-09-15: `disabled` alone is invisible on
      // `.icon-btn` — `color`/`background` never respond to `:disabled`
      // on their own, and the SVG icon themes with `currentColor`, so a
      // disabled button looked identical to an enabled one. Fixed with an
      // explicit `.icon-btn:disabled` opacity rule.
      const opacity = await btn.evaluate((el) => getComputedStyle(el).opacity);
      expect(Number(opacity)).toBeLessThan(1);
    });

    test("grayed out for a tab dated before today, even with a valid agenda file", async ({ page }) => {
      await seedApp(page, {
        seed: {
          ...scenario("empty"),
          calendarSyncEnabled: true,
          agendaJson: JSON.stringify([{ date: today, start: "09:00", end: "09:30", title: "Standup" }]),
          notes: { "2026-09-01.txt": "" },
          session: { openTabs: ["2026-09-01.txt"], activeTab: "2026-09-01.txt" },
        },
      });
      const btn = page.getByTitle("Only available for a note dated today or later", { exact: false });
      await expect(btn).toBeVisible();
      await expect(btn).toBeDisabled();
    });

    test("ready (enabled, unambiguous tooltip) once the setting is on, a valid file exists, and the date qualifies", async ({
      page,
    }) => {
      await seedApp(page, {
        seed: {
          ...scenario("empty"),
          calendarSyncEnabled: true,
          agendaJson: JSON.stringify([{ date: today, start: "09:00", end: "09:30", title: "Standup" }]),
        },
      });
      const btn = page.getByTitle("Sync calendar for this day", { exact: false });
      await expect(btn).toBeVisible();
      await expect(btn).toBeEnabled();
    });
  });

  test("Ctrl+Shift+C triggers the same sync as clicking the button", async ({ page }) => {
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([{ date: today, start: "09:00", end: "09:30", title: "Standup" }]),
      },
    });
    await editor(page).click();
    await page.keyboard.press("Control+Shift+C");
    await expect(page.getByText("Standup", { exact: true })).toBeVisible();
  });

  test("syncs meetings from the agenda file into the day's note, via the review step", async ({ page }) => {
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([
          { date: today, start: "09:00", end: "09:30", title: "Standup" },
          { date: today, start: "11:00", end: "11:30", title: "Design Review" },
          { date: "2099-01-01", start: "09:00", end: "09:30", title: "Not today" },
        ]),
      },
    });
    await editor(page).click();
    await editor(page).pressSequentially("Standup\n=======\nnotes here\n");

    await page.getByTitle("Sync calendar for this day", { exact: false }).click();
    await expect(page.getByText("Design Review")).toBeVisible();
    await expect(page.getByText("Not today")).not.toBeVisible();

    await page.getByRole("button", { name: "Sync", exact: true }).click();
    await expect(editor(page)).toContainText("Design Review");
    await expect(editor(page)).toContainText("notes here");
  });

  test("toasts instead of opening a review when a valid agenda file simply has no meetings today", async ({ page }) => {
    // A real, non-empty file with entries for *other* dates is confirmed
    // good data — a day with nothing in it is a legitimate empty result,
    // not the same as the file itself being empty/invalid (see below).
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([{ date: "2099-01-01", start: "09:00", end: "09:30", title: "Someday" }]),
      },
    });
    await page.getByTitle("Sync calendar for this day", { exact: false }).click();
    await expect(page.locator("#stat-message")).toContainText(`No meetings on ${today}`);
  });

  // A bare `[]` is treated as an error — the file *exists* (so the button
  // isn't grayed out), but its content isn't confirmed-good data — none
  // of this is ever produced by a genuine successful sync, so none of it
  // can be trusted as "you have no meetings" (a corrected requirement: an
  // earlier version of this feature treated an existing-but-empty file as
  // an empty calendar instead).
  test("a bare [] in an existing agenda file is an error, not an empty calendar", async ({ page }) => {
    await seedApp(page, { seed: { ...scenario("empty"), calendarSyncEnabled: true, agendaJson: "[]" } });
    const btn = page.getByTitle("Sync calendar for this day", { exact: false });
    await expect(btn).toBeEnabled(); // the file exists — only a missing file grays the button out
    await btn.click();
    await expect(toast(page)).toContainText("missing, empty, or invalid");
  });

  // #74: an external syncer stamps these prefixes onto a meeting's own
  // title to mean "not a real, attending occurrence" — a declined invite,
  // a cancelled meeting, or a forwarded copy of someone else's invite.
  // None of them should ever reach the review step at all.
  test("#74: declined, cancelled, and forwarded meetings are excluded from the sync review", async ({ page }) => {
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([
          { date: today, start: "09:00", end: "09:30", title: "Standup" },
          { date: today, start: "10:00", end: "10:30", title: "Declined: 1:1" },
          { date: today, start: "11:00", end: "11:30", title: "Cancelled: All Hands" },
          { date: today, start: "12:00", end: "12:30", title: "Following: Design Review" },
        ]),
      },
    });
    await page.getByTitle("Sync calendar for this day", { exact: false }).click();
    await expect(page.getByText("Standup", { exact: true })).toBeVisible();
    await expect(page.getByText(/Declined:/)).not.toBeVisible();
    await expect(page.getByText(/Cancelled:/)).not.toBeVisible();
    await expect(page.getByText(/Following:/)).not.toBeVisible();
  });

  // Real bug report, 2026-09-15: unchecking a meeting in the review step
  // silently did nothing when its agenda-file title had stray whitespace
  // (plausible from a real calendar export) — `confirmCalendarSync`
  // compared the raw, untrimmed stored title against the trimmed one the
  // checkbox list uses, so the exclusion match never fired. Fixed by
  // trimming/filtering once, at the source, in `openCalendarSyncReview`.
  test("unchecking a new meeting excludes it even when its title has stray whitespace", async ({ page }) => {
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([
          { date: today, start: "09:00", end: "09:30", title: "Standup " }, // trailing space
          { date: today, start: "10:00", end: "10:30", title: "Design Review" },
        ]),
      },
    });
    await page.getByTitle("Sync calendar for this day", { exact: false }).click();
    const checkboxes = page.locator(".sync-review-check input[type=checkbox]");
    await expect(checkboxes).toHaveCount(2);
    await checkboxes.nth(0).uncheck(); // "Standup"

    await page.getByRole("button", { name: "Sync", exact: true }).click();
    await expect(editor(page)).toContainText("Design Review");
    await expect(editor(page)).not.toContainText("Standup");
  });
});

// #78: Sync Review keyboard use, and the calendar's status prefixes.
test.describe("sync review improvements (#78)", () => {
  const today = REFERENCE_INSTANT.toISOString().slice(0, 10);
  const meeting = (start: string, title: string) => ({ date: today, start, end: "23:59", title });
  const reviewDialog = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Sync review" });
  const openReview = async (page: import("@playwright/test").Page) => {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+C");
    await expect(reviewDialog(page)).toBeVisible();
  };

  test("opens with focus on Sync; Up/Down move between the checkboxes; Tab keeps cycling", async ({ page }) => {
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([meeting("09:00", "Alpha"), meeting("10:00", "Bravo"), meeting("11:00", "Charlie")]),
      },
    });
    await openReview(page);
    const dialog = reviewDialog(page);
    const boxes = dialog.locator(".sync-review-check input[type=checkbox]");
    await expect(boxes).toHaveCount(3);
    await expect(dialog.getByRole("button", { name: "Sync", exact: true })).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(boxes.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(boxes.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(boxes.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowUp"); // wraps to the last
    await expect(boxes.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowDown"); // and back to the first
    await expect(boxes.nth(0)).toBeFocused();

    // Space toggles the focused one, as for any checkbox.
    await page.keyboard.press("Space");
    await expect(boxes.nth(0)).not.toBeChecked();

    // Tab still moves on through the ordinary controls.
    await page.keyboard.press("Tab");
    await expect(boxes.nth(1)).toBeFocused();

    // From the Sync button, Up goes to the LAST checkbox.
    await dialog.getByRole("button", { name: "Sync", exact: true }).focus();
    await page.keyboard.press("ArrowUp");
    await expect(boxes.nth(2)).toBeFocused();
  });

  test("Enter on the initially focused Sync button accepts the review", async ({ page }) => {
    await seedApp(page, {
      seed: { ...scenario("empty"), calendarSyncEnabled: true, agendaJson: JSON.stringify([meeting("09:00", "Alpha")]) },
    });
    await openReview(page);
    await page.keyboard.press("Enter");
    await expect(reviewDialog(page)).toHaveCount(0);
    await expect(editor(page)).toContainText("Alpha");
  });

  test("Placeholder / Confirmed prefixes are dropped; Canceled / Followed / Declined meetings are treated as removed", async ({ page }) => {
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([
          meeting("09:00", "Placeholder - Budget review"),
          meeting("10:00", "Confirmed: Design sync"),
          meeting("11:00", "Canceled: Old sync"),
          meeting("12:00", "Followed: Vendor call"),
          meeting("13:00", "Declined: Offsite"),
        ]),
        // The cancelled meeting's section sits ABOVE the part of the note the calendar owns.
        notes: {
          [`${today}.txt`]: "Old sync\n========\nnotes I took\n\n\nBudget review\n=============\n",
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });
    await openReview(page);
    const dialog = reviewDialog(page);

    // The real titles, without the status words; nothing removed is offered as new.
    await expect(dialog.locator(".sync-review-check")).toHaveText([/Design sync/]);
    await expect(dialog).not.toContainText("Placeholder");
    await expect(dialog).not.toContainText("Confirmed");
    await expect(dialog.locator(".sync-review-check")).not.toContainText(["Old sync", "Vendor call", "Offsite"]);

    // Its section (with content) is offered for review as no longer on the calendar.
    await expect(dialog).toContainText("No longer on the calendar");
    await expect(dialog.locator(".sync-review-removal")).toContainText("Old sync");
  });
});

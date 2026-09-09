import { test, expect } from "@playwright/test";
import { seedApp, activeTabLabel, tab, todayFilename } from "./helpers";

/** §91 / #23 — the first launch of a day (and the very first launch after
 * install) opens on today's note, regardless of which tab was last
 * active. Later launches the same day restore the saved active tab as
 * before (that path is covered implicitly by every other spec, which
 * seed a session stamped with today's date via `seedApp`). The date
 * comparison itself is unit-tested in `controller.test.ts`; this checks
 * the wiring end to end. */

const NOTES = {
  "2026-09-01.txt": "September 1\n===========\n# something from last week",
  "2026-09-07.txt": "Today\n=====\n",
};

test("first open of a new day lands on today's note, not the last-active tab", async ({ page }) => {
  await seedApp(page, {
    seed: {
      notes: NOTES,
      session: {
        openTabs: ["2026-09-01.txt", "2026-09-07.txt"],
        activeTab: "2026-09-01.txt",
        lastOpenedDate: "2026-09-05", // last opened a few days ago
      },
    },
  });

  await expect(activeTabLabel(page)).toHaveText(todayFilename());
  // the old tab is still open, just not focused
  await expect(tab(page, "2026-09-01.txt")).toBeVisible();
});

test("very first launch after install lands on today's note", async ({ page }) => {
  await seedApp(page, { seed: { notes: {}, session: null } });
  await expect(activeTabLabel(page)).toHaveText(todayFilename());
});

test("a later launch the same day restores the saved active tab", async ({ page }) => {
  await seedApp(page, {
    seed: {
      notes: NOTES,
      session: {
        openTabs: ["2026-09-01.txt", "2026-09-07.txt"],
        activeTab: "2026-09-01.txt",
        lastOpenedDate: "2026-09-07", // already opened today
      },
    },
  });

  await expect(activeTabLabel(page)).toHaveText("2026-09-01.txt");
});

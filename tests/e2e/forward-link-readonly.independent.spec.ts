import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  todayFilename,
  openViaShortcut,
} from "./helpers";

test.describe("forward links in readonly views (Action Drawer and Section History) (Task S428-T / Section D)", () => {
  test("Action Drawer shows back link pill with cm-fwd-dir-from and preserves 21px row height", async ({
    page,
  }) => {
    const noteContent = "# call Dana (<2026-10-20#Standup)";
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: noteContent,
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const rows = drawer.locator('.modal-item[role="option"]');
    await expect(rows).toHaveCount(1);

    const row = rows.first();
    await expect(row).toContainText("call Dana");

    const fwdLink = row.locator(".cm-fwd-link");
    await expect(fwdLink).toBeVisible();
    await expect(fwdLink.locator(".cm-fwd-dir-from")).toBeVisible();

    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeCloseTo(21, 0);
  });

  test("Section History occurrence body shows forward link pill with cm-fwd-dir-to", async ({
    page,
  }) => {
    const earlierDate = "2026-09-01";
    const today = todayFilename();

    await seedApp(page, {
      seed: {
        notes: {
          [`${earlierDate}.txt`]: [
            "Weekly Sync",
            "===========",
            "> review budget (>2026-10-26#Weekly Sync)",
          ].join("\n"),
          [today]: [
            "Weekly Sync",
            "===========",
            "# sync today",
          ].join("\n"),
        },
        session: { openTabs: [today], activeTab: today },
      },
    });

    // Place caret in the section "Weekly Sync"
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");

    // Open Section History docked pane
    await page.keyboard.press("ControlOrMeta+Shift+H");
    const pane = page.locator(".history-pane, .history-modal-card");
    await expect(pane.first()).toBeVisible();

    // Select the earlier occurrence tab if multiple tabs exist
    const occTab = page.locator(".history-occ-tab", { hasText: earlierDate });
    if (await occTab.isVisible()) {
      await occTab.click();
      await expect(page.locator(".history-occ-tab.active")).toContainText(earlierDate);
    }

    // Locate occurrence body line (.hp-line) containing "review budget"
    const hpLine = page.locator(".hp-line", { hasText: "review budget" });
    await expect(hpLine).toBeVisible();

    const fwdLink = hpLine.locator(".cm-fwd-link");
    await expect(fwdLink).toBeVisible();
    await expect(fwdLink.locator(".cm-fwd-dir-to")).toBeVisible();
  });
});

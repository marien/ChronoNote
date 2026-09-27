import { test, expect } from "@playwright/test";
import {
  seedApp,
  openViaShortcut,
  modalCard,
  MODAL_LABELS,
} from "./helpers";

test.describe("Action Drawer mobile portrait layout (§222)", () => {
  const noteContent = `Operations
==========
# Deploy release v0.16.0 to staging cluster and verify health metrics
# Short action
`;

  test("desktop viewport shows line numbers and section breadcrumbs", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": noteContent },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const item = drawer.locator('.modal-item[role="option"]').first();

    await expect(item).toBeVisible();
    await expect(item.locator(".item-tag")).toBeVisible();
    await expect(item.locator(".item-breadcrumb")).toBeVisible();
    await expect(item.locator(".item-breadcrumb")).toHaveText("· Operations");
  });

  test("mobile portrait viewport hides line numbers and section breadcrumbs to maximize action text space", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": noteContent },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const item = drawer.locator('.modal-item[role="option"]').first();

    await expect(item).toBeVisible();

    // Line tag and breadcrumb must be hidden on mobile portrait screens (<= 600px)
    await expect(item.locator(".item-tag")).toBeHidden();
    await expect(item.locator(".item-breadcrumb")).toBeHidden();

    // Verify modal-item-main has margin-right: 0 on mobile
    const mainMarginRight = await item.locator(".modal-item-main").evaluate((el) => {
      return window.getComputedStyle(el).marginRight;
    });
    expect(mainMarginRight).toBe("0px");

    // Verify title attribute is present on the action text for long-press / tooltip access
    const textSpan = item.locator(".modal-item-main span").nth(1);
    await expect(textSpan).toHaveAttribute("title", "Deploy release v0.16.0 to staging cluster and verify health metrics");
  });

  test("shortcuts modal keeps keycap tags visible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": "# regular note" },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    const shortcuts = await openViaShortcut(page, "ControlOrMeta+/", "shortcuts");
    const itemTag = shortcuts.locator(".shortcuts-list .item-tag").first();
    await expect(itemTag).toBeVisible();
  });
});

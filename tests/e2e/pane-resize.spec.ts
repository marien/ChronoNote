import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  todayFilename,
} from "./helpers";

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Resizable History and Actions panes (Proposal C1)", () => {
  const seedNotes = {
    [todayFilename()]: [
      "Weekly Sync",
      "===========",
      "# first action",
      "# second action",
      "# third action",
    ].join("\n"),
  };

  test("actions pane can be resized by dragging, preserves share on window resize and reload, keyboard ArrowLeft widens, history pane has its own share", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    await editor(page).click();

    // 1. Open the Actions pane
    await page.keyboard.press("ControlOrMeta+Shift+A");
    const actionsPane = page.locator(".actions-pane");
    await expect(actionsPane).toBeVisible();
    const resizer = actionsPane.locator(".pane-resizer");
    await expect(resizer).toBeVisible();

    const boxBefore = await actionsPane.boundingBox();
    expect(boxBefore).not.toBeNull();
    const initialWidth = boxBefore!.width;

    const resizerBox = await resizer.boundingBox();
    expect(resizerBox).not.toBeNull();

    // 2. Drag .pane-resizer 200px to the left with page.mouse
    const startX = resizerBox!.x + resizerBox!.width / 2;
    const startY = resizerBox!.y + resizerBox!.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 200, startY);
    await page.mouse.up();

    // -> the pane is wider and window.__CHRONO_MOCK__ config has a larger actionsPaneShare
    const boxAfter = await actionsPane.boundingBox();
    expect(boxAfter).not.toBeNull();
    expect(boxAfter!.width).toBeGreaterThan(initialWidth);

    await expect
      .poll(async () => page.evaluate(() => window.__CHRONO_MOCK__!.actionsPaneShare))
      .toBeGreaterThan(0.30);

    const shareAfterDrag = await page.evaluate(() => window.__CHRONO_MOCK__!.actionsPaneShare);

    // 3. Resize the viewport to 1600x800 -> the pane width / window width stays the same share (within 1%)
    await page.setViewportSize({ width: 1600, height: 800 });
    await expect.poll(async () => {
      const box = await page.locator(".actions-pane").boundingBox();
      if (!box) return 0;
      return box.width / 1600;
    }).toBeCloseTo(shareAfterDrag, 2);

    // 4. Reload -> the share survives
    await page.reload();
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+A");
    await expect(page.locator(".actions-pane")).toBeVisible();

    const reloadedShare = await page.evaluate(() => window.__CHRONO_MOCK__!.actionsPaneShare);
    expect(Math.abs(reloadedShare - shareAfterDrag)).toBeLessThan(0.01);

    // 5. Focus the resizer and press ArrowLeft -> wider
    const resizerReloaded = page.locator(".actions-pane .pane-resizer");
    await resizerReloaded.focus();
    const boxBeforeArrow = await page.locator(".actions-pane").boundingBox();
    expect(boxBeforeArrow).not.toBeNull();

    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => {
      const box = await page.locator(".actions-pane").boundingBox();
      return box ? box.width : 0;
    }).toBeGreaterThan(boxBeforeArrow!.width);

    await expect
      .poll(async () => page.evaluate(() => window.__CHRONO_MOCK__!.actionsPaneShare))
      .toBeGreaterThan(reloadedShare);

    // 6. History pane has its own share
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+Shift+H");
    const historyPane = page.locator(".history-pane");
    await expect(historyPane).toBeVisible();

    const historyShare = await page.evaluate(() => window.__CHRONO_MOCK__!.historyPaneShare);
    expect(historyShare).toBe(0.30);
    const finalActionsShare = await page.evaluate(() => window.__CHRONO_MOCK__!.actionsPaneShare);
    expect(historyShare).not.toBe(finalActionsShare);
  });
});

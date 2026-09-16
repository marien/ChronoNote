import { test, expect } from "@playwright/test";
import { seedApp, editor, todayFilename } from "./helpers";

test.describe("tab archetypes (§103)", () => {
  test("daily and scratchpad tabs are visually distinct, with a group divider", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "hello" } } });

    // one daily tab to start
    const daily = page.locator("#tab-bar .tab.daily");
    await expect(daily).toHaveCount(1);
    await expect(daily.locator(".tab-icon svg")).toBeVisible(); // calendar icon
    await expect(page.locator("#tab-bar .tab-group-divider")).toHaveCount(0);

    // add a scratchpad → divider appears between the groups
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+n");

    const scratch = page.locator("#tab-bar .tab.scratch");
    await expect(scratch).toHaveCount(1);
    await expect(page.locator("#tab-bar .tab-group-divider")).toHaveCount(1);
    await expect(scratch.locator(".tab-label")).toHaveText("Scratchpad 1");
    const fontStyle = await scratch.locator(".tab-label").evaluate((el) => getComputedStyle(el).fontStyle);
    expect(fontStyle).toBe("italic");

    // empty scratchpad → no dot; type something → a grey "memory-only" dot appears
    await expect(scratch.locator(".tab-status-dot")).toHaveCount(0);
    await editor(page).click();
    await page.keyboard.type("a thought");
    const dot = scratch.locator(".tab-status-dot.mem");
    await expect(dot).toHaveCount(1);
  });

  test("a daily tab shows its date without the .txt extension (§110)", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "hi" } } });
    await expect(page.locator("#tab-bar .tab.daily .tab-label")).toHaveText(todayFilename().replace(/\.txt$/, ""));
  });

  test("#68: past/today/future daily tabs are visually distinct from each other", async ({ page }) => {
    // 2026-09-05/10 sit either side of REFERENCE_TODAY (2026-09-07, the
    // "empty" seed's default day).
    const past = "2026-09-05.txt";
    const future = "2026-09-10.txt";
    await seedApp(page, {
      seed: {
        notes: { [past]: "old", [todayFilename()]: "today", [future]: "later" },
        session: { openTabs: [past, todayFilename(), future], activeTab: todayFilename() },
      },
    });

    const pastTab = page.locator("#tab-bar .tab.daily.past");
    const todayTab = page.locator("#tab-bar .tab.daily.today");
    const futureTab = page.locator("#tab-bar .tab.daily.future");
    await expect(pastTab).toHaveCount(1);
    await expect(todayTab).toHaveCount(1);
    await expect(futureTab).toHaveCount(1);

    const iconColor = (loc: ReturnType<typeof page.locator>) =>
      loc.locator(".tab-icon").evaluate((el) => getComputedStyle(el).color);
    const iconOpacity = (loc: ReturnType<typeof page.locator>) =>
      loc.locator(".tab-icon").evaluate((el) => getComputedStyle(el).opacity);

    // All three read as genuinely different treatments, not just "today"
    // standing out from an undifferentiated rest.
    expect(await iconOpacity(pastTab)).not.toBe(await iconOpacity(todayTab));
    expect(await iconColor(todayTab)).not.toBe(await iconColor(futureTab));
    expect(await iconColor(pastTab)).not.toBe(await iconColor(futureTab));
  });

  test("middle-click closes a tab (§110)", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    const before = await page.locator("#tab-bar .tab").count();
    // middle-click a non-active daily tab (no open-action prompt on those in busy-week's older notes)
    const victim = page.locator("#tab-bar .tab.daily").first();
    await victim.click({ button: "middle" });
    // it either closes outright or (if it had open actions) raises the safety modal
    const closedOrPrompted =
      (await page.locator("#tab-bar .tab").count()) < before ||
      (await page.locator('.modal-card[aria-label="Unresolved actions warning"]').isVisible());
    expect(closedOrPrompted).toBe(true);
  });
});

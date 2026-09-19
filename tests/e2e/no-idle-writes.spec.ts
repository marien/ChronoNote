import { test, expect } from "@playwright/test";
import { seedApp, tab, typeInEditor, noteWrites, mockNote, activeTabContent } from "./helpers";

/** Found with OneDrive on a phone and a PC: switching tabs rewrote the note
 * even when nothing had changed. A cloud-sync client sees that as an edit
 * (a new timestamp), and if another device had synced a newer version in
 * meanwhile, the switch overwrote it with the tab's stale text — producing
 * OneDrive conflict copies and silently undoing the other device's edit.
 * A tab is now only written when its text differs from what disk held. */
const A = "2026-09-07.txt";
const B = "2026-09-08.txt";
const seed = {
  notes: { [A]: "note A\n", [B]: "note B\n" },
  session: { openTabs: [A, B], activeTab: A },
};

test.describe("saving only what changed", () => {
  test("switching between tabs without editing writes nothing", async ({ page }) => {
    await seedApp(page, { seed });
    for (let i = 0; i < 3; i++) {
      await tab(page, B).click();
      await tab(page, A).click();
    }
    await page.waitForTimeout(600);
    expect(await noteWrites(page, A)).toEqual([]);
    expect(await noteWrites(page, B)).toEqual([]);
  });

  test("an edit is still saved, once, and switching afterwards adds no more writes", async ({ page }) => {
    await seedApp(page, { seed });
    await typeInEditor(page, "typed");
    await tab(page, B).click(); // flushes A
    await page.waitForTimeout(600);
    const writes = await noteWrites(page, A);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(writes[writes.length - 1]).toContain("typed");

    const before = (await noteWrites(page, A)).length;
    await tab(page, A).click();
    await tab(page, B).click();
    await tab(page, A).click();
    await page.waitForTimeout(600);
    expect((await noteWrites(page, A)).length).toBe(before);
  });

  test("a newer version synced in from another device is not overwritten by switching tabs", async ({ page }) => {
    await seedApp(page, { seed });
    // Another device's edit arrives on disk while this tab sits open, unedited.
    await page.evaluate((f) => window.__CHRONO_MOCK__!.setNote(f, "edited on the phone\n"), A);

    await tab(page, B).click(); // used to flush A's stale text over the phone's edit
    await page.waitForTimeout(600);
    expect(await noteWrites(page, A)).toEqual([]);
    expect(await mockNote(page, A)).toBe("edited on the phone\n");

    // Coming back, the tab picks up the newer text instead of showing stale content.
    await tab(page, A).click();
    await expect.poll(() => activeTabContent(page)).toBe("edited on the phone\n");
  });
});

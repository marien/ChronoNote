import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, activeTabContent, todayFilename } from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

test.describe("inline suggestions (F3)", () => {
  test("shows @Ruth from other notes, inserts on Tab, and never shifts line height or next line top", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-04.txt": "# ping @Ruth\n",
          "2026-09-05.txt": "# ask @Ruth\n",
          [todayFilename()]: "# ask \nsecond line",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    await setEditorText(page, "# ask \nsecond line");
    const lines = editor(page).locator(".cm-line");
    await expect(lines).toHaveCount(2);

    // Put caret at end of first line (`# ask |`)
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("End");

    const beforeLine0 = await lines.nth(0).boundingBox();
    const beforeLine1 = await lines.nth(1).boundingBox();
    expect(beforeLine0).not.toBeNull();
    expect(beforeLine1).not.toBeNull();

    await editor(page).pressSequentially("@R");

    const listbox = page.locator('[role="listbox"].cn-suggest');
    await expect(listbox).toBeVisible();
    await expect(listbox.locator('[role="option"]').first()).toContainText("@Ruth");

    const openLine0 = await lines.nth(0).boundingBox();
    const openLine1 = await lines.nth(1).boundingBox();
    expect(openLine0).not.toBeNull();
    expect(openLine1).not.toBeNull();
    expect(openLine0!.height).toBeCloseTo(beforeLine0!.height, 1);
    expect(openLine1!.y).toBeCloseTo(beforeLine1!.y, 1);

    await page.keyboard.press("Tab");
    await expect(listbox).toHaveCount(0);
    expect(await activeTabContent(page)).toBe("# ask @Ruth\nsecond line");
  });
});

test.describe("inline suggestions on phone", () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test("does not open on phone", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-05.txt": "# ask @Ruth\n",
          [`${REFERENCE_TODAY}.txt`]: "",
        },
        session: { openTabs: [`${REFERENCE_TODAY}.txt`], activeTab: `${REFERENCE_TODAY}.txt` },
      },
    });

    await editor(page).click();
    await expect(page.locator(".mobile-accessory-bar")).toBeVisible();
    await editor(page).pressSequentially("# ask @R");
    await expect(page.locator('[role="listbox"].cn-suggest')).toHaveCount(0);
  });
});

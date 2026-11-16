import { expect, test } from "@playwright/test";
import { activeTabContent, editor, seedApp, todayFilename, typeInEditor } from "./helpers";

test.describe("suggestions while typing", () => {
  test("offers @Ruth from older notes and Tab accepts it", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notesDir: "/notes",
        notes: {
          "2026-09-05.txt": "# ask @Ruth\n",
          "2026-09-04.txt": "o call @Ruth\n",
          [todayFilename()]: "",
        },
        session: {
          openTabs: [todayFilename()],
          activeTab: todayFilename(),
        },
      },
    });

    await typeInEditor(page, "# ask @R");

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible();
    await expect(listbox.locator('[role="option"]', { hasText: "@Ruth" })).toBeVisible();

    await page.keyboard.press("Tab");

    await expect(listbox).toBeHidden();
    await expect.poll(() => activeTabContent(page)).toBe("# ask @Ruth");
  });

  test("keeps the next line at the same y with the list open and after Escape", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notesDir: "/notes",
        notes: {
          "2026-09-05.txt": "# ask @Ruth\n",
          "2026-09-04.txt": "o call @Ruth\n",
          [todayFilename()]: "\nnext line",
        },
        session: {
          openTabs: [todayFilename()],
          activeTab: todayFilename(),
        },
      },
    });

    const content = editor(page);
    await content.click();
    await page.keyboard.press("ControlOrMeta+Home");
    await content.pressSequentially("# ask @R");

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible();

    const nextLine = page.locator(".cm-line", { hasText: "next line" });
    const openBox = await nextLine.boundingBox();
    expect(openBox).not.toBeNull();

    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();

    const closedBox = await nextLine.boundingBox();
    expect(closedBox).not.toBeNull();
    expect(openBox!.y).toBe(closedBox!.y);
  });
});

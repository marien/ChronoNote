import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  typeInEditor,
  activeTabContent,
  lastWrittenNote,
  todayFilename,
  mockFiles,
  mockNote,
} from "./helpers";

test.describe("smoke — mock backend + boot", () => {
  test("boots the empty scenario with today's tab", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    // Today's dated tab is always force-opened and active.
    await expect(page.locator("#tab-bar .tab.active")).toHaveText(new RegExp(todayFilename()));
    await expect(page.locator(".cm-editor")).toBeVisible();

    // Window title reflects the notes folder name.
    await expect(page).toHaveTitle(/ChronoNote - notes/);

    expect(await mockFiles(page)).toEqual([]);
  });

  test("boots a generated scenario and restores its session", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });

    const openTabs = await page.locator("#tab-bar .tab span").allTextContents();
    expect(openTabs.length).toBeGreaterThanOrEqual(4);
    await expect(page.locator("#tab-bar .tab.active")).toHaveText(new RegExp(todayFilename()));

    expect((await mockFiles(page)).length).toBeGreaterThan(8);
    expect((await mockNote(page, todayFilename()))!.length).toBeGreaterThan(0);
  });

  test("typing a token persists as raw text and renders a glyph", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    await typeInEditor(page, "# ship the release");

    expect(await activeTabContent(page)).toContain("# ship the release");
    expect(await lastWrittenNote(page, todayFilename())).toContain("# ship the release");
    await expect(editor(page).locator(".glyph-open")).toBeVisible();
  });

  test("a boot failure shows a readable message, not an endless spinner", async ({ page }) => {
    // The Rust side recovers a corrupt config/session file on its own; this
    // covers the rarer case where a core boot IPC just fails.
    await seedApp(page, { seed: { throwOnCommands: ["get_config"] }, expectBootFailure: true });
    await expect(page.locator('[role="alert"]')).toContainText(/couldn't start/i);
  });
});

import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, typeInEditor, mockNote, modalCard, MODAL_LABELS } from "./helpers";
import type { SeedApp } from "./helpers";

/** §93: the zero-loss exit barrier. An OS window close (X / Alt+F4) fires
 * `tauri://close-requested`; the frontend intercepts it, flushes every
 * pending + in-flight disk write, then destroys the window. A non-empty
 * scratchpad has no disk file, so it routes through the same
 * unsaved-scratchpads gate a notes-folder switch uses. Here the close
 * request is driven directly via the mock's `emitEvent`. */

const CLOSE = "tauri://close-requested";

async function requestClose(page: Page) {
  await page.evaluate((evt) => window.__CHRONO_MOCK__!.emitEvent(evt), CLOSE);
}

async function destroyCalls(page: Page): Promise<number> {
  return page.evaluate(
    () => window.__CHRONO_MOCK__!.invokeLog.filter((e) => e.cmd === "plugin:window|destroy").length,
  );
}

const today = {
  seed: {
    notes: { "2026-09-07.txt": "Today\n=====\n" },
    session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
  },
} satisfies SeedApp;

test("flushes the last un-debounced keystrokes before the window is destroyed", async ({ page }) => {
  await seedApp(page, today);

  // Type without waiting out the 400ms autosave debounce.
  await typeInEditor(page, "\nlast-minute note before quitting");
  // The write hasn't landed yet — still inside the debounce window.
  expect(await mockNote(page, "2026-09-07.txt")).not.toContain("last-minute note");

  await requestClose(page);

  // The barrier flushed it, then destroyed the window.
  await expect.poll(() => mockNote(page, "2026-09-07.txt")).toContain("last-minute note before quitting");
  await expect.poll(() => destroyCalls(page)).toBe(1);
});

test("closes straight away when nothing is dirty", async ({ page }) => {
  await seedApp(page, today);
  await requestClose(page);
  await expect.poll(() => destroyCalls(page)).toBe(1);
});

test("a non-empty scratchpad blocks the close with the unsaved-scratchpads gate", async ({ page }) => {
  await seedApp(page, today);

  // Make a scratchpad with real content.
  await page.keyboard.press("Control+n");
  await typeInEditor(page, "unpromoted scratch thoughts");

  await requestClose(page);

  const gate = modalCard(page, MODAL_LABELS.unsavedScratchpads);
  await expect(gate).toBeVisible();
  await expect(gate).toContainText(/discard & quit/i);
  expect(await destroyCalls(page)).toBe(0);

  // Cancel — stay in the app.
  await gate.getByRole("button", { name: "Cancel" }).click();
  await expect(gate).toBeHidden();
  expect(await destroyCalls(page)).toBe(0);

  // Request again, this time discard & quit.
  await requestClose(page);
  await expect(gate).toBeVisible();
  await gate.getByRole("button", { name: /discard & quit/i }).click();
  await expect.poll(() => destroyCalls(page)).toBe(1);
});

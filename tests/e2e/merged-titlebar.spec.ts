import { test, expect } from "@playwright/test";
import { seedApp, editor, typeInEditor, modalCard, MODAL_LABELS, todayFilename } from "./helpers";

/** §merged-titlebar: the app icon, tabs, and window controls (minimize/
 * maximize/close) all live in one bar, replacing the native OS title bar
 * (`decorations: false`). Renders whenever `backendKind === "desktop"` —
 * true both for the real app and for this Playwright/`?mock` harness
 * (which runs in an ordinary decorated browser tab, not a Tauri window —
 * the buttons just call the mocked Tauri APIs the same as every other
 * `getCurrentWindow()` call already exercised under the mock). */

async function invokeCount(page: import("@playwright/test").Page, cmd: string): Promise<number> {
  return page.evaluate((c) => window.__CHRONO_MOCK__!.invokeLog.filter((e) => e.cmd === c).length, cmd);
}

test.describe("merged title bar", () => {
  test("the app icon, drag regions, and window controls all render", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    await expect(page.locator(".app-icon")).toBeVisible();
    for (const locator of [page.locator("#top-bar"), page.locator("#tab-bar"), page.locator(".titlebar-drag-gutter")]) {
      expect(await locator.getAttribute("data-tauri-drag-region")).not.toBeNull();
    }

    await expect(page.getByRole("button", { name: "Minimize window" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Maximize window" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close window" })).toBeVisible();
  });

  test("minimize and maximize call the corresponding window API", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    await page.getByRole("button", { name: "Minimize window" }).click();
    expect(await invokeCount(page, "plugin:window|minimize")).toBe(1);

    await page.getByRole("button", { name: "Maximize window" }).click();
    expect(await invokeCount(page, "plugin:window|toggle_maximize")).toBe(1);
  });

  test("the close button routes through the same exit barrier a native close button already did (§93)", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "Today\n=====\n" } },
    });

    // Type without waiting out the autosave debounce — proves the flush
    // still happens on the way out, same as `exit-barrier.spec.ts`.
    await typeInEditor(page, "\nlast-minute note before quitting");
    const destroyCalls = () => invokeCount(page, "plugin:window|destroy");
    expect(await destroyCalls()).toBe(0);

    await page.getByRole("button", { name: "Close window" }).click();

    await expect.poll(() => page.evaluate((f) => window.__CHRONO_MOCK__!.getNote(f), todayFilename())).toContain(
      "last-minute note before quitting",
    );
    await expect.poll(destroyCalls).toBe(1);
  });

  test("the close button still gates on an unsaved scratchpad", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await page.keyboard.press("ControlOrMeta+n");
    await typeInEditor(page, "unpromoted scratch thoughts");

    await page.getByRole("button", { name: "Close window" }).click();

    const gate = modalCard(page, MODAL_LABELS.unsavedScratchpads);
    await expect(gate).toBeVisible();
    expect(await invokeCount(page, "plugin:window|destroy")).toBe(0);
  });

  // Note: the demo/web backends (`backendKind !== "desktop"`) aren't
  // reachable through this `?mock` harness at all — it always boots as
  // `"desktop"`, same as the real app; the demo and web app are separate
  // Vite entry points (`main-demo.ts`/`main-webapp.ts`) with no
  // Playwright coverage of their own, by existing project convention
  // (the same is true of every other `backendKind`-gated UI difference,
  // e.g. Settings' "Notes Location"/"Updates" sections). The
  // `isMergedTitlebar` gate in `TopBar.svelte` is a one-line
  // `$backendKind === "desktop"` check, verified by reading the code
  // rather than by a test that can't actually run the other two builds.
});

test.describe("status bar — notes folder name (§merged-titlebar)", () => {
  test("shows the folder name, with the full path on hover, and it's the lowest-priority item to hide", async ({
    page,
  }) => {
    await seedApp(page, { seed: { notes: {}, notesDir: "/Users/marien/Documents/Notes" } });

    const folder = page.locator("#stat-folder");
    await expect(folder).toHaveText("Notes");
    await expect(folder).toHaveAttribute("title", "/Users/marien/Documents/Notes");

    // Still visible at the width word count itself survives.
    await page.setViewportSize({ width: 900, height: 700 });
    await expect(folder).toBeVisible();
    await expect(page.locator("#stat-words")).toBeVisible();

    // Drops before word count as the window narrows further.
    await page.setViewportSize({ width: 800, height: 700 });
    await expect(folder).toBeHidden();
    await expect(page.locator("#stat-words")).toBeVisible();
  });
});

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
    const folderName = page.locator(".status-folder-name");
    await expect(folder).toHaveText("Notes");
    await expect(folder).toHaveAttribute("title", "/Users/marien/Documents/Notes");

    // Still visible at the width word count itself survives.
    await page.setViewportSize({ width: 900, height: 700 });
    await expect(folder).toBeVisible();
    await expect(page.locator("#stat-words")).toBeVisible();

    // #71: the name text drops before word count as the window narrows
    // further, same as before — but the folder icon (and the button
    // around it) stays, unlike before when the whole thing vanished.
    await page.setViewportSize({ width: 800, height: 700 });
    await expect(folderName).toBeHidden();
    await expect(folder).toBeVisible();
    await expect(folder.locator(".cn-icon")).toBeVisible();
    await expect(page.locator("#stat-words")).toBeVisible();
  });

  test("#71: clicking the folder icon/name opens Settings on the notes-folder tab, focused on Browse…", async ({
    page,
  }) => {
    await seedApp(page, { seed: { notes: {}, notesDir: "/Users/marien/Documents/Notes" } });

    await page.locator("#stat-folder").click();

    const settings = modalCard(page, MODAL_LABELS.settings);
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("radio", { name: "Notes & Sync", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(settings.getByRole("button", { name: "Browse…" })).toBeFocused();
  });

  test("#71: a plain Ctrl+, open still starts on the default first tab", async ({ page }) => {
    await seedApp(page, { seed: { notes: {} } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");

    const settings = modalCard(page, MODAL_LABELS.settings);
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("radio", { name: "Appearance", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

test.describe("tab strip follows the active tab on resize (§merged-titlebar follow-up)", () => {
  // Enough tabs to overflow even a comfortably-wide window — a middle one,
  // and the two ends, are all exercised below. Widths throughout stay at
  // or above the app's own `minWidth: 640` (`tauri.conf.json`) — the real
  // window can never get narrower than that, so a test width below it
  // would be exercising a layout state (`#tab-bar` squeezed to a 0
  // `clientWidth`) the shipped app can never actually reach.
  const DATES = [
    "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31",
    "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
  ];
  const WIDE = 1100;
  const NARROW = 700;

  async function seedManyTabs(page: import("@playwright/test").Page, activeDate: string) {
    const notes = Object.fromEntries(DATES.map((d) => [`${d}.txt`, `${d}\n${"=".repeat(10)}\n`]));
    await seedApp(page, {
      seed: {
        notes,
        session: { openTabs: DATES.map((d) => `${d}.txt`), activeTab: `${activeDate}.txt` },
      },
    });
  }

  function tabRect(page: import("@playwright/test").Page, date: string) {
    return page.locator(`[data-tab-id]`, { hasText: date }).boundingBox();
  }

  test("restoring from maximized (a resize with no activeTabId change) scrolls the active tab back into view", async ({
    page,
  }) => {
    await seedManyTabs(page, "2026-09-04"); // near the end of the strip
    await page.setViewportSize({ width: WIDE, height: 700 });
    await expect(page.locator("#top-bar")).toBeVisible();

    // Confirm the premise: at WIDE, every tab fits with room to spare, so
    // the active tab starts out visible with no scrolling needed.
    // Polled (#57), not a one-shot read: `settleLayout` can take a few
    // more frames to converge than it used to now that it correctly
    // retries the buttons-collapse decision with labels forced off
    // before giving up — real, and worth the extra frames, but slower
    // than a one-shot `boundingBox()` right after `setViewportSize`.
    await expect
      .poll(async () => {
        const bar = (await page.locator("#tab-bar").boundingBox())!;
        const t = (await tabRect(page, "2026-09-04"))!;
        return t.x >= bar.x - 1 && t.x + t.width <= bar.x + bar.width + 1;
      })
      .toBe(true);

    // Simulate "restore from maximized" — a resize with `activeTabId`
    // never changing. The reported bug: nothing re-scrolled just because
    // the bar got smaller, leaving the (still-active) tab off-screen.
    await page.setViewportSize({ width: NARROW, height: 700 });
    await expect
      .poll(async () => {
        const bar = (await page.locator("#tab-bar").boundingBox())!;
        const t = (await tabRect(page, "2026-09-04"))!;
        return t.x >= bar.x - 1 && t.x + t.width <= bar.x + bar.width + 1;
      })
      .toBe(true);
  });

  test("a middle tab gets a peek of its neighbor on both sides, not scrolled flush to an edge", async ({ page }) => {
    await seedManyTabs(page, "2026-09-01"); // a tab with neighbors on both sides
    await page.setViewportSize({ width: NARROW, height: 700 });
    await page.reload();
    await expect(page.locator("#top-bar")).toBeVisible();

    // Polled (#57, same reasoning as the test above): wait for the active
    // tab to actually be in view before reading positions — `settleLayout`
    // may still be converging right after a reload.
    await expect
      .poll(async () => {
        const bar = (await page.locator("#tab-bar").boundingBox())!;
        const t = (await tabRect(page, "2026-09-01"))!;
        return t.x >= bar.x - 1 && t.x + t.width <= bar.x + bar.width + 1;
      })
      .toBe(true);

    const bar = (await page.locator("#tab-bar").boundingBox())!;
    const active = (await tabRect(page, "2026-09-01"))!;
    const prev = (await tabRect(page, "2026-08-31"))!;
    const next = (await tabRect(page, "2026-09-02"))!;

    // The active tab itself is fully in view...
    expect(active.x).toBeGreaterThanOrEqual(bar.x - 1);
    expect(active.x + active.width).toBeLessThanOrEqual(bar.x + bar.width + 1);
    // ...and a sliver of each neighbor is too — neither sits flush against
    // the strip's edge with nothing beyond it.
    expect(prev.x + prev.width).toBeGreaterThan(bar.x);
    expect(next.x).toBeLessThan(bar.x + bar.width);
  });

  test("the actual first tab doesn't reserve dead peek space with no neighbor to show", async ({ page }) => {
    await seedManyTabs(page, "2026-08-28"); // the very first tab, no predecessor
    await page.setViewportSize({ width: NARROW, height: 700 });
    await page.reload();
    await expect(page.locator("#top-bar")).toBeVisible();

    // No neighbor exists to the left, so the strip scrolls flush to 0 —
    // not held back by a phantom left-side peek margin.
    const scrollLeft = await page.locator("#tab-bar").evaluate((el) => el.scrollLeft);
    expect(scrollLeft).toBe(0);
  });
});

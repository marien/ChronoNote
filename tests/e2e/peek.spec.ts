import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, mockNote, tab, activeTabLabel } from "./helpers";

/** Peek mode: the compact, see-through note window for calls. The native window handling (size, position,
 * transparency, always-on-top, the global shortcut) can't run in a browser — this covers the part the page owns:
 * the one-section view of the SAME editor, the header strip with the occurrence/past-today-future colour, stepping
 * between occurrences, the feature toggle, and that edits are ordinary edits.
 *
 * Every test seeds the app exactly once. (Seeding twice is unreliable: the mock restores its saved state over a new
 * seed after a reload, depending on whether anything had been saved yet.) */
const note = (extra: string) =>
  ["Standup", "=======", "# one", "", "Weekly sync", "===========", "o budget", extra, "", "Other", "=====", "x elsewhere"].join(
    "\n",
  );

const today = (extra = "- today") => ({
  notes: { "2026-09-07.txt": note(extra) },
  session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
});

async function enterOnWeeklySync(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ControlOrMeta+Shift+KeyP");
}

/** Three occurrences of the section (09-01 past, 09-07 today, 09-10 future), Peek on, header strip visible. */
async function seedThreeOccurrences(page: Page, openTabs = ["2026-09-07.txt"]) {
  await seedApp(page, {
    seed: {
      notes: {
        "2026-09-01.txt": note("- last month"),
        "2026-09-07.txt": note("- today"),
        "2026-09-10.txt": note("- next week"),
      },
      session: { openTabs, activeTab: "2026-09-07.txt" },
      peek: { header: "always", fadeSeconds: 1 },
    },
  });
}

test.describe("peek mode", () => {
  test.beforeEach(async ({ page }) => seedThreeOccurrences(page));

  test("shows only the section the cursor is in", async ({ page }) => {
    await enterOnWeeklySync(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();
    const text = await editor(page).innerText();
    expect(text).toContain("budget");
    expect(text).not.toContain("Standup");
    expect(text).not.toContain("elsewhere");
    // The section's own title and underline are not drawn: the header strip shows the title.
    expect(text).not.toContain("Weekly sync");
    expect(text).not.toContain("=====");
    await expect(page.locator("#peek-bar")).toContainText("Weekly sync");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-07");
    await expect(page.locator("#peek-bar")).toContainText("2/3");
    await expect(page.locator("#peek-bar")).toHaveClass(/\btoday\b/);
  });

  test("full bar has a minimize button directly left of the expand button", async ({ page }) => {
    await enterOnWeeklySync(page);
    const minimizeBtn = page.locator("#peek-bar").getByRole("button", { name: "Minimize" });
    const expandBtn = page.locator("#peek-bar").getByRole("button", { name: "Back to the full window" });
    await expect(minimizeBtn).toBeVisible();
    await expect(expandBtn).toBeVisible();
    const minBox = (await minimizeBtn.boundingBox())!;
    const expBox = (await expandBtn.boundingBox())!;
    expect(minBox.x + minBox.width).toBeLessThanOrEqual(expBox.x + 2);
  });

  test("the shortcut again brings the full note back", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.waitForTimeout(300);
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    expect(await editor(page).innerText()).toContain("Standup");
  });

  test("Alt+Left / Alt+Right switch occurrence; the header colour follows past / today / future", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-01");
    await expect(page.locator("#peek-bar")).toHaveClass(/\bpast\b/);
    expect(await editor(page).innerText()).toContain("last month");
    await page.keyboard.press("Alt+ArrowRight");
    await page.keyboard.press("Alt+ArrowRight");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-10");
    await expect(page.locator("#peek-bar")).toHaveClass(/\bfuture\b/);
    expect(await editor(page).innerText()).toContain("next week");
  });

  test("a past occurrence is editable and the edit lands in that note", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-01");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("added in peek");
    await expect
      .poll(async () => (await mockNote(page, "2026-09-01.txt")) ?? "")
      .toContain("added in peek");
    // The tab for that day is a normal tab now.
    await expect(tab(page, "2026-09-01.txt")).toHaveCount(1);
  });

  test("leaving Peek closes the notes it opened and returns to the note you started from", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(tab(page, "2026-09-01.txt")).toHaveCount(1);
    await page.keyboard.press("Alt+ArrowRight");
    await page.keyboard.press("Alt+ArrowRight");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-10");
    await expect(tab(page, "2026-09-10.txt")).toHaveCount(1);
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    await expect(tab(page, "2026-09-01.txt")).toHaveCount(0);
    await expect(tab(page, "2026-09-10.txt")).toHaveCount(0);
    await expect(activeTabLabel(page)).toContainText("2026-09-07");
  });

  test("a note you edited in Peek stays open, and you stay on it", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-01");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("kept");
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    await expect(tab(page, "2026-09-01.txt")).toHaveCount(1);
    await expect(activeTabLabel(page)).toContainText("2026-09-01");
  });

  test("a changed setting is saved to the config and is still there after a reload", async ({ page }) => {
    await openPeekSettings(page);
    await peekRange(page, "Background opacity, out of focus").evaluate((el: HTMLInputElement) => {
      el.value = "45";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.peek.opacity)).toBe(45);
    await page.reload();
    await openPeekSettings(page);
    await expect(peekRange(page, "Background opacity, out of focus")).toHaveValue("45");
  });
});

test.describe("peek mode: tests with their own seed", () => {
  test("the scrollbar's open-action markers are not drawn in Peek (they would mark actions in the hidden sections, and the track looks like a second scrollbar)", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 260 });
    const body = Array.from({ length: 25 }, (_, i) => `- line ${i + 1}`).join("\n");
    const long = ["Standup", "=======", "# one", "", "Weekly sync", "===========", body, "# open at the end", "", "Other", "=====", "x elsewhere"].join("\n");
    await seedApp(page, {
      seed: { notes: { "2026-09-07.txt": long }, session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" }, peek: {} },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    // Normal window: the markers exist and the ruler is part of the layout.
    await expect.poll(() => page.locator(".cm-ruler-marker").count()).toBeGreaterThan(0);
    await expect(page.locator(".cm-overview-ruler")).not.toHaveCSS("display", "none");
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await page.evaluate(() => { (document.querySelector(".cm-scroller") as HTMLElement).scrollTop = 1000; });
    await page.waitForTimeout(500);
    await expect(page.locator(".cm-overview-ruler")).toHaveCSS("display", "none");
    // And nothing makes the editor's container scroll on its own.
    const overflow = await page.evaluate(() => {
      const c = document.querySelector("#editor-container") as HTMLElement;
      return c.scrollHeight - c.clientHeight;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the header strip is shown by default, with the date and the section's title", async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: {} } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    await expect(bar).not.toHaveClass(/\bthin\b/);
    await expect(bar).toContainText("2026-09-07");
    await expect(bar).toContainText("Weekly sync");
  });

  test('set to "never" (hidden): shown when Peek starts, gone after the fade time; pointer over the window shows the thin strip with tiny minimize and expand buttons', async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: { header: "never", fadeSeconds: 1 } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    // Shown at the start (to see which section opened), then gone after the 1 s fade time.
    await expect(bar).toBeVisible();
    await expect(bar).toHaveCount(0);
    // The top bar gives its space back with a short transition: wait until the editor is fully at the top
    // (within 1px can still be the last frame of the slide).
    await expect.poll(async () => (await page.locator("#editor-container").boundingBox())!.y).toBeLessThan(0.01);

    // Pointer over window
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseenter")));
    await expect(bar).toBeVisible();
    await expect(bar).toHaveClass(/\bthin\b/);
    await expect(bar).toHaveClass(/\boverlay\b/);
    await expect(bar).toHaveClass(/\btoday\b/);

    const height = (await bar.boundingBox())!.height;
    expect(height).toBe(16);

    // Both tiny buttons exist at right end
    const minBtn = bar.locator("button.peek-btn.tiny[aria-label='Minimize']");
    const expBtn = bar.locator("button.peek-btn.tiny[aria-label='Back to the full window']");
    await expect(minBtn).toBeVisible();
    await expect(expBtn).toBeVisible();

    // Pointer leaves
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave")));
    await expect(bar).toHaveCount(0);
  });

  test('"On hover": shown when Peek starts, gone after the fade time; pointer over window draws full bar overlay', async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: { header: "hover", fadeSeconds: 1 } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    // Shown at the start (to see which section opened), then gone after the 1 s fade time.
    await expect(bar).toBeVisible();
    await expect(bar).toHaveCount(0);
    // The top bar gives its space back with a short transition: wait until the editor is fully at the top
    // (within 1px can still be the last frame of the slide).
    await expect.poll(async () => (await page.locator("#editor-container").boundingBox())!.y).toBeLessThan(0.01);

    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseenter")));
    await expect(bar).toBeVisible();
    await expect(bar).not.toHaveClass(/\bthin\b/);
    await expect(bar).toHaveClass(/\boverlay\b/);
    await expect(bar).toContainText("Weekly sync");
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave")));
    await expect(bar).toHaveCount(0);
  });

  test('"On hover": typing hides the bar at once; a real pointer movement brings it back, a still pointer does not', async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: { header: "hover" } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    await expect(bar).toBeVisible(); // shown at the start
    await page.keyboard.type("x");
    await expect(bar).toHaveCount(0);
    // Chromium sends a mousemove at the same screen spot when the page changes under a still pointer: not movement.
    const move = (x: number, y: number) =>
      page.evaluate(([sx, sy]) => document.documentElement.dispatchEvent(new MouseEvent("mousemove", { screenX: sx, screenY: sy })), [x, y]);
    await move(50, 50);
    await expect(bar).toBeVisible();
    await page.keyboard.type("y");
    await expect(bar).toHaveCount(0);
    await move(50, 50);
    await page.waitForTimeout(300);
    await expect(bar).toHaveCount(0);
    await move(60, 52);
    await expect(bar).toBeVisible();
    // A shortcut is not typing.
    await page.keyboard.press("ControlOrMeta+KeyJ");
    await page.waitForTimeout(200);
    await expect(bar).toBeVisible();
  });

  test('"Hidden": typing hides the strip too', async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: { header: "never" } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    await expect(bar).toHaveClass(/\bthin\b/);
    await page.keyboard.type("x");
    await expect(bar).toHaveCount(0);
  });

  test('"On hover": a pointer that leaves and comes back (or moves on) at once does not flap the bar', async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: { header: "hover" } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    const fire = (type: string) => page.evaluate((t) => document.documentElement.dispatchEvent(new MouseEvent(t)), type);
    await fire("mouseenter");
    await expect(bar).toBeVisible();
    await expect(bar).not.toHaveClass(/\bthin\b/);
    // Resizing the window moves it under a still pointer, which makes the browser report a leave and an enter.
    await fire("mouseleave");
    await fire("mouseenter");
    await page.waitForTimeout(400);
    await expect(bar).toBeVisible();
    // A leave followed by movement over the window is not a real leave either.
    await fire("mouseleave");
    await fire("mousemove");
    await page.waitForTimeout(400);
    await expect(bar).toBeVisible();
    // A real leave collapses it after a short delay.
    await fire("mouseleave");
    await expect(bar).toHaveCount(0);
  });

  test('"On hover": the full strip is drawn OVER the content: nothing underneath moves and the window never changes size', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 240 });
    await seedApp(page, { seed: { ...today(), peek: { header: "hover" } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    // The top bar gives its space back with a short transition: wait until the editor is fully at the top
    // (within 1px can still be the last frame of the slide).
    await expect.poll(async () => (await page.locator("#editor-container").boundingBox())!.y).toBeLessThan(0.01);
    const editorEl = page.locator("#editor-container");
    const editorBoxBefore = (await editorEl.boundingBox())!;

    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseenter")));
    await expect(bar).toBeVisible();
    await expect(bar).toHaveClass(/\boverlay\b/);
    const barBox = (await bar.boundingBox())!;
    const editorBoxAfter = (await editorEl.boundingBox())!;

    expect(barBox.height).toBe(30);
    expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("absolute");
    expect(editorBoxAfter.y).toBe(editorBoxBefore.y);
    expect(editorBoxAfter.height).toBe(editorBoxBefore.height);

    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave")));
    await expect(bar).toHaveCount(0);
    const editorBoxLeft = (await editorEl.boundingBox())!;
    expect(editorBoxLeft.y).toBe(editorBoxBefore.y);
    expect(editorBoxLeft.height).toBe(editorBoxBefore.height);
  });

  test("the background opacity defaults to 50% (out of focus)", async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: {} } });
    await openPeekSettings(page);
    await expect(peekRange(page, "Background opacity, out of focus")).toHaveValue("50");
  });

  test.describe("from Zen mode", () => {
    test.beforeEach(async ({ page }) => seedThreeOccurrences(page));

    test("Peek can be started while Zen is on: Zen ends and Peek shows", async ({ page }) => {
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Shift+F11");
      await expect(page.locator("body.zen-mode")).toBeVisible();
      await page.keyboard.press("ControlOrMeta+Shift+KeyP");
      await expect(page.locator("body.peek-mode")).toBeVisible();
      await expect(page.locator("body.zen-mode")).toHaveCount(0);
      await page.keyboard.press("ControlOrMeta+Shift+KeyP");
      await expect(page.locator("body.peek-mode")).toHaveCount(0);
    });
  });

  test.describe("Esc", () => {
    test.beforeEach(async ({ page }) => seedThreeOccurrences(page));

    test("Esc leaves Peek, like Zen mode", async ({ page }) => {
      await enterOnWeeklySync(page);
      await expect(page.locator("body.peek-mode")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("body.peek-mode")).toHaveCount(0);
      expect(await editor(page).innerText()).toContain("Standup");
    });

  });

  test.describe("opening a drawer or dialog ends Peek (they do not fit in the small window)", () => {
    test.beforeEach(async ({ page }) => seedThreeOccurrences(page));
    const modal = (page: import("@playwright/test").Page) => page.evaluate(() => window.__CHRONO_MOCK__!.debug!.modal());

    const shortcuts: [string, string, string][] = [
      ["Action Drawer", "ControlOrMeta+Shift+A", "actions"],
      ["Section History", "ControlOrMeta+Shift+H", "history"],
      ["Search", "ControlOrMeta+Shift+F", "search"],
      ["command palette", "ControlOrMeta+K", "commandPalette"],
      ["Settings", "ControlOrMeta+Comma", "settings"],
      ["date picker", "ControlOrMeta+O", "date"],
      ["Shortcuts & Symbols", "ControlOrMeta+Slash", "shortcuts"],
    ];
    for (const [name, combo, kind] of shortcuts) {
      test(`the ${name} shortcut ends Peek and opens the ${name}`, async ({ page }) => {
        await enterOnWeeklySync(page);
        await expect(page.locator("body.peek-mode")).toBeVisible();
        await page.keyboard.press(combo);
        await expect.poll(() => modal(page)).toBe(kind);
        await expect(page.locator("body.peek-mode")).toHaveCount(0);
        // Esc then just closes the drawer; we are back in the full window, not in Peek.
        await page.keyboard.press("Escape");
        await expect.poll(() => modal(page)).toBe("none");
        await expect(page.locator("body.peek-mode")).toHaveCount(0);
      });
    }

    test("the tabs stay as they are: Section History opened from a past occurrence works on that note", async ({ page }) => {
      await enterOnWeeklySync(page);
      await page.keyboard.press("Alt+ArrowLeft");
      await expect(page.locator("#peek-bar")).toContainText("2026-09-01");
      await page.keyboard.press("ControlOrMeta+Shift+H");
      await expect.poll(() => modal(page)).toBe("history");
      await expect(page.locator("body.peek-mode")).toHaveCount(0);
      // Not sent back to the starting note, and the note Peek opened is not closed under the drawer.
      await expect(activeTabLabel(page)).toContainText("2026-09-01");
      await expect(tab(page, "2026-09-01.txt")).toHaveCount(1);
    });
  });

  test("a note that was already open before Peek is not closed, and you land back on the note you started from", async ({ page }) => {
    await seedThreeOccurrences(page, ["2026-09-01.txt", "2026-09-07.txt"]);
    await enterOnWeeklySync(page);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-01");
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    await expect(tab(page, "2026-09-01.txt")).toHaveCount(1);
    await expect(activeTabLabel(page)).toContainText("2026-09-07");
  });

  test.describe("Peek is part of the app (no switch)", () => {
    test.beforeEach(async ({ page }) => seedApp(page, { seed: today() }));

    test("the shortcut works with no Peek configuration at all", async ({ page }) => {
      await enterOnWeeklySync(page);
      await expect(page.locator("body.peek-mode")).toBeVisible();
      await expect(page.locator("#peek-bar")).toContainText("Weekly sync");
    });

    test("Ctrl+Alt+P (AltGr+P, an o with a diaeresis on US-International) is not a Peek shortcut", async ({ page }) => {
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Alt+KeyP");
      await page.waitForTimeout(300);
      await expect(page.locator("body.peek-mode")).toHaveCount(0);
    });

    test("there is a command-palette entry and a Shortcuts-drawer row", async ({ page }) => {
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+K");
      await page.keyboard.type("peek");
      await expect(page.locator(".modal-card")).toContainText("Peek");
      await page.keyboard.press("Escape");
      await page.keyboard.press("ControlOrMeta+Slash");
      await expect(page.locator(".modal-card")).toContainText("Peek");
    });

    test("Settings has the Peek settings and no enable switch", async ({ page }) => {
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Comma");
      const settings = page.locator(".settings-modal-card");
      await expect(settings.getByLabel("Background opacity, out of focus", { exact: true })).toHaveCount(1);
      await expect(settings.getByLabel("Fit the window height to the section", { exact: true })).toHaveCount(1);
      await expect(settings.getByLabel(/Enable Peek/)).toHaveCount(0);
    });
  });

  test("the height is a fit-to-section switch: lines 0 is on, turning it off gives the default 6 lines", async ({ page }) => {
    await seedApp(page, { seed: { ...today("- x"), peek: { lines: 0 } } });
    await openPeekSettings(page);
    const fit = page.getByLabel("Fit the window height to the section", { exact: true });
    await expect(fit).toBeChecked();
    await page.locator("label.toggle-switch", { hasText: "Fit the window height to the section" }).click();
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.peek.lines)).toBe(6);
    await expect(fit).not.toBeChecked();
    await page.locator("label.toggle-switch", { hasText: "Fit the window height to the section" }).click();
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.peek.lines)).toBe(0);
  });

  test("starting up shows the stored settings and does not overwrite them with defaults", async ({ page }) => {
    await seedApp(page, { seed: { ...today("- x"), peek: { opacity: 35, lines: 4 } } });
    await openPeekSettings(page);
    await expect(peekRange(page, "Background opacity, out of focus")).toHaveValue("35");
    await expect(page.getByLabel("Fit the window height to the section", { exact: true })).not.toBeChecked();
    await page.waitForTimeout(700); // longer than the save debounce
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.peek)).toMatchObject({ opacity: 35, lines: 4 });
  });
});

const peekRange = (page: Page, label: string) => page.locator(".settings-modal-card").getByLabel(label, { exact: true });

async function openPeekSettings(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  await expect(page.locator(".settings-modal-card")).toBeVisible();
  await peekRange(page, "Background opacity, out of focus").scrollIntoViewIfNeeded();
}

test.describe("peek feedback round 3 (#126)", () => {
  test.beforeEach(async ({ page }) => seedThreeOccurrences(page));

  const vars = (page: Page) =>
    page.evaluate(() => ({
      bg: document.documentElement.style.getPropertyValue("--peek-opacity"),
      bar: document.documentElement.style.getPropertyValue("--peek-bar-opacity"),
    }));

  test("the window is in focus (95%) when Peek starts and fades to out of focus (50%) after the timer; the header is 5 points above", async ({ page }) => {
    await enterOnWeeklySync(page);
    await expect.poll(() => vars(page)).toEqual({ bg: "95", bar: "100" });
    await expect.poll(() => vars(page), { timeout: 4000 }).toEqual({ bg: "50", bar: "55" });
  });

  test("typing takes it back into focus at once, and it fades again after the timer", async ({ page }) => {
    await enterOnWeeklySync(page);
    await expect.poll(() => vars(page), { timeout: 8000 }).toEqual({ bg: "50", bar: "55" });
    await page.keyboard.type("x");
    await expect.poll(() => vars(page)).toEqual({ bg: "95", bar: "100" });
    await expect.poll(() => vars(page), { timeout: 8000 }).toEqual({ bg: "50", bar: "55" });
  });

  test("moving the pointer over the window is activity; resting or leaving is not", async ({ page }) => {
    await enterOnWeeklySync(page);
    await expect.poll(() => vars(page), { timeout: 8000 }).toEqual({ bg: "50", bar: "55" });
    await page.locator("html").dispatchEvent("mouseenter");
    await expect.poll(() => vars(page)).toEqual({ bg: "95", bar: "100" });
    // the pointer leaving does not fade it by itself: the countdown just runs on
    await page.locator("html").dispatchEvent("mouseleave");
    await page.waitForTimeout(300);
    expect(await vars(page)).toEqual({ bg: "95", bar: "100" });
    await expect.poll(() => vars(page), { timeout: 8000 }).toEqual({ bg: "50", bar: "55" });
    await page.locator("html").dispatchEvent("mousemove");
    await expect.poll(() => vars(page)).toEqual({ bg: "95", bar: "100" });
  });

  test("a fade time of 0 never fades", async ({ page }) => {
    await seedApp(page, {
      seed: { ...today(), peek: { header: "always", fadeSeconds: 0 } },
    });
    await enterOnWeeklySync(page);
    await page.waitForTimeout(1500);
    expect(await vars(page)).toEqual({ bg: "95", bar: "100" });
  });

  test("the in-focus opacity (default 95%) and the fade time are settings", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    await expect(peekRange(page, "Background opacity, in focus")).toHaveValue("95");
    await expect(peekRange(page, "Fade to out of focus after (seconds)")).toHaveValue("1");
  });

  test("two empty lines are kept between the section's last filled line and the next section", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.keyboard.press("End");
    await page.keyboard.type("x");
    await expect.poll(() => mockNote(page, "2026-09-07.txt")).toContain("- today\n\n\nOther");
    // typing in the empty lines does not eat the gap either
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("more");
    await expect.poll(() => mockNote(page, "2026-09-07.txt")).toMatch(/more\n\n\nOther/);
  });

  test("the two empty lines are kept out of the window: the caret cannot reach them", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.keyboard.press("End"); // the first body line
    await page.keyboard.type("x"); // makes sure the two empty lines exist
    await expect.poll(() => mockNote(page, "2026-09-07.txt")).toContain("- today\n\n\nOther");
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("Q");
    await expect.poll(() => mockNote(page, "2026-09-07.txt")).toContain("- todayQ\n\n\nOther");
    // Delete at the end of the last line cannot pull an empty line (or the next section) in either
    await page.keyboard.press("Delete");
    await page.waitForTimeout(200);
    expect(await mockNote(page, "2026-09-07.txt")).toContain("- todayQ\n\n\nOther");
    // Enter at the end opens a new line to type on (a list item continues the list)
    await page.keyboard.press("Enter");
    await page.keyboard.type("next");
    await expect.poll(() => mockNote(page, "2026-09-07.txt")).toContain("- todayQ\n- next\n\n\nOther");
  });

  test("ending Peek puts the caret in the section it was showing, also after stepping to another note", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.locator("#peek-bar")).toContainText("2026-09-01");
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    await expect(activeTabLabel(page)).toContainText("2026-09-07");
    await page.keyboard.type("Z");
    await expect.poll(() => mockNote(page, "2026-09-07.txt")).toContain("Weekly sync\n===========\nZo budget");
  });

  test("ending Peek keeps the caret where it was in the section", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    await page.keyboard.type("Z");
    await expect.poll(() => mockNote(page, "2026-09-07.txt")).toContain("- todayZ");
  });
});

test.describe("ad-hoc call naming", () => {
  const adhocNote = [
    "'Call 14:05",
    "===========",
    "- discussed plan",
    "",
    "Standup",
    "=======",
    "# next",
  ].join("\n");

  test("ad-hoc title can be clicked and renamed; Enter commits with matching underline", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": adhocNote },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
        peek: { header: "always" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    await expect(page.locator("body.peek-mode")).toBeVisible();

    const titleEl = page.locator(".peek-title");
    await expect(titleEl).toHaveClass(/\badhoc\b/);
    await expect(titleEl).toContainText("'Call 14:05");

    await titleEl.click();
    const input = page.locator(".peek-title-input");
    await expect(input).toBeVisible();

    // Typing replaces the selected "Call", keeping "14:05"
    await page.keyboard.type("Budget Jan");
    await page.keyboard.press("Enter");

    await expect(input).toHaveCount(0);
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator(".peek-title")).toContainText("'Budget Jan 14:05");
    expect(await editor(page).innerText()).toContain("discussed plan");

    // Verify the note's text in storage has the new title and matching underline
    const expectedUnderline = "=".repeat("'Budget Jan 14:05".length);
    await expect
      .poll(async () => (await mockNote(page, "2026-09-07.txt")) ?? "")
      .toContain(`'Budget Jan 14:05\n${expectedUnderline}\n- discussed plan`);
  });

  test("Escape in the title input cancels rename and keeps Peek on", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": adhocNote },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
        peek: { header: "always" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    await expect(page.locator("body.peek-mode")).toBeVisible();

    await page.locator(".peek-title").click();
    const input = page.locator(".peek-title-input");
    await expect(input).toBeVisible();

    await page.keyboard.type("Something Else");
    await page.keyboard.press("Escape");

    await expect(input).toHaveCount(0);
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator(".peek-title")).toContainText("'Call 14:05");
    await expect
      .poll(async () => (await mockNote(page, "2026-09-07.txt")) ?? "")
      .toContain("'Call 14:05\n===========\n- discussed plan");
  });

  test("F2 starts naming the call, also with the header hidden; a rename after an Escape still commits", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": adhocNote },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
        peek: { header: "never" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    await expect(page.locator("body.peek-mode")).toBeVisible();

    const input = page.locator(".peek-title-input");
    await page.keyboard.press("F2");
    await expect(input).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(page.locator("body.peek-mode")).toBeVisible();

    await page.keyboard.press("F2");
    await expect(input).toBeVisible();
    await page.keyboard.type("Budget Jan");
    await page.keyboard.press("Enter");
    await expect(input).toHaveCount(0);
    await expect
      .poll(async () => (await mockNote(page, "2026-09-07.txt")) ?? "")
      .toContain("'Budget Jan 14:05\n");
    await expect(page.locator("body.peek-mode")).toBeVisible();
  });

  test("the ad-hoc title and its field only take the width they need; the rest of the bar is a drag area", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": adhocNote },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
        peek: { header: "always" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    const bar = page.locator("#peek-bar");
    const barWidth = (await bar.boundingBox())!.width;
    const fill = bar.locator(".peek-drag-fill");
    await expect(fill).toHaveAttribute("data-tauri-drag-region", "");
    const titleWidth = (await bar.locator(".peek-title").boundingBox())!.width;
    expect(titleWidth).toBeLessThan(barWidth / 3);
    expect((await fill.boundingBox())!.width).toBeGreaterThan(barWidth / 3);

    await bar.locator(".peek-title").click();
    const input = page.locator(".peek-title-input");
    await expect(input).toBeVisible();
    expect((await input.boundingBox())!.width).toBeLessThan(barWidth / 3);
    expect((await fill.boundingBox())!.width).toBeGreaterThan(barWidth / 3);
  });

  test("a meeting section's title is not editable (no input appears on click)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": adhocNote },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
        peek: { header: "always" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    await expect(page.locator("body.peek-mode")).toBeVisible();

    const titleEl = page.locator(".peek-title");
    await expect(titleEl).toContainText("Standup");
    await expect(titleEl).not.toHaveClass(/\badhoc\b/);

    await titleEl.click();
    await expect(page.locator(".peek-title-input")).toHaveCount(0);
    await expect(page.locator("body.peek-mode")).toBeVisible();
  });
});


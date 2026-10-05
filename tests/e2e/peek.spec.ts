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
  await page.keyboard.press("ControlOrMeta+Alt+Space");
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
      peek: { enabled: true, header: "always" },
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

  test("the shortcut again brings the full note back", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.waitForTimeout(300);
    await page.keyboard.press("ControlOrMeta+Alt+Space");
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
    await page.keyboard.press("ControlOrMeta+Alt+Space");
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
    await page.keyboard.press("ControlOrMeta+Alt+Space");
    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    await expect(tab(page, "2026-09-01.txt")).toHaveCount(1);
    await expect(activeTabLabel(page)).toContainText("2026-09-01");
  });

  test("a changed setting is saved to the config and is still there after a reload", async ({ page }) => {
    await openPeekSettings(page);
    await peekRange(page, "Background opacity (pointer away)").evaluate((el: HTMLInputElement) => {
      el.value = "45";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.peek.opacity)).toBe(45);
    await page.reload();
    await openPeekSettings(page);
    await expect(peekRange(page, "Background opacity (pointer away)")).toHaveValue("45");
  });
});

test.describe("peek mode: tests with their own seed", () => {
  test("the scrollbar's open-action markers are not drawn in Peek (they would mark actions in the hidden sections, and the track looks like a second scrollbar)", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 260 });
    const body = Array.from({ length: 25 }, (_, i) => `- line ${i + 1}`).join("\n");
    const long = ["Standup", "=======", "# one", "", "Weekly sync", "===========", body, "# open at the end", "", "Other", "=====", "x elsewhere"].join("\n");
    await seedApp(page, {
      seed: { notes: { "2026-09-07.txt": long }, session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" }, peek: { enabled: true } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    // Normal window: the markers exist and the ruler is part of the layout.
    await expect.poll(() => page.locator(".cm-ruler-marker").count()).toBeGreaterThan(0);
    await expect(page.locator(".cm-overview-ruler")).not.toHaveCSS("display", "none");
    await page.keyboard.press("ControlOrMeta+Alt+Space");
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
    await seedApp(page, { seed: { ...today(), peek: { enabled: true } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    await expect(bar).not.toHaveClass(/\bthin\b/);
    await expect(bar).toContainText("2026-09-07");
    await expect(bar).toContainText("Weekly sync");
  });

  test('set to "Verborgen" (hidden) the strip shrinks to a thin one that keeps the past/today/future colour and the drag handle', async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: { enabled: true, header: "never" } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    await expect(bar).toHaveClass(/\bthin\b/);
    await expect(bar).toHaveClass(/\btoday\b/);
    await expect(bar).toHaveText("");
    // Thin, but a real grab area (it is the only handle for moving the window).
    const height = (await bar.boundingBox())!.height;
    expect(height).toBeGreaterThanOrEqual(14);
    expect(height).toBeLessThan(20);
  });

  test('"On hover": the thin strip grows into the header while the pointer is over the window', async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: { enabled: true, header: "hover" } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    await expect(bar).toHaveClass(/\bthin\b/);
    await expect(bar).toHaveText("");
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseenter")));
    await expect(bar).not.toHaveClass(/\bthin\b/);
    await expect(bar).toContainText("Weekly sync");
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave")));
    await expect(bar).toHaveClass(/\bthin\b/);
  });

  test('"On hover": a pointer that leaves and comes back (or moves on) at once does not flap the strip', async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: { enabled: true, header: "hover" } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    const fire = (type: string) => page.evaluate((t) => document.documentElement.dispatchEvent(new MouseEvent(t)), type);
    await fire("mouseenter");
    await expect(bar).not.toHaveClass(/\bthin\b/);
    // Resizing the window moves it under a still pointer, which makes the browser report a leave and an enter.
    await fire("mouseleave");
    await fire("mouseenter");
    await page.waitForTimeout(400);
    await expect(bar).not.toHaveClass(/\bthin\b/);
    // A leave followed by movement over the window is not a real leave either.
    await fire("mouseleave");
    await fire("mousemove");
    await page.waitForTimeout(400);
    await expect(bar).not.toHaveClass(/\bthin\b/);
    // A real leave collapses it after a short delay.
    await fire("mouseleave");
    await expect(bar).toHaveClass(/\bthin\b/);
  });

  test('"On hover": the full strip is drawn OVER the content: nothing underneath moves and the window never changes size', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 240 });
    await seedApp(page, { seed: { ...today(), peek: { enabled: true, header: "hover" } } });
    await enterOnWeeklySync(page);
    const bar = page.locator("#peek-bar");
    const geometry = async () => {
      const editorBox = (await page.locator("#editor-container").boundingBox())!;
      const barBox = (await bar.boundingBox())!;
      return {
        barTop: barBox.y,
        barHeight: barBox.height,
        editorTop: editorBox.y,
        editorHeight: editorBox.height,
        position: await bar.evaluate((el) => getComputedStyle(el).position),
      };
    };
    await page.waitForTimeout(300); // let Peek's own layout settle
    const collapsed = await geometry();
    expect(collapsed).toMatchObject({ barHeight: 16, position: "relative" });
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseenter")));
    await expect(bar).toHaveClass(/\boverlay\b/);
    const open = await geometry();
    // 30px tall, over the top of the editor; the editor is exactly where it was.
    expect(open).toMatchObject({ barHeight: 30, position: "absolute", barTop: collapsed.barTop });
    expect(open.editorTop).toBe(collapsed.editorTop);
    expect(open.editorHeight).toBe(collapsed.editorHeight);
    expect(open.barTop + open.barHeight).toBeGreaterThan(open.editorTop); // it covers the first lines
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave")));
    await expect(bar).not.toHaveClass(/\boverlay\b/);
    expect(await geometry()).toEqual(collapsed);
  });

  test("the background opacity defaults to 80%", async ({ page }) => {
    await seedApp(page, { seed: { ...today(), peek: { enabled: true } } });
    await openPeekSettings(page);
    await expect(peekRange(page, "Background opacity (pointer away)")).toHaveValue("80");
  });

  test.describe("from Zen mode", () => {
    test.beforeEach(async ({ page }) => seedThreeOccurrences(page));

    test("Peek can be started while Zen is on: Zen ends and Peek shows", async ({ page }) => {
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Shift+F11");
      await expect(page.locator("body.zen-mode")).toBeVisible();
      await page.keyboard.press("ControlOrMeta+Alt+Space");
      await expect(page.locator("body.peek-mode")).toBeVisible();
      await expect(page.locator("body.zen-mode")).toHaveCount(0);
      await page.keyboard.press("ControlOrMeta+Alt+Space");
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
    await page.keyboard.press("ControlOrMeta+Alt+Space");
    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    await expect(tab(page, "2026-09-01.txt")).toHaveCount(1);
    await expect(activeTabLabel(page)).toContainText("2026-09-07");
  });

  test.describe("feature toggle: off by default", () => {
    test.beforeEach(async ({ page }) => seedApp(page, { seed: today() }));

    test("with Peek off the shortcut does nothing", async ({ page }) => {
      await enterOnWeeklySync(page);
      await page.waitForTimeout(300);
      await expect(page.locator("body.peek-mode")).toHaveCount(0);
      await expect(page.locator("#peek-bar")).toHaveCount(0);
      expect(await editor(page).innerText()).toContain("Standup");
    });

    test("with Peek off there is no command-palette entry and no Shortcuts-drawer row", async ({ page }) => {
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+K");
      await page.keyboard.type("peek");
      await page.waitForTimeout(300);
      await expect(page.locator(".modal-card")).not.toContainText("Peek");
      await page.keyboard.press("Escape");
      await page.keyboard.press("ControlOrMeta+Slash");
      await expect(page.locator(".modal-card")).toContainText("Zen mode");
      await expect(page.locator(".modal-card")).not.toContainText("Peek");
    });

    test("Settings shows only the switch while it is off; switching it on reveals the rest and Peek works at once", async ({ page }) => {
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Comma");
      const settings = page.locator(".settings-modal-card");
      const toggle = settings.getByLabel("Enable Peek (experimental)");
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle).not.toBeChecked();
      await expect(settings.getByLabel("Background opacity (pointer away)", { exact: true })).toHaveCount(0);
      await expect(settings.getByLabel("Height (lines)", { exact: true })).toHaveCount(0);

      await settings.locator("label.toggle-switch", { hasText: "Enable Peek (experimental)" }).click();
      await expect(toggle).toBeChecked();
      await expect(settings.getByLabel("Background opacity (pointer away)", { exact: true })).toHaveCount(1);
      await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.peek.enabled)).toBe(true);

      await page.keyboard.press("Escape");
      await enterOnWeeklySync(page);
      await expect(page.locator("body.peek-mode")).toBeVisible();

      // Switching it off again ends Peek's availability.
      await page.keyboard.press("ControlOrMeta+Alt+Space");
      await expect(page.locator("body.peek-mode")).toHaveCount(0);
      await page.keyboard.press("ControlOrMeta+Comma");
      await settings.locator("label.toggle-switch", { hasText: "Enable Peek (experimental)" }).click();
      await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.peek.enabled)).toBe(false);
    });
  });

  test("starting up shows the stored settings and does not overwrite them with defaults", async ({ page }) => {
    await seedApp(page, { seed: { ...today("- x"), peek: { enabled: true, opacity: 35, lines: 4 } } });
    await openPeekSettings(page);
    await expect(peekRange(page, "Background opacity (pointer away)")).toHaveValue("35");
    await expect(peekRange(page, "Height (lines)")).toHaveValue("4");
    await page.waitForTimeout(700); // longer than the save debounce
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.peek)).toMatchObject({ opacity: 35, lines: 4 });
  });
});

const peekRange = (page: Page, label: string) => page.locator(".settings-modal-card").getByLabel(label, { exact: true });

async function openPeekSettings(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  await expect(page.locator(".settings-modal-card")).toBeVisible();
  await peekRange(page, "Background opacity (pointer away)").scrollIntoViewIfNeeded();
}

test.describe("peek feedback round 3 (#126)", () => {
  test.beforeEach(async ({ page }) => seedThreeOccurrences(page));

  const vars = (page: Page) =>
    page.evaluate(() => ({
      bg: document.documentElement.style.getPropertyValue("--peek-opacity"),
      bar: document.documentElement.style.getPropertyValue("--peek-bar-opacity"),
    }));

  test("the background is 100% under the pointer and 80% away; the header is 5 points above the background", async ({ page }) => {
    await enterOnWeeklySync(page);
    await page.locator("html").dispatchEvent("mouseleave");
    await expect.poll(() => vars(page)).toEqual({ bg: "80", bar: "85" });
    await page.locator("html").dispatchEvent("mouseenter");
    await expect.poll(() => vars(page)).toEqual({ bg: "100", bar: "100" });
    await page.locator("html").dispatchEvent("mouseleave");
    await expect.poll(() => vars(page)).toEqual({ bg: "80", bar: "85" });
  });

  test("the opacity under the pointer is a setting with a 100% default", async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    await expect(peekRange(page, "Background opacity under the pointer")).toHaveValue("100");
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

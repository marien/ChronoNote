import { test, expect, type Page } from "@playwright/test";
import { seedApp, todayFilename } from "./helpers";

/** Phone feedback on the tabs drawer: it lists tabs in the tab bar's order, uses
 * the tab bar's colour scheme, and the active tab is always visible next to the
 * drawer button. */
const seed = {
  notes: {
    "2026-09-03.txt": "# three",
    "2026-09-01.txt": "# one",
    "2026-09-02.txt": "# two",
  },
  // Deliberately not in date order.
  session: { openTabs: ["2026-09-03.txt", "2026-09-01.txt", "2026-09-02.txt"], activeTab: "2026-09-02.txt" },
};

const drawer = (page: Page) => page.getByRole("dialog", { name: "Open tabs" });

test.describe("mobile tabs drawer", () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test("lists dated tabs by date, then scratchpads", async ({ page }) => {
    await seedApp(page, { seed });
    await page.getByRole("button", { name: /^Open tabs list/ }).click();
    const names = drawer(page).locator(".drawer-tab-name");
    // (Today's note is always open too, so compare against the sorted order.)
    await expect(names.first()).toHaveText("2026-09-01");
    const shown = await names.allTextContents();
    expect(shown).toContain("2026-09-03");
    expect(shown).toEqual([...shown].sort());
  });

  test("uses the tab bar's scheme: an accent-marked active tab and tinted date icons", async ({ page }) => {
    await seedApp(page, { seed });
    await page.getByRole("button", { name: /^Open tabs list/ }).click();
    const active = drawer(page).locator(".drawer-tab-item.active");
    await expect(active).toHaveCount(1);
    await expect(active.locator(".drawer-tab-name")).toHaveText("2026-09-02");
    // Past dates are dimmed, like the tab bar's.
    const opacity = await drawer(page)
      .locator(".drawer-tab-item.past .drawer-tab-icon")
      .first()
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeLessThan(0.6);
    // The active tab carries the accent edge (box-shadow), not the old selection fill.
    const shadow = await active.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe("none");
  });

  test("#96: the selected tab's accent stripe follows its own past/today/future color, not a fixed accent", async ({
    page,
  }) => {
    const past = "2026-09-05.txt";
    const future = "2026-09-10.txt";
    await seedApp(page, {
      seed: {
        notes: { [past]: "old", [todayFilename()]: "today", [future]: "later" },
        session: { openTabs: [past, todayFilename(), future], activeTab: past },
      },
    });
    await page.getByRole("button", { name: /^Open tabs list/ }).click();

    const pastItem = drawer(page).locator(".drawer-tab-item.daily.past");
    const todayItem = drawer(page).locator(".drawer-tab-item.daily.today");
    const futureItem = drawer(page).locator(".drawer-tab-item.daily.future");
    const stripe = (loc: typeof pastItem) => loc.evaluate((el) => getComputedStyle(el).boxShadow);

    // Past is active first: its own stripe color, not the "today" accent.
    await expect(pastItem).toHaveClass(/active/);
    const pastActiveStripe = await stripe(pastItem);

    await todayItem.click();
    await page.getByRole("button", { name: /^Open tabs list/ }).click();
    await expect(todayItem).toHaveClass(/active/);
    const todayActiveStripe = await stripe(todayItem);

    await futureItem.click();
    await page.getByRole("button", { name: /^Open tabs list/ }).click();
    await expect(futureItem).toHaveClass(/active/);
    const futureActiveStripe = await stripe(futureItem);

    expect(pastActiveStripe).not.toBe(todayActiveStripe);
    expect(todayActiveStripe).not.toBe(futureActiveStripe);
    expect(pastActiveStripe).not.toBe(futureActiveStripe);
  });

  test("shows each tab's open-action count, in the status bar's quiet count style", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-05.txt": "# one open\n# two open\nv done, not counted",
          [todayFilename()]: "no actions here",
        },
        session: { openTabs: ["2026-09-05.txt", todayFilename()], activeTab: todayFilename() },
      },
    });
    await page.getByRole("button", { name: /^Open tabs list/ }).click();

    const withOpens = drawer(page).locator(".drawer-tab-item", { hasText: "2026-09-05" });
    const badge = withOpens.locator(".drawer-tab-open-count");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("☐ 2");
    // Plain/muted, like the status bar's own count — not the editor's
    // colored glyph-open treatment (which would use --glyph-open-color).
    const { badgeColor, mutedColor, glyphOpenColor } = await page.evaluate(() => {
      const probe = document.createElement("span");
      document.body.appendChild(probe);
      probe.style.color = "var(--muted)";
      const mutedColor = getComputedStyle(probe).color;
      probe.style.color = "var(--glyph-open-color)";
      const glyphOpenColor = getComputedStyle(probe).color;
      probe.remove();
      const badgeColor = getComputedStyle(document.querySelector(".drawer-tab-open-count")!).color;
      return { badgeColor, mutedColor, glyphOpenColor };
    });
    expect(badgeColor).toBe(mutedColor);
    expect(badgeColor).not.toBe(glyphOpenColor);

    // A tab with no open actions shows no badge at all.
    const withoutOpens = drawer(page).locator(".drawer-tab-item.today");
    await expect(withoutOpens.locator(".drawer-tab-open-count")).toHaveCount(0);
  });

  test("the active tab is shown next to the drawer button, and follows the selection", async ({ page }) => {
    await seedApp(page, { seed });
    const chip = page.locator(".mobile-active-tab");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("2026-09-02");

    await page.getByRole("button", { name: /^Open tabs list/ }).click();
    await drawer(page).locator(".drawer-tab-item", { hasText: "2026-09-03" }).click();
    await expect(chip).toContainText("2026-09-03");

    // Tapping the title button opens the date picker (§D2).
    await chip.click();
    await expect(page.locator(".datepicker-pop")).toBeVisible();
  });

  test("the top bar has room for the active tab's whole date", async ({ page }) => {
    // The mock backend is a "desktop" one and so also draws window controls (~130px) that a
    // phone browser never has; widen the viewport by that much to compare like with like.
    await page.setViewportSize({ width: 520, height: 800 });
    await seedApp(page, { seed });
    const fits = await page.evaluate(() => {
      const bar = document.getElementById("top-bar")!;
      const chip = document.querySelector<HTMLElement>(".mobile-active-tab .tab-label")!;
      return { barOverflow: bar.scrollWidth - bar.clientWidth, labelClipped: chip.scrollWidth > chip.clientWidth };
    });
    expect(fits.barOverflow).toBeLessThanOrEqual(1);
    expect(fits.labelClipped).toBe(false);
    // The buttons that no longer fit are still reachable.
    await expect(page.getByRole("button", { name: /More actions/ })).toBeVisible();
  });

  test("when the keyboard shrinks the layout, the line being edited stays in view", async ({ page }) => {
    const lines = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join("\n");
    await seedApp(page, { seed: { notes: { "2026-09-02.txt": lines }, session: { openTabs: ["2026-09-02.txt"], activeTab: "2026-09-02.txt" } } });
    // Put the caret on the last line and bring it into view, as a tap there would.
    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("Control+End");
    const visible = () =>
      page.evaluate(() => {
        const line = document.querySelector(".cm-cursor")!.getBoundingClientRect();
        const box = document.querySelector(".cm-scroller")!.getBoundingClientRect();
        return line.top >= box.top - 1 && line.bottom <= box.bottom + 1;
      });
    await expect.poll(visible).toBe(true);

    // The keyboard opens: the layout loses ~40% of its height (what
    // interactive-widget=resizes-content does).
    await page.setViewportSize({ width: 400, height: 460 });
    await expect.poll(visible, { timeout: 3000 }).toBe(true);
  });
});

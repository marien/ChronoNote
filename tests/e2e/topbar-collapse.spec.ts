/** #56: on a narrow window, the top bar's secondary action buttons
 * (Actions/History/Search/Import/Promote/Settings/About) collapse into a
 * single "More actions" button — `TopBar.svelte`'s `settleLayout`,
 * extended one tier past its existing label-collapse logic — freeing that
 * space back to the tab strip. New Scratchpad and Open Date Note stay
 * pinned regardless of width. `MoreActionsModal` is the resulting
 * popover, anchored to the "More actions" button the same way
 * `DatePickerModal` anchors to its own trigger. */
import { test, expect } from "@playwright/test";
import { seedApp, modalCard, MODAL_LABELS, typeInEditor } from "./helpers";

test.describe("top bar: collapsing secondary buttons on a narrow window (#56)", () => {
  test("wide window: every action button is visible individually, no More button", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await expect(page.getByTitle(/^Actions /)).toBeVisible();
    await expect(page.getByTitle(/^Settings /)).toBeVisible();
    await expect(page.getByTitle(/^About ChronoNote /)).toBeVisible();
    await expect(page.getByTitle("More actions")).toHaveCount(0);
  });

  test("narrow window: secondary buttons collapse into More; New Scratchpad and Open Date stay pinned", async ({
    page,
  }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });
    await expect(page.getByTitle("More actions")).toBeVisible();

    // Pinned — never collapse.
    await expect(page.getByTitle(/^New Scratchpad /)).toBeVisible();
    await expect(page.getByTitle(/^Open Date Note /)).toBeVisible();

    // Collapsed — no longer rendered as individual top-bar buttons.
    await expect(page.getByTitle(/^Actions /)).toHaveCount(0);
    await expect(page.getByTitle(/^Section history /)).toHaveCount(0);
    await expect(page.getByTitle(/^Cross-Tab Search /)).toHaveCount(0);
    await expect(page.getByTitle(/^Import Sections /)).toHaveCount(0);
    await expect(page.getByTitle(/^Settings /)).toHaveCount(0);
    await expect(page.getByTitle(/^About ChronoNote /)).toHaveCount(0);
  });

  test("More actions lists every collapsed action with its shortcut, and running one closes the popover", async ({
    page,
  }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });
    await page.getByTitle("More actions").click();

    const menu = page.getByRole("menu", { name: "More actions" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Actions.*Ctrl\+Shift\+A/s })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Section history.*Ctrl\+Shift\+H/s })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Cross-tab search.*Ctrl\+Shift\+F/s })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Import sections.*Ctrl\+Shift\+I/s })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^Settings/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /About ChronoNote/ })).toBeVisible();

    await menu.getByRole("menuitem", { name: /^Settings/ }).click();
    await expect(modalCard(page, MODAL_LABELS.settings)).toBeVisible();
    await expect(menu).toBeHidden();
  });

  test("More actions includes Promote only when the active tab is a scratchpad", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await page.setViewportSize({ width: 480, height: 720 });
    await page.keyboard.press("Control+n"); // fresh scratchpad, becomes active

    await page.getByTitle("More actions").click();
    const menu = page.getByRole("menu", { name: "More actions" });
    await expect(menu.getByRole("menuitem", { name: /Promote/ })).toBeVisible();
  });

  test("clicking outside, or Escape, closes the popover without running anything", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });
    await page.getByTitle("More actions").click();
    const menu = page.getByRole("menu", { name: "More actions" });
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await page.getByTitle("More actions").click();
    await expect(menu).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(menu).toBeHidden();
  });

  test("widening the window back un-collapses the buttons", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });
    await expect(page.getByTitle("More actions")).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTitle("More actions")).toHaveCount(0);
    await expect(page.getByTitle(/^Actions /)).toBeVisible();
    await expect(page.getByTitle(/^About ChronoNote /)).toBeVisible();
  });
});

/** #57: two bugs reported together, both in `settleLayout`'s tiering.
 *
 * (1) Labels used to require the window be maximized/fullscreen
 * (`chromeExpanded`) on top of having room — a restored window, however
 * wide, could never show them at all. Purely width-driven now, matching
 * `docs/spec.md`'s description (which never mentioned a maximize
 * requirement) — a sufficiently wide *restored* window shows labels.
 *
 * (2) Typing visibly flickered the labeled/collapsed state on and off.
 * Root cause: every keystroke calls `updateActiveTabContent()`, which is
 * a `tabs.set()` on every content change — not just a tab being added,
 * removed, or renamed — and `TopBar.svelte` re-ran its *entire* layout
 * decision on every `tabs` update. Re-running unconditionally tries the
 * next-better tier and measures again even when nothing about available
 * width could have changed, so a burst of keystrokes flashed labels/
 * buttons on and off for no reason. Fixed by reducing a tab list to only
 * the fields that can actually affect rendered width
 * (`layoutSignature`) before deciding whether to re-settle at all — a
 * keystroke changes a tab's `content`, never its identity/filename/
 * scratchpad-ness, so the signature is unchanged and `settleLayout()` is
 * never even called. Verified below via a `MutationObserver` on
 * `#top-bar`'s subtree: zero DOM mutations there while typing, in both
 * the icon-only/collapsed tier and the labeled tier. */
test.describe("top bar: label/collapse state doesn't depend on window-maximized state, and doesn't flicker while typing (#57)", () => {
  test("a wide-enough restored window shows action-button labels, purely from available width", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 1600, height: 720 });

    await expect(page.locator(".icon-label")).not.toHaveCount(0);
    await expect(page.getByTitle(/^Actions /)).toContainText("Actions");
    await expect(page.getByTitle("More actions")).toHaveCount(0);
  });

  // `settleLayout` converges over several `requestAnimationFrame` waits
  // (labels, then buttons, each potentially retried) — an assertion like
  // `toBeVisible()` can pass on an *intermediate* frame of that
  // convergence, not its final settled state. Waiting out a generous
  // number of real frames (not a wall-clock timeout, which would be
  // flaky under load) before attaching the mutation observer ensures
  // it only ever sees mutations caused by the *typing* that follows, not
  // the tail of the initial settle still resolving.
  async function waitForFrames(page: import("@playwright/test").Page, n = 15): Promise<void> {
    await page.evaluate(
      (count) =>
        new Promise<void>((resolve) => {
          let remaining = count;
          const step = () => (--remaining <= 0 ? resolve() : requestAnimationFrame(step));
          requestAnimationFrame(step);
        }),
      n,
    );
  }

  async function countTopBarMutationsWhileTyping(page: import("@playwright/test").Page): Promise<number> {
    await waitForFrames(page);
    await page.evaluate(() => {
      const w = window as unknown as { __topBarMutations: number; __topBarObserver: MutationObserver };
      w.__topBarMutations = 0;
      w.__topBarObserver = new MutationObserver((muts) => {
        w.__topBarMutations += muts.length;
      });
      w.__topBarObserver.observe(document.getElementById("top-bar")!, { childList: true, subtree: true });
    });
    await typeInEditor(page, "the quick brown fox jumps over the lazy dog");
    return page.evaluate(() => {
      const w = window as unknown as { __topBarMutations: number; __topBarObserver: MutationObserver };
      w.__topBarObserver.disconnect();
      return w.__topBarMutations;
    });
  }

  test("typing doesn't touch the top bar at all, in the icon-only/collapsed tier", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });
    await expect(page.getByTitle("More actions")).toBeVisible();

    expect(await countTopBarMutationsWhileTyping(page)).toBe(0);
  });

  test("typing doesn't touch the top bar at all, in the labeled tier", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 1600, height: 720 });
    await expect(page.locator(".icon-label")).not.toHaveCount(0);

    expect(await countTopBarMutationsWhileTyping(page)).toBe(0);
  });
});

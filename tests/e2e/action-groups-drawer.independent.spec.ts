import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  seedApp,
  todayFilename,
  openViaShortcut,
  activeTabContent,
} from "./helpers";

const SEED_CONTENT = `# release 0.34
  # changelog
  v build
  # announce

# onboard Lee => v laptop => # accounts => # intro meeting

# standalone action
`;

/** Returns the filter input inside the action drawer. */
function getFilterInput(drawer: Locator): Locator {
  return drawer
    .locator('input[type="text"], input[type="search"], input.filter-input, input')
    .first();
}

/** Returns the "Only open" toggle element (button, checkbox, or labeled control). */
function getOnlyOpenToggle(drawer: Locator): Locator {
  return drawer
    .getByRole("checkbox", { name: /only open/i })
    .or(drawer.getByRole("button", { name: /only open/i }))
    .or(drawer.getByLabel(/only open/i))
    .or(drawer.locator('label, button, [role="button"]').filter({ hasText: /only open/i }))
    .first();
}

/** Helper to seed app with SEED_CONTENT and open the action drawer. */
async function setupActionDrawer(page: Page): Promise<Locator> {
  await seedApp(page, {
    seed: {
      notes: {
        [todayFilename()]: SEED_CONTENT,
      },
    },
  });
  return openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
}

test.describe("Action Drawer Groups", () => {
  test("nested rows appear under their parent in order with tree guides and step indicators", async ({
    page,
  }) => {
    const drawer = await setupActionDrawer(page);

    // With default "Only open" filter on, the resolved items (build, laptop) are hidden
    const rows = drawer.locator('.modal-item[role="option"]');
    await expect(rows).toHaveCount(7);

    // Verify ordering
    await expect(rows.nth(0)).toContainText("release 0.34");
    await expect(rows.nth(1)).toContainText("changelog");
    await expect(rows.nth(2)).toContainText("announce");
    await expect(rows.nth(3)).toContainText("onboard Lee");
    await expect(rows.nth(4)).toContainText("accounts");
    await expect(rows.nth(5)).toContainText("intro meeting");
    await expect(rows.nth(6)).toContainText("standalone action");

    // Parent row release 0.34 has depth 0 and chevron
    const releaseRow = rows.nth(0);
    await expect(releaseRow.locator(".group-chevron")).toBeVisible();
    await expect(releaseRow).toHaveCSS("padding-left", "18px");

    // Nested child changelog has depth 1, left inset padding (42px), and a tree-guide elbow
    const changelogRow = rows.nth(1);
    await expect(changelogRow).toHaveCSS("padding-left", "42px");
    await expect(changelogRow.locator(".tree-guide.is-tee")).toBeVisible();

    // The tree line runs from the parent's glyph, as in the editor, and the glyph keeps its width on a long row
    const parentGlyph = await releaseRow.locator(".item-glyph").boundingBox();
    const guide = await changelogRow.locator(".tree-guide.is-tee").boundingBox();
    expect(Math.abs(guide!.x - (parentGlyph!.x + parentGlyph!.width / 2))).toBeLessThanOrEqual(1.5);

    // Step rows display their 1-based stepIndex number
    const accountsRow = rows.nth(4);
    await expect(accountsRow.locator(".step-number")).toHaveText("2.");
    const introRow = rows.nth(5);
    await expect(introRow.locator(".step-number")).toHaveText("3.");

    // §427: steps are joined by tree lines like line children, and the number follows the box
    await expect(accountsRow.locator(".tree-guide.is-tee")).toHaveCount(1);
    await expect(introRow.locator(".tree-guide.is-end")).toHaveCount(1);
    const stepGlyph = await accountsRow.locator(".item-glyph").boundingBox();
    const stepNumber = await accountsRow.locator(".step-number").boundingBox();
    expect(stepNumber!.x).toBeGreaterThan(stepGlyph!.x + stepGlyph!.width);

    // Standalone row has depth 0, no chevron, and its glyph lines up with a parent's (the chevron is in the gutter)
    const standaloneRow = rows.nth(6);
    await expect(standaloneRow.locator(".group-chevron")).toHaveCount(0);
    const standaloneGlyph = await standaloneRow.locator(".item-glyph").boundingBox();
    expect(standaloneGlyph!.x).toBeCloseTo(parentGlyph!.x, 0);
  });

  test("the parent shows 1/3-style progress", async ({ page }) => {
    const drawer = await setupActionDrawer(page);

    // Parent "# release 0.34" has 3 descendants (changelog, build, announce), 1 resolved (build) -> "1/3"
    const releaseRow = drawer.locator('.modal-item[role="option"]', {
      hasText: "release 0.34",
    });
    const releaseProgress = releaseRow.locator(".item-progress");
    await expect(releaseProgress).toBeVisible();
    await expect(releaseProgress).toHaveText("1/3");

    // Parent "# onboard Lee" has 3 steps (laptop, accounts, intro meeting), 1 resolved (laptop) -> "1/3"
    const onboardRow = drawer.locator('.modal-item[role="option"]', {
      hasText: "onboard Lee",
    });
    const onboardProgress = onboardRow.locator(".item-progress");
    await expect(onboardProgress).toBeVisible();
    await expect(onboardProgress).toHaveText("1/3");

    // Standalone action without stateful descendants has no progress indicator
    const standaloneRow = drawer.locator('.modal-item[role="option"]', {
      hasText: "standalone action",
    });
    await expect(standaloneRow.locator(".item-progress")).toHaveCount(0);
  });

  test("a resolved child is hidden with Only open on and shown with it off", async ({ page }) => {
    const drawer = await setupActionDrawer(page);

    // "Only open" is on by default: resolved items "build" and "laptop" must be hidden
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "build" }),
    ).toHaveCount(0);
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "laptop" }),
    ).toHaveCount(0);

    // Toggle "Only open" off
    const onlyOpenToggle = getOnlyOpenToggle(drawer);
    await onlyOpenToggle.click();

    // With "Only open" off, resolved items become visible with item-completed styling
    const buildRow = drawer.locator('.modal-item[role="option"]', { hasText: "build" });
    await expect(buildRow).toBeVisible();
    // The done style sits on the row's text, as it always has.
    await expect(buildRow.locator(".item-completed")).toBeVisible();

    const laptopRow = drawer.locator('.modal-item[role="option"]', { hasText: "laptop" });
    await expect(laptopRow).toBeVisible();
    await expect(laptopRow.locator(".item-completed")).toBeVisible();

    // Toggle "Only open" back on: resolved items should be hidden again
    await onlyOpenToggle.click();
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "build" }),
    ).toHaveCount(0);
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "laptop" }),
    ).toHaveCount(0);
  });

  test("the chevron collapses and expands on click", async ({ page }) => {
    const drawer = await setupActionDrawer(page);

    const releaseRow = drawer.locator('.modal-item[role="option"]', {
      hasText: "release 0.34",
    });
    const chevron = releaseRow.locator("button.group-chevron");

    // Starts expanded
    await expect(chevron).toHaveAttribute("aria-expanded", "true");
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "changelog" }),
    ).toBeVisible();
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "announce" }),
    ).toBeVisible();

    // Click to collapse
    await chevron.click();
    await expect(chevron).toHaveAttribute("aria-expanded", "false");
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "changelog" }),
    ).toHaveCount(0);
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "announce" }),
    ).toHaveCount(0);

    // Progress counter remains visible while collapsed
    await expect(releaseRow.locator(".item-progress")).toHaveText("1/3");

    // Click again to expand
    await chevron.click();
    await expect(chevron).toHaveAttribute("aria-expanded", "true");
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "changelog" }),
    ).toBeVisible();
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "announce" }),
    ).toBeVisible();
  });

  test("ArrowLeft and ArrowRight collapse and expand with an empty filter", async ({
    page,
  }) => {
    const drawer = await setupActionDrawer(page);

    // Verify filter input is empty
    const filterInput = getFilterInput(drawer);
    await expect(filterInput).toHaveValue("");

    const releaseRow = drawer.locator('.modal-item[role="option"]', {
      hasText: "release 0.34",
    });
    const chevron = releaseRow.locator("button.group-chevron");

    // Select the parent row release 0.34
    await releaseRow.hover();

    // ArrowLeft on an expanded parent collapses it
    await page.keyboard.press("ArrowLeft");
    await expect(chevron).toHaveAttribute("aria-expanded", "false");
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "changelog" }),
    ).toHaveCount(0);

    // ArrowRight on a collapsed parent expands it
    await page.keyboard.press("ArrowRight");
    await expect(chevron).toHaveAttribute("aria-expanded", "true");
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "changelog" }),
    ).toBeVisible();
  });

  test("clicking the chevron does not close a dialog or jump", async ({ page }) => {
    const drawer = await setupActionDrawer(page);

    const releaseRow = drawer.locator('.modal-item[role="option"]', {
      hasText: "release 0.34",
    });
    const chevron = releaseRow.locator("button.group-chevron");

    // Clicking the chevron should stop propagation so the drawer does not close
    // and navigation to the line does not occur
    await chevron.click();
    await expect(drawer).toBeVisible();
    await expect(chevron).toHaveAttribute("aria-expanded", "false");

    // Clicking again keeps the drawer open
    await chevron.click();
    await expect(drawer).toBeVisible();
    await expect(chevron).toHaveAttribute("aria-expanded", "true");
  });

  test("Ctrl+Space on a step row changes only that step's symbol in the note", async ({
    page,
  }) => {
    const drawer = await setupActionDrawer(page);

    // Locate the step row for "accounts"
    const accountsRow = drawer.locator('.modal-item[role="option"]', {
      hasText: "accounts",
    });
    await expect(accountsRow).toBeVisible();

    // Select the step row
    await accountsRow.hover();

    // Cycle action symbol on the selected step row
    await page.keyboard.press("ControlOrMeta+Space");

    // Read the active note content directly from app state
    const content = await activeTabContent(page);

    // Only the step's symbol changed (from '# ' to 'v ', '> ', or 'x ')
    expect(content).not.toContain("=> # accounts");
    expect(content).toMatch(/=> [vx>] accounts/);

    // The line parent (# onboard Lee) and other steps remain intact
    expect(content).toContain("# onboard Lee");
    expect(content).toContain("=> v laptop");
    expect(content).toContain("=> # intro meeting");
  });

  test("typing a child's text in the filter shows the child with its parent", async ({
    page,
  }) => {
    const drawer = await setupActionDrawer(page);

    const filterInput = getFilterInput(drawer);
    await filterInput.fill("changelog");

    // The parent is shown as context (with .context-row class)
    const releaseRow = drawer.locator('.modal-item[role="option"]', {
      hasText: "release 0.34",
    });
    await expect(releaseRow).toBeVisible();
    await expect(releaseRow).toHaveClass(/context-row/);

    // The matching child is shown without .context-row
    const changelogRow = drawer.locator('.modal-item[role="option"]', {
      hasText: "changelog",
    });
    await expect(changelogRow).toBeVisible();
    await expect(changelogRow).not.toHaveClass(/context-row/);

    // Sibling child and other groups are not shown
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "announce" }),
    ).toHaveCount(0);
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "onboard Lee" }),
    ).toHaveCount(0);
    await expect(
      drawer.locator('.modal-item[role="option"]', { hasText: "standalone action" }),
    ).toHaveCount(0);
  });
});

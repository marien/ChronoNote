import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  seedApp,
  editor,
  modalCard,
  MODAL_LABELS,
  datePicker,
  parkMouse,
  todayFilename,
} from "./helpers";
import { KNOWN_VIOLATIONS } from "./a11y-known";

async function openMain(page: Page) {
  await seedApp(page, { seed: "busy-week" });
}

async function openCommandPalette(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await parkMouse(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(modalCard(page, MODAL_LABELS.commandPalette)).toBeVisible();
}

async function openSearch(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await parkMouse(page);
  await page.keyboard.press("ControlOrMeta+Shift+F");
  await expect(modalCard(page, MODAL_LABELS.search)).toBeVisible();
}

async function openActionsDrawer(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Shift+A");
  await expect(page.locator(".actions-pane")).toBeVisible();
}

async function openSectionHistory(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Shift+H");
  await expect(page.locator(".history-pane")).toBeVisible();
}

async function openDatePicker(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await parkMouse(page);
  await page.keyboard.press("ControlOrMeta+o");
  await expect(datePicker(page)).toBeVisible();
}

async function openSettingsAppearance(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  const settings = page.locator(".settings-modal-card, .settings-page");
  await expect(settings).toBeVisible();
}

async function openSettingsNotesAndSync(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  const settings = page.locator(".settings-modal-card, .settings-page");
  await expect(settings).toBeVisible();
  await settings.getByRole("tab", { name: "Notes & Sync", exact: true }).click();
  await expect(settings.getByRole("tabpanel")).toBeVisible();
}

async function openSettingsAbout(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  const settings = page.locator(".settings-modal-card, .settings-page");
  await expect(settings).toBeVisible();
  await settings.getByRole("tab", { name: "About", exact: true }).click();
  await expect(settings.getByRole("tabpanel")).toBeVisible();
}

async function openAbout(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await parkMouse(page);
  await page.keyboard.press("ControlOrMeta+Shift+Comma");
  const about = modalCard(page, MODAL_LABELS.about);
  await expect(about).toBeVisible();
}

async function openLineContextMenu(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  const line = page.locator(".cm-content .cm-line").first();
  await line.click({ button: "right" });
  const menu = page.locator(".editor-context-menu");
  await expect(menu).toBeVisible();
}

async function openFindBar(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+f");
  const bar = page.locator(".find-bar");
  await expect(bar).toBeVisible();
}

async function openShortcutsDrawer(page: Page) {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await parkMouse(page);
  await page.keyboard.press("ControlOrMeta+Slash");
  const drawer = modalCard(page, MODAL_LABELS.shortcuts);
  await expect(drawer).toBeVisible();
}

async function openConfirmationDialog(page: Page) {
  await seedApp(page, {
    seed: { notes: { [todayFilename()]: "# open action to block closing" } },
  });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+w");
  const safety = modalCard(page, MODAL_LABELS.safety);
  await expect(safety).toBeVisible();
}

async function checkScreenA11y(page: Page, screenName: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  console.log(`\n=== A11y Summary: ${screenName} ===`);
  if (results.violations.length === 0) {
    console.log("  0 violations");
  } else {
    for (const v of results.violations) {
      console.log(`  Rule: ${v.id} | Impact: ${v.impact} | Count: ${v.nodes.length}`);
    }
  }

  const baseScreen = screenName.replace(/\s*\((light|dark|forced-colors)\)\s*$/i, "").trim();

  const unhandled: Array<{
    rule: string;
    impact: string | null;
    target: string;
    html: string;
    failureSummary?: string;
  }> = [];

  for (const v of results.violations) {
    if (v.impact === "serious" || v.impact === "critical") {
      for (const node of v.nodes) {
        const targetSelector = node.target.join(" ");
        const isKnown = KNOWN_VIOLATIONS.some((k) => {
          if (k.rule !== v.id) return false;
          const screenMatches =
            k.screen === "*" || k.screen === screenName || k.screen === baseScreen;
          if (!screenMatches) return false;
          const targetTokens = k.target.split(/\s+/);
          return (
            node.target.includes(k.target) ||
            targetSelector === k.target ||
            targetSelector.includes(k.target) ||
            targetTokens.every((tok) => targetSelector.includes(tok)) ||
            (node.html && node.html.includes(k.target.replace(".", "")))
          );
        });

        if (!isKnown) {
          unhandled.push({
            rule: v.id,
            impact: v.impact,
            target: targetSelector,
            html: node.html,
            failureSummary: node.failureSummary,
          });
        }
      }
    }
  }

  expect(
    unhandled,
    `Found unhandled serious/critical a11y violations on screen "${screenName}":\n${JSON.stringify(unhandled, null, 2)}`
  ).toEqual([]);
}

const DESKTOP_SCREENS: Array<{
  name: string;
  open: (page: Page) => Promise<void>;
}> = [
  { name: "Main window", open: openMain },
  { name: "Command palette", open: openCommandPalette },
  { name: "Search", open: openSearch },
  { name: "Actions drawer", open: openActionsDrawer },
  { name: "Section history", open: openSectionHistory },
  { name: "Date picker", open: openDatePicker },
  { name: "Settings - Appearance", open: openSettingsAppearance },
  { name: "Settings - Notes & Sync", open: openSettingsNotesAndSync },
  { name: "Settings - About", open: openSettingsAbout },
  { name: "About", open: openAbout },
  { name: "Line context menu", open: openLineContextMenu },
  { name: "Find bar", open: openFindBar },
  { name: "Shortcuts drawer", open: openShortcutsDrawer },
  { name: "Confirmation dialog", open: openConfirmationDialog },
];

test.describe("a11y - light theme", () => {
  test.use({ colorScheme: "light" });

  for (const screen of DESKTOP_SCREENS) {
    test(`${screen.name} (light)`, async ({ page }) => {
      await screen.open(page);
      await checkScreenA11y(page, `${screen.name} (light)`);
    });
  }
});

test.describe("a11y - phone layout (light)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  });

  test("Phone layout with Actions sheet open (light)", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    const actionsDest = page.locator(".mobile-nav-bar .mobile-nav-dest", { hasText: "Actions" });
    await expect(actionsDest).toBeVisible();
    await actionsDest.click();
    const drawer = page.locator(
      ".modal-card[aria-label='Actions'], aside.actions-pane, [role='dialog'][aria-label='Actions']"
    );
    await expect(drawer).toBeVisible();
    await checkScreenA11y(page, "Phone layout with Actions sheet open (light)");
  });
});

test.describe("a11y - dark theme", () => {
  test.use({ colorScheme: "dark" });

  for (const screen of DESKTOP_SCREENS) {
    test(`${screen.name} (dark)`, async ({ page }) => {
      await screen.open(page);
      await checkScreenA11y(page, `${screen.name} (dark)`);
    });
  }
});

test.describe("a11y - phone layout (dark)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
  });

  test("Phone layout with Actions sheet open (dark)", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    const actionsDest = page.locator(".mobile-nav-bar .mobile-nav-dest", { hasText: "Actions" });
    await expect(actionsDest).toBeVisible();
    await actionsDest.click();
    const drawer = page.locator(
      ".modal-card[aria-label='Actions'], aside.actions-pane, [role='dialog'][aria-label='Actions']"
    );
    await expect(drawer).toBeVisible();
    await checkScreenA11y(page, "Phone layout with Actions sheet open (dark)");
  });
});

test.describe("a11y - forced colors", () => {
  test.use({ contextOptions: { forcedColors: "active" } });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
  });

  test("Main window (forced-colors)", async ({ page }) => {
    await openMain(page);
    await checkScreenA11y(page, "Main window (forced-colors)");
  });

  test("Settings - Appearance (forced-colors)", async ({ page }) => {
    await openSettingsAppearance(page);
    await checkScreenA11y(page, "Settings - Appearance (forced-colors)");
  });

  test("Settings - Notes & Sync (forced-colors)", async ({ page }) => {
    await openSettingsNotesAndSync(page);
    await checkScreenA11y(page, "Settings - Notes & Sync (forced-colors)");
  });

  test("Settings - About (forced-colors)", async ({ page }) => {
    await openSettingsAbout(page);
    await checkScreenA11y(page, "Settings - About (forced-colors)");
  });
});

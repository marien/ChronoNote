import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor } from "./helpers";
import { scenario } from "../../src/lib/testing/scenarios";

interface OverflowIssue {
  locale: string;
  size: string;
  surface: string;
  selector: string;
  text: string;
  clientWidth: number;
  scrollWidth: number;
  clientHeight: number;
  scrollHeight: number;
  details: string;
}

interface KnownFault {
  locale: string;
  size: string;
  surface: string;
  selector: string;
  reason: string;
}

const ONE_LINE = [
  ".modal-counter",
  ".filter-chip",
  ".segmented-option",
  ".modal-group-header",
  ".band-title",
  "#status-bar button",
  ".tab-label",
  "button.icon-btn",
];

const KNOWN: KnownFault[] = [
];

function formatIssue(issue: OverflowIssue): string {
  return `[${issue.locale}] ${issue.size} | ${issue.surface} | ${issue.selector} | "${issue.text}" — ${issue.details}`;
}

async function findOverflows(
  page: Page,
  rootSelector: string,
  locale: string,
  surface: string,
  size = "1100x720"
): Promise<OverflowIssue[]> {
  return page.evaluate(
    ({ root, loc, surf, sz, oneLineSelectors }) => {
      const issues: OverflowIssue[] = [];
      const rootEl = document.querySelector(root);
      if (!rootEl) return issues;

      const rootRect = rootEl.getBoundingClientRect();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const containerTargetSelector =
        "button, input, label, .filter-chip, .palette-chip, .search-chip, .about-status-chip, .segmented";

      const describeEl = (el: HTMLElement): string => {
        const id = el.id ? `#${el.id}` : "";
        const stableClasses = Array.from(el.classList).filter((c) => !c.startsWith("svelte-"));
        const classes = stableClasses.length ? `.${stableClasses.join(".")}` : "";
        return `${el.tagName.toLowerCase()}${id}${classes}`;
      };

      const labelOf = (el: HTMLElement): string => {
        const raw =
          el.textContent ||
          (el as HTMLInputElement).placeholder ||
          (el as HTMLInputElement).value ||
          el.getAttribute("aria-label") ||
          "";
        return raw.trim().slice(0, 80);
      };

      const elements = rootEl.querySelectorAll("*");
      for (const el of Array.from(elements)) {
        const htmlEl = el as HTMLElement;
        const style = window.getComputedStyle(htmlEl);

        // Skip hidden elements
        if (style.display === "none" || style.visibility === "hidden" || htmlEl.offsetParent === null) {
          continue;
        }

        // Drawn glyph boxes (§346): their character is transparent and clipped on purpose (`overflow: hidden` puts
        // the box's bottom on the text baseline), so nothing visible spills over.
        if (style.color === "rgba(0, 0, 0, 0)" && style.overflowX === "hidden") {
          continue;
        }

        // Deliberate single-line truncation with an ellipsis (the full text is the element's tooltip).
        if (style.textOverflow === "ellipsis" && style.overflowX === "hidden" && style.whiteSpace === "nowrap") {
          continue;
        }

        // Skip elements designed to truncate with ellipsis (§54: section breadcrumbs capped at 50% width)
        if (htmlEl.classList.contains("item-breadcrumb")) {
          continue;
        }

        const selector = describeEl(htmlEl);

        // Check horizontal overflow on buttons, tabs, labels, headers, spans
        const isScrollable = style.overflowX === "auto" || style.overflowX === "scroll";
        if (!isScrollable) {
          if (htmlEl.scrollWidth > htmlEl.clientWidth + 1) {
            // Filter out pre/code blocks or multiline text blocks that are supposed to wrap
            const text = (htmlEl.textContent || "").trim();
            if (text && text.length < 200) {
              issues.push({
                locale: loc,
                size: sz,
                surface: surf,
                selector,
                text: text.slice(0, 80),
                clientWidth: htmlEl.clientWidth,
                scrollWidth: htmlEl.scrollWidth,
                clientHeight: htmlEl.clientHeight,
                scrollHeight: htmlEl.scrollHeight,
                details: `horizontal overflow: scrollWidth (${htmlEl.scrollWidth}px) > clientWidth (${htmlEl.clientWidth}px)`,
              });
            }
          }
        }

        // 1. Placeholder check: visible input[placeholder] and textarea[placeholder]
        if (htmlEl.matches("input[placeholder], textarea[placeholder]") && ctx) {
          const placeholder = (htmlEl as HTMLInputElement | HTMLTextAreaElement).placeholder;
          if (placeholder) {
            const font =
              style.font ||
              `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            ctx.font = font;
            const placeholderWidth = ctx.measureText(placeholder).width;
            const padLeft = parseFloat(style.paddingLeft) || 0;
            const padRight = parseFloat(style.paddingRight) || 0;
            const availableWidth = htmlEl.clientWidth - padLeft - padRight;
            if (placeholderWidth > availableWidth + 1) {
              issues.push({
                locale: loc,
                size: sz,
                surface: surf,
                selector,
                text: placeholder.slice(0, 80),
                clientWidth: htmlEl.clientWidth,
                scrollWidth: htmlEl.scrollWidth,
                clientHeight: htmlEl.clientHeight,
                scrollHeight: htmlEl.scrollHeight,
                details: `placeholder (${Math.round(placeholderWidth)}px) > input inner width (${Math.round(availableWidth)}px)`,
              });
            }
          }
        }

        // 2. One-line elements check: height > 1.6 * computed lineHeight + vertical padding + border
        if (oneLineSelectors.some((sel) => htmlEl.matches(sel)) && (htmlEl.textContent || "").trim()) {
          const fontSize = parseFloat(style.fontSize) || 14;
          const parsedLineHeight = parseFloat(style.lineHeight);
          const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.2;
          const padTop = parseFloat(style.paddingTop) || 0;
          const padBottom = parseFloat(style.paddingBottom) || 0;
          const borderTop = parseFloat(style.borderTopWidth) || 0;
          const borderBottom = parseFloat(style.borderBottomWidth) || 0;
          const maxHeight = 1.6 * lineHeight + padTop + padBottom + borderTop + borderBottom;
          const rectHeight = htmlEl.getBoundingClientRect().height;
          if (rectHeight > maxHeight) {
            issues.push({
              locale: loc,
              size: sz,
              surface: surf,
              selector,
              text: labelOf(htmlEl),
              clientWidth: htmlEl.clientWidth,
              scrollWidth: htmlEl.scrollWidth,
              clientHeight: htmlEl.clientHeight,
              scrollHeight: htmlEl.scrollHeight,
              details: `one-line element wrapped/too tall: height (${rectHeight.toFixed(1)}px) > 1.6 * lineHeight + chrome (${maxHeight.toFixed(1)}px)`,
            });
          }
        }

        // 3. Inside its container check: visible button, input, label, chip, .segmented
        if (htmlEl.matches(containerTargetSelector)) {
          const rect = htmlEl.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            let hasHorizontalScrollAncestor = false;
            let cur: HTMLElement | null = htmlEl.parentElement;
            while (cur && cur !== rootEl) {
              const curStyle = window.getComputedStyle(cur);
              if (
                (curStyle.overflowX === "auto" || curStyle.overflowX === "scroll") &&
                cur.scrollWidth > cur.clientWidth + 1
              ) {
                hasHorizontalScrollAncestor = true;
                break;
              }
              cur = cur.parentElement;
            }
            if (!hasHorizontalScrollAncestor && (rect.right > rootRect.right + 1 || rect.left < rootRect.left - 1)) {
              issues.push({
                locale: loc,
                size: sz,
                surface: surf,
                selector,
                text: labelOf(htmlEl),
                clientWidth: htmlEl.clientWidth,
                scrollWidth: htmlEl.scrollWidth,
                clientHeight: htmlEl.clientHeight,
                scrollHeight: htmlEl.scrollHeight,
                details: `outside container (${root}): element [${Math.round(rect.left)}..${Math.round(rect.right)}] vs root [${Math.round(rootRect.left)}..${Math.round(rootRect.right)}]`,
              });
            }
          }
        }
      }
      return issues;
    },
    { root: rootSelector, loc: locale, surf: surface, sz: size, oneLineSelectors: ONE_LINE }
  );
}

async function checkSurface(
  page: Page,
  rootSelector: string,
  locale: string,
  surface: string,
  size: string,
  allIssues: OverflowIssue[],
  visitedSurfaces: Set<string>
): Promise<void> {
  visitedSurfaces.add(`${size}|${surface}`);
  const issues = await findOverflows(page, rootSelector, locale, surface, size);
  allIssues.push(...issues);
}

function assertAuditResults(allIssues: OverflowIssue[], locale: string, visitedSurfaces: Set<string>): void {
  const matchedKnown = new Set<KnownFault>();
  const unexpectedIssues: OverflowIssue[] = [];

  for (const issue of allIssues) {
    const known = KNOWN.find(
      (k) =>
        k.locale === issue.locale &&
        k.size === issue.size &&
        k.surface === issue.surface &&
        k.selector === issue.selector
    );
    if (known) {
      matchedKnown.add(known);
      test.info().annotations.push({
        type: "known-fault",
        description: `${formatIssue(issue)} (${known.reason})`,
      });
    } else {
      unexpectedIssues.push(issue);
    }
  }

  const staleKnown =
    test.info().project.name === "chromium"
      ? KNOWN.filter(
          (k) => k.locale === locale && visitedSurfaces.has(`${k.size}|${k.surface}`) && !matchedKnown.has(k)
        ).map((k) => `fixed: remove it from KNOWN — [${k.locale}] ${k.size} | ${k.surface} | ${k.selector}`)
      : [];

  expect(staleKnown, "Stale entries in KNOWN").toEqual([]);
  expect(unexpectedIssues.map(formatIssue), "Unexpected layout/clipping issues").toEqual([]);
}

test.describe("Visual layout & overflow audit across locales", () => {
  for (const locale of ["en", "nl", "de"] as const) {
    test(`No layout overflow in modals or components for [${locale}]`, async ({ page }) => {
      test.setTimeout(120000);
      await seedApp(page, { seed: { ...scenario("busy-week"), languageMode: locale } });

      const allIssues: OverflowIssue[] = [];
      const visitedSurfaces = new Set<string>();
      const size = "1100x720";

      // 1. Settings Modal - Appearance
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Comma");
      await page.waitForSelector(".settings-modal-card, .settings-page");

      await checkSurface(page, ".settings-modal-card, .settings-page", locale, "Settings (Appearance)", size, allIssues, visitedSurfaces);

      // Switch to Notes & Sync tab
      const tabButtons = page.locator(".settings-tab");
      await tabButtons.nth(1).click();
      await expect(tabButtons.nth(1)).toHaveAttribute("aria-selected", "true");
      await checkSurface(page, ".settings-modal-card, .settings-page", locale, "Settings (Notes & Sync)", size, allIssues, visitedSurfaces);

      // Switch to About tab if present
      if ((await tabButtons.count()) > 2) {
        await tabButtons.nth(2).click();
        await expect(tabButtons.nth(2)).toHaveAttribute("aria-selected", "true");
        await checkSurface(page, ".settings-modal-card, .settings-page", locale, "Settings (About)", size, allIssues, visitedSurfaces);
      }

      await page.keyboard.press("Escape");
      await expect(page.locator(".settings-modal-card, .settings-page")).toHaveCount(0);

      // 2. Shortcuts Modal
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+/");
      await page.waitForSelector(".shortcuts-modal-card, .modal-card.modal-xl");
      await checkSurface(page, ".modal-card", locale, "Shortcuts", size, allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator(".shortcuts-modal-card, .modal-card.modal-xl")).toHaveCount(0);

      // 3. About Modal
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+Comma");
      await page.waitForSelector(".settings-page .about-version-card"); // §344: About is a Settings tab
      await checkSurface(page, ".settings-page", locale, "About", size, allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator(".settings-page")).toHaveCount(0);

      // 4. Command Palette
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+k");
      await page.waitForSelector(".palette-card, .modal-card");
      await checkSurface(page, ".modal-card", locale, "Command Palette", size, allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator(".palette-card, .modal-card")).toHaveCount(0);

      // 5. Section History Modal
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+h");
      await page.waitForSelector(".history-modal-card, aside.history-pane, .modal-card");
      await checkSurface(page, ".modal-card, aside.history-pane", locale, "Section History", size, allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator(".history-modal-card, aside.history-pane, .modal-card")).toHaveCount(0);

      // 6. Search Modal
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+f");
      await page.waitForSelector(".search-modal-card, .modal-card.modal-lg");
      await checkSurface(page, ".modal-card", locale, "Search", size, allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator(".search-modal-card, .modal-card.modal-lg")).toHaveCount(0);

      // 7. Action Drawer
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+a");
      await page.waitForSelector(".actions-pane-card, aside.actions-pane, .modal-card");
      await checkSurface(page, ".modal-card, aside.actions-pane", locale, "Action Drawer", size, allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator(".actions-pane-card, aside.actions-pane, .modal-card")).toHaveCount(0);

      // 8. Date Picker Modal
      await page.locator("[data-datepicker-trigger]").click();
      await page.waitForSelector(".datepicker-pop");
      await checkSurface(page, ".datepicker-pop", locale, "DatePicker", size, allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator(".datepicker-pop")).toHaveCount(0);

      // 9. Find Bar
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+f");
      await page.waitForSelector(".find-bar");
      await checkSurface(page, ".find-bar", locale, "FindBar", size, allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator(".find-bar")).toHaveCount(0);

      // 10. TopBar & StatusBar
      await checkSurface(page, "#top-bar", locale, "TopBar", size, allIssues, visitedSurfaces);
      await checkSurface(page, "#status-bar", locale, "StatusBar", size, allIssues, visitedSurfaces);

      // 11. Mobile Viewport (375x667)
      await page.setViewportSize({ width: 375, height: 667 });

      // Mobile Settings - Appearance and Notes & Sync
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Comma");
      await page.waitForSelector(".settings-modal-card, .settings-page");
      await checkSurface(page, ".settings-modal-card, .settings-page", locale, "Mobile Settings", "375x667", allIssues, visitedSurfaces);

      await page.locator(".settings-tab").nth(1).click();
      await expect(page.locator(".settings-tab").nth(1)).toHaveAttribute("aria-selected", "true");
      await checkSurface(page, ".settings-modal-card, .settings-page", locale, "Mobile Settings (Notes)", "375x667", allIssues, visitedSurfaces);

      await page.keyboard.press("Escape");
      await expect(page.locator(".settings-modal-card, .settings-page")).toHaveCount(0);

      // Mobile Tab Drawer
      const drawerBtn = page.locator("#mobile-drawer-btn");
      if (await drawerBtn.isVisible()) {
        await drawerBtn.click();
        await page.waitForSelector(".mobile-drawer-card");
        await checkSurface(page, ".mobile-drawer-card", locale, "MobileTabDrawer", "375x667", allIssues, visitedSurfaces);
        await page.locator(".drawer-close-btn").click();
        await expect(page.locator(".mobile-drawer-card")).toHaveCount(0);
      }

      // Restore desktop viewport
      await page.setViewportSize({ width: 1100, height: 720 });

      // 12. Sync Conflicts & Health Popover
      await seedApp(page, {
        seed: {
          backendKind: "web",
          languageMode: locale,
          notes: { "2026-09-26.txt": "local edit" },
          oneDriveConflicts: [{ name: "2026-09-26.txt", remote: "remote edit" }],
          oneDriveFolder: { folderId: "f1", folderPath: "/Notes" },
        },
      });

      const conflictBtn = page.locator("#stat-conflicts");
      if (await conflictBtn.isVisible()) {
        await conflictBtn.click();
        await page.waitForSelector(".modal-card");
        await checkSurface(page, ".modal-card", locale, "SyncConflictsModal", size, allIssues, visitedSurfaces);
        await page.keyboard.press("Escape");
        await expect(page.locator(".modal-card")).toHaveCount(0);
      }

      const cloudBtn = page.locator("#stat-cloud");
      if (await cloudBtn.isVisible()) {
        await cloudBtn.click();
        await page.waitForSelector("#telemetry-popover");
        await checkSurface(page, "#telemetry-popover", locale, "SyncHealthPopover", size, allIssues, visitedSurfaces);
        await cloudBtn.click();
        await expect(page.locator("#telemetry-popover")).toHaveCount(0);
      }

      // 13. Narrowest docked panes: 1000x720 with actionsPaneShare=0.18, historyPaneShare=0.18
      await page.setViewportSize({ width: 1000, height: 720 });
      await seedApp(page, {
        seed: {
          ...scenario("busy-week"),
          languageMode: locale,
          actionsPaneShare: 0.18,
          historyPaneShare: 0.18,
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+a");
      await page.waitForSelector("aside.actions-pane");
      await checkSurface(page, "aside.actions-pane", locale, "Action Drawer (docked)", "1000x720", allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator("aside.actions-pane")).toHaveCount(0);

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+h");
      await page.waitForSelector("aside.history-pane");
      await checkSurface(page, "aside.history-pane", locale, "Section History (docked)", "1000x720", allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator("aside.history-pane")).toHaveCount(0);

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+k");
      await page.waitForSelector("aside.week-review-pane");
      await checkSurface(page, "aside.week-review-pane", locale, "Week Review (docked)", "1000x720", allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator("aside.week-review-pane")).toHaveCount(0);

      // 14. Wide docked panes: 1600x900 with actionsPaneShare=0.30, historyPaneShare=0.30
      await page.setViewportSize({ width: 1600, height: 900 });
      await seedApp(page, {
        seed: {
          ...scenario("busy-week"),
          languageMode: locale,
          actionsPaneShare: 0.30,
          historyPaneShare: 0.30,
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+a");
      await page.waitForSelector("aside.actions-pane");
      await checkSurface(page, "aside.actions-pane", locale, "Action Drawer (docked)", "1600x900", allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator("aside.actions-pane")).toHaveCount(0);

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+h");
      await page.waitForSelector("aside.history-pane");
      await checkSurface(page, "aside.history-pane", locale, "Section History (docked)", "1600x900", allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator("aside.history-pane")).toHaveCount(0);

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+k");
      await page.waitForSelector("aside.week-review-pane");
      await checkSurface(page, "aside.week-review-pane", locale, "Week Review (docked)", "1600x900", allIssues, visitedSurfaces);
      await page.keyboard.press("Escape");
      await expect(page.locator("aside.week-review-pane")).toHaveCount(0);

      await checkSurface(page, "#top-bar", locale, "TopBar", "1600x900", allIssues, visitedSurfaces);
      await checkSurface(page, "#status-bar", locale, "StatusBar", "1600x900", allIssues, visitedSurfaces);

      assertAuditResults(allIssues, locale, visitedSurfaces);
    });
  }
});

test.describe("Visual layout & overflow audit on phone (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const locale of ["en", "nl", "de"] as const) {
    test(`No layout overflow on phone for [${locale}]`, async ({ page }) => {
      test.setTimeout(60000);
      await seedApp(page, { seed: { ...scenario("busy-week"), languageMode: locale } });
      const size = "390x844";
      const allIssues: OverflowIssue[] = [];
      const visitedSurfaces = new Set<string>();

      // 1. App bar
      await checkSurface(page, "#top-bar", locale, "Phone AppBar", size, allIssues, visitedSurfaces);

      // 2. Bottom bar
      await checkSurface(page, ".mobile-nav-bar", locale, "Phone BottomBar", size, allIssues, visitedSurfaces);

      // 3. Actions sheet
      await page.locator(".mobile-nav-bar .mobile-nav-dest").nth(1).click();
      await page.waitForSelector(".modal-card");
      await checkSurface(page, ".modal-card", locale, "Phone Actions Sheet", size, allIssues, visitedSurfaces);
      await page.locator(".modal-card .modal-close-btn").click();
      await expect(page.locator(".modal-card")).toHaveCount(0);

      // 4. More sheet
      await page.locator(".mobile-more-btn").click();
      await page.waitForSelector(".more-actions-pop");
      await checkSurface(page, ".more-actions-pop", locale, "Phone More Sheet", size, allIssues, visitedSurfaces);

      // 5. Settings
      await page.locator(".more-actions-pop .more-actions-item").last().click();
      await page.waitForSelector(".settings-modal-card");
      await checkSurface(page, ".settings-modal-card", locale, "Phone Settings (Appearance)", size, allIssues, visitedSurfaces);

      const tabButtons = page.locator(".settings-tab");
      if ((await tabButtons.count()) > 1) {
        await tabButtons.nth(1).click();
        await expect(tabButtons.nth(1)).toHaveAttribute("aria-selected", "true");
        await checkSurface(page, ".settings-modal-card", locale, "Phone Settings (Notes & Sync)", size, allIssues, visitedSurfaces);
      }
      if ((await tabButtons.count()) > 2) {
        await tabButtons.nth(2).click();
        await expect(tabButtons.nth(2)).toHaveAttribute("aria-selected", "true");
        await checkSurface(page, ".settings-modal-card", locale, "Phone Settings (About)", size, allIssues, visitedSurfaces);
      }

      await page.locator(".settings-modal-card .modal-close-btn").click();
      await expect(page.locator(".settings-modal-card")).toHaveCount(0);

      assertAuditResults(allIssues, locale, visitedSurfaces);
    });
  }
});

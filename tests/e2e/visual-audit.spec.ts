import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor } from "./helpers";
import { scenario } from "../../src/lib/testing/scenarios";

interface OverflowIssue {
  locale: string;
  modal: string;
  selector: string;
  text: string;
  clientWidth: number;
  scrollWidth: number;
  clientHeight: number;
  scrollHeight: number;
  details?: string;
}

async function findOverflows(page: Page, rootSelector: string, locale: string, modalName: string): Promise<OverflowIssue[]> {
  return page.evaluate(
    ({ root, loc, mod }) => {
      const issues: OverflowIssue[] = [];
      const rootEl = document.querySelector(root);
      if (!rootEl) return issues;

      const elements = rootEl.querySelectorAll("*");
      for (const el of Array.from(elements)) {
        const htmlEl = el as HTMLElement;
        const style = window.getComputedStyle(htmlEl);

        // Skip hidden elements
        if (style.display === "none" || style.visibility === "hidden" || htmlEl.offsetParent === null) {
          continue;
        }

        // Skip elements designed to truncate with ellipsis (§54: section breadcrumbs capped at 50% width)
        if (htmlEl.classList.contains("item-breadcrumb")) {
          continue;
        }

        // Check horizontal overflow on buttons, tabs, labels, headers, spans
        const isScrollable = style.overflowX === "auto" || style.overflowX === "scroll";
        if (!isScrollable) {
          if (htmlEl.scrollWidth > htmlEl.clientWidth + 1) {
            // Filter out pre/code blocks or multiline text blocks that are supposed to wrap
            const text = (htmlEl.textContent || "").trim();
            if (text && text.length < 200) {
              issues.push({
                locale: loc,
                modal: mod,
                selector: htmlEl.tagName.toLowerCase() + (htmlEl.className ? "." + htmlEl.className.split(" ").join(".") : ""),
                text: text.slice(0, 80),
                clientWidth: htmlEl.clientWidth,
                scrollWidth: htmlEl.scrollWidth,
                clientHeight: htmlEl.clientHeight,
                scrollHeight: htmlEl.scrollHeight,
                details: `scrollWidth (${htmlEl.scrollWidth}px) > clientWidth (${htmlEl.clientWidth}px)`,
              });
            }
          }
        }
      }
      return issues;
    },
    { root: rootSelector, loc: locale, mod: modalName }
  );
}

test.describe("Visual layout & overflow audit across locales", () => {
  for (const locale of ["en", "nl", "de"] as const) {
    test(`No layout overflow in modals or components for [${locale}]`, async ({ page }) => {
      test.setTimeout(60000);
      await seedApp(page, { seed: { ...scenario("busy-week"), languageMode: locale } });

      const allIssues: OverflowIssue[] = [];

      // 1. Settings Modal - Appearance
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Comma");
      await page.waitForSelector(".settings-modal-card");

      let issues = await findOverflows(page, ".settings-modal-card", locale, "Settings (Appearance)");
      allIssues.push(...issues);

      // Switch to Notes & Sync tab
      const tabButtons = page.locator(".settings-tab");
      await tabButtons.nth(1).click();
      await page.waitForTimeout(100);
      issues = await findOverflows(page, ".settings-modal-card", locale, "Settings (Notes & Sync)");
      allIssues.push(...issues);

      // Switch to Updates tab if present
      if ((await tabButtons.count()) > 2) {
        await tabButtons.nth(2).click();
        await page.waitForTimeout(100);
        issues = await findOverflows(page, ".settings-modal-card", locale, "Settings (Updates)");
        allIssues.push(...issues);
      }

      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      // 2. Shortcuts Modal
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+/");
      await page.waitForSelector(".shortcuts-modal-card, .modal-card.modal-xl");
      issues = await findOverflows(page, ".modal-card", locale, "Shortcuts");
      allIssues.push(...issues);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      // 3. About Modal
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+Comma");
      await page.waitForSelector(".modal-card.modal-sm");
      issues = await findOverflows(page, ".modal-card", locale, "About");
      allIssues.push(...issues);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      // 4. Command Palette
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+k");
      await page.waitForSelector(".palette-card, .modal-card");
      issues = await findOverflows(page, ".modal-card", locale, "Command Palette");
      allIssues.push(...issues);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      // 5. Section History Modal
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+h");
      await page.waitForSelector(".history-modal-card, .modal-card");
      issues = await findOverflows(page, ".modal-card", locale, "Section History");
      allIssues.push(...issues);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      // 6. Search Modal
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+f");
      await page.waitForSelector(".search-modal-card, .modal-card.modal-lg");
      issues = await findOverflows(page, ".modal-card", locale, "Search");
      allIssues.push(...issues);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      // 7. Action Drawer
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+a");
      await page.waitForSelector(".action-drawer-card, .modal-card");
      issues = await findOverflows(page, ".modal-card", locale, "Action Drawer");
      allIssues.push(...issues);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      // 8. Date Picker Modal
      await page.locator("[data-datepicker-trigger]").click();
      await page.waitForSelector(".datepicker-pop");
      issues = await findOverflows(page, ".datepicker-pop", locale, "DatePicker");
      allIssues.push(...issues);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      // 9. Find Bar
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+f");
      await page.waitForSelector(".find-bar");
      issues = await findOverflows(page, ".find-bar", locale, "FindBar");
      allIssues.push(...issues);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      // 10. TopBar & StatusBar
      issues = await findOverflows(page, "#top-bar", locale, "TopBar");
      allIssues.push(...issues);
      issues = await findOverflows(page, "#status-bar", locale, "StatusBar");
      allIssues.push(...issues);

      // 11. Mobile Viewport (375x667)
      await page.setViewportSize({ width: 375, height: 667 });

      // Mobile Settings - Appearance and Notes & Sync
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Comma");
      await page.waitForSelector(".settings-modal-card");
      issues = await findOverflows(page, ".settings-modal-card", locale, "Mobile Settings");
      allIssues.push(...issues);

      await page.locator(".settings-tab").nth(1).click();
      await page.waitForTimeout(100);
      issues = await findOverflows(page, ".settings-modal-card", locale, "Mobile Settings (Notes)");
      allIssues.push(...issues);

      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      // Mobile Tab Drawer
      const drawerBtn = page.locator("#mobile-drawer-btn");
      if (await drawerBtn.isVisible()) {
        await drawerBtn.click();
        await page.waitForSelector(".mobile-drawer-card");
        issues = await findOverflows(page, ".mobile-drawer-card", locale, "MobileTabDrawer");
        allIssues.push(...issues);
        await page.locator(".drawer-close-btn").click();
        await page.waitForTimeout(150);
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
        issues = await findOverflows(page, ".modal-card", locale, "SyncConflictsModal");
        allIssues.push(...issues);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);
      }

      const cloudBtn = page.locator("#stat-cloud");
      if (await cloudBtn.isVisible()) {
        await cloudBtn.click();
        await page.waitForSelector("#telemetry-popover");
        issues = await findOverflows(page, "#telemetry-popover", locale, "SyncHealthPopover");
        allIssues.push(...issues);
        await cloudBtn.click();
        await page.waitForTimeout(150);
      }

      expect(allIssues).toEqual([]);
    });
  }
});

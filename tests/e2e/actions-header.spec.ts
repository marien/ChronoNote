import { test, expect } from "@playwright/test";
import { openViaShortcut, seedApp } from "./helpers";

const WIDTHS = [180, 240, 330, 500] as const;
const LANGUAGES = ["nl", "de", "en"] as const;

test.describe("Actions & Week Review header redesign (U1)", () => {
  for (const languageMode of LANGUAGES) {
    for (const width of WIDTHS) {
      test(`header fits cleanly without clipping (${languageMode}, ${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width: 1000, height: 800 });
        await seedApp(page, {
          seed: {
            ...((await import("../../src/lib/testing/scenarios")).scenario("busy-week")),
            languageMode,
            actionsPaneShare: width / 1000,
          },
        });

        await page.keyboard.press("ControlOrMeta+Shift+A");
        const pane = page.locator("aside.actions-pane");
        await expect(pane).toBeVisible();

        // Wait for ResizeObserver to settle the pane width class before measuring.
        if (width < 300) {
          await expect(pane.locator(".actions-header-row-2.is-narrow")).toBeVisible();
        } else {
          await expect(pane.locator(".actions-header-row-2:not(.is-narrow)")).toBeVisible();
        }

        const metrics = await pane.evaluate((aside) => {
          const paneRect = aside.getBoundingClientRect();
          const input = aside.querySelector<HTMLInputElement>(".actions-header-row-1 .modal-input")!;
          const row1Buttons = Array.from(
            aside.querySelectorAll<HTMLElement>(".actions-header-row-1 button"),
          );
          const row2Controls = Array.from(
            aside.querySelectorAll<HTMLElement>(
              ".actions-header-row-2 .filter-chip, .actions-header-row-2 .segmented-option",
            ),
          );
          const counter = aside.querySelector<HTMLElement>(".actions-header-counter")!;

          const overflowIssues: string[] = [];
          const checkElement = (label: string, el: HTMLElement) => {
            const rect = el.getBoundingClientRect();
            if (rect.right > paneRect.right + 0.5) {
              overflowIssues.push(`${label}: rect.right=${rect.right.toFixed(1)} > paneRect.right=${paneRect.right.toFixed(1)}`);
            }
            if (rect.left < paneRect.left - 0.5) {
              overflowIssues.push(`${label}: rect.left=${rect.left.toFixed(1)} < paneRect.left=${paneRect.left.toFixed(1)}`);
            }
            if (el.scrollWidth > el.clientWidth + 1) {
              overflowIssues.push(`${label}: scrollWidth=${el.scrollWidth} > clientWidth=${el.clientWidth}`);
            }
          };

          checkElement("filter-input", input);
          row1Buttons.forEach((btn, idx) => checkElement(`row1-btn-${idx}`, btn));
          row2Controls.forEach((ctrl, idx) =>
            checkElement(`row2-ctrl-${idx}(${ctrl.textContent?.trim()})`, ctrl),
          );
          checkElement("counter", counter);

          const counterStyle = getComputedStyle(counter);
          const counterLineHeight = parseFloat(counterStyle.lineHeight) || parseFloat(counterStyle.fontSize) * 1.4;
          const counterHeight = counter.getBoundingClientRect().height;

          const inputStyle = getComputedStyle(input);
          const padLeft = parseFloat(inputStyle.paddingLeft) || 0;
          const padRight = parseFloat(inputStyle.paddingRight) || 0;
          const inputInnerWidth = input.clientWidth - padLeft - padRight;

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;
          ctx.font = `${inputStyle.fontWeight} ${inputStyle.fontSize} ${inputStyle.fontFamily}`;
          const placeholderWidth = ctx.measureText(input.placeholder).width;

          return {
            paneWidth: paneRect.width,
            overflowIssues,
            counterHeight,
            counterLineHeight,
            placeholder: input.placeholder,
            placeholderWidth,
            inputInnerWidth,
          };
        });

        expect(metrics.paneWidth).toBeCloseTo(width, 0);
        expect(metrics.overflowIssues).toEqual([]);
        expect(metrics.counterHeight).toBeLessThan(1.6 * metrics.counterLineHeight);
        expect(metrics.placeholderWidth).toBeLessThanOrEqual(metrics.inputInnerWidth + 0.5);
      });
    }
  }

  test("Only open filter-chip toggles aria-pressed and disables on is:open", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await seedApp(page, { seed: "busy-week" });

    const pane = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const onlyOpenChip = pane.locator(".actions-header-row-2 .filter-chip", { hasText: "Only open" });
    await expect(onlyOpenChip).toHaveAttribute("aria-pressed", "true");

    const openOnlyCount = await pane.locator(".modal-item").count();
    await onlyOpenChip.click();
    await expect(onlyOpenChip).toHaveAttribute("aria-pressed", "false");
    const allItemsCount = await pane.locator(".modal-item").count();
    expect(allItemsCount).toBeGreaterThan(openOnlyCount);

    await onlyOpenChip.click();
    await expect(onlyOpenChip).toHaveAttribute("aria-pressed", "true");
    await expect(pane.locator(".modal-item")).toHaveCount(openOnlyCount);

    const filterInput = pane.locator(".actions-header-row-1 .modal-input");
    await filterInput.fill("is:open");
    await expect(onlyOpenChip).toBeDisabled();
  });

  test("under 300px, scope chip opens menu and switches scope via keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await seedApp(page, {
      seed: {
        ...((await import("../../src/lib/testing/scenarios")).scenario("busy-week")),
        actionsPaneShare: 0.24,
      },
    });

    const pane = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await expect(pane.locator(".actions-header-row-2.is-narrow")).toBeVisible();
    await expect(pane.locator(".actions-header-row-2 .segmented")).toHaveCount(0);

    const scopeChip = pane.locator(".actions-header-row-2 .scope-chip");
    await expect(scopeChip).toContainText("Open tabs");
    const initialCount = await pane.locator(".modal-item").count();

    await scopeChip.focus();
    await page.keyboard.press("Enter");

    const menu = page.locator(".actions-scope-pop[role='menu']");
    await expect(menu).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(menu).toHaveCount(0);
    await expect(scopeChip).toContainText("All");
    const allCount = await pane.locator(".modal-item").count();
    expect(allCount).toBeGreaterThanOrEqual(initialCount);
  });

  test("? help popover in Actions and Week review opens, shows hints, and Escape closes without closing pane", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await seedApp(page, { seed: "busy-week" });

    // Actions pane help popover
    const actionsPane = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const actionsHelpBtn = actionsPane.locator(".actions-header-row-1 .modal-help-btn");
    await actionsHelpBtn.click();

    const pop = page.locator(".header-help-pop");
    await expect(pop).toBeVisible();
    await expect(pop.locator("kbd")).toHaveCount(3);
    for (const op of ["@", "is:open", "is:done", "tag:", "has:@name", "since:", "before:", "due:"]) {
      await expect(pop.locator("code", { hasText: op }).first()).toBeVisible();
    }

    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
    await expect(actionsPane).toBeVisible();
    await expect(actionsPane.locator(".actions-header-row-1 .modal-input")).toBeFocused();

    // Week review pane help popover
    const weekReviewPane = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");

    const weekHelpBtn = weekReviewPane.locator(".week-review-header .modal-help-btn");
    await weekHelpBtn.click();

    await expect(pop).toBeVisible();
    await expect(pop.locator(".help-pop-row")).toHaveCount(5);

    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
    await expect(weekReviewPane).toBeVisible();
    await expect(weekReviewPane.locator(".week-review-list")).toBeFocused();
  });

  test("no .modal-footer in Actions pane or Week review", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await seedApp(page, { seed: "busy-week" });

    const actionsPane = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await expect(actionsPane.locator(".modal-footer")).toHaveCount(0);

    const weekReviewPane = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");
    await expect(weekReviewPane.locator(".modal-footer")).toHaveCount(0);
  });
});

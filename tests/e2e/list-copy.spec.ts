import { test, expect } from "@playwright/test";
import { openViaShortcut, seedApp, toast } from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

test.describe("Copy Actions & Week Review list (F8)", () => {
  test("copies filtered Actions list, folded group, and disables on empty list", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1200, height: 800 });

    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-04.txt": [
            "Design review",
            "=============",
            "# (budget) send draft by:2026-09-18 (>2026-09-25) => # numbers from Sam => v template",
            "# (other) unrelated task",
            "",
            "1:1 Dana",
            "========",
            "# (budget) check forecast @dana",
          ].join("\n"),
        },
        session: { openTabs: [], activeTab: "" },
        languageMode: "en",
        tabLabelStyle: "friendly",
      },
    });

    const pane = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await pane.locator(".actions-header-row-2 .segmented-option", { hasText: "All" }).click();

    const filterInput = pane.locator(".actions-header-row-1 .modal-input");
    await filterInput.fill("tag:budget");

    // 3 visible actions: parent, step 1 (open), and check forecast (step 2 is done so hidden by Only open)
    await expect(pane.locator(".modal-item")).toHaveCount(3);

    const copyBtn = pane.locator('.modal-copy-btn[aria-label="Copy list"]');
    await expect(copyBtn).toBeEnabled();
    await copyBtn.click();

    await expect(toast(page)).toContainText("List copied (3 actions).");

    const { dayLabel, dueLabel, todayLabel } = await page.evaluate((refToday) => {
      const loc = "en";
      const fmtDay = (iso: string) => {
        const [y, m, d] = iso.split("-").map(Number);
        return new Intl.DateTimeFormat(loc, { weekday: "short", day: "numeric", month: "short" }).format(
          new Date(y, m - 1, d, 12),
        );
      };
      const [ty, tm, td] = refToday.split("-").map(Number);
      const todayFormatted = new Intl.DateTimeFormat(loc, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(ty, tm - 1, td, 12));
      return {
        dayLabel: fmtDay("2026-09-04"),
        dueLabel: fmtDay("2026-09-18"),
        todayLabel: todayFormatted,
      };
    }, REFERENCE_TODAY);

    await expect.poll(() =>
      page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n")),
    ).toBe(
      [
        `Actions · tag:budget · only open · ${todayLabel}`,
        "",
        `${dayLabel} · Design review`,
        `☐ (budget) send draft by ${dueLabel}`,
        "  ☐ 1. numbers from Sam",
        `${dayLabel} · 1:1 Dana`,
        "☐ (budget) check forecast @dana",
      ].join("\n"),
    );

    // Clear filter so group folding applies, then fold the parent group and copy again
    await filterInput.fill("");
    await expect(pane.locator(".modal-item")).toHaveCount(4);

    const chevron = pane.locator(".group-chevron").first();
    await chevron.click();
    await expect(pane.locator(".modal-item")).toHaveCount(3);

    await copyBtn.click();
    await expect.poll(() =>
      page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n")),
    ).toBe(
      [
        `Actions · only open · ${todayLabel}`,
        "",
        `${dayLabel} · Design review`,
        `☐ (budget) send draft by ${dueLabel} (1/2)`,
        "☐ (other) unrelated task",
        `${dayLabel} · 1:1 Dana`,
        "☐ (budget) check forecast @dana",
      ].join("\n"),
    );

    // Empty list disables the Copy button
    await filterInput.fill("tag:nonexistent");
    await expect(pane.locator(".modal-item")).toHaveCount(0);
    await expect(copyBtn).toBeDisabled();
  });

  test("copies Week review list and disables button when week has no items", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1200, height: 800 });

    // REFERENCE_TODAY is Monday 2026-09-07, so Week review opens on week 36 (2026-08-31 .. 2026-09-06).
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-03.txt": [
            "Design review",
            "=============",
            "# (budget) prepare Q4 review by:2026-09-10",
          ].join("\n"),
        },
        session: { openTabs: [], activeTab: "" },
        languageMode: "en",
        tabLabelStyle: "friendly",
      },
    });

    const weekPane = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");
    const copyBtn = weekPane.locator('.modal-copy-btn[aria-label="Copy list"]');
    await expect(copyBtn).toBeEnabled();
    await copyBtn.click();

    await expect(toast(page)).toContainText("List copied (1 actions).");

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.startsWith("Week ")).toBe(true);
    expect(clip).toContain("☐ (budget) prepare Q4 review by ");

    // Navigate to next week (which has no actions) -> Copy button is disabled
    await weekPane.locator(".week-nav-btn").nth(1).click();
    await expect(copyBtn).toBeDisabled();
  });
});

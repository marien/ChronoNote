import { test, expect } from "@playwright/test";
import { openViaShortcut, seedApp, toast } from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";
import { addDaysISO } from "../../src/lib/date";

test.describe("Actions pane copy list (independent)", () => {
  test("copies filtered All-scope actions and shows toast with count", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    const day1 = addDaysISO(REFERENCE_TODAY, -1);
    const day2 = REFERENCE_TODAY;
    const dueISO = addDaysISO(REFERENCE_TODAY, 74); // 2026-11-20 (Fri 20 Nov)

    await seedApp(page, {
      seed: {
        notes: {
          [`${day1}.txt`]: [
            "Design review",
            "=============",
            `# (budget) send draft by:${dueISO} => # numbers from Sam => v template`,
          ].join("\n"),
          [`${day2}.txt`]: [
            "1:1 Dana",
            "========",
            "# (budget) check forecast @dana",
          ].join("\n"),
        },
        session: { openTabs: [`${day2}.txt`], activeTab: `${day2}.txt` },
        languageMode: "en",
      },
    });

    const pane = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await pane.locator(".actions-header-row-2 .segmented-option", { hasText: "All" }).click();

    const filterInput = pane.locator(".actions-header-row-1 .modal-input");
    await filterInput.fill("tag:budget");

    const bands = pane.locator(".band.modal-group-header:not(.modal-group-header-sticky) .band-date");
    await expect(bands).toHaveCount(2);

    const bandOrder = await bands.evaluateAll((els) =>
      els.map((el) => ({
        iso: el.getAttribute("title") ?? "",
        label: el.textContent?.trim() ?? "",
      })),
    );

    // Review: the due date follows the app's language through Intl (en: "Fri, Nov 20"; the brief's example is en-GB).
    const dueLabel = await page.evaluate((iso) => {
      const [y, m, d] = iso.split("-").map(Number);
      return new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short" }).format(new Date(y, m - 1, d, 12));
    }, dueISO);

    const buildExpectedGroups = (includeDoneStep: boolean): string[] => {
      const out: string[] = [];
      for (const band of bandOrder) {
        if (band.iso === day1) {
          out.push(
            `${band.label} · Design review`,
            `☐ (budget) send draft by ${dueLabel}`,
            "  ☐ 1. numbers from Sam",
          );
          if (includeDoneStep) {
            out.push("  ☑ 2. template");
          }
        } else if (band.iso === day2) {
          out.push(
            `${band.label} · 1:1 Dana`,
            "☐ (budget) check forecast @dana",
          );
        }
      }
      return out;
    };

    const copyBtn = pane.getByRole("button", { name: "Copy list" });
    await expect(copyBtn).toBeEnabled();
    await copyBtn.click();

    await expect(toast(page)).toContainText("List copied (3");

    const openOnlyClip = await page.evaluate(() => navigator.clipboard.readText());
    const openOnlyLines = openOnlyClip.split(/\r?\n/); // Review: the Windows clipboard returns CRLF.
    expect(openOnlyLines[0].startsWith("Actions · tag:budget")).toBe(true);
    expect(openOnlyLines[0]).toContain(" · only open · ");
    expect(openOnlyLines[1]).toBe("");
    expect(openOnlyLines.slice(2)).toEqual(buildExpectedGroups(false));

    // Toggle "Only open" off so the done step is included too.
    const onlyOpenChip = pane.locator(".actions-header-row-2 .filter-chip", { hasText: "Only open" });
    await onlyOpenChip.click();
    await expect(onlyOpenChip).toHaveAttribute("aria-pressed", "false");
    await expect(pane.locator(".modal-item.action-row")).toHaveCount(4);

    await copyBtn.click();
    await expect(toast(page)).toContainText("List copied (4");

    const allClip = await page.evaluate(() => navigator.clipboard.readText());
    const allLines = allClip.split(/\r?\n/);
    expect(allLines[0].startsWith("Actions · tag:budget")).toBe(true);
    expect(allLines[0]).not.toContain("only open");
    expect(allLines[1]).toBe("");
    expect(allLines.slice(2)).toEqual(buildExpectedGroups(true));
  });

  test("Copy list button is disabled when the list is empty", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await seedApp(page, { seed: "empty" });

    const pane = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const copyBtn = pane.getByRole("button", { name: "Copy list" });
    await expect(copyBtn).toBeDisabled();
  });
});

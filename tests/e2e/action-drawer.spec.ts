import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  openViaShortcut,
  modalCard,
  MODAL_LABELS,
  currentModal,
  mockNote,
  activeTabLabel,
} from "./helpers";

const drawer = (page: Page) => modalCard(page, MODAL_LABELS.actions);
const rows = (page: Page) => drawer(page).locator('.modal-item[role="option"]');
const filterInput = (page: Page) => drawer(page).locator(".modal-input");

test.describe("action drawer (Ctrl+Shift+A)", () => {
  test("opens and lists actions from the open tabs", async ({ page }) => {
    await seedApp(page, { seed: "delegation" });
    await openViaShortcut(page, "Control+Shift+A", "actions");

    await expect(rows(page).first()).toBeVisible();
    await expect(drawer(page)).toContainText("send the recap email");
  });

  test("'Only Open' narrows to # / => # ; toggling it off reveals resolved lines", async ({ page }) => {
    await seedApp(page, { seed: "delegation" });
    const d = await openViaShortcut(page, "Control+Shift+A", "actions");

    await expect(d).not.toContainText("agreed on the rollout order"); // a `v ` line
    await d.getByText("Only Open", { exact: false }).click();
    await expect(d).toContainText("agreed on the rollout order");
    await expect(d).toContainText("drop the Linux build"); // an `x ` line
  });

  test("'All Files' scope pulls actions from notes that aren't open tabs", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    const d = await openViaShortcut(page, "Control+Shift+A", "actions");

    // The list is virtualized (only ~10 rows in the DOM at once) — read the
    // "N open / M listed" counter rather than counting elements.
    const listed = async () => {
      const t = (await d.locator(".modal-counter").textContent()) ?? "";
      return Number(t.match(/\/\s*(\d+)\s*listed/)?.[1] ?? 0);
    };
    const openScope = await listed();
    await d.getByRole("radio", { name: "All Files" }).click();
    await expect.poll(listed).toBeGreaterThan(openScope);
  });

  test("typing '@' in the filter reveals delegated lines", async ({ page }) => {
    await seedApp(page, { seed: "delegation" });
    const d = await openViaShortcut(page, "Control+Shift+A", "actions");

    // Delegated `=> @name` lines have no action-state of their own, so
    // they're out of scope for "Only Open" — turn it off first.
    await d.getByText("Only Open", { exact: false }).click();
    await expect(d).not.toContainText("draft the migration plan"); // still hidden — no `@` in the filter yet
    await filterInput(page).fill("@priya");
    await expect(d).toContainText("draft the migration plan");
    await expect(d).not.toContainText("review the API shape"); // => @Dana, filtered out by "@priya"
  });

  test("Ctrl+Space on a row cycles that action's state and persists it to the source note", async ({ page }) => {
    await seedApp(page, { seed: "delegation" });
    const d = await openViaShortcut(page, "Control+Shift+A", "actions");

    // Turn Only Open off so the row survives being marked done and we can
    // watch the glyph change in place.
    await d.getByText("Only Open", { exact: false }).click();
    await filterInput(page).fill("recap email");
    const row = rows(page).first();
    await expect(row).toContainText("send the recap email");
    await expect(row.locator("span").first()).toHaveText("☐");

    await filterInput(page).focus();
    await page.keyboard.press("Control+Space");

    await expect(row.locator("span").first()).toHaveText("☑");
    await expect.poll(() => mockNote(page, "2026-09-07.txt")).toContain("=> v send the recap email");
  });

  test("Shift+Enter forwards an action to today: source -> '>', today gets '#' on top", async ({ page }) => {
    await seedApp(page, { seed: "delegation" });
    await openViaShortcut(page, "Control+Shift+A", "actions");

    await filterInput(page).fill("signing cert");
    await expect(rows(page).first()).toContainText("chase the signing cert renewal");
    await filterInput(page).focus();
    await page.keyboard.press("Shift+Enter");

    await expect.poll(() => mockNote(page, "2026-09-04.txt")).toContain("> chase the signing cert renewal");
    await expect.poll(() => mockNote(page, "2026-09-07.txt")).toMatch(/^# chase the signing cert renewal/);
  });

  test("Enter jumps to the line: modal closes, the file opens, cursor lands on it", async ({ page }) => {
    await seedApp(page, { seed: "delegation" });
    await openViaShortcut(page, "Control+Shift+A", "actions");

    await filterInput(page).fill("cert renewal");
    await expect(rows(page).first()).toContainText("chase the signing cert renewal");
    await filterInput(page).focus();
    await page.keyboard.press("Enter");

    await expect(drawer(page)).toBeHidden();
    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText(/2026-09-0[24]/);
    await expect(editor(page)).toContainText("chase the signing cert renewal");
  });
});

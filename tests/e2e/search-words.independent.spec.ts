import { expect, test, type Page } from "@playwright/test";
import { editor, MODAL_LABELS, modalCard, seedApp, todayFilename } from "./helpers";

const REFERENCE_NOTE = [
  "above the first section => not in a section",
  "Board meeting",
  "===",
  ". budget => we keep the Q1 numbers",
  "# call Sam => yes",
  "=> # follow up",
  "! the hall is booked",
  "",
  "Design review",
  "===",
  "=> moved to March",
].join("\n");

const search = (page: Page) => modalCard(page, MODAL_LABELS.search);
const rows = (m: ReturnType<typeof search>) => m.locator('.modal-item[role="option"]');

test.describe("search words (section: and is:decision)", () => {
  test("filters by section:board is:decision, shows both chips, and removing section:board leaves is:decision with four results", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: REFERENCE_NOTE,
        },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    await expect(search(page)).toBeVisible();

    await search(page).locator(".modal-input").fill("section:board is:decision");

    const chips = search(page).locator(".search-chip");
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toContainText("section:board");
    await expect(chips.nth(1)).toContainText("is:decision");
    await expect(rows(search(page))).toHaveCount(2);

    await chips.filter({ hasText: "section:board" }).locator(".chip-remove-btn").click();

    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText("is:decision");
    await expect(rows(search(page))).toHaveCount(4);
  });
});

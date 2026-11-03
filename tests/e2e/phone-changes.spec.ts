import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  toast,
  activeTabContent,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

const NOTE_CONTENT = [
  "Planning",
  "========",
  "# call the venue",
  "# book the room",
  "",
].join("\n");

const INBOX_CONTENT = JSON.stringify({
  format: 1,
  writer: "test",
  requests: [
    {
      id: "req-applied",
      type: "setState",
      date: REFERENCE_TODAY,
      section: "Planning",
      line: "# call the venue",
      n: 3,
      state: "done",
    },
    {
      id: "req-conflict",
      type: "setState",
      date: REFERENCE_TODAY,
      section: "Planning",
      line: "# old missing task",
      n: 4,
      state: "done",
    },
  ],
});

async function runApplyPhoneChanges(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.locator('.modal-card[role="dialog"]');
  await expect(palette).toBeVisible();
  await palette.locator(".modal-input").fill("apply phone");
  const row = palette.locator('.modal-item[role="option"]', { hasText: /apply phone changes/i }).first();
  await expect(row).toBeVisible();
  await row.click();
}

test.describe("phone companion phase 2 UI", () => {
  test("apply phone changes: applies one, shows conflict dialog, user resolves to line", async ({ page }) => {
    await seedApp(page, {
      seed: {
        phoneCompanion: true,
        notes: {
          [`${REFERENCE_TODAY}.txt`]: NOTE_CONTENT,
        },
        phoneInbox: INBOX_CONTENT,
      },
    });

    await runApplyPhoneChanges(page);

    // Toast shows applied count
    await expect(toast(page)).toBeVisible();
    await expect(toast(page)).toContainText("1 change from your phone applied.");

    // Info bar shows conflict
    const infoBar = page.locator(".info-bar");
    await expect(infoBar).toBeVisible();
    await expect(infoBar.locator(".info-bar-text")).toContainText("1 change from your phone needs a look.");

    // Dialog opens with the conflict
    const dialog = modalCard(page, "Changes from your phone");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Needs a look");
    await expect(dialog).toContainText("# old missing task");

    // Select "# book the room" and apply
    await dialog.locator("label.radio-row", { hasText: "# book the room" }).click();
    const applyBtn = dialog.getByRole("button", { name: "Apply to the chosen line" });
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    // The editor now shows "v book the room" (checked box in DOM, "v book the room" in doc)
    await expect.poll(async () => activeTabContent(page)).toContain("v book the room");
    await expect(editor(page)).toContainText("book the room");

    // Info bar is gone
    await expect(page.locator(".info-bar")).toBeHidden();
  });

  test("apply phone changes: user skips conflict", async ({ page }) => {
    await seedApp(page, {
      seed: {
        phoneCompanion: true,
        notes: {
          [`${REFERENCE_TODAY}.txt`]: NOTE_CONTENT,
        },
        phoneInbox: INBOX_CONTENT,
      },
    });

    await runApplyPhoneChanges(page);

    const dialog = modalCard(page, "Changes from your phone");
    await expect(dialog).toBeVisible();

    const skipBtn = dialog.getByRole("button", { name: "Skip" });
    await skipBtn.click();

    // Info bar is gone
    await expect(page.locator(".info-bar")).toBeHidden();

    // Editor still has "# book the room"
    await expect.poll(async () => activeTabContent(page)).toContain("# book the room");
  });

  test("clicking the toast opens the dialog with the Applied list", async ({ page }) => {
    const singleAppliedInbox = JSON.stringify({
      format: 1,
      writer: "test",
      requests: [
        {
          id: "req-applied",
          type: "setState",
          date: REFERENCE_TODAY,
          section: "Planning",
          line: "# call the venue",
          n: 3,
          state: "done",
        },
      ],
    });

    await seedApp(page, {
      seed: {
        phoneCompanion: true,
        notes: {
          [`${REFERENCE_TODAY}.txt`]: NOTE_CONTENT,
        },
        phoneInbox: singleAppliedInbox,
      },
    });

    await runApplyPhoneChanges(page);

    await expect(toast(page)).toBeVisible();
    await expect(toast(page)).toContainText("1 change from your phone applied.");

    // Click toast to open modal
    await toast(page).click();

    const dialog = modalCard(page, "Changes from your phone");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Applied");
    await expect(dialog).toContainText("# call the venue");
    await expect(dialog).not.toContainText("Needs a look");
  });
});

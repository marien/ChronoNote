import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  MODAL_LABELS,
  toast,
  activeTabContent,
} from "./helpers";
import { REFERENCE_TODAY, scenario } from "../../src/lib/testing/scenarios";

function phoneChangesDialog(page: Page) {
  return page.getByRole("dialog", { name: "Changes from your phone" });
}

async function triggerApplyPhoneChanges(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+k");
  const pal = modalCard(page, MODAL_LABELS.commandPalette);
  await expect(pal).toBeVisible();
  await pal.locator(".modal-input").fill("Apply phone changes");
  const row = pal.locator('.modal-item[role="option"]', { hasText: /apply phone changes/i }).first();
  await expect(row).toBeVisible();
  await row.click();
}

test.describe("phone companion: phone changes notice and dialog", () => {
  const today = REFERENCE_TODAY;
  const todayNoteFile = `${today}.txt`;

  test("the command palette has 'Apply phone changes' when phone companion is on, and not when it is off", async ({
    page,
  }) => {
    // 1. Off
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        phoneCompanion: false,
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    const palOff = modalCard(page, MODAL_LABELS.commandPalette);
    await expect(palOff).toBeVisible();
    await palOff.locator(".modal-input").fill("Apply phone changes");
    await expect(palOff.locator('.modal-item[role="option"]', { hasText: /apply phone changes/i })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // 2. On
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        phoneCompanion: true,
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    const palOn = modalCard(page, MODAL_LABELS.commandPalette);
    await expect(palOn).toBeVisible();
    await palOn.locator(".modal-input").fill("Apply phone changes");
    await expect(palOn.locator('.modal-item[role="option"]', { hasText: /apply phone changes/i })).toBeVisible();
  });

  test("running it applies requests to open note, shows toast, and a second run shows 'No new changes'", async ({
    page,
  }) => {
    const initial = "Planning\n========\n# call the venue\n";
    const inbox = {
      format: 1,
      requests: [
        {
          id: "r1",
          type: "setState",
          date: today,
          section: "Planning",
          line: "# call the venue",
          n: 3,
          state: "done",
        },
      ],
    };

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        phoneCompanion: true,
        notes: { [todayNoteFile]: initial },
        session: { openTabs: [todayNoteFile], activeTab: todayNoteFile },
        phoneInbox: JSON.stringify(inbox),
      },
    });

    await triggerApplyPhoneChanges(page);

    // Toast reads "1 change from your phone applied."
    await expect(toast(page)).toHaveText(/1 change from your phone applied\./);

    // Open note reflects change
    await expect.poll(async () => activeTabContent(page)).toContain("v call the venue");

    // A second run with nothing new shows "No new changes from your phone."
    await triggerApplyPhoneChanges(page);
    await expect(toast(page)).toHaveText(/no new changes from your phone\./i);
  });

  test("running it with multiple requests shows 'N changes from your phone applied.'", async ({ page }) => {
    const initial = "Planning\n========\n# call the venue\n";
    const inbox = {
      format: 1,
      requests: [
        {
          id: "r1",
          type: "setState",
          date: today,
          section: "Planning",
          line: "# call the venue",
          n: 3,
          state: "done",
        },
        {
          id: "r2",
          type: "addLine",
          date: today,
          section: "Planning",
          text: "# order cake",
        },
      ],
    };

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        phoneCompanion: true,
        notes: { [todayNoteFile]: initial },
        session: { openTabs: [todayNoteFile], activeTab: todayNoteFile },
        phoneInbox: JSON.stringify(inbox),
      },
    });

    await triggerApplyPhoneChanges(page);

    await expect(toast(page)).toHaveText(/2 changes from your phone applied\./);
    await expect.poll(async () => activeTabContent(page)).toContain("v call the venue");
    await expect.poll(async () => activeTabContent(page)).toContain("# order cake");
  });

  test("a missing line becomes a conflict: info bar shows notice with Review button opening dialog", async ({
    page,
  }) => {
    const initial = "Planning\n========\n# book the room\n";
    const inbox = {
      format: 1,
      requests: [
        {
          id: "r1",
          type: "setState",
          date: today,
          section: "Planning",
          line: "# call the venue",
          n: 3,
          state: "done",
        },
      ],
    };

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        phoneCompanion: true,
        notes: { [todayNoteFile]: initial },
        session: { openTabs: [todayNoteFile], activeTab: todayNoteFile },
        phoneInbox: JSON.stringify(inbox),
      },
    });

    await triggerApplyPhoneChanges(page);

    // Info bar reads "1 change from your phone needs a look."
    const infoBar = page.getByRole("status");
    await expect(infoBar).toContainText("1 change from your phone needs a look.");

    // "Review" button opens dialog titled "Changes from your phone"
    const reviewBtn = infoBar.getByRole("button", { name: "Review" });
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    const dialog = phoneChangesDialog(page);
    await expect(dialog).toBeVisible();
  });

  test("conflict dialog: shows details, radio selection enables 'Apply to the chosen line', and updates note", async ({
    page,
  }) => {
    const initial = "Planning\n========\n# book the room\no catering\n";
    const inbox = {
      format: 1,
      requests: [
        {
          id: "r1",
          type: "setState",
          date: today,
          section: "Planning",
          line: "# call the venue",
          n: 3,
          state: "done",
        },
      ],
    };

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        phoneCompanion: true,
        notes: { [todayNoteFile]: initial },
        session: { openTabs: [todayNoteFile], activeTab: todayNoteFile },
        phoneInbox: JSON.stringify(inbox),
      },
    });

    await triggerApplyPhoneChanges(page);

    const infoBar = page.getByRole("status");
    await infoBar.getByRole("button", { name: "Review" }).click();

    const dialog = phoneChangesDialog(page);
    await expect(dialog).toBeVisible();

    // Shows "Mark as done" and the line the phone saw
    await expect(dialog).toContainText("Mark as done");
    await expect(dialog).toContainText("# call the venue");

    // Reason: "This line changed on the computer after your phone read it."
    await expect(dialog).toContainText("This line changed on the computer after your phone read it.");

    // Under "In the note now" a radio per action line of that section (actions only, not topic)
    await expect(dialog).toContainText("In the note now");
    const radio = dialog.getByRole("radio", { name: /book the room/i }).or(dialog.locator('input[type="radio"]')).first();
    await expect(radio).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /catering/i })).toHaveCount(0);

    // "Apply to the chosen line" is disabled until a radio is chosen
    const applyBtn = dialog.getByRole("button", { name: "Apply to the chosen line" });
    await expect(applyBtn).toBeDisabled();

    // Choosing "# book the room" and applying
    await radio.check();
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    // Makes note read "v book the room" and nothing else changes
    await expect.poll(async () => activeTabContent(page)).toBe("Planning\n========\nv book the room\no catering\n");

    // The conflict disappears, the info bar is gone, dialog says "Nothing from your phone needs a look."
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(dialog).toContainText("Nothing from your phone needs a look.");
  });

  test("'Skip' in dialog removes conflict without changing note", async ({ page }) => {
    const initial = "Planning\n========\n# book the room\n";
    const inbox = {
      format: 1,
      requests: [
        {
          id: "r1",
          type: "setState",
          date: today,
          section: "Planning",
          line: "# call the venue",
          n: 3,
          state: "done",
        },
      ],
    };

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        phoneCompanion: true,
        notes: { [todayNoteFile]: initial },
        session: { openTabs: [todayNoteFile], activeTab: todayNoteFile },
        phoneInbox: JSON.stringify(inbox),
      },
    });

    await triggerApplyPhoneChanges(page);

    const infoBar = page.getByRole("status");
    await infoBar.getByRole("button", { name: "Review" }).click();

    const dialog = phoneChangesDialog(page);
    await expect(dialog).toBeVisible();

    // Clicking "Skip"
    const skipBtn = dialog.getByRole("button", { name: "Skip" });
    await expect(skipBtn).toBeVisible();
    await skipBtn.click();

    // Conflict removed without changing note
    await expect.poll(async () => activeTabContent(page)).toBe(initial);
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(dialog).toContainText("Nothing from your phone needs a look.");
  });

  test("'Add as a new line' adds 'v <line text without symbol>' at the end of section", async ({ page }) => {
    const initial = "Planning\n========\n# book the room\n";
    const inbox = {
      format: 1,
      requests: [
        {
          id: "r1",
          type: "setState",
          date: today,
          section: "Planning",
          line: "# call the venue",
          n: 3,
          state: "done",
        },
      ],
    };

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        phoneCompanion: true,
        notes: { [todayNoteFile]: initial },
        session: { openTabs: [todayNoteFile], activeTab: todayNoteFile },
        phoneInbox: JSON.stringify(inbox),
      },
    });

    await triggerApplyPhoneChanges(page);

    const infoBar = page.getByRole("status");
    await infoBar.getByRole("button", { name: "Review" }).click();

    const dialog = phoneChangesDialog(page);
    await expect(dialog).toBeVisible();

    // Clicking "Add as a new line"
    const addBtn = dialog.getByRole("button", { name: "Add as a new line" });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Adds "v call the venue" at the end of section
    await expect.poll(async () => activeTabContent(page)).toContain("v call the venue");
    await expect.poll(async () => activeTabContent(page)).toContain("# book the room");
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(dialog).toContainText("Nothing from your phone needs a look.");
  });

  test("clicking the applied toast opens dialog listing applied changes under 'Applied'", async ({ page }) => {
    const initial = "Planning\n========\n# call the venue\n";
    const inbox = {
      format: 1,
      requests: [
        {
          id: "r1",
          type: "setState",
          date: today,
          section: "Planning",
          line: "# call the venue",
          n: 3,
          state: "done",
        },
      ],
    };

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        phoneCompanion: true,
        notes: { [todayNoteFile]: initial },
        session: { openTabs: [todayNoteFile], activeTab: todayNoteFile },
        phoneInbox: JSON.stringify(inbox),
      },
    });

    await triggerApplyPhoneChanges(page);

    const toastEl = toast(page);
    await expect(toastEl).toHaveText(/1 change from your phone applied\./);
    await toastEl.click();

    const dialog = phoneChangesDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Applied");
    await expect(dialog).toContainText("call the venue");
  });

  test("section gone from note shows reason 'This meeting is no longer in that day\\'s note.' and no apply button", async ({
    page,
  }) => {
    const initial = "Different Section\n=================\n# other task\n";
    const inbox = {
      format: 1,
      requests: [
        {
          id: "r1",
          type: "setState",
          date: today,
          section: "Planning",
          line: "# call the venue",
          n: 3,
          state: "done",
        },
      ],
    };

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        phoneCompanion: true,
        notes: { [todayNoteFile]: initial },
        session: { openTabs: [todayNoteFile], activeTab: todayNoteFile },
        phoneInbox: JSON.stringify(inbox),
      },
    });

    await triggerApplyPhoneChanges(page);

    const infoBar = page.getByRole("status");
    await expect(infoBar).toContainText("1 change from your phone needs a look.");
    await infoBar.getByRole("button", { name: "Review" }).click();

    const dialog = phoneChangesDialog(page);
    await expect(dialog).toBeVisible();

    // Reason reads "This meeting is no longer in that day's note."
    await expect(dialog).toContainText("This meeting is no longer in that day's note.");

    // There is NO "Apply to the chosen line" button
    await expect(dialog.getByRole("button", { name: "Apply to the chosen line" })).toHaveCount(0);
  });
});

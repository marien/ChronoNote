import { test, expect } from "@playwright/test";
import { seedApp, activeTabLabel, editor, mockNote, todayFilename, dateLabel } from "./helpers";

test.describe("first-time user onboarding flow (§onboarding)", () => {
  test("fresh installation with 0 notes seeds today's note with the interactive onboarding template", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notesDir: "/notes",
        notes: {},
        session: null,
        onboardingCompleted: false,
      },
    });

    // Opens directly on today's note
    await expect(activeTabLabel(page)).toHaveText(dateLabel(todayFilename()));

    // The note file was created with the full onboarding template
    const saved = await mockNote(page, todayFilename());
    expect(saved).toContain("Welcome to ChronoNote");
    expect(saved).toContain("Do First — Initial Setup");
    expect(saved).toContain("Do Next — Discover Your Daily Workflow");
    expect(saved).toContain("Token Quick Reference");
    expect(saved).toContain("Meeting Agenda Topics");

    // The editor renders the welcome header and glyph decorations
    const text = await editor(page).innerText();
    expect(text).toContain("Welcome to ChronoNote");
    expect(text).toContain("Do First — Initial Setup");
    await expect(editor(page).locator(".glyph-open").first()).toBeVisible();
    await expect(editor(page).locator(".glyph-followup").first()).toBeVisible();

    // User can place cursor on an action line and press Ctrl+Space to toggle it to 'v'
    const actionLine = editor(page).locator(".cm-line").filter({ hasText: "Try checking off this task" });
    await actionLine.click();
    await page.keyboard.press("Control+Space");
    await expect(editor(page).locator(".glyph-done").first()).toBeVisible();
  });

  test("skips onboarding template if user already has existing notes in the folder", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notesDir: "/notes",
        notes: {
          "2026-09-01.txt": "Existing note from another machine\n=================================\n# preexisting task",
        },
        session: null,
        onboardingCompleted: false,
      },
    });

    // Today's note opens cleanly as an empty file without injecting the onboarding template
    await expect(activeTabLabel(page)).toHaveText(dateLabel(todayFilename()));
    const text = await editor(page).innerText();
    expect(text).not.toContain("Welcome to ChronoNote");
  });
});

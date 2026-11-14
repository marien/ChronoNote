import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  setEditorText,
  typeInEditor,
  activeTabContent,
  lastWrittenNote,
  noteWrites,
  mockNote,
  todayFilename,
  toast,
  tab,
  modalCard,
  MODAL_LABELS,
  cursorLine,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

async function externallyWrite(page: Page, filename: string, content: string): Promise<void> {
  await page.evaluate(
    ({ f, c }) => {
      window.__CHRONO_MOCK__!.setNote(f, c);
    },
    { f: filename, c: content },
  );
}

async function checkDrift(page: Page): Promise<void> {
  await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.checkDrift());
}

async function triggerApplyPhoneChanges(page: Page): Promise<void> {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = modalCard(page, MODAL_LABELS.commandPalette);
  await expect(palette).toBeVisible();
  await palette.locator(".modal-input").fill("Apply phone changes");
  const row = palette.locator('.modal-item[role="option"]', { hasText: /apply phone changes/i }).first();
  await expect(row).toBeVisible();
  await row.click();
}

test.describe("Editor batch 1 — independent tests", () => {
  test.describe("Rule 1: Ctrl+Z never undoes an outside change", () => {
    test("1.1: typing then total outside replacement keeps external text on Ctrl+Z and saves it to disk", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: { [file]: "original line\n" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.type("typed ");
      await expect.poll(() => mockNote(page, file)).toBe("typed original line\n");

      await externallyWrite(page, file, "EXTERNAL change\n");
      await checkDrift(page);
      await expect.poll(() => activeTabContent(page)).toBe("EXTERNAL change\n");

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");

      expect(await activeTabContent(page)).toBe("EXTERNAL change\n");
      // Nothing of the user's is left to save, so the file keeps the outside version.
      // Deliberate: asserts nothing happens for 800 ms (no autosave overwrites the external version after Ctrl+Z)
      await page.waitForTimeout(800);
      expect(await mockNote(page, file)).toBe("EXTERNAL change\n");
    });

    test("1.1b: resolving a disk conflict with 'Keep disk version' is not undone by Ctrl+Z", async ({ page }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: { [file]: "original line\n" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.type("typed ");

      await externallyWrite(page, file, "EXTERNAL change\n");
      await checkDrift(page);
      const conflictModal = modalCard(page, MODAL_LABELS.conflict);
      await expect(conflictModal).toBeVisible();
      await conflictModal.getByRole("button", { name: /keep disk/i }).click();
      await expect(conflictModal).toBeHidden();
      await expect.poll(() => activeTabContent(page)).toBe("EXTERNAL change\n");

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");

      expect(await activeTabContent(page)).toBe("EXTERNAL change\n");
      // Deliberate: asserts nothing happens for 800 ms (no autosave overwrites the external version after Ctrl+Z)
      await page.waitForTimeout(800);
      expect(await mockNote(page, file)).toBe("EXTERNAL change\n");
    });

    test("1.2: outside change on line 2 preserves user undo and Ctrl+Y redo on line 1", async ({ page }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: { [file]: "A\nB\n" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("End");
      await page.keyboard.type("x");
      await expect.poll(() => mockNote(page, file)).toBe("Ax\nB\n");

      await externallyWrite(page, file, "Ax\nB2\n");
      await checkDrift(page);
      await expect.poll(() => activeTabContent(page)).toBe("Ax\nB2\n");

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toBe("A\nB2\n");

      await page.keyboard.press("ControlOrMeta+y");
      await expect.poll(() => activeTabContent(page)).toBe("Ax\nB2\n");
      await expect.poll(() => mockNote(page, file)).toBe("Ax\nB2\n");
    });

    test("1.2b: several undo steps before an outside change all undo and redo while keeping the outside change", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: { [file]: "A\nB\n" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("End");

      // Three edits at different places, so each is its own undo step (typing at one spot joins into one step).
      await page.keyboard.type("1");
      await page.keyboard.press("Home");
      await page.keyboard.type("2");
      await page.keyboard.press("End");
      await page.keyboard.type("3");
      await expect.poll(() => mockNote(page, file)).toBe("2A13\nB\n");

      await externallyWrite(page, file, "2A13\nB2\n");
      await checkDrift(page);
      await expect.poll(() => activeTabContent(page)).toBe("2A13\nB2\n");

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toBe("2A1\nB2\n");

      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toBe("A1\nB2\n");

      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toBe("A\nB2\n");

      // One extra undo must not touch the outside change "B2".
      await page.keyboard.press("ControlOrMeta+z");
      // Deliberate: asserts nothing happens for 200 ms (extra Ctrl+Z does not undo outside change)
      await page.waitForTimeout(200);
      expect(await activeTabContent(page)).toBe("A\nB2\n");

      // Redo steps back through all three user edits while preserving "B2".
      await page.keyboard.press("ControlOrMeta+y");
      await expect.poll(() => activeTabContent(page)).toBe("A1\nB2\n");
      await page.keyboard.press("ControlOrMeta+y");
      await expect.poll(() => activeTabContent(page)).toBe("2A1\nB2\n");
      await page.keyboard.press("ControlOrMeta+y");
      await expect.poll(() => activeTabContent(page)).toBe("2A13\nB2\n");
    });

    test("1.3: phone companion adding a line is not undone by Ctrl+Z", async ({ page }) => {
      const file = todayFilename();
      const inbox = JSON.stringify({
        format: 1,
        writer: "test",
        requests: [
          {
            id: "r1",
            type: "addLine",
            date: REFERENCE_TODAY,
            section: "Planning",
            text: "# from phone",
          },
        ],
      });

      await seedApp(page, {
        seed: {
          phoneCompanion: true,
          notes: { [file]: "Planning\n========\n# call the venue\n" },
          session: { openTabs: [file], activeTab: file },
          phoneInbox: inbox,
        },
      });

      await triggerApplyPhoneChanges(page);
      await expect(toast(page)).toContainText("1 change from your phone applied.");
      await expect.poll(() => activeTabContent(page)).toContain("# from phone");

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");
      // Deliberate: asserts nothing happens for 200 ms (Ctrl+Z does not undo phone companion line)
      await page.waitForTimeout(200);

      expect(await activeTabContent(page)).toContain("# from phone");
      expect(await lastWrittenNote(page, file)).toContain("# from phone");
    });

    test("1.3b: user edit before phone companion change can be undone without removing the phone line", async ({
      page,
    }) => {
      const file = todayFilename();
      const inbox = JSON.stringify({
        format: 1,
        writer: "test",
        requests: [
          {
            id: "r1",
            type: "addLine",
            date: REFERENCE_TODAY,
            section: "Planning",
            text: "# from phone",
          },
        ],
      });

      await seedApp(page, {
        seed: {
          phoneCompanion: true,
          notes: { [file]: "Planning\n========\n# call the venue\n" },
          session: { openTabs: [file], activeTab: file },
          phoneInbox: inbox,
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("End");
      await page.keyboard.type(" today");
      await expect.poll(() => mockNote(page, file)).toContain("# call the venue today");

      await triggerApplyPhoneChanges(page);
      await expect(toast(page)).toContainText("1 change from your phone applied.");
      await expect.poll(() => activeTabContent(page)).toContain("# from phone");

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).not.toContain("today");
      expect(await activeTabContent(page)).toContain("# call the venue");
      expect(await activeTabContent(page)).toContain("# from phone");

      // Further Ctrl+Z must not undo the phone companion line.
      await page.keyboard.press("ControlOrMeta+z");
      // Deliberate: asserts nothing happens for 200 ms (extra Ctrl+Z does not undo phone companion line)
      await page.waitForTimeout(200);
      expect(await activeTabContent(page)).toContain("# from phone");
    });

    test("1.3c: resolving a dropped-note import conflict with 'Use the dropped file' is not undone by Ctrl+Z", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          backendKind: "web",
          notes: { [file]: "my own note\n" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await page.evaluate(
        ({ name, content }) => {
          const dt = new DataTransfer();
          dt.items.add(new File([content], name, { type: "text/plain" }));
          window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt }));
        },
        { name: file, content: "dropped version\n" },
      );

      const dialog = page.getByRole("dialog", { name: "Dropped notes differ" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Use the dropped file" }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(() => activeTabContent(page)).toBe("dropped version\n");

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");
      // Deliberate: asserts nothing happens for 200 ms (Ctrl+Z does not undo dropped-file resolution)
      await page.waitForTimeout(200);
      expect(await activeTabContent(page)).toBe("dropped version\n");
    });

    test("1.4a: app command — setting a state from the Actions view remains undoable", async ({ page }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: { [file]: "Weekly\n======\n# open task\n" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+A");
      const actions = modalCard(page, MODAL_LABELS.actions);
      await expect(actions).toBeVisible();
      await actions.locator(".modal-input").fill("open task");
      await page.keyboard.press("Control+Space");
      await expect.poll(() => activeTabContent(page)).toContain("v open task");

      await page.keyboard.press("Escape");
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toContain("# open task");
    });

    test("1.4b: app command — copy forward remains undoable", async ({ page }) => {
      await seedApp(page, {
        seed: {
          notes: {
            "2026-09-07.txt": "Weekly Sync\n============\n# renew the TLS cert",
            "2026-09-08.txt": "Weekly Sync\n============\n- prior notes",
          },
          session: { openTabs: ["2026-09-07.txt", "2026-09-08.txt"], activeTab: "2026-09-07.txt" },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+End");
      await page.keyboard.press("ControlOrMeta+Shift+Period");

      await expect.poll(() => activeTabContent(page)).toContain("> renew the TLS cert");

      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toBe("Weekly Sync\n============\n# renew the TLS cert");
    });

    test("1.4c: app command — due-date command remains undoable", async ({ page }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: { [file]: "# buy milk" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();
      await pop.locator('.cp-day[data-iso="2026-09-08"]').click();
      await expect(pop).toBeHidden();
      await expect.poll(() => activeTabContent(page)).toBe("# buy milk by:2026-09-08");

      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toBe("# buy milk");
    });

    test("1.4d: app command — calendar sync remains undoable", async ({ page }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          calendarSyncEnabled: true,
          agendaJson: JSON.stringify([{ date: REFERENCE_TODAY, start: "09:00", end: "09:30", title: "Standup" }]),
          notes: { [file]: "Scratch notes\n" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await page.getByTitle("Sync calendar for this day", { exact: false }).click();
      await expect(page.getByText("Standup")).toBeVisible();
      await page.getByRole("button", { name: "Sync", exact: true }).click();
      await expect.poll(() => activeTabContent(page)).toContain("Standup");

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).not.toContain("Standup");
    });

    test("1.4e: app command — Peek edits remain undoable", async ({ page }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: { [file]: "Call\n====\n- first note\n\n\nStandup\n=======\n# next\n" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ControlOrMeta+Shift+KeyP");
      await expect(page.locator("body.peek-mode")).toBeVisible();

      await editor(page).click();
      await page.keyboard.press("End");
      await page.keyboard.type(" edited");
      await expect.poll(() => activeTabContent(page)).toContain("- first note edited");

      await page.keyboard.press("Escape");
      await expect(page.locator("body.peek-mode")).toHaveCount(0);

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).not.toContain("edited");
      expect(await activeTabContent(page)).toContain("- first note");
    });

    test("1.4f: app command — restoring an earlier version remains undoable", async ({ page }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: { [file]: "Initial morning notes\n" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await typeInEditor(page, "\nAdded afternoon follow-up\n");
      await expect.poll(() => mockNote(page, file)).toContain("Added afternoon follow-up");

      await tab(page, file).click({ button: "right" });
      const menu = page.locator(".tab-context-menu");
      await menu.getByRole("menuitem", { name: "Earlier versions…" }).click();

      const modal = page.locator(".modal-card[role='dialog']");
      await expect(modal).toBeVisible();
      await modal.locator('[data-testid="version-entry"]').first().click();
      await modal.getByRole("button", { name: "Restore this version" }).click();
      await expect(modal).toBeHidden();
      await expect.poll(() => activeTabContent(page)).toBe("Initial morning notes\n");

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toContain("Added afternoon follow-up");
    });
  });

  test.describe("Rule 2: Enter with the caret right after a leading symbol is a plain line break", () => {
    test.beforeEach(async ({ page }) => {
      await seedApp(page, { seed: "empty" });
    });

    test("2.1: '# hello' with caret after '#' breaks into '#\\n hello' with caret at start of line 2", async ({
      page,
    }) => {
      await setEditorText(page, " hello");
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.type("#");
      await page.keyboard.press("Enter");

      expect(await activeTabContent(page)).toBe("#\n hello");
      expect(await cursorLine(page)).toBe(2);
      await page.keyboard.type("Z");
      expect(await activeTabContent(page)).toBe("#\nZ hello");
    });

    for (const sym of ["x", "o", "-", "v", ">"]) {
      test(`2.2 / 2.3: '${sym}' typed at column 0 before two spaces breaks into '${sym}\\n  ' with caret at start of line 2`, async ({
        page,
      }) => {
        await setEditorText(page, "  ");
        await page.keyboard.press("ControlOrMeta+Home");
        await page.keyboard.type(sym);
        await page.keyboard.press("Enter");

        expect(await activeTabContent(page)).toBe(`${sym}\n  `);
        expect(await cursorLine(page)).toBe(2);
        await page.keyboard.type("Z");
        expect(await activeTabContent(page)).toBe(`${sym}\nZ  `);
      });
    }

    for (const sym of ["#", "x", "o", "-", "v", ">", "=>", "!", "1."]) {
      for (const spaces of [" ", "   "]) {
        test(`every listed symbol '${sym}' with ${spaces.length} trailing space(s) breaks without deleting or continuing`, async ({
          page,
        }) => {
          await setEditorText(page, spaces);
          await page.keyboard.press("ControlOrMeta+Home");
          await page.keyboard.type(sym);
          await page.keyboard.press("Enter");

          expect(await activeTabContent(page)).toBe(`${sym}\n${spaces}`);
          expect(await cursorLine(page)).toBe(2);
          await page.keyboard.type("Z");
          expect(await activeTabContent(page)).toBe(`${sym}\nZ${spaces}`);
        });
      }
    }

    for (const { sym, rest } of [
      { sym: "=>", rest: "hello" },
      { sym: "-", rest: "item" },
      { sym: "o", rest: "topic" },
      { sym: "!", rest: "urgent" },
      { sym: "1.", rest: "first" },
      { sym: "v", rest: "done" },
      { sym: ">", rest: "deferred" },
      { sym: "x", rest: "wont" },
    ]) {
      test(`2.4 / 2.5: '${sym} ${rest}' with caret after '${sym}' breaks into '${sym}\\n ${rest}'`, async ({ page }) => {
        await setEditorText(page, ` ${rest}`);
        await page.keyboard.press("ControlOrMeta+Home");
        await page.keyboard.type(sym);
        await page.keyboard.press("Enter");

        expect(await activeTabContent(page)).toBe(`${sym}\n ${rest}`);
        expect(await cursorLine(page)).toBe(2);
        await page.keyboard.type("Z");
        expect(await activeTabContent(page)).toBe(`${sym}\nZ ${rest}`);
      });
    }

    test("2.6: unchanged Enter at end of '# hello', on empty '# ', and at column 0 of '# hello'", async ({ page }) => {
      await typeInEditor(page, "# hello");
      await page.keyboard.press("Enter");
      expect(await activeTabContent(page)).toBe("# hello\n# ");

      // Enter on empty '# ' exits the list / removes the symbol.
      await page.keyboard.press("Enter");
      expect(await activeTabContent(page)).toBe("# hello\n");

      // Enter at column 0 pushes the marker line down.
      await setEditorText(page, "# hello");
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("Enter");
      expect(await activeTabContent(page)).toBe("\n# hello");
    });
  });

  test.describe("Rule 3: Closing a tab never overwrites a newer file", () => {
    const OTHER = "2026-09-03.txt";

    test("3.1: closing a dirty tab via Ctrl+W when disk changed keeps disk version and writes a conflict copy", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: {
            [file]: "Today\n=====\ninitial\n",
            [OTHER]: "Older\n=====\n",
          },
          session: { openTabs: [OTHER, file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.type(" unsaved edit");

      await externallyWrite(page, file, "Today\n=====\nEXTERNAL newer\n");
      await page.keyboard.press("ControlOrMeta+w");

      await expect(tab(page, file)).toHaveCount(0);
      await expect(toast(page)).toContainText(/Saved your version as /i);
      expect(await mockNote(page, file)).toBe("Today\n=====\nEXTERNAL newer\n");

      const copies = await page.evaluate(() => window.__CHRONO_MOCK__!.conflictCopyNames());
      expect(copies).toHaveLength(1);
      expect(copies[0]).toMatch(/^2026-09-07-\d{6}\.txt$/);
      const copyBody = await page.evaluate((name) => window.__CHRONO_MOCK__!.conflictCopy(name), copies[0]);
      expect(copyBody).toContain("unsaved edit");

      // Ensure no delayed autosave fires later to clobber the external file.
      // Deliberate: asserts nothing happens for 600 ms (no delayed autosave clobbers external file after tab close)
      await page.waitForTimeout(600);
      expect(await mockNote(page, file)).toBe("Today\n=====\nEXTERNAL newer\n");
    });

    test("3.2: closing a dirty tab via tab close button when disk changed keeps disk version and writes a conflict copy", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: {
            [file]: "Today\n=====\ninitial\n",
            [OTHER]: "Older\n=====\n",
          },
          session: { openTabs: [OTHER, file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.type(" button close unsaved");

      await externallyWrite(page, file, "Today\n=====\nEXTERNAL newer\n");
      await tab(page, file).locator(".tab-close").click();

      await expect(tab(page, file)).toHaveCount(0);
      await expect(toast(page)).toContainText(/Saved your version as /i);
      expect(await mockNote(page, file)).toBe("Today\n=====\nEXTERNAL newer\n");

      const copies = await page.evaluate(() => window.__CHRONO_MOCK__!.conflictCopyNames());
      expect(copies).toHaveLength(1);
      const copyBody = await page.evaluate((name) => window.__CHRONO_MOCK__!.conflictCopy(name), copies[0]);
      expect(copyBody).toContain("button close unsaved");
    });

    test("3.3: closing a clean tab when disk is unchanged makes no conflict copy and preserves disk", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: {
            [file]: "Today\n=====\ninitial\n",
            [OTHER]: "Older\n=====\n",
          },
          session: { openTabs: [OTHER, file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+w");

      await expect(tab(page, file)).toHaveCount(0);
      expect(await mockNote(page, file)).toBe("Today\n=====\ninitial\n");
      expect(await page.evaluate(() => window.__CHRONO_MOCK__!.conflictCopyNames())).toEqual([]);
      const writes = await noteWrites(page, file);
      expect(writes.length).toBeLessThanOrEqual(1);
      for (const w of writes) expect(w).toBe("Today\n=====\ninitial\n");
    });

    test("3.4: closing a dirty tab when disk is unchanged performs one normal save and no conflict copy", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: {
            [file]: "Today\n=====\ninitial\n",
            [OTHER]: "Older\n=====\n",
          },
          session: { openTabs: [OTHER, file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.type(" local edit");
      await page.keyboard.press("ControlOrMeta+w");

      await expect(tab(page, file)).toHaveCount(0);
      await expect.poll(() => mockNote(page, file)).toBe("Today\n=====\ninitial\n local edit");
      expect(await noteWrites(page, file)).toEqual(["Today\n=====\ninitial\n local edit"]);
      expect(await page.evaluate(() => window.__CHRONO_MOCK__!.conflictCopyNames())).toEqual([]);
    });

    test("3.5: closing a tab that was edited and already saved (clean again) creates no conflict copy", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: {
            [file]: "Today\n=====\ninitial\n",
            [OTHER]: "Older\n=====\n",
          },
          session: { openTabs: [OTHER, file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.type(" saved edit");
      await expect.poll(() => mockNote(page, file)).toBe("Today\n=====\ninitial\n saved edit");

      await page.keyboard.press("ControlOrMeta+w");
      await expect(tab(page, file)).toHaveCount(0);
      expect(await mockNote(page, file)).toBe("Today\n=====\ninitial\n saved edit");
      expect(await page.evaluate(() => window.__CHRONO_MOCK__!.conflictCopyNames())).toEqual([]);
      const writes = await noteWrites(page, file);
      expect(writes.length).toBeGreaterThanOrEqual(1);
      for (const w of writes) expect(w).toBe("Today\n=====\ninitial\n saved edit");
    });

    test("3.6: closing a clean tab when disk changed externally does not overwrite disk and creates no conflict copy", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: {
            [file]: "Today\n=====\ninitial\n",
            [OTHER]: "Older\n=====\n",
          },
          session: { openTabs: [OTHER, file], activeTab: file },
        },
      });

      await externallyWrite(page, file, "Today\n=====\nEXTERNAL newer\n");
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+w");

      await expect(tab(page, file)).toHaveCount(0);
      expect(await mockNote(page, file)).toBe("Today\n=====\nEXTERNAL newer\n");
      expect(await page.evaluate(() => window.__CHRONO_MOCK__!.conflictCopyNames())).toEqual([]);
    });
  });

  test.describe("Rule 4: A failed phone-companion write keeps what the user typed meanwhile", () => {
    test("4.1: when phone companion write fails and user typed nothing, note reverts to text before phone change", async ({
      page,
    }) => {
      const file = todayFilename();
      const initial = "Planning\n========\n# call the venue\n";
      const inbox = JSON.stringify({
        format: 1,
        writer: "test",
        requests: [
          {
            id: "r1",
            type: "addLine",
            date: REFERENCE_TODAY,
            section: "Planning",
            text: "# from phone",
          },
        ],
      });

      await seedApp(page, {
        seed: {
          phoneCompanion: true,
          notes: { [file]: initial },
          session: { openTabs: [file], activeTab: file },
          phoneInbox: inbox,
        },
      });

      await page.evaluate(() => {
        window.__CHRONO_MOCK__!.throwOnCommands = new Set(["write_note"]);
      });

      await triggerApplyPhoneChanges(page);
      await expect
        .poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.invokeLog.some((e) => e.cmd === "write_note")))
        .toBe(true);
      await expect.poll(() => activeTabContent(page)).toBe(initial);
      expect(await mockNote(page, file)).toBe(initial);
    });

    // Cannot drive with existing mock hooks: `MockBackend.invoke` checks `this.throwOnCommands.has(cmd)`
    // *before* `this.delayCommands.get(cmd)`, so `write_note` either fails immediately (0 ms, no window for
    // the user to type `USER ` while the save runs) or delays and resolves successfully.
    // Needed hook: a way on `window.__CHRONO_MOCK__` to hold an in-flight `write_note` call open until the
    // test explicitly rejects it (e.g. `holdCommand("write_note")` returning a reject handle).
    // Steps it should take:
    // 1. Seed `phoneCompanion: true`, a note `"Planning\n========\noriginal\n"`, and `phoneInbox` appending `"phone line"` to `"Planning"`.
    // 2. Arm the mock hook to hold the next `write_note` invocation pending.
    // 3. Trigger `"Apply phone changes"` via the Command Palette so `"phone line"` is applied and `write_note` is in flight.
    // 4. Click the editor, move the caret to the start of the `"original"` line, and type `"USER "`.
    // 5. Reject the held `write_note` promise with a non-conflict error.
    // 6. Assert `activeTabContent(page)` contains `"USER original\n"` and does not contain `"phone line"`.
    test.fixme(
      "4.2: while phone companion save is in flight, typing USER at start of line keeps USER when save fails",
      async () => {},
    );
  });

  test.describe("Rule 5: Spell check never applies results for text that has changed", () => {
    test("5.1: replacing 'helo world' with 'ok' while spell check runs produces no error and no underline", async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await seedApp(page, {
        seed: {
          spellCheck: true,
          delayCommands: { spell_check_lines: 1200 },
        },
      });
      await page.evaluate(() => {
        window.__CHRONO_MOCK__!.spellMisspelled.add("helo");
      });

      await setEditorText(page, "helo world");
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.__CHRONO_MOCK__!.invokeLog.some(
              (e) =>
                e.cmd === "spell_check_lines" &&
                Array.isArray((e.args as { lines?: unknown[] }).lines) &&
                (e.args as { lines: string[] }).lines.some((l) => l.includes("helo world")),
            ),
          ),
        )
        .toBe(true);

      // Replace the whole note while the delayed spell check is still in flight.
      await setEditorText(page, "ok");

      // Wait past both the 1200ms in-flight response and the subsequent recheck.
      // Deliberate: asserts nothing happens for 1800 ms (in-flight stale spell check never applies underline after note replacement)
      await page.waitForTimeout(1800);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      await expect(page.locator(".cm-misspelled")).toHaveCount(0);
    });

    test("5.2: typing 'hello ' before 'helo' while spell check runs never underlines 'hello', and underlines 'helo' after next check", async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await seedApp(page, {
        seed: {
          spellCheck: true,
          delayCommands: { spell_check_lines: 1400 },
        },
      });
      await page.evaluate(() => {
        window.__CHRONO_MOCK__!.spellMisspelled.add("helo");
        const observed: string[] = [];
        (window as unknown as { __OBSERVED_MISSPELLINGS__: string[] }).__OBSERVED_MISSPELLINGS__ = observed;
        const root = document.querySelector(".cm-content")!;
        const record = () => {
          for (const el of root.querySelectorAll(".cm-misspelled")) {
            const t = el.textContent ?? "";
            if (t) observed.push(t);
          }
        };
        new MutationObserver(record).observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["class"],
        });
      });

      await setEditorText(page, "helo");
      await expect
        .poll(() =>
          page.evaluate(() => {
            const entry = window.__CHRONO_MOCK__!.invokeLog.find(
              (e) =>
                e.cmd === "spell_check_lines" &&
                Array.isArray((e.args as { lines?: unknown[] }).lines) &&
                (e.args as { lines: string[] }).lines.some((l) => l === "helo"),
            );
            return entry?.at ?? null;
          }),
        )
        .not.toBeNull();

      // Type "hello " at the start while the first check is in flight, and stretch the 2nd check
      // so we have a clean observation window after the 1st check resolves.
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.type("hello ");
      await page.evaluate(() => {
        window.__CHRONO_MOCK__!.delayCommands.set("spell_check_lines", 2400);
      });
      expect(await activeTabContent(page)).toBe("hello helo");

      // Wait until the 1st (stale) check has resolved (~1400ms) while the 2nd is still pending.
      // Deliberate: asserts nothing happens for 1600 ms (stale 1st check resolves without underlining shifted 'hello')
      await page.waitForTimeout(1600);
      await expect(page.locator(".cm-misspelled")).toHaveCount(0);

      // The caret still touches "helo", and the word being typed is never marked; moving the caret ends typing.
      await page.keyboard.press("End");
      // Once a check after that resolves, only "helo" is underlined.
      await expect(page.locator(".cm-misspelled")).toHaveText(["helo"], { timeout: 4000 });

      const observed = await page.evaluate(
        () => (window as unknown as { __OBSERVED_MISSPELLINGS__: string[] }).__OBSERVED_MISSPELLINGS__,
      );
      expect(observed.some((w) => /^hell/i.test(w))).toBe(false);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
});

import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  setEditorText,
  modalCard,
  MODAL_LABELS,
  activeTabLabel,
  currentModal,
  todayFilename,
} from "./helpers";

const search = (page: Page) => modalCard(page, MODAL_LABELS.search);
const history = (page: Page) => modalCard(page, MODAL_LABELS.history);
const rows = (m: ReturnType<typeof search>) => m.locator('.modal-item[role="option"]');

test.describe("cross-tab search (Ctrl/Cmd+Shift+F)", () => {
  test("matches lines across open tabs and jumps on Enter", async ({ page }) => {
    await seedApp(page, { seed: "delegation" });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    await expect(search(page)).toBeVisible();

    await search(page).locator(".modal-input").fill("migration plan");
    await expect(rows(search(page)).first()).toBeVisible();
    await expect(search(page)).toContainText("draft the migration plan");

    await page.keyboard.press("Enter");
    expect(await currentModal(page)).toBe("none");
    await expect(editor(page)).toContainText("draft the migration plan");
  });

  test("'All Files' scope widens the result set beyond open tabs", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    await search(page).locator(".modal-input").fill("the");

    const openCount = await rows(search(page)).count();
    await search(page).getByRole("radio", { name: "All Files" }).click();
    await expect.poll(() => rows(search(page)).count()).toBeGreaterThanOrEqual(openCount);
  });

  test("#62: switching to 'All Files' shows a spinner while the disk read is slow", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": "the migration plan", "2026-08-01.txt": "the older migration plan" },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
        delayCommands: { read_all_notes: 1000 },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    await expect(search(page)).toBeVisible();

    await search(page).getByRole("radio", { name: "All Files" }).click();
    await expect(search(page).locator(".modal-spinner")).toBeVisible();
    await expect(search(page).locator(".modal-spinner")).toHaveCount(0, { timeout: 2000 });

    await search(page).locator(".modal-input").fill("migration plan");
    await expect(rows(search(page))).toHaveCount(2);
  });

  test("renders search operator chips and allows removing them (Area 8.2)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "# (ui) Build search chips\nv (ui) Done task\n# (backend) Api work",
        },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    await expect(search(page)).toBeVisible();

    // Type query with operators
    await search(page).locator(".modal-input").fill("is:open tag:ui");
    const chips = search(page).locator(".search-chip");
    await expect(chips).toHaveCount(2);
    await expect(chips.first()).toContainText("is:open");
    await expect(chips.nth(1)).toContainText("tag:ui");

    // Only 1 result matching open + tag:ui
    await expect(rows(search(page))).toHaveCount(1);
    await expect(search(page)).toContainText("Build search chips");

    // Click remove button on tag:ui chip
    const removeBtn = chips.nth(1).locator(".chip-remove-btn");
    await removeBtn.click();

    // Now tag:ui chip is gone, is:open remains
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText("is:open");
    expect(await search(page).locator(".modal-input").inputValue()).toBe("is:open");

    // Now matches both open items (Build search chips & Api work)
    await expect(rows(search(page))).toHaveCount(2);
  });

  test("jumping to a search match applies .cm-line-hit-pulse animation to target line (Area 8.3)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Line 1\nLine 2\n# Target pulse action\nLine 4",
        },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    await expect(search(page)).toBeVisible();

    await search(page).locator(".modal-input").fill("pulse");
    await expect(rows(search(page))).toHaveCount(1);

    await page.keyboard.press("Enter");
    expect(await currentModal(page)).toBe("none");

    // Target line in editor should have .cm-line-hit-pulse class
    const pulsedLine = editor(page).locator(".cm-line.cm-line-hit-pulse");
    await expect(pulsedLine).toBeVisible();
    await expect(pulsedLine).toContainText("Target pulse action");
  });
});

test.describe("section history (Ctrl/Cmd+Shift+H)", () => {
  test("aggregates a recurring section's actions across days, deduped", async ({ page }) => {
    // Hand-built so the recurring section + its repeated line are exact.
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": ["Weekly Planning — 2026-09-07", "===========================", "# renew the TLS cert", "- notes for today"].join(
            "\n",
          ),
          "2026-09-01.txt": [
            "Weekly Planning — 2026-09-01",
            "===========================",
            "# renew the TLS cert",
            "v shipped the docs",
          ].join("\n"),
          "2026-08-25.txt": [
            "Weekly Planning — 2026-08-25",
            "===========================",
            "# renew the TLS cert",
            "> defer the audit",
          ].join("\n"),
        },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    // Put the cursor inside the recurring section.
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // onto "# renew the TLS cert"
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await expect(history(page)).toBeVisible();
    // Title (§127: a plain heading, not a fake readonly input) names the
    // section being aggregated.
    await expect(history(page).locator(".modal-title")).toContainText(/Weekly Planning/);
    // "renew the TLS cert" appears in all three days but dedupes to one row.
    const list = history(page).locator(".modal-list");
    await expect(list.getByText("renew the TLS cert")).toHaveCount(1);
    // The other, distinct lines from earlier days are listed.
    await expect(list).toContainText("shipped the docs");
    await expect(list).toContainText("defer the audit");
  });

  test("#41: list rows show the action after a mid-line follow-up, split multi-action lines, format topics", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Sync\n====\ntoday",
          "2026-09-05.txt": [
            "Sync",
            "====",
            "Talked to Ana => # (q3) chase the invoice",
            "# draft the plan => # send it round",
          ].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const list = history(page).locator(".modal-list");
    // mid-line follow-up: only the post-arrow text, with its (q3) topic styled
    const row1 = list.locator(".modal-item", { hasText: "chase the invoice" });
    await expect(row1).toContainText("☐ (q3) chase the invoice");
    await expect(row1).not.toContainText("Talked to Ana");
    await expect(row1.locator(".glyph-topic")).toHaveText("(q3)");
    // the two-action line becomes two rows
    await expect(list.locator(".modal-item", { hasText: "draft the plan" })).toHaveCount(1);
    await expect(list.locator(".modal-item", { hasText: "send it round" })).toHaveCount(1);

    // Shift+Enter inserts the action itself, not the whole source line
    await list.locator(".modal-item", { hasText: "chase the invoice" }).hover();
    await expect(history(page).locator(".hp-insert")).toHaveText("# (q3) chase the invoice");
  });

  test("the 'Previous occurrence' pane shows that section's prior body, glyph-rendered (#27/#33)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Weekly Sync\n====\n# something new today",
          "2026-09-05.txt": [
            "Weekly Sync",
            "===========",
            "- reviewed the roadmap",
            "# chase the vendor (q3)",
            "Next section here",
            "=================",
            "not part of the sync",
          ].join("\n"),
          "2026-09-01.txt": "Weekly Sync\n====\n- older, should be ignored",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown"); // into the "Weekly Sync" section
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const panel = history(page).locator(".history-prev");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Previous occurrence · 2026-09-05");
    // Glyph-rendered (#33.1): the `#` shows as ☐, the bullet as •, stopping
    // at the next section header. The (q3) topic tag (#36) is kept.
    await expect(panel.locator(".po-body")).toContainText("☐ chase the vendor (q3)");
    await expect(panel.locator(".po-body")).toContainText("• reviewed the roadmap");
    await expect(panel.locator(".po-body")).not.toContainText("not part of the sync");
    await expect(panel.locator(".po-body")).not.toContainText("older, should be ignored");

    // "Open file" jumps to that occurrence and closes the drawer.
    await panel.getByRole("button", { name: "Open file" }).click();
    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText("2026-09-05");
  });

  test("the 'Previous occurrence' pane caps at 5 lines with a show-all toggle (#33.2)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\ntoday",
          "2026-09-05.txt": ["Standup", "=======", "one", "two", "three", "four", "five", "six", "seven"].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const pane = history(page).locator(".history-prev");
    await expect(pane.locator(".po-line")).toHaveCount(5);
    await pane.getByRole("button", { name: /show all 7 lines/i }).click();
    await expect(pane.locator(".po-line")).toHaveCount(7);
    await pane.getByRole("button", { name: /show fewer/i }).click();
    await expect(pane.locator(".po-line")).toHaveCount(5);
  });

  test("the 'Previous occurrence' pane is always anchored to today, not the note it was opened from (§150)", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Weekly Sync\n====\ntoday's note",
          "2026-09-05.txt": ["Weekly Sync", "===========", "# opened from here"].join("\n"),
          "2026-09-03.txt": ["Weekly Sync", "===========", "# the pre-§150 answer"].join("\n"),
        },
        // Opened from 2026-09-05 — an earlier note than today. Before §150,
        // "previous" meant "before the opened-from note", which would land
        // on 2026-09-03. Relative to *today* (2026-09-07), the most recent
        // earlier occurrence is 2026-09-05 itself — the very note the
        // drawer was opened from.
        session: { openTabs: ["2026-09-05.txt"], activeTab: "2026-09-05.txt" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const panel = history(page).locator(".history-prev");
    await expect(panel).toContainText("Previous occurrence · 2026-09-05");
    await expect(panel).not.toContainText("2026-09-03");

    // §150: the panel spans the full modal width now, not a left column
    // shared with the list+preview split below it.
    const panelBox = await panel.boundingBox();
    const cardBox = await history(page).boundingBox();
    expect(panelBox!.width).toBeGreaterThan(cardBox!.width * 0.9);
  });

  test("date headers are selectable — including a future occurrence and one with no actions — and update the From block (§150)", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-10.txt": ["Weekly Sync", "===========", "# a future item"].join("\n"),
          [todayFilename()]: ["Weekly Sync", "===========", "nothing actionable yet"].join("\n"),
          "2026-09-05.txt": ["Weekly Sync", "===========", "# an older item"].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const list = history(page).locator(".modal-list");
    // The future-dated occurrence is listed alongside past ones.
    await expect(list).toContainText("2026-09-10");

    // Today's occurrence has no actions of its own — a header showing a
    // zero count, and a dimmed placeholder row instead of any item rows.
    const todayHeader = list.locator(".modal-group-header", { hasText: "2026-09-07" });
    await expect(todayHeader).toContainText("· 0");
    await expect(list.locator(".modal-empty-inline")).toHaveText("No actions in this section");

    // Clicking the header selects it — updating the From block — without
    // jumping away or closing the drawer (unlike clicking an action row).
    await todayHeader.click();
    expect(await currentModal(page)).toBe("history");
    const preview = history(page).locator(".history-preview");
    await expect(preview).toContainText(`From ${todayFilename()}`);
    await expect(preview.locator(".hp-context")).toContainText("nothing actionable yet");
  });

  test("the 'Only Open' toggle hides occurrences with no remaining open actions (§150)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: ["Standup", "=======", "# still open"].join("\n"),
          "2026-09-05.txt": ["Standup", "=======", "v already done"].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const list = history(page).locator(".modal-list");
    await expect(list).toContainText("already done");

    await history(page).getByText("Only Open", { exact: false }).click();
    await expect(list).not.toContainText("2026-09-05");
    await expect(list).not.toContainText("already done");
    await expect(list).toContainText("still open");
  });

  test("the preview pane shows the source context, insert text and target (§109)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\nnothing here yet",
          "2026-09-05.txt": "Standup\n====\n> chase the flaky test\nplain follow-up line",
        },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown"); // into the "Standup" section
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const preview = history(page).locator(".history-preview");
    await expect(preview).toBeVisible();

    // hover the deferred action from the older note to select it (a click
    // would jump to the source file instead)
    await history(page).locator('.modal-item[role="option"]', { hasText: "chase the flaky test" }).hover();

    await expect(preview).toContainText("From 2026-09-05.txt");
    await expect(preview.locator(".hp-context")).toContainText("chase the flaky test");
    // Shift+Enter rewrites a deferred `>` as a fresh open `#`
    await expect(preview.locator(".hp-insert")).toHaveText("# chase the flaky test");
    await expect(preview).toContainText(todayFilename());
  });

  test("#62: opens immediately with a spinner while the disk read is slow, then fills in", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n# something today",
          "2026-09-05.txt": "Standup\n====\n# an older action",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
        delayCommands: { read_all_notes: 1000 },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    // The drawer is open right away — no waiting on the disk read at all
    // (the fix for #62: "it takes a bit of time for the drawer to open").
    // Both the header counter and the empty-list placeholder show their own
    // spinner while loading.
    await expect(history(page)).toBeVisible({ timeout: 500 });
    await expect(history(page).locator(".modal-spinner")).toHaveCount(2);
    await expect(history(page).locator(".modal-empty")).toContainText("Loading history");

    await expect(history(page).locator(".modal-spinner")).toHaveCount(0, { timeout: 2000 });
    await expect(history(page).locator(".modal-list")).toContainText("an older action");
  });

  test("cursor outside any named section shows a toast, no drawer", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "just a floating line, no header");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await expect(history(page)).toBeHidden();
    await expect(page.locator("#stat-message")).toContainText(/section/i);
  });

  test("a long 'From' occurrence scrolls internally instead of growing the modal past 80% of the window (§154 follow-up)", async ({
    page,
  }) => {
    const longBody = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join("\n");
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: `Standup\n=======\n${longBody}` },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown"); // into the "Standup" section
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const card = history(page);
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    const viewportSize = page.viewportSize()!;
    expect(cardBox!.height).toBeLessThanOrEqual(viewportSize.height * 0.8 + 1);

    const fromBody = card.locator(".hp-context");
    const [scrollHeight, clientHeight] = await fromBody.evaluate((el) => [el.scrollHeight, el.clientHeight]);
    expect(scrollHeight).toBeGreaterThan(clientHeight);
  });

  test("the action list fills its column height instead of stopping at a fixed size while the From column grows (#59)", async ({
    page,
  }) => {
    // Enough recurring occurrences that the list is a real, busy one —
    // the shared `.modal-list` rule (used by Action Drawer/Search too)
    // caps at 380px, which used to apply here as well even though this
    // modal's own card can grow much taller (§155's 80vh cap), making
    // the list look cut short next to the "From" column beside it.
    const notes: Record<string, string> = {};
    for (let i = 1; i <= 20; i++) {
      const d = `2026-08-${String(i).padStart(2, "0")}`;
      notes[`${d}.txt`] = `Standup\n=======\n# task from ${d}\n`;
    }
    await seedApp(page, {
      seed: { notes, session: { openTabs: ["2026-08-20.txt"], activeTab: "2026-08-20.txt" } },
    });
    await page.setViewportSize({ width: 1100, height: 900 });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown"); // into the "Standup" section
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const card = history(page);
    await expect(card).toBeVisible();
    const [mainBox, previewBox, listBox] = await Promise.all([
      card.locator(".history-main").boundingBox(),
      card.locator(".history-preview").boundingBox(),
      card.locator(".modal-list").boundingBox(),
    ]);
    // Same height as the "From" column right next to it...
    expect(Math.abs(mainBox!.height - previewBox!.height)).toBeLessThanOrEqual(1);
    // ...which the list itself (inside its own toolbar-topped column)
    // only achieves by no longer being capped at 380px.
    expect(listBox!.height).toBeGreaterThan(380);
  });
});

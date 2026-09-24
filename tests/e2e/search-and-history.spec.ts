import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  setEditorText,
  modalCard,
  MODAL_LABELS,
  activeTabLabel,
  currentModal,
  mockNote,
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

  test("the loading spinner is a true circle: square box, round, ring only, no character inside it", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": "the migration plan" },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
        delayCommands: { read_all_notes: 1500 },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    await search(page).getByRole("radio", { name: "All Files" }).click();
    const spinner = search(page).locator(".modal-spinner");
    await expect(spinner).toBeVisible();
    const box = (await spinner.boundingBox())!;
    expect(Math.abs(box.width - box.height)).toBeLessThan(0.5);
    const style = await spinner.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderTopLeftRadius, overflow: s.overflow, animation: s.animationName };
    });
    expect(style.radius).not.toBe("0px");
    expect(style.overflow).toBe("hidden");
    expect(style.animation).toContain("spin");
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

  test("a repeated operator shows one chip and one click removes it; regex characters in a value never break the modal", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await seedApp(page, { seed: { notes: { [todayFilename()]: "# open one\nv done one" } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    const input = search(page).locator(".modal-input");

    await input.fill("is:open is:open");
    const chips = search(page).locator(".search-chip");
    await expect(chips).toHaveCount(1);
    await chips.first().locator(".chip-remove-btn").click();
    await expect(chips).toHaveCount(0);
    expect(await input.inputValue()).toBe("");

    await input.fill("has:@a(b");
    await expect(chips).toHaveCount(1);
    await input.fill("has:@a.b*+?[");
    await expect(chips).toHaveCount(1);
    await expect(search(page)).toBeVisible();
    expect(errors).toEqual([]);
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

// 2026-09-24 redesign (docs/design/section-history-browse-and-carry-forward-
// roadmap.md): the drawer browses full occurrences glyph-rendered in place,
// rather than aggregating a flat, de-contextualized action list — these
// tests replace the pre-redesign suite entirely.
test.describe("section history (Ctrl/Cmd+Shift+H)", () => {
  const occRow = (page: Page, date: string) => history(page).locator(".modal-group-header", { hasText: date });
  const detailLine = (page: Page, text: string) => history(page).locator(".history-select-line", { hasText: text });

  test("lists every occurrence — past, today (empty), and future — and browsing one shows its full glyph-rendered body", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-10.txt": ["Weekly Sync", "===========", "# a future item"].join("\n"),
          [todayFilename()]: ["Weekly Sync", "===========", "nothing actionable yet"].join("\n"),
          "2026-08-20.txt": ["Weekly Sync", "===========", ""].join("\n"),
          "2026-09-05.txt": [
            "Weekly Sync",
            "===========",
            "- reviewed the roadmap",
            "# chase the vendor (q3)",
            "Next section here",
            "=================",
            "not part of the sync",
          ].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await expect(history(page)).toBeVisible();
    await expect(history(page).locator(".modal-title")).toContainText(/Weekly Sync/);
    const list = history(page).locator(".modal-list");
    await expect(list).toContainText("2026-09-10");
    await expect(list).toContainText(todayFilename().replace(".txt", ""));
    await expect(list).toContainText("2026-09-05");
    await expect(occRow(page, "2026-08-20")).toContainText("no content yet");

    // Browsing the 2026-09-05 occurrence shows its whole body, glyph-
    // rendered (the `#` as ☐, the bullet as •), stopping at the next
    // section header — not just the action lines out of context.
    await occRow(page, "2026-09-05").click();
    const detail = history(page).locator(".history-detail");
    await expect(detail).toContainText("2026-09-05.txt");
    await expect(detail.locator(".hp-context")).toContainText("☐ chase the vendor (q3)");
    await expect(detail.locator(".hp-context")).toContainText("• reviewed the roadmap");
    await expect(detail.locator(".hp-context")).not.toContainText("not part of the sync");

    // Browsing the genuinely empty occurrence shows the placeholder text.
    await occRow(page, "2026-08-20").click();
    await expect(detail.locator(".hp-context")).toContainText("nothing in this section yet");

    // Browsing today's occurrence shows its own prose, and "Open file"
    // jumps there and closes the drawer.
    await occRow(page, todayFilename().replace(".txt", "")).click();
    await expect(detail.locator(".hp-context")).toContainText("nothing actionable yet");
    await detail.getByRole("button", { name: "Open file" }).click();
    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText(todayFilename().replace(".txt", ""));
  });

  test("opened from today: selecting a line offers only 'Insert here', and takes it over into this same note", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n- prior notes",
          "2026-09-05.txt": "Standup\n====\n# renew the cert",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await occRow(page, "2026-09-05").click();
    await detailLine(page, "renew the cert").click();

    const bar = history(page).locator(".history-takeover-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("button")).toHaveCount(1);
    await expect(bar.getByRole("button", { name: "Insert here" })).toBeVisible();

    await bar.getByRole("button", { name: "Insert here" }).click();
    // Source deferred, target (today's own note — opened from here) updated,
    // drawer stays open with the source's new state reflected.
    await expect(detailLine(page, "renew the cert")).toContainText("»"); // deferred glyph
    await expect.poll(() => mockNote(page, "2026-09-05.txt")).toContain("> renew the cert");
    await expect.poll(() => mockNote(page, todayFilename())).toBe("Standup\n====\n- prior notes\n\n# renew the cert");
  });

  test("opened from a past note: selecting a line offers 'Today' and 'Next occurrence'", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          // Opened from here — browsing a *different*, earlier occurrence
          // below is what should offer destinations at all (browsing the
          // opened-from note itself never does — nothing to carry it to).
          "2026-09-01.txt": "Standup\n====\nsomething from today's own past note",
          "2026-08-25.txt": "Standup\n====\n# an old item",
          "2026-09-10.txt": "Standup\n====\n", // the next occurrence, already on disk
        },
        session: { openTabs: ["2026-09-01.txt"], activeTab: "2026-09-01.txt" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await occRow(page, "2026-08-25").click();
    await detailLine(page, "an old item").click();
    const bar = history(page).locator(".history-takeover-bar");
    await expect(bar.getByRole("button", { name: "→ Today" })).toBeVisible();
    await expect(bar.getByRole("button", { name: /→ Next occurrence/ })).toBeVisible();

    await bar.getByRole("button", { name: "→ Today" }).click();
    await expect.poll(() => mockNote(page, todayFilename())).toContain("# an old item");
    await expect.poll(() => mockNote(page, "2026-08-25.txt")).toContain("> an old item");
  });

  test("Shift+click extends the selection to a range; the whole range is taken over together", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": "Standup\n====\n# first\nplain middle line\n# second",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await occRow(page, "2026-09-05").click();
    await detailLine(page, "first").click();
    await detailLine(page, "second").click({ modifiers: ["Shift"] });
    await expect(history(page).locator(".history-line-selected")).toHaveCount(3);

    await history(page).getByRole("button", { name: "Insert here" }).click();
    await expect.poll(() => mockNote(page, todayFilename())).toBe(
      "Standup\n====\n# first\nplain middle line\n# second",
    );
  });

  test("a single 'prose => action' line offers Whole line / Action only; only the action lands with 'Action only'", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": "Standup\n====\nTalked to Ana => # chase the invoice",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await occRow(page, "2026-09-05").click();
    await detailLine(page, "chase the invoice").click();

    const bar = history(page).locator(".history-takeover-bar");
    await expect(bar.getByRole("radio", { name: "Whole line" })).toBeVisible();
    await bar.getByRole("radio", { name: "Action only" }).click();
    await bar.getByRole("button", { name: "Insert here" }).click();

    await expect.poll(() => mockNote(page, todayFilename())).toBe("Standup\n====\n# chase the invoice");
  });

  test("a plain leading action line has no Whole line / Action only choice — nothing to strip", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": "Standup\n====\n# renew the cert",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await occRow(page, "2026-09-05").click();
    await detailLine(page, "renew the cert").click();
    await expect(history(page).locator(".history-takeover-bar").getByRole("radio")).toHaveCount(0);
  });

  test("re-adopts a deferred line as a fresh open action when taken over (decision #3)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": "Standup\n====\n> chase the flaky test",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await occRow(page, "2026-09-05").click();
    await detailLine(page, "chase the flaky test").click();
    await history(page).getByRole("button", { name: "Insert here" }).click();
    await expect.poll(() => mockNote(page, todayFilename())).toBe("Standup\n====\n# chase the flaky test");
  });

  test("browsing the note History was opened from offers no take-over — nowhere to carry it to", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "Standup\n====\n# today's own item" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await detailLine(page, "today's own item").click();
    await expect(history(page).locator(".history-takeover-bar")).toHaveCount(0);
    await expect(history(page)).toContainText("nothing to carry it over to");
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
    await expect(history(page)).toBeVisible({ timeout: 500 });
    await expect(history(page).locator(".modal-spinner")).toHaveCount(2);
    await expect(history(page).locator(".modal-empty")).toContainText("Loading history");

    await expect(history(page).locator(".modal-spinner")).toHaveCount(0, { timeout: 2000 });
    await expect(history(page).locator(".modal-list")).toContainText("2026-09-05");
  });

  test("cursor outside any named section shows a toast, no drawer", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "just a floating line, no header");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await expect(history(page)).toBeHidden();
    await expect(page.locator("#stat-message")).toContainText(/section/i);
  });

  test("a long occurrence body scrolls internally instead of growing the modal past 80% of the window (§154 follow-up)", async ({
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

    const detailBody = card.locator(".hp-context");
    const [scrollHeight, clientHeight] = await detailBody.evaluate((el) => [el.scrollHeight, el.clientHeight]);
    expect(scrollHeight).toBeGreaterThan(clientHeight);
  });

  test("the occurrence list fills its column height instead of stopping at a fixed size while the detail column grows (#59)", async ({
    page,
  }) => {
    // Enough recurring occurrences that the list is a real, busy one —
    // the shared `.modal-list` rule (used by Action Drawer/Search too)
    // caps at 380px, which used to apply here as well even though this
    // modal's own card can grow much taller (§155's 80vh cap), making
    // the list look cut short next to the detail column beside it.
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
    const [mainBox, detailBox, listBox] = await Promise.all([
      card.locator(".history-main").boundingBox(),
      card.locator(".history-detail").boundingBox(),
      card.locator(".modal-list").boundingBox(),
    ]);
    // Same height as the detail column right next to it...
    expect(Math.abs(mainBox!.height - detailBox!.height)).toBeLessThanOrEqual(1);
    // ...which the list itself only achieves by no longer being capped at 380px.
    expect(listBox!.height).toBeGreaterThan(380);
  });
});

import { test, expect, type Locator, type Page } from "@playwright/test";
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
  // Scoped to the scrollable strip specifically (never a `.pinned-slot`
  // duplicate, which only lives outside it) — a pinned slot for the same
  // date can coexist once scrolled out of view, which would otherwise
  // make this locator ambiguous.
  const occRow = (page: Page, date: string) => history(page).locator(".history-occ-strip .history-occ-tab", { hasText: date });
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
    const strip = history(page).locator(".history-occ-strip");
    await expect(strip).toContainText("2026-09-10");
    await expect(strip).toContainText(todayFilename().replace(".txt", ""));
    await expect(strip).toContainText("2026-09-05");
    await expect(occRow(page, "2026-08-20")).toHaveClass(/\bempty\b/);

    // Browsing the 2026-09-05 occurrence shows its whole body, glyph-
    // rendered (the `#` as ☐, the bullet as •), stopping at the next
    // section header — not just the action lines out of context.
    await occRow(page, "2026-09-05").click();
    const detail = history(page).locator(".history-detail");
    await expect(detail.locator(".hp-context")).toContainText("☐ chase the vendor (q3)");
    await expect(detail.locator(".hp-context")).toContainText("• reviewed the roadmap");
    await expect(detail.locator(".hp-context")).not.toContainText("not part of the sync");

    // Browsing the genuinely empty occurrence shows the placeholder text.
    await occRow(page, "2026-08-20").click();
    await expect(detail.locator(".hp-context")).toContainText("nothing in this section yet");

    // Browsing today's occurrence shows its own prose, and double-clicking
    // its tab jumps there and closes the drawer — the filename is never
    // shown in the detail pane (the selected tab already names the date).
    await occRow(page, todayFilename().replace(".txt", "")).click();
    await expect(detail.locator(".hp-context")).toContainText("nothing actionable yet");
    await expect(detail).not.toContainText(todayFilename());
    await occRow(page, todayFilename().replace(".txt", "")).dblclick();
    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText(todayFilename().replace(".txt", ""));
  });

  test("opened from today: selecting a line offers only 'Add to today', and takes it over into this same note", async ({
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
    await expect(bar.getByRole("button", { name: "Add to today" })).toBeVisible();

    await bar.getByRole("button", { name: "Add to today" }).click();
    // Source deferred, target (today's own note — opened from here) updated,
    // drawer stays open with the source's new state reflected.
    await expect(detailLine(page, "renew the cert")).toContainText("»"); // deferred glyph
    await expect.poll(() => mockNote(page, "2026-09-05.txt")).toContain("> renew the cert");
    await expect.poll(() => mockNote(page, todayFilename())).toBe("Standup\n====\n- prior notes\n\n# renew the cert");
  });

  test("opened from a past note: selecting a line offers 'Add to today' and 'Add to next occurrence'", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          // Opened from here — a different, earlier occurrence below also
          // offers both destinations (they're different files from either
          // one), and so does this note itself (see the dedicated
          // "opened from a past note: browsing that same note" test below).
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
    await expect(bar.getByRole("button", { name: "Add to today" })).toBeVisible();
    await expect(bar.getByRole("button", { name: /Add to next occurrence/ })).toBeVisible();

    await bar.getByRole("button", { name: "Add to today" }).click();
    await expect.poll(() => mockNote(page, todayFilename())).toContain("# an old item");
    await expect.poll(() => mockNote(page, "2026-08-25.txt")).toContain("> an old item");
  });

  // 2026-09-26 bug fix: the old rule disabled *all* take-over whenever the
  // browsed occurrence was the one History was opened from — right when
  // "here" is also that occurrence (opened from today/future/scratchpad),
  // wrong when opened from the past, where "Today"/"Next occurrence" are
  // different files entirely and there's something real to forward to. It
  // also missed the mirror-image bug: browsing *today's own* occurrence
  // while "Today" is offered is exactly as self-referential, but wasn't
  // caught at all — reported as "selecting lines on today... does not copy
  // them but does mark an open action as deferred" (the self-write raced
  // two edits against the same file and silently dropped the insertion).
  test("bug fix: opened from a past note — that note's own lines can be forwarded to today; today's own lines get no self-referential button", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-01.txt": "Standup\n====\n# old item",
          [todayFilename()]: "Standup\n====\n# today item",
        },
        session: { openTabs: ["2026-09-01.txt"], activeTab: "2026-09-01.txt" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    // Browsing the very note History was opened from: "Add to today" is a
    // different file, so it's offered and actually copies the line.
    await detailLine(page, "old item").click();
    await expect(history(page).getByRole("button", { name: "Add to today" })).toBeVisible();
    await history(page).getByRole("button", { name: "Add to today" }).click();
    await expect.poll(() => mockNote(page, "2026-09-01.txt")).toContain("> old item");
    await expect.poll(() => mockNote(page, todayFilename())).toContain("# old item");

    // Browsing today's own occurrence: "Add to today" would write source
    // and target to the same file, so it's not offered at all (the only
    // destination here, so the bar disappears entirely).
    await occRow(page, todayFilename().replace(".txt", "")).click();
    await detailLine(page, "today item").click();
    await expect(history(page).locator(".history-takeover-bar")).toHaveCount(0);
    await expect(history(page)).toContainText("nowhere else to carry this over to");
  });

  test("opened from a past note, a section already exists today: 'Add to next occurrence' is never offered (Today already covers it)", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-01.txt": "Standup\n====\nold prose",
          [todayFilename()]: "Standup\n====\n# today item",
          "2026-09-20.txt": "Standup\n====\n# future item",
        },
        session: { openTabs: ["2026-09-01.txt"], activeTab: "2026-09-01.txt" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    // Browsing the opened-from note: Today is a different file, offered;
    // Next occurrence was never computed at all (the search stops at the
    // first match after the anchor, which is today).
    await detailLine(page, "old prose").click();
    let bar = history(page).locator(".history-takeover-bar");
    await expect(bar.getByRole("button", { name: "Add to today" })).toBeVisible();
    await expect(bar.getByRole("button", { name: /Add to next occurrence/ })).toHaveCount(0);

    // Browsing today's own occurrence: the only destination there ever was
    // is "Today" itself, so nothing is left to offer.
    await occRow(page, todayFilename().replace(".txt", "")).click();
    await detailLine(page, "today item").click();
    await expect(history(page).locator(".history-takeover-bar")).toHaveCount(0);
    await expect(history(page)).toContainText("nowhere else to carry this over to");

    // Browsing the future occurrence: Today is still a different file.
    await occRow(page, "2026-09-20").click();
    await detailLine(page, "future item").click();
    bar = history(page).locator(".history-takeover-bar");
    await expect(bar.getByRole("button", { name: "Add to today" })).toBeVisible();
  });

  test("opened from a past note, only a future occurrence exists (no section today yet): browsing it hides 'Add to next occurrence' but keeps 'Add to today'", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-01.txt": "Standup\n====\nold prose",
          "2026-09-20.txt": "Standup\n====\n# future item",
        },
        session: { openTabs: ["2026-09-01.txt"], activeTab: "2026-09-01.txt" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    // Today has no section yet, so it isn't in the strip at all — only the
    // opened-from date and the future one are.
    await expect(history(page).locator(".history-occ-tab")).toHaveCount(2);

    await occRow(page, "2026-09-20").click();
    await detailLine(page, "future item").click();
    const bar = history(page).locator(".history-takeover-bar");
    await expect(bar.getByRole("button", { name: "Add to today" })).toBeVisible();
    await expect(bar.getByRole("button", { name: /Add to next occurrence/ })).toHaveCount(0);
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

    await history(page).getByRole("button", { name: "Add to today" }).click();
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
    await bar.getByRole("button", { name: "Add to today" }).click();

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
    await history(page).getByRole("button", { name: "Add to today" }).click();
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
    await expect(history(page)).toContainText("nowhere else to carry this over to");
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
    await expect(history(page).locator(".history-occ-loading")).toContainText("Loading history");

    await expect(history(page).locator(".modal-spinner")).toHaveCount(0, { timeout: 2000 });
    await expect(history(page).locator(".history-occ-strip")).toContainText("2026-09-05");
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

  test("the occurrence strip stays a compact single row and scrolls horizontally, even with many occurrences (2026-09-25 redesign)", async ({
    page,
  }) => {
    // Enough recurring occurrences that the strip genuinely overflows its
    // own width — it should scroll horizontally rather than growing the
    // modal taller (that's what a vertical sidebar list used to do; the
    // whole point of the redesign is giving the note body the space back).
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
    const [cardBox, stripBox, detailBox] = await Promise.all([
      card.boundingBox(),
      card.locator(".history-occ-strip").boundingBox(),
      card.locator(".history-detail").boundingBox(),
    ]);
    // The strip is a thin row, not a tall column...
    expect(stripBox!.height).toBeLessThan(50);
    // ...and the note body — not the strip — gets the space the card has
    // to give.
    expect(detailBox!.height).toBeGreaterThan(stripBox!.height * 2);
    // The card is a fixed ~80% of the viewport regardless of content —
    // not "up to" 80%, per the chat feedback that switching dates used to
    // visibly resize the whole modal.
    expect(cardBox!.height).toBeGreaterThan(900 * 0.8 - 2);
    expect(cardBox!.height).toBeLessThan(900 * 0.8 + 2);
    const [scrollWidth, clientWidth] = await card
      .locator(".history-occ-strip")
      .evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });

  test("occurrence tabs show a dot reflecting that date's own open/closed/no-actions state", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n# an open item",
          "2026-09-05.txt": "Standup\n====\nv a done item",
          "2026-09-01.txt": "Standup\n====\njust some prose, no actions",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await expect(occRow(page, todayFilename().replace(".txt", "")).locator(".occ-dot")).toHaveClass(/has-pending/);
    await expect(occRow(page, "2026-09-05").locator(".occ-dot")).toHaveClass(/has-done/);
    await expect(occRow(page, "2026-09-01").locator(".occ-dot")).toHaveClass(/has-log/);
  });

  test("Left/Right cycle between occurrence dates, wrapping at either end", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": "Standup\n====\n# b",
          "2026-09-01.txt": "Standup\n====\n# a",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    // Chronological order, oldest at the left — opened from today, which is
    // the newest of the three and so sits at the strip's right end.
    const today = todayFilename().replace(".txt", "");
    await expect(occRow(page, today)).toHaveClass(/active/);

    await page.keyboard.press("ArrowLeft");
    await expect(occRow(page, "2026-09-05")).toHaveClass(/active/);

    await page.keyboard.press("ArrowRight");
    await expect(occRow(page, today)).toHaveClass(/active/);

    // Wraps past the newest occurrence back around to the oldest.
    await page.keyboard.press("ArrowRight");
    await expect(occRow(page, "2026-09-01")).toHaveClass(/active/);
  });

  test("occurrence tabs render left-to-right in chronological order, oldest to newest", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": "Standup\n====\n",
          "2026-09-01.txt": "Standup\n====\n",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const dates = await history(page).locator(".history-occ-date").allTextContents();
    expect(dates).toEqual(["2026-09-01", "2026-09-05", todayFilename().replace(".txt", "")]);
  });

  test("opens focused on the occurrence for the note History was opened from", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": "Standup\n====\n# an old item",
        },
        // Opened from the *older* note — the strip should focus that date,
        // not the newest one (today) it happens to render at the right end.
        session: { openTabs: ["2026-09-05.txt"], activeTab: "2026-09-05.txt" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await expect(occRow(page, "2026-09-05")).toHaveClass(/active/);
    await expect(occRow(page, todayFilename().replace(".txt", ""))).not.toHaveClass(/active/);
  });

  // 2026-09-27 bug fix: the previous focus-on-open logic ran once in
  // `onMount`, before `historyOccurrences` had actually filled in (#62
  // means it always starts `[]` and fills in later, once the disk read
  // resolves) — it silently found no match and left `selectedIndex` at 0,
  // which is the *oldest* date now that the strip sorts oldest-first.
  // A fast mock read can resolve quickly enough to mask this (the existing
  // "opens focused" test above didn't fail), so this test forces the read
  // to be genuinely slow — the same `delayCommands` pattern the #62 tests
  // themselves use — to deterministically exercise the race that exposed
  // the bug in real use.
  test("bug fix: still focuses the opened-from occurrence when the disk read is slow (#62-style race)", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-08-01.txt": "Standup\n====\n# oldest item",
          "2026-09-01.txt": "Standup\n====\n# opened from here",
          "2026-09-20.txt": "Standup\n====\n# newest item",
        },
        session: { openTabs: ["2026-09-01.txt"], activeTab: "2026-09-01.txt" },
        delayCommands: { read_all_notes: 500 },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await expect(history(page).locator(".modal-spinner")).toHaveCount(0, { timeout: 2000 });
    await expect(occRow(page, "2026-09-01")).toHaveClass(/active/);
    await expect(occRow(page, "2026-08-01")).not.toHaveClass(/active/);
  });

  test("scroll-left/right buttons appear once the strip overflows, scroll it (not the selection), and wrap at the ends", async ({
    page,
  }) => {
    const notes: Record<string, string> = {};
    for (let i = 1; i <= 20; i++) {
      const d = `2026-08-${String(i).padStart(2, "0")}`;
      notes[`${d}.txt`] = `Standup\n=======\n# task from ${d}\n`;
    }
    await seedApp(page, {
      seed: { notes, session: { openTabs: ["2026-08-01.txt"], activeTab: "2026-08-01.txt" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const card = history(page);
    const leftBtn = card.getByRole("button", { name: "Scroll dates left" });
    const rightBtn = card.getByRole("button", { name: "Scroll dates right" });
    await expect(leftBtn).toBeVisible();
    await expect(rightBtn).toBeVisible();

    // Opened from the oldest (leftmost) date — already scrolled fully
    // left, so clicking "left" wraps around to the far (right) end,
    // exactly like the main tab strip's own scroll arrows.
    const strip = card.locator(".history-occ-strip");
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
    // The selection must not move — these buttons scroll the view, they
    // don't change which occurrence is browsed (matching the main tab
    // strip's own arrows, which never change the active tab either).
    await expect(occRow(page, "2026-08-01")).toHaveClass(/active/);

    // `maxScroll` isn't captured once up front — scrolling the opened-from
    // tab out of view can pin a duplicate of it outside the strip (see the
    // dedicated pinned-slot test), narrowing the strip and changing what
    // "the far end" actually is; recomputed fresh each time stays correct
    // regardless of whether that happens to fire here too.
    const currentMaxScroll = () => strip.evaluate((el) => el.scrollWidth - el.clientWidth);
    await leftBtn.click();
    // Wait for the smooth-scroll wrap to fully settle at the end before
    // clicking again — clicking mid-animation would read a stale,
    // not-yet-`maxScroll` position and scroll normally instead of
    // wrapping, which is a real flake source, not a fresh assertion.
    await expect.poll(async () => {
      const [scrollLeft, maxScroll] = await Promise.all([strip.evaluate((el) => el.scrollLeft), currentMaxScroll()]);
      return Math.abs(scrollLeft - maxScroll) <= 1;
    }).toBe(true);
    await expect(occRow(page, "2026-08-01")).toHaveClass(/active/);

    await rightBtn.click();
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
  });

  test("the active occurrence tab squares off its bottom corners, connecting it to the note body below", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "Standup\n====\n# today item" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const radius = await history(page)
      .locator(".history-occ-tab.active")
      .evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).toBe("5px 5px 0px 0px");
  });

  // 2026-09-27 bug fix: chat feedback that the active tab, matched to the
  // (darker) note-body background as the "visual connection" cue, was
  // "very hard to see... if that is a past date, as it is gray on gray" —
  // `--surface-canvas` (#1e1e1e) is actually darker than the strip's own
  // `--surface-chrome` (#252526), so the "highlighted" tab was *less*
  // prominent than an unselected one, and the past-date dimming (meant
  // only for at-a-glance scanning of unselected tabs) hit the tab's only
  // text at all once combined with it. Fixed by going back to
  // `--surface-raised` (clearly lighter, the same token every other
  // active control uses) and only dimming past dates when *not* selected.
  test("bug fix: a selected occurrence stays clearly legible even when it's a past date", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-08-01.txt": "Standup\n====\n# an old item",
          [todayFilename()]: "Standup\n====\n# today item",
        },
        session: { openTabs: ["2026-08-01.txt"], activeTab: "2026-08-01.txt" },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const card = history(page);
    const activePastTab = occRow(page, "2026-08-01");
    await expect(activePastTab).toHaveClass(/active/);
    await expect(activePastTab).toHaveClass(/past/);

    const [activeBg, chromeBg, dateOpacity] = await Promise.all([
      activePastTab.evaluate((el) => getComputedStyle(el).backgroundColor),
      card.locator(".history-occ-strip-row").evaluate((el) => getComputedStyle(el).backgroundColor),
      activePastTab.locator(".history-occ-date").evaluate((el) => getComputedStyle(el).opacity),
    ]);
    // A real highlight, not just a same-or-darker tone the past dimming
    // then washes out further.
    expect(activeBg).not.toBe(chromeBg);
    expect(dateOpacity).toBe("1");

    // The same active background regardless of date-class — a past tab
    // being selected must look exactly as prominent as any other.
    await occRow(page, todayFilename().replace(".txt", "")).click();
    const activeTodayBg = await occRow(page, todayFilename().replace(".txt", "")).evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(activeBg).toBe(activeTodayBg);
  });

  // 2026-09-28: replaces `position: sticky` (which made the pinned tab
  // visually hover over whatever else was scrolling underneath it — chat
  // feedback that this specifically wasn't wanted) with a genuine layout
  // reflow: a small duplicate ("pinned slot") renders as an ordinary flex
  // sibling of the scrollable strip, outside it, only once the real tab
  // has actually scrolled out of view — shrinking the strip's own
  // available width to make room for itself rather than floating above it.
  test("today's tab and the opened-from tab get a real pinned slot (not an overlay) once scrolled out of view, and it shrinks the strip", async ({
    page,
  }) => {
    // Enough occurrences that a strip-width's worth of tabs (roughly 8-9
    // at this modal size) can't cover the opened-from date *and* the
    // oldest one at the same time — with only ~15 total (the original
    // size here) they were close enough together that scrolling to the
    // oldest could still leave the opened-from one in view too, which
    // undersold the point of this test.
    const notes: Record<string, string> = {
      [todayFilename()]: "Standup\n====\n# today item",
    };
    for (let i = 1; i <= 30; i++) {
      const d = `2026-06-${String(i).padStart(2, "0")}`;
      notes[`${d}.txt`] = `Standup\n=======\n# task from ${d}\n`;
    }
    // Opened from the middle of that older range — well away from both
    // today's tab and the strip's own left edge either way.
    await seedApp(page, {
      seed: { notes, session: { openTabs: ["2026-06-15.txt"], activeTab: "2026-06-15.txt" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const card = history(page);
    const strip = card.locator(".history-occ-strip");
    const pinnedToday = card.locator(".history-occ-strip-row > .history-occ-tab.pinned-slot.pinned-today");
    const pinnedSource = card.locator(".history-occ-strip-row > .history-occ-tab.pinned-slot.pinned-source");

    // Opened from 2026-06-15 (already on screen) — no pinned slot needed
    // for it yet, so the strip has its full available width.
    await expect(pinnedSource).toHaveCount(0);
    const widthBefore = (await strip.boundingBox())!.width;

    // Browse all the way to the oldest (leftmost) date via the keyboard —
    // far from both pinned dates. 2026-06-15 is the 15th of 31
    // occurrences (0-indexed 14) — exactly 14 presses reaches the oldest
    // (index 0) without wrapping.
    for (let i = 0; i < 14; i++) await page.keyboard.press("ArrowLeft");
    await expect(occRow(page, "2026-06-01")).toHaveClass(/active/);

    await expect(pinnedToday).toBeVisible();
    await expect(pinnedSource).toBeVisible();
    // A real reflow, not an overlay: the strip is now narrower, having
    // given up width to the two new pinned slots beside it.
    const widthAfter = (await strip.boundingBox())!.width;
    expect(widthAfter).toBeLessThan(widthBefore);

    // Clicking a pinned slot reveals + selects the real tab; the
    // now-unneeded duplicate disappears.
    await pinnedSource.click();
    await expect(occRow(page, "2026-06-15")).toHaveClass(/active/);
    await expect(pinnedSource).toHaveCount(0);
  });

  test("Up/Down move a single-line selection; Shift+Up/Down grow or shrink the range", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": "Standup\n====\n# line a\n# line b\n# line c",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await occRow(page, "2026-09-05").click();
    await page.keyboard.press("ArrowDown");
    await expect(detailLine(page, "line a")).toHaveClass(/history-line-selected/);
    await expect(history(page).locator(".history-line-selected")).toHaveCount(1);

    await page.keyboard.press("ArrowDown");
    await expect(detailLine(page, "line b")).toHaveClass(/history-line-selected/);
    await expect(history(page).locator(".history-line-selected")).toHaveCount(1);

    await page.keyboard.press("Shift+ArrowDown");
    await expect(history(page).locator(".history-line-selected")).toHaveCount(2);
    await expect(detailLine(page, "line b")).toHaveClass(/history-line-selected/);
    await expect(detailLine(page, "line c")).toHaveClass(/history-line-selected/);

    // Shift+Up shrinks the same range back down rather than moving a
    // brand new single-line selection.
    await page.keyboard.press("Shift+ArrowUp");
    await expect(history(page).locator(".history-line-selected")).toHaveCount(1);
    await expect(detailLine(page, "line b")).toHaveClass(/history-line-selected/);
  });

  test("click-and-drag with the mouse selects a range of lines", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": "Standup\n====\n# line a\n# line b\n# line c",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await occRow(page, "2026-09-05").click();
    const lineA = detailLine(page, "line a");
    const lineC = detailLine(page, "line c");
    const boxA = (await lineA.boundingBox())!;
    const boxC = (await lineC.boundingBox())!;

    await page.mouse.move(boxA.x + 5, boxA.y + boxA.height / 2);
    await page.mouse.down();
    await page.mouse.move(boxC.x + 5, boxC.y + boxC.height / 2, { steps: 5 });
    await page.mouse.up();

    await expect(history(page).locator(".history-line-selected")).toHaveCount(3);
  });

  test("Ctrl/Cmd+Tab does not escape the drawer to switch the main tab strip underneath it (regression)", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n# today item",
          "2026-09-05.txt": "Standup\n====\n# old item",
        },
        session: { openTabs: [todayFilename(), "2026-09-05.txt"], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(history(page)).toBeVisible();

    await page.keyboard.press("ControlOrMeta+Tab");

    // The drawer is still open and the active tab underneath is unchanged
    // — Ctrl+Tab used to leak through and cycle the main tab strip while
    // a modal was open.
    await expect(history(page)).toBeVisible();
    await expect(activeTabLabel(page)).toHaveText(todayFilename().replace(".txt", ""));
  });

  test("no filename is shown, and there's no separate 'Open file' button — double-click a tab instead", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": "Standup\n====\n# an old item",
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    await occRow(page, "2026-09-05").click();
    await expect(history(page)).not.toContainText("2026-09-05.txt");
    await expect(history(page).getByRole("button", { name: "Open file" })).toHaveCount(0);

    // Double-clicking a *different* tab than the one currently browsed
    // still jumps straight there — it doesn't require single-clicking it
    // first.
    await occRow(page, todayFilename().replace(".txt", "")).dblclick();
    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText(todayFilename().replace(".txt", ""));
  });

  test("the selected tab's colored line follows past/today/future, like the main tab strip (#96)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-10.txt": "Standup\n====\n", // future
          [todayFilename()]: "Standup\n====\n",
          "2026-09-01.txt": "Standup\n====\n", // past
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const shadow = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).boxShadow);
    const today = todayFilename().replace(".txt", "");

    const todayShadow = await shadow(occRow(page, today));
    await occRow(page, "2026-09-01").click();
    const pastShadow = await shadow(occRow(page, "2026-09-01"));
    await occRow(page, "2026-09-10").click();
    const futureShadow = await shadow(occRow(page, "2026-09-10"));

    expect(new Set([todayShadow, pastShadow, futureShadow]).size).toBe(3);
  });

  test("Shift+Enter takes over the current selection to the primary destination, same as clicking its button", async ({
    page,
  }) => {
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
    await page.keyboard.press("ArrowDown");
    await expect(detailLine(page, "renew the cert")).toHaveClass(/history-line-selected/);

    // The footer names the exact same destination the button would.
    await expect(history(page).locator(".modal-footer")).toContainText("Add to today");

    await page.keyboard.press("Shift+Enter");
    await expect.poll(() => mockNote(page, "2026-09-05.txt")).toContain("> renew the cert");
    await expect.poll(() => mockNote(page, todayFilename())).toBe("Standup\n====\n# renew the cert");
  });

  test("the modal height stays constant (~80% of the window) switching between a short and a long occurrence", async ({
    page,
  }) => {
    const longBody = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join("\n");
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Standup\n====\n",
          "2026-09-05.txt": `Standup\n====\n${longBody}`,
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await page.setViewportSize({ width: 1000, height: 800 });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const card = history(page);
    const shortHeight = (await card.boundingBox())!.height;
    await occRow(page, "2026-09-05").click();
    const longHeight = (await card.boundingBox())!.height;

    expect(shortHeight).toBeCloseTo(longHeight, 0);
    expect(shortHeight).toBeCloseTo(800 * 0.8, 0);
  });
});

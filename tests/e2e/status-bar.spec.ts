import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, todayFilename, modalCard, MODAL_LABELS } from "./helpers";

test.describe("status bar — three zones (§100/§110)", () => {
  test("left zone tracks cursor, word count and action counts", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "# open one\nv done two\nplain words here" } } });

    await expect(page.locator("#stat-words")).toHaveText("9 words");
    await expect(page.locator("#stat-open .stat-full")).toHaveText("1 open");
    await expect(page.locator("#stat-closed .stat-full")).toHaveText("1 done");

    await setEditorText(page, "just three words");
    await expect(page.locator("#stat-words")).toHaveText("3 words");
    await setEditorText(page, "solo");
    await expect(page.locator("#stat-words")).toHaveText("1 word");
  });

  test("#37/#38: left zone shows how many lines are selected", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "line one\nline two\nline three" } } });
    await editor(page).click();
    await expect(page.locator("#stat-selection")).toHaveCount(0);

    // select the whole document
    await page.keyboard.press("ControlOrMeta+A");
    await expect(page.locator("#stat-selection")).toHaveText("3 lines selected");

    // a within-line selection is still "1 line selected" — no character count
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.locator("#stat-selection")).toHaveText("1 line selected");

    // clearing the selection removes the readout
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#stat-selection")).toHaveCount(0);
  });

  test("centre zone is empty until a transient message appears", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "no actions here" } } });
    await expect(page.locator("#stat-message")).toHaveCount(0);

    await editor(page).click();
    await page.keyboard.press("Control+KeyJ"); // "No open actions in this note"
    await expect(page.locator("#stat-message")).toContainText(/no open actions/i);
  });

  test("a failed save surfaces as a red dot on the active tab, not a status readout", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "start" } } });
    await page.evaluate(() => {
      window.__CHRONO_MOCK__!.throwOnCommands = new Set(["write_note"]);
    });
    await editor(page).click();
    await page.keyboard.type("x");
    // debounced write (400ms) then it rejects
    const dot = page.locator("#tab-bar .tab.active .tab-status-dot.err");
    await expect(dot).toBeVisible({ timeout: 3000 });
    // no persistent text readout in the centre zone
    await expect(page.locator("#stat-save")).toHaveCount(0);
  });

  test("right zone: the ? shortcut trigger opens the combined drawer; the version is no longer shown (§B4)", async ({ page }) => {
    await seedApp(page, { seed: { notes: {}, appVersion: "9.9.9" } });
    await expect(page.locator("#stat-version")).toHaveCount(0);

    await page.locator(".status-help").click();
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeVisible();
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toContainText("Symbols → glyphs");
  });

  test("#58: the About icon comes last - after the shortcuts trigger - and opens About", async ({
    page,
  }) => {
    await seedApp(page, { seed: { notes: {}, appVersion: "9.9.9", updateCheck: "none" } });

    const order = await page.locator(".status-right").evaluate((el) =>
      // The component's own class, not the full className: scoped styles add Svelte's hash class.
      [...el.querySelectorAll("#stat-version, .status-about-btn, .status-help")].map(
        (n) => n.id || [...n.classList].find((c) => c === "status-help" || c === "status-about-btn"),
      ),
    );
    expect(order).toEqual(["status-help", "status-about-btn"]);

    await page.locator(".status-about-btn").click();
    await expect(modalCard(page, MODAL_LABELS.about)).toBeVisible();
  });

  test("#58: the status-bar About icon stays reachable even on a narrow window, unlike the old top-bar button", async ({
    page,
  }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });

    await page.locator(".status-about-btn").click();
    await expect(modalCard(page, MODAL_LABELS.about)).toBeVisible();
  });

  test("§update-check follow-up: clicking the 'update available' status message opens About; other messages stay plain text", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "no actions here" },
        updateCheck: "available",
        updateCheckVersion: "9.9.9",
        autoCheckUpdates: true,
      },
    });
    // The launch-time check's toast is specifically clickable.
    const message = page.locator("#stat-message");
    await expect(message).toContainText(/update available/i, { timeout: 5000 });
    await expect(page.locator("button#stat-message")).toHaveCount(1);
    await message.click();
    await expect(modalCard(page, MODAL_LABELS.about)).toBeVisible();
    await page.keyboard.press("Escape");

    // An unrelated toast (still while an update happens to be available)
    // is plain text, not a link to About.
    await editor(page).click();
    await page.keyboard.press("Control+KeyJ"); // "No open actions in this note"
    await expect(page.locator("#stat-message")).toContainText(/no open actions/i);
    await expect(page.locator("button#stat-message")).toHaveCount(0);
  });

  test("§147: narrow-width collapse drops least-useful info first, keeps counts + help pinned", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "# one\nv two\n> three" } } });
    const leftZone = page.locator(".status-left");
    const rightZone = page.locator(".status-right");

    // Full width: everything shown, compact forms hidden.
    await page.setViewportSize({ width: 1000, height: 700 });
    await expect(page.locator("#stat-pos")).toBeVisible();
    await expect(page.locator("#stat-words")).toBeVisible();
    await expect(leftZone).toContainText("1 open");
    await expect(leftZone.locator(".stat-compact").first()).toBeHidden();

    // Tier 1 (<=680px): word count drops first; position stays.
    await page.setViewportSize({ width: 650, height: 700 });
    await expect(page.locator("#stat-pos")).toBeVisible();
    await expect(page.locator("#stat-words")).toBeHidden();

    // Tier 2 (<=520px): position drops too — counts read with no orphan
    // leading separator. `toHaveText` checks raw textContent (includes
    // hidden siblings), so read `innerText` directly to see what's
    // actually rendered.
    await page.setViewportSize({ width: 500, height: 700 });
    await expect(page.locator("#stat-pos")).toBeHidden();
    await expect(leftZone).toContainText("1 open");
    await expect(leftZone).toContainText("1 deferred");
    await expect(leftZone).toContainText("1 done");

    // Tier 3 (<=420px, phone width): counts switch to compact glyph form,
    // the version number disappears, and nothing overflows — the exact
    // scenario reported from a phone-width web app screenshot.
    await page.setViewportSize({ width: 390, height: 700 });
    await expect(page.locator("#stat-open .stat-full")).toBeHidden();
    await expect(leftZone.locator(".stat-compact").first()).toBeVisible();
    await expect(page.locator("#stat-open .stat-compact")).toHaveText("1");
    const overflowing = await page
      .locator("#status-bar")
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflowing).toBe(false);

    await expect(rightZone.locator(".status-help")).toBeVisible();
  });

  test("§update-check: finding an update shows the InfoBar and its action opens About", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: { notes: {}, updateCheck: "none" },
    });
    await expect(page.locator(".info-bar")).toHaveCount(0);

    await page.evaluate(() => {
      window.__CHRONO_MOCK__!.updateCheck = "available";
      window.__CHRONO_MOCK__!.updateCheckVersion = "9.9.9";
    });
    await page.keyboard.press("ControlOrMeta+Comma");
    await page.getByRole("tab", { name: "Updates", exact: true }).click();
    await page.getByRole("button", { name: "Check now" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();

    const infoBar = page.locator(".info-bar");
    await expect(infoBar).toBeVisible();
    await expect(infoBar).toContainText("ChronoNote 9.9.9 is available.");
    await infoBar.locator(".info-bar-action").click();
    await expect(modalCard(page, MODAL_LABELS.about)).toBeVisible();
    await expect(modalCard(page, MODAL_LABELS.about)).toContainText("9.9.9");
  });
});

test.describe("§B4: clickable counts and the Show status bar setting", () => {
  test("the open count jumps the caret to the next open action", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "plain\nmore\n# first\nv done\n# second" } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.locator("#stat-open").click();
    await expect(page.locator("#stat-pos")).toContainText("Ln 3,");
  });

  test("the done count opens the Action Drawer with every state listed", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "# open one\nv done one" } } });
    await page.locator("#stat-closed").click();
    const drawer = modalCard(page, MODAL_LABELS.actions);
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("done one");
  });

  test("turning the status bar off hides it and survives a reload", async ({ page }) => {
    await seedApp(page, { seed: { notes: {} } });
    await expect(page.locator("#status-bar")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+Comma");
    await page.locator(".toggle-switch", { hasText: "Show status bar" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("#status-bar")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".cm-content")).toBeVisible();
    await expect(page.locator("#status-bar")).toHaveCount(0);
  });
});

test.describe("long messages", () => {
  test("a message too long for the status bar wraps in a toast that stays readable; short ones stay in the bar", async ({ page }) => {
    await seedApp(page);
    const long =
      "OneDrive sync failed: this is a deliberately long message that would never fit on the single line of the status bar at any window width.";
    await page.evaluate((m) => window.__CHRONO_MOCK__!.debug!.showToast(m), long);
    const toast = page.locator(".long-toast");
    await expect(toast).toContainText("deliberately long message");
    await expect(page.locator("#stat-message")).toHaveCount(0);
    const box = (await toast.boundingBox())!;
    expect(box.height).toBeGreaterThan(30); // more than one line
    const vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);

    await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.showToast("Saved."));
    await expect(page.locator("#stat-message")).toContainText("Saved.");
    await expect(page.locator(".long-toast")).toHaveCount(0);
  });
});

test.describe("Dutch and German status bar collapse & center message non-overlap", () => {
  test("Dutch locale with centre message keeps counts visible and does not overlap", async ({ page }) => {
    await page.setViewportSize({ width: 750, height: 600 });
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "# taak een\nv taak twee\n> taak drie" },
        languageMode: "nl",
      },
    });

    await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.showToast("Opgeslagen."));

    const bar = page.locator("#status-bar");
    await expect(bar).toHaveClass(/has-centre-message/);

    const left = bar.locator(".status-left");
    const centre = bar.locator(".status-centre");

    // Centre message is visible
    await expect(centre).toContainText("Opgeslagen.");

    // Action counts must be visible in compact form
    await expect(left.locator(".stat-compact").first()).toBeVisible();
    await expect(left.locator("#stat-open .stat-compact")).toHaveText("1");

    // Left and centre bounding boxes must not overlap
    const leftBox = (await left.boundingBox())!;
    const centreBox = (await centre.boundingBox())!;
    expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(centreBox.x);

    // No overflow on status bar
    const overflowing = await bar.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflowing).toBe(false);
  });

  test("German locale without message collapses long count text gracefully on medium screens", async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 600 });
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "# aufgabe eins\nv aufgabe zwei\n> aufgabe drei" },
        languageMode: "de",
      },
    });

    const bar = page.locator("#status-bar");
    const left = bar.locator(".status-left");

    // On 720px in German, verbose "Weitergeleitet" collapses to compact glyph format
    await expect(left.locator(".stat-compact").first()).toBeVisible();
    await expect(left.locator("#stat-open .stat-compact")).toHaveText("1");

    // No overflow on status bar
    const overflowing = await bar.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflowing).toBe(false);
  });

  test("Dutch locale displays full text for actions without clipping when stat-full is active", async ({ page }) => {
    // 800px width is above the 780px compact threshold — stat-full is active
    await page.setViewportSize({ width: 800, height: 600 });
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "# taak een\nv taak twee\n> taak drie" },
        languageMode: "nl",
      },
    });

    const bar = page.locator("#status-bar");
    const statForwarded = bar.locator("#stat-forwarded");
    await expect(statForwarded).toBeVisible();
    await expect(statForwarded).toContainText("1 doorgeschoven");
    await expect(bar.locator("#stat-open")).toContainText("1 open");
    await expect(bar.locator("#stat-closed")).toContainText("1 voltooid");

    // Verify stat-forwarded is not clipped by the left zone's container
    const isClipped = await page.evaluate(() => {
      const el = document.getElementById("stat-forwarded")!;
      const left = el.closest(".status-left")!;
      return el.getBoundingClientRect().right > left.getBoundingClientRect().right + 1;
    });
    expect(isClipped).toBe(false);

    // Verify compact form uses boxed deferred glyph instead of »
    await page.setViewportSize({ width: 400, height: 600 });
    await expect(bar.locator("#stat-forwarded .stat-compact")).toBeVisible();
    await expect(bar.locator("#stat-forwarded .glyph-progress")).toBeVisible();
    expect(await bar.locator(".status-left").innerText()).not.toContain("»");
  });

  test("actionable toast in status bar runs action on click and dismisses", async ({ page }) => {
    await seedApp(page);
    await page.evaluate(() => {
      window.__CHRONO_MOCK__!.debug!.showToast("Test Action Toast", {
        action: () => {
          (window as any).__ACTION_FIRED__ = true;
        },
      });
    });

    const btn = page.locator("button#stat-message");
    await expect(btn).toHaveText("Test Action Toast");
    await btn.click();

    const fired = await page.evaluate(() => (window as any).__ACTION_FIRED__);
    expect(fired).toBe(true);
    await expect(page.locator("#stat-message")).toHaveCount(0);
  });

  test("clicking plain status bar toast dismisses it immediately", async ({ page }) => {
    await seedApp(page);
    await page.evaluate(() => {
      window.__CHRONO_MOCK__!.debug!.showToast("Short informational toast");
    });

    const msg = page.locator("span#stat-message");
    await expect(msg).toHaveText("Short informational toast");
    await msg.click();
    await expect(page.locator("#stat-message")).toHaveCount(0);
  });

  test("long actionable toast renders in .long-toast, has pointer cursor, and runs action", async ({ page }) => {
    await seedApp(page);
    const longMsg = "This is a very long actionable toast message that exceeds sixty characters easily!";
    await page.evaluate((text) => {
      window.__CHRONO_MOCK__!.debug!.showToast(text, {
        action: () => {
          (window as any).__LONG_ACTION_FIRED__ = true;
        },
      });
    }, longMsg);

    const toast = page.locator(".long-toast");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText(longMsg);
    await expect(toast).toHaveClass(/interactive/);

    await toast.click();
    const fired = await page.evaluate(() => (window as any).__LONG_ACTION_FIRED__);
    expect(fired).toBe(true);
    await expect(toast).toHaveCount(0);
  });
});


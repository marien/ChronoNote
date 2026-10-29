import { test, expect, type Page } from "@playwright/test";
import { currentModal, datePicker, modalCard, MODAL_LABELS } from "./helpers";

/** §440: the website's "Try it" links open the live demo on one feature: `demo-app/?try=<feature>` on the first
 * load, a `postMessage` from the page around it after that (`src/lib/testing/demoTry.ts`). The dev server serves the
 * demo's own entry, so this runs against `main-demo.ts` with the real "demo" scenario. */

const DEMO = "/demo-src/index.html";

async function openDemo(page: Page, query = "") {
  await page.goto(`${DEMO}${query}`);
  await expect(page.locator(".cm-content")).toBeVisible();
}

test.describe("demo ?try= links", () => {
  test("history opens on the church committee's earlier meetings", async ({ page }) => {
    await openDemo(page, "?try=history");
    const card = modalCard(page, MODAL_LABELS.history);
    await expect(card).toBeVisible();
    await expect(card).toContainText("Church community committee");
    // Today's meeting and the two earlier ones (scenarios.ts, "demo").
    await expect(card).toContainText("3 dates");
  });

  test("search opens filled in with Joan's open actions", async ({ page }) => {
    await openDemo(page, "?try=search");
    const card = modalCard(page, MODAL_LABELS.search);
    await expect(card).toBeVisible();
    await expect(card.locator("input.modal-input")).toHaveValue("has:@Joan is:open");
    await expect(card).toContainText("ask @Joan for referees");
  });

  test("week review, actions, due dates, palette and the date picker each open", async ({ page }) => {
    await openDemo(page, "?try=week");
    await expect(modalCard(page, MODAL_LABELS.weekReview)).toBeVisible();

    for (const [feature, modal] of [
      ["actions", "actions"],
      ["due", "actions"],
      ["palette", "commandPalette"],
    ] as const) {
      await openDemo(page, `?try=${feature}`);
      await expect(modalCard(page, MODAL_LABELS[modal])).toBeVisible();
    }

    await openDemo(page, "?try=date");
    await expect(datePicker(page)).toBeVisible();
  });

  test("today puts the caret at the end of today's note, and zen hides the bars", async ({ page }) => {
    await openDemo(page, "?try=today");
    await expect.poll(() => currentModal(page)).toBe("none");
    await expect(page.locator(".cm-content")).toBeFocused();

    await openDemo(page, "?try=zen");
    await expect(page.locator("body")).toHaveClass(/zen-mode/);
  });

  test("an unknown feature is ignored", async ({ page }) => {
    await openDemo(page, "?try=nonsense");
    await page.waitForTimeout(300);
    expect(await currentModal(page)).toBe("none");
  });

  test("?theme=dark opens the demo dark", async ({ page }) => {
    await openDemo(page, "?theme=dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("demo messages from the website", () => {
  test("a page around the demo switches feature and theme without reloading it", async ({ page }) => {
    // The website and the demo share an origin; a same-origin page (not an app) with the demo in a frame stands in.
    await page.goto("/package.json");
    await page.evaluate((src) => {
      document.body.innerHTML = "";
      const f = document.createElement("iframe");
      f.id = "demo";
      f.style.cssText = "width:1000px;height:650px";
      f.src = src;
      (window as unknown as { __ready: boolean }).__ready = false;
      addEventListener("message", (e) => {
        if (e.origin === location.origin && e.data?.type === "chrononote-demo-ready") (window as unknown as { __ready: boolean }).__ready = true;
      });
      document.body.appendChild(f);
    }, DEMO);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __ready: boolean }).__ready)).toBe(true);

    const frame = page.frameLocator("#demo");
    await expect(frame.locator(".cm-content")).toBeVisible();
    const send = (msg: object) =>
      page.evaluate((m) => (document.getElementById("demo") as HTMLIFrameElement).contentWindow!.postMessage(m, location.origin), msg);

    // The same locator modalCard() builds, inside the frame.
    const card = (label: string) =>
      frame.locator(`.modal-card[aria-label="${label}"], aside[aria-label="${label}"]`);
    await send({ type: "chrononote-try", feature: "week" });
    await expect(card(MODAL_LABELS.weekReview)).toBeVisible();
    await send({ type: "chrononote-try", feature: "actions" });
    await expect(card(MODAL_LABELS.actions)).toBeVisible();
    await send({ type: "chrononote-theme", mode: "light" });
    await expect(frame.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

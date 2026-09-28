import { test, expect } from "@playwright/test";
import { seedApp } from "./helpers";

test.describe("Overview Ruler - scrollbar markers for open actions", () => {
  const sampleNote = [
    "Meeting Notes",
    "=============",
    "# First open priority task",
    "v Already completed task",
    "> Deferred follow-up",
    "",
    "Discussion",
    "==========",
    "o Topic for tomorrow",
    ". Already discussed item",
    "",
    "Follow-ups",
    "==========",
    "  => # Urgent blocker to resolve",
    "x Cancelled item",
    "",
    "Closing remarks and summary.",
    ...Array.from({ length: 40 }, (_, i) => `Filler line ${i + 1} to ensure scrollbar is present.`),
  ].join("\n");

  test("markers only show when scrollbar is present and moved", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": sampleNote },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    const ruler = page.locator(".cm-overview-ruler");
    // Initially not visible (opacity: 0, no cm-ruler-visible class)
    await expect(ruler).not.toHaveClass(/cm-ruler-visible/);
    const initialOpacity = await ruler.evaluate((el) => window.getComputedStyle(el).opacity);
    expect(initialOpacity).toBe("0");

    // Scroll the editor
    await page.locator(".cm-scroller").evaluate((el) => {
      el.scrollTop = 100;
      el.dispatchEvent(new Event("scroll"));
    });

    // Becomes visible on scroll
    await expect(ruler).toHaveClass(/cm-ruler-visible/);
    await expect(async () => {
      const op = parseFloat(await ruler.evaluate((el) => window.getComputedStyle(el).opacity));
      expect(op).toBeGreaterThan(0.5);
    }).toPass();

    const markers = ruler.locator(".cm-ruler-marker");
    // Line 3: # First open priority task (action)
    // Line 9: o Topic for tomorrow (topic — not shown on ruler)
    // Line 14: => # Urgent blocker to resolve (action)
    await expect(markers).toHaveCount(2);

    // Check action markers
    const actionMarkers = ruler.locator(".cm-ruler-marker.cm-ruler-action");
    await expect(actionMarkers).toHaveCount(2);

    // Check topic markers do not appear
    const topicMarkers = ruler.locator(".cm-ruler-marker.cm-ruler-topic");
    await expect(topicMarkers).toHaveCount(0);

    // Check tooltips
    await expect(actionMarkers.first()).toHaveAttribute("title", /First open priority task/);
    await expect(actionMarkers.last()).toHaveAttribute("title", /Urgent blocker to resolve/);
  });

  test("clicking a marker jumps caret to the corresponding line", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": sampleNote },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    // Move scrollbar to show markers
    await page.locator(".cm-scroller").evaluate((el) => {
      el.scrollTop = 50;
      el.dispatchEvent(new Event("scroll"));
    });

    const ruler = page.locator(".cm-overview-ruler");
    const lastMarker = ruler.locator(".cm-ruler-marker.cm-ruler-action").last();

    // Click the last marker (line 14)
    await lastMarker.click();

    // Verify the status bar shows Line 14 (or caret is on line 14)
    const statusPos = page.locator("#stat-pos");
    await expect(statusPos).toContainText("14");
  });

  test("completing all actions hides the ruler markers (even with open topics)", async ({ page }) => {
    const doneNote = [
      "Notes",
      "=====",
      "v Task 1 completed",
      "v Task 2 completed",
      "o Open agenda topic",
      ". Discussed topic",
    ].join("\n");

    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": doneNote },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    const ruler = page.locator(".cm-overview-ruler");
    // With 0 open actions, the ruler has display: none and 0 markers
    await expect(ruler).toBeHidden();
  });

  test("does not force the outer editor container to overflow (regression)", async ({ page }) => {
    // The ruler used to size itself via a JS-measured inline `height`,
    // which could land a pixel off from .cm-editor's true box under
    // fractional display scaling. .cm-editor has `overflow: visible`, so
    // that pixel of overflow escaped it and landed on #editor-container
    // (the next ancestor with `overflow: auto`) — which was never in the
    // app's thin-scrollbar CSS, so it showed a full native OS scrollbar,
    // both vertically and (via the width the scrollbar then stole)
    // horizontally too. Fixed by sizing the ruler with top+bottom: 0
    // instead of a measured height, so it's always pixel-identical to
    // .cm-editor's box by construction.
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": sampleNote },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    const ruler = page.locator(".cm-overview-ruler");
    await expect(ruler).toBeVisible();
    await expect(ruler.locator(".cm-ruler-marker")).toHaveCount(2);

    const overflow = await page.locator("#editor-container").evaluate((el) => ({
      vertical: el.scrollHeight - el.clientHeight,
      horizontal: el.scrollWidth - el.clientWidth,
    }));
    expect(overflow.vertical).toBe(0);
    expect(overflow.horizontal).toBe(0);

    // The ruler's own box must be pixel-identical to .cm-editor's — no
    // inline height of its own driving the size.
    const heights = await page.evaluate(() => {
      const r = document.querySelector(".cm-overview-ruler")!;
      const e = document.querySelector(".cm-editor")!;
      return { ruler: r.getBoundingClientRect().height, editor: e.getBoundingClientRect().height, inlineHeight: (r as HTMLElement).style.height };
    });
    expect(heights.ruler).toBe(heights.editor);
    expect(heights.inlineHeight).toBe("");
  });
});

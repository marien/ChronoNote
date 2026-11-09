import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor } from "./helpers";

/** The Peek bar's text items share one baseline (§456): the on-now chip's numbers (`2/2`) once sat 1.5 px above the
 * title and the `1/1` count next to the date. A layout spec, so it also runs with Windows fonts at 125 and 150 %. */

const TODAY = "2026-09-07.txt";

/** Baselines of the title, the chip and the count, measured in one pass (Peek may still be moving the bar). */
async function baselines(page: Page): Promise<{ chip: number; count: number }> {
  return page.locator("#peek-bar").evaluate((bar) => {
    const at = (sel: string) => {
      const el = bar.querySelector(sel)!;
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      el.appendChild(probe);
      const y = probe.getBoundingClientRect().top;
      probe.remove();
      return y;
    };
    const title = at(".peek-title");
    return { chip: Math.abs(at('[data-testid="peek-switch"]') - title), count: Math.abs(at(".peek-count") - title) };
  });
}

test("the on-now chip's numbers sit on the title's baseline", async ({ page }) => {
  await seedApp(page, {
    seed: {
      notes: { [TODAY]: "Standup\n=======\no a\n\nDesign review\n=============\no b" },
      session: { openTabs: [TODAY], activeTab: TODAY },
      agendaJson: JSON.stringify([
        { date: "2026-09-07", start: "08:30", end: "09:30", title: "Standup" },
        { date: "2026-09-07", start: "09:00", end: "10:00", title: "Design review" },
      ]),
    },
  });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("notes for the meeting");
  await page.keyboard.press("Enter");
  const chip = page.locator('#peek-bar [data-testid="peek-switch"]');
  await expect(chip).toHaveText("2/2");

  // Differences from the title's baseline, in px.
  const d = await baselines(page);
  expect(d.chip).toBeLessThanOrEqual(0.5);
  expect(d.count).toBeLessThanOrEqual(0.5);
  // The chip's hover box stays inside the 30 px bar.
  const inside = await page.locator("#peek-bar").evaluate((bar) => {
    const b = bar.getBoundingClientRect();
    const c = bar.querySelector('[data-testid="peek-switch"]')!.getBoundingClientRect();
    return c.top >= b.top && c.bottom <= b.bottom;
  });
  expect(inside).toBe(true);
});

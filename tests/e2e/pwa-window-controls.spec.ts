/** Marien, 2026-10-10: the web app installed on a PC with the title bar hidden (window controls overlay) put
 * minimize/maximize/close over the right end of the top bar, hiding More and the buttons next to it. The rule that
 * keeps the bar's content out of the window buttons' area lived in a global stylesheet, and the top bar's own scoped
 * `#top-bar` rule (more specific) overrode its padding and height. Headless Chromium cannot enter that display mode
 * or set the titlebar-area env() values, so this checks the CSS itself: the overlay rule must use the same selector
 * as the bar's own rule and reserve the window buttons' area with the env() values. */
import { test, expect } from "@playwright/test";
import { seedApp } from "./helpers";

test("the window-controls-overlay rule for the top bar is not outranked by its own scoped rule", async ({ page }) => {
  await seedApp(page);
  const found = await page.evaluate(() => {
    const base: string[] = [];
    const overlay: { selector: string; paddingRight: string; height: string }[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule && /^#top-bar\.svelte-[\w-]+$/.test(rule.selectorText)) base.push(rule.selectorText);
        if (rule instanceof CSSMediaRule && rule.conditionText.includes("window-controls-overlay")) {
          for (const inner of Array.from(rule.cssRules)) {
            if (inner instanceof CSSStyleRule && inner.style.paddingRight) {
              overlay.push({ selector: inner.selectorText, paddingRight: inner.style.paddingRight, height: inner.style.height });
            }
          }
        }
      }
    }
    return { base, overlay };
  });
  expect(found.base.length).toBeGreaterThan(0);
  const rule = found.overlay.find((r) => found.base.includes(r.selector));
  expect(rule, JSON.stringify(found)).toBeTruthy();
  expect(rule!.paddingRight).toContain("titlebar-area-width");
  expect(rule!.height).toContain("titlebar-area-height");
  // No other overlay rule sets the bar's padding with a weaker selector (the old bug).
  expect(found.overlay.filter((r) => !found.base.includes(r.selector) && /#top-bar\b/.test(r.selector))).toEqual([]);
});

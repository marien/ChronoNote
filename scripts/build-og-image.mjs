// Renders the website's social image (§440): scripts/og-image.html -> website/assets/og-image.png, 1200x630.
// Uses the site's own stylesheet, fonts and glyph renderer, so it follows the site's design.
//
//   node scripts/build-og-image.mjs
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve("scripts/og-image.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "website/assets/og-image.png" });
await browser.close();
console.log("wrote website/assets/og-image.png");

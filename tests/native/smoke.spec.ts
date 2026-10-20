/** D1 (readiness review): a few checks that only the real app can answer: the Rust commands, saving to disk, the exit
 * barrier, session restore, the app log and the corrupt-settings fallback. The app is the debug build
 * (`npm run tauri build -- --debug --no-bundle`); Playwright attaches to its WebView2 over CDP.
 *
 * They run against the isolated test build (its own identifier, settings folder and log; see app.ts), so they are safe
 * locally too: `npm run test:native`. */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CONFIG, CONFIG_DIR, LOG, RUNNABLE, TODAY, VERSION, closeApp, launch, localIso, shutdown, writeConfig as writeAppConfig } from "./app";

test.skip(!RUNNABLE, "needs the native test build: npm run test:native");
test.describe.configure({ mode: "serial" });

const NOTES = fs.mkdtempSync(path.join(os.tmpdir(), "chrononote-native-"));
const writeConfig = () => writeAppConfig(NOTES);

test.beforeAll(() => {
  fs.writeFileSync(path.join(NOTES, TODAY), "Weekly Sync\n===========\n# seeded action\n");
  writeConfig();
});

test.afterAll(async () => {
  await shutdown();
});

test("starts on today's note from the configured folder", async () => {
  const page = await launch();
  await expect(page.locator(".cm-content")).toContainText("seeded action");
  await expect(page.locator(".tab.active")).toContainText(localIso());
  (globalThis as any).__page = page;
});

test("typing is saved to the file on disk", async () => {
  const page = (globalThis as any).__page as Page;
  await page.locator(".cm-line", { hasText: "seeded action" }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" typed-natively");
  await expect.poll(() => fs.readFileSync(path.join(NOTES, TODAY), "utf8"), { timeout: 15_000 }).toContain("typed-natively");
});

test("About shows the running version, read from the real app", async () => {
  const page = (globalThis as any).__page as Page;
  await page.keyboard.press("Control+Shift+Comma");
  await expect(page.locator(".about-version-card")).toContainText(VERSION);
  await page.keyboard.press("Escape");
});

/** Every window and plugin call the frontend makes is allowed by the capabilities. The mock backend allows everything,
 * so a missing permission only showed in the installed app (§93 `destroy`, §135 opener). Tauri checks the permission
 * before it reads the arguments, so each command is called so it cannot act: window commands on a window that does not
 * exist, plugin commands with arguments of the wrong type. Only "not allowed" fails the test. */
test("every window and plugin command the app uses is allowed by the capabilities", async () => {
  const page = (globalThis as any).__page as Page;
  const appSource = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "testing" || e.name === "webapp" ? [] : appSource(p);
      return /\.(ts|svelte)$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [fs.readFileSync(p, "utf8")] : [];
    });
  const src = appSource("src").join("\n");

  // Window commands: every command in Tauri's window module whose JS method the app calls (`.setTitle(` -> set_title).
  // The scan matches by method name only; these names are calls on other objects, never on a Tauri window.
  const notWindowCalls: Record<string, string> = {
    create: "CodeMirror's EditorState.create / EditorSelection.create",
    hide: "the overview ruler's own hide()",
  };
  const windowJs = fs.readFileSync("node_modules/@tauri-apps/api/window.js", "utf8");
  const windowCmds = [...new Set(windowJs.match(/plugin:window\|[a-z_]+/g) ?? [])]
    .map((c) => c.slice("plugin:window|".length))
    .filter((c) => !(c in notWindowCalls))
    .filter((c) => src.includes(`.${c.replace(/_([a-z])/g, (_m, l: string) => l.toUpperCase())}(`));
  expect(windowCmds).toContain("destroy");

  // Plugin commands, by the functions the app imports. Keep in step with the import check below.
  const pluginProbes: Record<string, Record<string, unknown>> = {
    "plugin:dialog|open": { options: 0 },
    "plugin:dialog|save": { options: 0 },
    "plugin:opener|open_url": { url: 0 },
    "plugin:global-shortcut|register": { shortcuts: 0, handler: 0 },
    "plugin:global-shortcut|unregister": { shortcuts: 0 },
    "plugin:app|version": {},
    "plugin:event|listen": { event: 0 },
    "plugin:event|unlisten": { event: 0 },
  };
  const probedPackages = ["plugin-dialog", "plugin-opener", "plugin-global-shortcut", "plugin-process"];
  const imported = [...new Set([...src.matchAll(/["']@tauri-apps\/(plugin-[a-z-]+)["']/g)].map((m) => m[1]))];
  expect(imported.filter((p) => !probedPackages.includes(p)), "a plugin package the probe table does not cover").toEqual([]);

  const denied = await page.evaluate(
    async ({ windowCmds, pluginProbes }) => {
      const inv = (window as any).__TAURI_INTERNALS__.invoke as (cmd: string, args: unknown) => Promise<unknown>;
      const out: string[] = [];
      const probe = async (cmd: string, args: unknown) => {
        try {
          await inv(cmd, args);
        } catch (e) {
          if (/not allowed/i.test(String(e))) out.push(`${cmd}: ${String(e).slice(0, 160)}`);
        }
      };
      // Control: a command the capabilities do not grant must come back "not allowed", or the probe proves nothing.
      await probe("plugin:window|set_icon", { label: "__acl_probe__", value: 0 });
      const control = out.splice(0).length === 1;
      for (const c of windowCmds) await probe(`plugin:window|${c}`, { label: "__acl_probe__", value: 0 });
      for (const [cmd, args] of Object.entries(pluginProbes)) await probe(cmd, args);
      return { control, out };
    },
    { windowCmds, pluginProbes },
  );
  console.log(`probed ${windowCmds.length} window commands: ${windowCmds.join(" ")}`);
  expect(denied.control, "set_icon (not granted) should be refused; the probe is not reaching the permission check").toBe(true);
  expect(denied.out).toEqual([]);

  // `relaunch` (process|restart) takes no arguments, so it cannot be probed without restarting: check the file instead.
  const caps = JSON.parse(fs.readFileSync("src-tauri/capabilities/default.json", "utf8")).permissions as string[];
  expect(caps.some((p) => p === "process:allow-restart" || p === "process:default")).toBe(true);
});

test("closing through the title bar ends the process; a restart restores the tab and its text", async () => {
  const page = (globalThis as any).__page as Page;
  await closeApp(page);
  expect(fs.existsSync(path.join(NOTES, ".chrononote-session.json"))).toBe(true);
  const again = await launch();
  await expect(again.locator(".cm-content")).toContainText("typed-natively");
  (globalThis as any).__page = again;
});

test("the app log records the start-up", async () => {
  await expect.poll(() => (fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : ""), { timeout: 10_000 }).toContain(
    `start ChronoNote ${VERSION}`,
  );
});

test("an unreadable config.json is set aside and the app still starts", async () => {
  await closeApp((globalThis as any).__page as Page);
  fs.writeFileSync(CONFIG, "{ not json");
  const page = await launch();
  await expect(page.locator(".cm-content")).toBeVisible();
  const asides = fs.readdirSync(CONFIG_DIR).filter((f) => f.startsWith("config.json.corrupt-"));
  expect(asides.length).toBeGreaterThan(0);
  await expect.poll(() => fs.readFileSync(LOG, "utf8"), { timeout: 10_000 }).toContain("set aside config.json");
  await closeApp(page);
});

/** Spell check against the real Windows Spell Checking API (§375/§376). CI's runner has English only, like Marien's
 * work laptop where no word was underlined in 0.32.0-3; the diagnostics are attached either way. */
test("spell check: the Windows checker flags misspelled words and the editor underlines them", async ({}, testInfo) => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const cfg = { notesDir: NOTES, onboardingCompleted: true, autoCheckUpdates: false, lastSeenVersion: VERSION, spellCheck: true };
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), { encoding: "utf8" });
  fs.writeFileSync(path.join(NOTES, TODAY), "Weekly Sync\n===========\nteh wrods are mispeled here\n");
  const page = await launch();
  const diag = await page.evaluate(async () => {
    const inv = (window as any).__TAURI_INTERNALS__.invoke as (cmd: string, args?: unknown) => Promise<unknown>;
    const safe = async (cmd: string, args?: unknown) => {
      try {
        return await inv(cmd, args);
      } catch (e) {
        return `ERROR ${String(e)}`;
      }
    };
    return {
      available: await safe("spell_available_languages"),
      windows: await safe("spell_windows_languages"),
      activeBefore: await safe("spell_languages"),
      check: await safe("spell_check_lines", { lines: ["teh wrods are mispeled here"] }),
    };
  });
  const consoleLines: string[] = [];
  page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));
  await page.waitForTimeout(3000);
  const marksBeforeTyping = await page.locator(".cm-misspelled").count();
  const editorText = await page.locator(".cm-content").innerText();
  // Type at the end of the misspelled line: a doc change must trigger a check whatever happened at start-up.
  await page.locator(".cm-line", { hasText: "mispeled" }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and moar wrods");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  const after = await page.evaluate(async () => ({
    active: await (window as any).__TAURI_INTERNALS__.invoke("spell_languages").catch((e: unknown) => `ERROR ${e}`),
    marks: document.querySelectorAll(".cm-misspelled").length,
    attr: document.querySelector(".cm-content")?.getAttribute("spellcheck"),
  }));
  const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").split("\n").filter((l) => /spell|Spell/.test(l)).join("\n") : "";
  const report = JSON.stringify({ diag, marksBeforeTyping, editorText, after, spellLog: log, console: consoleLines }, null, 2);
  console.log(report);
  await testInfo.attach("spell-diagnostics", { body: report, contentType: "application/json" });
  await expect.poll(() => page.locator(".cm-misspelled").count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await closeApp(page);
});

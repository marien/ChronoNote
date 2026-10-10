/** D1 (readiness review): a few checks that only the real app can answer: the Rust commands, saving to disk, the exit
 * barrier, session restore, the app log and the corrupt-settings fallback. The app is the debug build
 * (`npm run tauri build -- --debug --no-bundle`); Playwright attaches to its WebView2 over CDP.
 *
 * These write %APPDATA%\com.chrononote.app (config.json) and start the app with the same identifier as an installed
 * ChronoNote (the single-instance plugin would hand off to a running one). So they run only on CI, or locally with
 * CHRONONOTE_NATIVE_OK=1 when no ChronoNote is running and you accept the config being replaced. */
import { test, expect, chromium, type Browser, type Page } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

test.skip(!process.env.CI && !process.env.CHRONONOTE_NATIVE_OK, "native smoke tests run on CI only");
test.describe.configure({ mode: "serial" });

const EXE = process.env.CHRONONOTE_EXE ?? path.resolve("src-tauri/target/debug/chrononote.exe");
const PORT = 9333;
const CONFIG_DIR = path.join(process.env.APPDATA ?? "", "com.chrononote.app");
const CONFIG = path.join(CONFIG_DIR, "config.json");
const LOG = path.join(process.env.LOCALAPPDATA ?? "", "com.chrononote.app", "logs", "app.log");
const NOTES = fs.mkdtempSync(path.join(os.tmpdir(), "chrononote-native-"));
const VERSION = JSON.parse(fs.readFileSync("package.json", "utf8")).version as string;

function localIso(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const TODAY = `${localIso()}.txt`;

/** A config without a BOM: a BOM makes the app set the file aside as corrupt. */
function writeConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const cfg = { notesDir: NOTES, onboardingCompleted: true, autoCheckUpdates: false, lastSeenVersion: VERSION };
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), { encoding: "utf8" });
}

let proc: ChildProcess | null = null;
let browser: Browser | null = null;

/** WebView2 may listen on IPv4 or IPv6 depending on the machine. */
async function connectAny(): Promise<Browser> {
  let last: unknown;
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    try {
      return await chromium.connectOverCDP(`http://${host}:${PORT}`, { timeout: 5_000 });
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** The command lines of the app's WebView2 processes: shows whether the debugging argument reached them. */
function webviewArgs(): Promise<string> {
  return new Promise((resolve) =>
    execFile(
      "powershell",
      ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Select-Object -First 3 -ExpandProperty CommandLine"],
      (_err, out) => resolve(String(out).slice(0, 3000)),
    ),
  );
}

async function launch(): Promise<Page> {
  if (!fs.existsSync(EXE)) throw new Error(`app not built: ${EXE}`);
  let output = "";
  let exitInfo: string | null = null;
  proc = spawn(EXE, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.on("data", (d) => (output += d));
  proc.stderr?.on("data", (d) => (output += d));
  proc.on("exit", (code, signal) => (exitInfo = `exit code ${code} signal ${signal}`));
  proc.on("error", (e) => (exitInfo = `spawn error ${e.message}`));
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      browser = await connectAny();
      break;
    } catch (e) {
      if (exitInfo || Date.now() > deadline) {
        const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").slice(-2000) : "(no app.log)";
        const ports = await new Promise<string>((resolve) =>
          execFile("netstat", ["-ano", "-p", "TCP"], (_err, out) =>
            resolve(String(out).split("\n").filter((l) => /LISTEN/.test(l)).join("\n")),
          ),
        );
        output += `\nlistening TCP ports:\n${ports}\nwebview processes: ${await webviewArgs()}`;
        throw new Error(
          `the app's WebView2 never opened its debugging port (${exitInfo ?? "still running"}; last error ${e}).\n` +
            `output:\n${output.slice(-2000)}\napp.log:\n${log}`,
        );
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const page = await (async () => {
    for (let i = 0; i < 60; i++) {
      const pages = browser!.contexts().flatMap((c) => c.pages());
      const app = pages.find((p) => !p.url().startsWith("devtools"));
      if (app) return app;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("no app page");
  })();
  await expect(page.locator(".cm-content")).toBeVisible({ timeout: 60_000 });
  return page;
}

/** Closes through the title bar's close button (the exit barrier), and waits for the process to end. */
async function closeApp(page: Page) {
  const exited = new Promise<void>((resolve) => proc!.once("exit", () => resolve()));
  await page.locator(".win-btn.win-close").click();
  await Promise.race([exited, new Promise((_, rej) => setTimeout(() => rej(new Error("app did not exit")), 20_000))]);
  await browser?.close().catch(() => {});
  browser = null;
  proc = null;
}

test.beforeAll(() => {
  fs.writeFileSync(path.join(NOTES, TODAY), "Weekly Sync\n===========\n# seeded action\n");
  writeConfig();
});

test.afterAll(async () => {
  await browser?.close().catch(() => {});
  proc?.kill();
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

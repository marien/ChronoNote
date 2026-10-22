/** Shared helpers for the native tests: start the REAL app (debug build, real Rust backend, WebView2), attach Playwright
 * over WebView2's debugging port, and read the window and the screen through the Win32 API.
 *
 * Isolation (§400): the test build has its own identifier (`com.chrononote.nativetest`, set by
 * scripts/native-test-config.mjs), so it has its own settings folder, log and WebView2 profile, and the
 * single-instance plugin never hands off to an installed ChronoNote that is running. That makes the suite safe to run
 * on a developer's machine: `npm run test:native`. Notes go to a temporary folder. The window does appear on screen
 * while the tests run, and docking Peek briefly reserves a strip of the screen. */
import { expect, chromium, type Browser, type Page } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const IDENTIFIER = process.env.CHRONONOTE_IDENTIFIER ?? "com.chrononote.nativetest";
export const EXE = process.env.CHRONONOTE_EXE ?? path.resolve("src-tauri/target/debug/chrononote.exe");
export const PORT = 9333;
export const CONFIG_DIR = path.join(process.env.APPDATA ?? "", IDENTIFIER);
export const CONFIG = path.join(CONFIG_DIR, "config.json");
export const LOG = path.join(process.env.LOCALAPPDATA ?? "", IDENTIFIER, "logs", "app.log");
export const VERSION = JSON.parse(fs.readFileSync("package.json", "utf8")).version as string;

/** Runs on CI, or locally when the isolated test build exists (`npm run test:native` builds it). Never against the
 * real identifier outside CI: that would replace the user's own settings. */
export const RUNNABLE = !!process.env.CI || (IDENTIFIER !== "com.chrononote.app" && fs.existsSync(EXE));

export function localIso(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const TODAY = `${localIso()}.txt`;

/** A config without a BOM: a BOM makes the app set the file aside as corrupt. */
export function writeConfig(notesDir: string, extra: Record<string, unknown> = {}) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const cfg = { notesDir, onboardingCompleted: true, autoCheckUpdates: false, lastSeenVersion: VERSION, ...extra };
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), { encoding: "utf8" });
}

let proc: ChildProcess | null = null;
let browser: Browser | null = null;

export function appPid(): number {
  if (!proc?.pid) throw new Error("app not running");
  return proc.pid;
}

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

export async function launch(): Promise<Page> {
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
    // 60 s: on CI's runner a restart after a kill once took longer than the old 30 s ("no app page", 2026-10-22).
    for (let i = 0; i < 120; i++) {
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

async function waitForExit() {
  const p = proc;
  if (!p || p.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => p.once("exit", () => resolve()));
  await Promise.race([exited, new Promise((_, rej) => setTimeout(() => rej(new Error("app did not exit")), 20_000))]);
}

/** Closes through the title bar's close button (the exit barrier), and waits for the process to end. */
export async function closeApp(page: Page) {
  const done = waitForExit();
  await page.locator(".win-btn.win-close").click();
  await done;
  await browser?.close().catch(() => {});
  browser = null;
  proc = null;
}

/** Closes through the window's own close request (what the title bar button and Alt+F4 do), for states where the
 * title bar is not shown (Peek). */
export async function requestClose(page: Page) {
  const done = waitForExit();
  await page.evaluate(() => (window as any).__TAURI_INTERNALS__.invoke("plugin:window|close", { label: "main" })).catch(() => {});
  await done;
  await browser?.close().catch(() => {});
  browser = null;
  proc = null;
}

export async function shutdown() {
  await browser?.close().catch(() => {});
  proc?.kill();
  browser = null;
  proc = null;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface NativeState {
  /** The app's main window, outer rectangle, physical pixels. */
  window: Rect;
  topmost: boolean;
  maximized: boolean;
  minimized: boolean;
  /** The primary monitor's work area (the screen minus the taskbar and any docked strips), and the whole monitor. */
  work: Rect;
  screen: Rect;
}

const NATIVE_PS = `
param([int]$procId)
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class CnW {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(int a, int b, ref RECT r, int c);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
}
"@
[CnW]::SetProcessDPIAware() | Out-Null
$h = (Get-Process -Id $procId).MainWindowHandle
$r = New-Object CnW+RECT; [CnW]::GetWindowRect($h, [ref]$r) | Out-Null
$w = New-Object CnW+RECT; [CnW]::SystemParametersInfo(0x30, 0, [ref]$w, 0) | Out-Null
$ex = [CnW]::GetWindowLong($h, -20)
@{
  window = @{ left = $r.Left; top = $r.Top; right = $r.Right; bottom = $r.Bottom }
  topmost = (($ex -band 0x8) -ne 0)
  maximized = [CnW]::IsZoomed($h)
  minimized = [CnW]::IsIconic($h)
  work = @{ left = $w.Left; top = $w.Top; right = $w.Right; bottom = $w.Bottom }
  screen = @{ left = 0; top = 0; right = [CnW]::GetSystemMetrics(0); bottom = [CnW]::GetSystemMetrics(1) }
} | ConvertTo-Json -Compress
`;

/** Reads the window and the screen through Win32 (DPI-aware, so physical pixels like Tauri's own coordinates). */
export function nativeState(): Promise<NativeState> {
  const pid = appPid();
  return new Promise((resolve, reject) =>
    execFile(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", `& { ${NATIVE_PS} } -procId ${pid}`],
      { maxBuffer: 1024 * 1024 },
      (err, out, stderr) => {
        if (err) return reject(new Error(`${err.message}\n${stderr}`));
        try {
          resolve(JSON.parse(String(out).trim()));
        } catch {
          reject(new Error(`unexpected output: ${out} ${stderr}`));
        }
      },
    ),
  );
}

export const height = (r: Rect) => r.bottom - r.top;
export const width = (r: Rect) => r.right - r.left;

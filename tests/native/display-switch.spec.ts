/** Docked Peek and the full window across display-mode switches (Win+P), on a machine with two or more screens. It
 * changes the machine's display mode (`DisplaySwitch.exe`), so it never runs by itself: DISPLAY_SWITCH=1 only, never on
 * CI. It always ends in "extend". Run: DISPLAY_SWITCH=1 npm run test:native -- display-switch.spec.ts */
import { test, expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LOG, RUNNABLE, TODAY, height, launch, nativeState, shutdown, width, writeConfig, type Rect } from "./app";

test.skip(!RUNNABLE || process.env.DISPLAY_SWITCH !== "1" || !!process.env.CI, "changes the display mode: DISPLAY_SWITCH=1 only");
test.skip(process.platform !== "win32", "Windows only");
test.describe.configure({ mode: "serial" });

const NOTES = fs.mkdtempSync(path.join(os.tmpdir(), "chrononote-native-display-"));
const NOTE = ["Weekly Sync", "===========", "# first action", "# second action", "", "", "Other", "=====", "- something", ""].join("\n");
const REPORT = path.join("test-results", "native", "display-switch.log");

let page: Page;

function ps(script: string): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], (err, out, stderr) =>
      err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve(String(out).trim()),
    ),
  );
}

interface Monitor {
  bounds: Rect;
  work: Rect;
}
async function monitors(): Promise<Monitor[]> {
  const out = await ps(
    `Add-Type -AssemblyName System.Windows.Forms; Add-Type 'using System.Runtime.InteropServices; public static class D { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'; [D]::SetProcessDPIAware() | Out-Null; ` +
      `@([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { @{ bounds = @{ left = $_.Bounds.Left; top = $_.Bounds.Top; right = $_.Bounds.Right; bottom = $_.Bounds.Bottom }; work = @{ left = $_.WorkingArea.Left; top = $_.WorkingArea.Top; right = $_.WorkingArea.Right; bottom = $_.WorkingArea.Bottom } } }) | ConvertTo-Json -Compress -Depth 4`,
  );
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

const fmt = (r: Rect) => `[${r.left},${r.top} ${r.right - r.left}x${r.bottom - r.top}]`;
let logSeen = 0;
function note(line: string) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.appendFileSync(REPORT, line + "\n");
}
/** Records the window, the screens and the app log lines since the last snapshot. */
async function snap(label: string) {
  const s = await nativeState();
  const mons = await monitors();
  const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
  const fresh = log.slice(logSeen).split("\n").filter((l) => /PEEK|WARN/.test(l) && !/TRACE/.test(l));
  logSeen = log.length;
  note(`--- ${label}`);
  note(`window ${fmt(s.window)}${s.minimized ? " minimized" : ""}${s.maximized ? " maximized" : ""}${s.topmost ? " topmost" : ""}`);
  for (const m of mons) note(`screen ${fmt(m.bounds)} work ${fmt(m.work)}`);
  for (const l of fresh) note(`  log: ${l.replace(/^\S+ \S+ UTC\s+/, "")}`);
  return { s, mons };
}

/** Win+P: extend, external (second screen only), internal (first screen only), clone. Waits for the screen count. */
async function display(mode: "extend" | "external" | "internal" | "clone") {
  const want = mode === "extend" ? screens : 1;
  for (let attempt = 0; ; attempt++) {
    await ps(`& "$env:WINDIR\\System32\\DisplaySwitch.exe" /${mode}`);
    const ok = await expect
      .poll(async () => (await monitors()).length, { timeout: 15_000 })
      .toBe(want)
      .then(() => true, () => false);
    if (ok) break;
    if (attempt === 1) throw new Error(`DisplaySwitch /${mode} did not give ${want} screen(s)`);
  }
  await new Promise((r) => setTimeout(r, 4000)); // Windows moves windows around for a moment after the switch
}

/** The screen count in "extend" when the test starts (the machine's own setup, restored at the end). */
let screens = 2;

const inside = (r: Rect, mons: Monitor[]) =>
  mons.some((m) => r.left >= m.bounds.left - 16 && r.top >= m.bounds.top - 16 && r.right <= m.bounds.right + 16 && r.bottom <= m.bounds.bottom + 16);

test.beforeAll(async () => {
  fs.rmSync(LOG, { force: true });
  fs.rmSync(REPORT, { force: true });
  fs.writeFileSync(path.join(NOTES, TODAY), NOTE);
  writeConfig(NOTES, { languageMode: "en", peek: { header: "always", fadeSeconds: 0, dockBottom: true, defaultsVersion: 5 } });
  screens = (await monitors()).length;
  if (screens < 2) throw new Error("needs two or more screens in extend mode to start from");
  page = await launch();
});

test.afterAll(async () => {
  await display("extend").catch(() => {});
  await shutdown();
});

async function enterPeek() {
  await page.locator(".cm-line", { hasText: "first action" }).click();
  await page.keyboard.press("Control+Shift+KeyP");
  await expect(page.locator("body.peek-mode")).toBeVisible();
}

const invoke = (cmd: string, args: object = {}) =>
  page.evaluate(([c, a]) => (window as any).__TAURI_INTERNALS__.invoke(c, a), [cmd, args] as const);

/** Marien's sequence on 0.32.5-4 (log of 2026-10-21 08:47-08:48): docked Peek, "external only" (Windows minimizes it),
 * restore it from the taskbar, dock again on the remaining screen, back to "extend" (dock lost), leave Peek, then
 * "external only" again: the FULL window came back at the docked strip's size. */
test("Marien's sequence: the full window and a floating Peek do not stay where Windows remembered Peek", async () => {
  note("===== Marien's sequence");
  const dockButton = page.locator("#peek-bar").getByRole("button", { name: "Dock to the bottom of the screen" });
  await enterPeek();
  if (await dockButton.count()) await dockButton.click();
  await new Promise((r) => setTimeout(r, 1500));
  await snap("docked Peek on screen 1 (extend)");
  await display("external");
  await snap("after external");
  await invoke("plugin:window|unminimize", { label: "main" });
  await new Promise((r) => setTimeout(r, 1500));
  await snap("restored (as from the taskbar)");
  await dockButton.click();
  await new Promise((r) => setTimeout(r, 1500));
  await snap("docked again on the remaining screen");
  await display("extend");
  await snap("after extend");
  // Still in Peek, floating: back to the setup it was docked in. Windows puts it back on that strip; Peek floats it.
  await display("external");
  if ((await nativeState()).minimized) {
    await snap("Peek after external again (minimized by Windows)");
    await invoke("plugin:window|unminimize", { label: "main" });
  }
  await expect.poll(async () => height((await nativeState()).window), { timeout: 10_000 }).toBeLessThan(200);
  await expect.poll(async () => width((await nativeState()).window), { timeout: 10_000 }).toBeLessThan(1000);
  await snap("floating Peek after external again");
  await display("extend");
  await snap("floating Peek after extend again");
  await page.keyboard.press("Escape");
  await expect(page.locator("body.peek-mode")).toHaveCount(0);
  await new Promise((r) => setTimeout(r, 1000));
  const { s: home } = await snap("full window after leaving Peek");
  for (const mode of ["external", "extend", "external", "extend"] as const) {
    await display(mode);
    if ((await nativeState()).minimized) {
      await snap(`full window after ${mode} (minimized by Windows)`);
      await invoke("plugin:window|unminimize", { label: "main" });
    }
    // Its own size, not the strip's (Windows put it back on the strip before §407).
    await expect
      .poll(async () => {
        const w = (await nativeState()).window;
        return Math.abs(width(w) - width(home.window)) <= 4 && Math.abs(height(w) - height(home.window)) <= 4;
      }, { timeout: 10_000 })
      .toBe(true)
      .catch(async (e) => {
        await snap(`FAILED: full window after ${mode}`);
        const all = fs.readFileSync(LOG, "utf8").split("\n").slice(-30);
        for (const l of all) note(`  tail: ${l}`);
        throw e;
      });
    const { s, mons } = await snap(`full window after ${mode}`);
    expect(inside(s.window, mons)).toBe(true);
  }
});

test("docked Peek and the full window stay on a screen across extend, external, internal and duplicate", async () => {
  await snap("start (extend)");
  await enterPeek();
  const dockButton = page.locator("#peek-bar").getByRole("button", { name: "Dock to the bottom of the screen" });
  if (await dockButton.count()) await dockButton.click();
  await new Promise((r) => setTimeout(r, 1500));
  await snap("docked Peek on screen 1");
  const visibleOnAScreen = async (label: string) => {
    if ((await nativeState()).minimized) {
      await snap(`${label} (minimized by Windows)`);
      await invoke("plugin:window|unminimize", { label: "main" });
    }
    await expect.poll(async () => inside((await nativeState()).window, await monitors()), { timeout: 10_000 }).toBe(true);
    await snap(label);
  };
  for (const mode of ["external", "extend", "internal", "extend", "clone", "extend"] as const) {
    await display(mode);
    await visibleOnAScreen(`Peek after ${mode}`);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("body.peek-mode")).toHaveCount(0);
  await snap("full window after leaving Peek");
  for (const mode of ["external", "extend", "internal", "extend"] as const) {
    await display(mode);
    await visibleOnAScreen(`full window after ${mode}`);
  }
});

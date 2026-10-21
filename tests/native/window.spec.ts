/** Native window behaviour that the browser tests cannot see (§400): Peek's real window (size, always on top, the exact
 * rectangle restored) and docked Peek's screen reservation (an AppBar: the Windows work area shrinks while docked and
 * comes back on leaving, and when the app closes while docked). Readings come from the Win32 API (`nativeState`).
 *
 * Not covered here: dragging with a real mouse (input injected from another process does not reach a native window
 * drag), and plugging monitors in or out. */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LOG, RUNNABLE, TODAY, height, launch, nativeState, requestClose, shutdown, width, writeConfig, type Rect } from "./app";

test.skip(!RUNNABLE, "needs the native test build: npm run test:native");
test.skip(process.platform !== "win32", "Windows only");
test.describe.configure({ mode: "serial" });

const NOTES = fs.mkdtempSync(path.join(os.tmpdir(), "chrononote-native-window-"));
const NOTE = ["Weekly Sync", "===========", "# first action", "# second action", "", "", "Other", "=====", "- something", ""].join("\n");

const near = (a: number, b: number, slack = 2) => Math.abs(a - b) <= slack;
const sameRect = (a: Rect, b: Rect) => near(a.left, b.left) && near(a.top, b.top) && near(a.right, b.right) && near(a.bottom, b.bottom);

let page: Page;

async function enterPeek() {
  await page.locator(".cm-line", { hasText: "first action" }).click();
  await page.keyboard.press("Control+Shift+KeyP");
  await expect(page.locator("body.peek-mode")).toBeVisible();
}

async function leavePeek() {
  await page.keyboard.press("Escape");
  await expect(page.locator("body.peek-mode")).toHaveCount(0);
}

test.beforeAll(async () => {
  // The test app's own log (its own identifier), emptied so lines from an earlier run cannot satisfy these tests.
  fs.rmSync(LOG, { force: true });
  fs.writeFileSync(path.join(NOTES, TODAY), NOTE);
  // English UI (the dock button is found by its label); Peek floating, header always shown, no fade.
  writeConfig(NOTES, { languageMode: "en", peek: { header: "always", fadeSeconds: 0, dockBottom: false, defaultsVersion: 5 } });
  page = await launch();
});

test.afterAll(async () => {
  await shutdown();
});

test("Peek floats as a small always-on-top window, and leaving puts the exact rectangle back", async () => {
  const before = await nativeState();
  expect(before.topmost).toBe(false);
  await enterPeek();
  await expect.poll(async () => (await nativeState()).topmost, { timeout: 10_000 }).toBe(true);
  const peek = await nativeState();
  expect(width(peek.window)).toBeLessThan(width(before.window));
  expect(height(peek.window)).toBeLessThan(height(before.window));
  await leavePeek();
  await expect.poll(async () => sameRect((await nativeState()).window, before.window), { timeout: 10_000 }).toBe(true);
  expect((await nativeState()).topmost).toBe(false);
});

test("docking reserves a full-width strip at the bottom of the screen, and leaving gives it back", async () => {
  const before = await nativeState();
  await enterPeek();
  await page.locator("#peek-bar").getByRole("button", { name: "Dock to the bottom of the screen" }).click();
  await expect.poll(async () => (await nativeState()).work.bottom, { timeout: 10_000 }).toBeLessThan(before.work.bottom - 40);
  const docked = await nativeState();
  // The window sits on the strip: full width, its bottom where the work area used to end (the outer rectangle includes
  // an invisible resize border of a few pixels).
  expect(near(docked.window.bottom, before.work.bottom, 12)).toBe(true);
  expect(width(docked.window)).toBeGreaterThanOrEqual(width(docked.screen) - 2);
  // What is reserved is the strip itself: the work area now ends where the window begins.
  expect(near(docked.work.bottom, docked.window.top, 16)).toBe(true);
  await leavePeek();
  await expect.poll(async () => (await nativeState()).work.bottom, { timeout: 10_000 }).toBe(before.work.bottom);
});

test("the next Peek opens docked again; closing the app while docked gives the strip back", async () => {
  const before = await nativeState();
  await enterPeek();
  await expect.poll(async () => (await nativeState()).work.bottom, { timeout: 10_000 }).toBeLessThan(before.work.bottom - 40);
  await requestClose(page);
  // The app process is gone; read the screen through a fresh start of the app.
  page = await launch();
  expect((await nativeState()).work.bottom).toBe(before.work.bottom);
});

test("Peek from a maximized window: leaving maximizes it again", async () => {
  await page.locator(".win-btn.win-max").click();
  await expect.poll(async () => (await nativeState()).maximized, { timeout: 10_000 }).toBe(true);
  await enterPeek();
  await expect.poll(async () => (await nativeState()).maximized, { timeout: 10_000 }).toBe(false);
  await leavePeek();
  await expect.poll(async () => (await nativeState()).maximized, { timeout: 10_000 }).toBe(true);
  await page.locator(".win-btn.win-max").click();
});

const logText = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "");

/** §404: the native side docked while the page believes Peek floats (a half dock). Leaving Peek used to keep the strip
 * reserved and the window strip-sized. Now the move that docking makes triggers the page's check, which releases the
 * strip by itself within a second; leaving afterwards restores the full window exactly. */
test("a half dock (native docked, page floating) is found and released, and leaving restores the full window", async () => {
  await expect.poll(async () => (await nativeState()).maximized, { timeout: 10_000 }).toBe(false);
  const before = await nativeState();
  await enterPeek(); // opens docked (remembered from the earlier test)
  await page.locator("#peek-bar").getByRole("button", { name: "Float the window" }).click();
  await expect.poll(async () => (await nativeState()).work.bottom, { timeout: 10_000 }).toBe(before.work.bottom);
  // Dock behind the page's back.
  await page.evaluate(() => (window as any).__TAURI_INTERNALS__.invoke("peek_dock_bottom", { height: 200 }));
  await expect
    .poll(() => logText().includes("the native side still held a dock the page did not know about; released it"), { timeout: 10_000 })
    .toBe(true);
  await expect.poll(async () => (await nativeState()).work.bottom, { timeout: 10_000 }).toBe(before.work.bottom);
  // Back at a floating Peek's size, not the strip's full width.
  await expect.poll(async () => width((await nativeState()).window), { timeout: 10_000 }).toBeLessThan(width(before.screen) / 2);
  expect(logText()).toMatch(/TRACE {2}flight recorder \(half docked after window moved\)/);
  await leavePeek();
  await expect.poll(async () => sameRect((await nativeState()).window, before.window), { timeout: 10_000 }).toBe(true);
  expect((await nativeState()).work.bottom).toBe(before.work.bottom);
});

/** §405, from a work-laptop log: switching to "external screens only", Windows minimized docked Peek and then the dock
 * was lost. Floating it while minimized did not stick: restored, Windows put it back at the strip's place and size
 * (rescaled for the other monitor). The display switch is imitated: minimize, give the strip back behind the page's
 * back, and send the event the native side sends. With one monitor Windows keeps a position set while minimized, so
 * this cannot show the old failure; it shows that the float now waits, and that a real restore places it. */
test("a dock lost while minimized floats Peek when Windows restores it", async () => {
  const before = await nativeState();
  await enterPeek();
  const dockButton = page.locator("#peek-bar").getByRole("button", { name: "Dock to the bottom of the screen" });
  if (await dockButton.count()) await dockButton.click(); // the previous test left it floating
  await expect.poll(async () => (await nativeState()).work.bottom, { timeout: 10_000 }).toBeLessThan(before.work.bottom - 40);
  const invoke = (cmd: string, args: object = {}) =>
    page.evaluate(([c, a]) => (window as any).__TAURI_INTERNALS__.invoke(c, a), [cmd, args] as const);
  await invoke("plugin:window|minimize", { label: "main" });
  await expect.poll(async () => (await nativeState()).minimized, { timeout: 10_000 }).toBe(true);
  await invoke("peek_undock");
  await invoke("plugin:event|emit", { event: "peek-dock-lost", payload: null });
  await expect.poll(() => logText().includes("the window is minimized: it floats when it is restored"), { timeout: 10_000 }).toBe(true);
  await invoke("plugin:window|unminimize", { label: "main" });
  await expect.poll(() => logText().includes("restored after the screens changed: placing the floating window"), { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => width((await nativeState()).window), { timeout: 10_000 }).toBeLessThan(width(before.screen) / 2);
  expect((await nativeState()).work.bottom).toBe(before.work.bottom);
  await leavePeek();
  await expect.poll(async () => sameRect((await nativeState()).window, before.window), { timeout: 10_000 }).toBe(true);
});

test("docking, the strip and undocking are in the app log, with milliseconds", async () => {
  const log = logText();
  expect(log).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} UTC {2}PEEK {2}dock: height \d+/);
  expect(log).toMatch(/PEEK {2}reserve: strip \[/);
  expect(log).toMatch(/PEEK {2}undock \(asked by the page\): strip given back/);
  expect(log).toMatch(/PEEK {2}enter Peek: full window \[/);
  expect(log).toMatch(/PEEK {2}leave Peek: /);
  // No note text in the log: the seeded actions never appear.
  expect(log).not.toContain("first action");
});

test("a normal close writes exit lines; a run that was killed is reported at the next start", async () => {
  await requestClose(page);
  expect(logText()).toContain("exit: window destroyed");
  page = await launch();
  await shutdown(); // killed: no exit line
  page = await launch();
  expect(logText()).toContain("the previous run has no exit line");
});

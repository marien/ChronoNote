/** Phone companion in the real app: the phone's `inbox.json` is applied through the real Rust backend (ledger in the
 * app data folder, earlier versions kept, outbox written), and a conflict is resolved in the dialog. The browser specs
 * cover the same flows against the mock; this one checks the Rust side and the file paths.
 *
 * Isolated test build (see app.ts): its own settings folder; notes go to a temporary folder. */
import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CONFIG_DIR, RUNNABLE, TODAY, launch, localIso, shutdown, writeConfig } from "./app";

test.skip(!RUNNABLE, "needs the native test build: npm run test:native");
test.describe.configure({ mode: "serial" });

const NOTES = fs.mkdtempSync(path.join(os.tmpdir(), "chrononote-phone-"));
const MOBILE = path.join(NOTES, ".chrononote-mobile");
const date = localIso();
const yesterdayDate = localIso(new Date(Date.now() - 86_400_000));
const YESTERDAY = `${yesterdayDate}.txt`;
const read = (name: string) => fs.readFileSync(path.join(NOTES, name), "utf8");
type Result = { id: string; result: string };
/** The outbox's results, or null while it isn't written yet: a throw would end `expect.poll` at once, and CI's runner
 * reaches this before the app's first outbox write. */
function outboxResults(): Result[] | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(MOBILE, "outbox.json"), "utf8")).results ?? null;
  } catch {
    return null;
  }
}

let page: Page;

test.beforeAll(() => {
  fs.writeFileSync(path.join(NOTES, TODAY), "Weekly Sync\n===========\n# call the venue\n# book the room for Thursday\n");
  fs.writeFileSync(path.join(NOTES, YESTERDAY), "Planning\n========\no hiring plan\n");
  fs.mkdirSync(MOBILE);
  const requests = [
    // Today's note is open in a tab: applied through the tab.
    { id: "r1", type: "setState", date, section: "Weekly Sync", line: "# call the venue", n: 3, state: "done" },
    // The line was reworded on the computer: held as a conflict.
    { id: "r2", type: "setState", date, section: "Weekly Sync", line: "# book the room", n: 4, state: "done" },
    // Yesterday's note is closed: applied to the file.
    { id: "r3", type: "setState", date: yesterdayDate, section: "Planning", line: "o hiring plan", n: 3, state: "discussed" },
    { id: "r4", type: "addLine", date: yesterdayDate, section: "Planning", text: "# ask about the budget" },
  ];
  fs.writeFileSync(path.join(MOBILE, "inbox.json"), JSON.stringify({ format: 1, requests }, null, 2));
  writeConfig(NOTES, { languageMode: "en", phoneCompanion: true });
});

test.afterAll(async () => {
  await shutdown();
});

test("applies the phone's requests to the open note and to a closed file", async () => {
  page = await launch();
  await expect(page.locator(".cm-content")).toContainText("call the venue");
  await expect.poll(() => read(TODAY), { timeout: 30_000 }).toContain("v call the venue");
  expect(read(TODAY)).toContain("# book the room for Thursday");
  await expect.poll(() => read(YESTERDAY), { timeout: 30_000 }).toBe(
    "Planning\n========\n. hiring plan\n# ask about the budget\n",
  );
  await expect(page.getByText("3 changes from your phone applied.")).toBeVisible();
});

test("reports the results in the outbox and keeps a ledger outside the notes folder", async () => {
  await expect.poll(() => outboxResults()?.length ?? 0, { timeout: 30_000 }).toBe(4);
  const byId = Object.fromEntries(outboxResults()!.map((r) => [r.id, r.result]));
  expect(byId).toEqual({ r1: "applied", r2: "conflict", r3: "applied", r4: "applied" });
  // One ledger per notes folder, named after the first 16 hex digits of the SHA-256 of its path.
  const key = createHash("sha256").update(NOTES).digest("hex").slice(0, 16);
  const ledger = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "phone-companion", `${key}.json`), "utf8"));
  expect(Object.keys(ledger.handled).sort()).toEqual(["r1", "r2", "r3", "r4"]);
  expect(fs.readdirSync(MOBILE).sort()).toEqual(["inbox.json", "meetings.json", "outbox.json"]);
  const outbox = JSON.parse(fs.readFileSync(path.join(MOBILE, "outbox.json"), "utf8"));
  expect(outbox.format).toBe(2);
  const meetings = JSON.parse(fs.readFileSync(path.join(MOBILE, "meetings.json"), "utf8"));
  expect(meetings.meetings).toBeDefined();
});

test("the conflict is resolved in the dialog and written to the note", async () => {
  const bar = page.getByText("1 change from your phone needs a look.");
  await expect(bar).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  const dialog = page.getByRole("dialog", { name: "Changes from your phone" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "# book the room for Thursday" }).check();
  await dialog.getByRole("button", { name: "Apply to the chosen line" }).click();
  await expect(dialog).not.toContainText("Needs a look");
  await expect.poll(() => read(TODAY), { timeout: 15_000 }).toBe(
    "Weekly Sync\n===========\nv call the venue\nv book the room for Thursday\n",
  );
  await expect(bar).toBeHidden();
  await expect.poll(() => outboxResults()?.find((r) => r.id === "r2")?.result, { timeout: 15_000 }).toBe("applied");
  await page.keyboard.press("Escape");
});

test("a request is never applied twice, also after a restart", async () => {
  await shutdown();
  page = await launch();
  await expect(page.locator(".cm-content")).toContainText("call the venue");
  // Give the boot run (3 s after start) time to happen, then check nothing changed.
  await page.waitForTimeout(6_000);
  expect(read(YESTERDAY)).toBe("Planning\n========\n. hiring plan\n# ask about the budget\n");
  expect(read(TODAY)).toBe("Weekly Sync\n===========\nv call the venue\nv book the room for Thursday\n");
});

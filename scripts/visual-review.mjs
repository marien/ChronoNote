#!/usr/bin/env node
// Model-based visual review (§399). Captures the screenshot gallery (tests/e2e/visual-gallery.spec.ts) and has a
// vision model look at it for layout problems a user would notice: clipped or overlapping text, misalignment,
// unreadable contrast, elements off screen. Pixel diffs are too noisy for this app under display scaling; a model can
// judge a screenshot the way a person would.
//
// Usage:
//   node scripts/visual-review.mjs [--before <git-ref>] [--only dark,phone] [--model <agy model>] [--skip-capture]
//
//   --before <ref>   Also capture the gallery of <ref> (in a temporary worktree) and review the pairs: findings are
//                    then marked new or already there. Use the branch's base, e.g. --before main.
//   --only <list>    Review only these variants (dark, light, german, dark-150, phone).
//   --model <name>   The model agy runs (default gemini-3.8-flash-high: separate budget, has image input).
//   --skip-capture   Review the images already in test-results/visual/ (after a manual capture).
//   --task <name>    The change this review belongs to, for the cost log (default: visual-review).
//
// Cost log: when AGENT_USAGE_LOG names a file, one JSON line per model run is appended to it (the format of the
// orchestrator's usage-log.py), so a change's visual review shows up in its cost.
//
// Output: test-results/visual/review.md (readable) and review.json (findings + token usage per call). Exit code 0
// always unless the script itself fails: findings are leads for a person (or the orchestrator) to check against the
// screenshot before acting, not a gate. In the first trials a high-effort model reported real problems with a few
// false alarms; a medium-effort one invented more of them.
//
// Needs the Antigravity CLI (`agy`, %LOCALAPPDATA%\agy\bin\agy.exe or $AGY) and Playwright's Chromium.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "test-results", "visual");
const VARIANTS = ["dark", "light", "german", "dark-150", "phone"];

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const before = opt("--before");
const model = opt("--model") ?? "gemini-3.8-flash-high";
const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean) ?? VARIANTS;
const skipCapture = args.includes("--skip-capture");
const task = opt("--task") ?? "visual-review";
const AGY = process.env.AGY ?? path.join(process.env.LOCALAPPDATA ?? "", "agy", "bin", "agy.exe");

function run(cmd, cmdArgs, opts = {}) {
  // Never through a shell: arguments are passed as they are, whatever paths they contain.
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", ...opts });
  if (r.error) throw r.error;
  return r;
}

/** Runs the gallery spec in `cwd` on its own Vite server (`port`), writing to `outDir`. Playwright's CLI is started with
 * this Node itself (npx is a .cmd on Windows and would need a shell). */
function capture(cwd, outDir, port, extraEnv = {}) {
  fs.rmSync(outDir, { recursive: true, force: true });
  const cli = path.join(cwd, "node_modules", "@playwright", "test", "cli.js");
  const r = run(process.execPath, [cli, "test", "tests/e2e/visual-gallery.spec.ts", "--project=chromium", "--workers=2", "--reporter=line"], {
    cwd,
    env: { ...process.env, VISUAL_GALLERY: "1", VISUAL_OUT: outDir, E2E_PORT: String(port), E2E_MATRIX: "0", ...extraEnv },
  });
  const tail = (r.stdout + r.stderr).trim().split("\n").slice(-3).join("\n");
  if (r.status !== 0) console.log(`   capture in ${cwd} reported failures (the gallery may be incomplete):\n${tail}`);
  const count = fs.existsSync(outDir) ? fs.readdirSync(outDir, { recursive: true }).filter((f) => String(f).endsWith(".png")).length : 0;
  console.log(`   ${count} screenshots -> ${path.relative(ROOT, outDir)}`);
  return count;
}

const pngCount = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".png")).length : 0);

/** Captures the gallery of `ref` in a temporary detached worktree, with the CURRENT gallery spec and Playwright config
 * (the old commit may not have them), so both galleries show the same states. */
function captureBefore(ref) {
  // A folder only this process created (unpredictable name, private); the worktree goes inside it.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chrononote-visual-"));
  const wt = path.join(tmp, "wt");
  // A ref is a branch, tag or commit; anything else (an option, say) is refused before it reaches git.
  if (!/^[\w./~^@{}-]+$/.test(ref) || ref.startsWith("-")) throw new Error(`--before: not a git ref: ${ref}`);
  const add = run("git", ["worktree", "add", "--detach", "-q", wt, ref], { cwd: ROOT });
  if (add.status !== 0) throw new Error(`git worktree add ${ref} failed: ${add.stderr.trim()}`);
  const nm = path.join(wt, "node_modules");
  let count = 0;
  try {
    // A junction on Windows (no admin rights needed), a directory link elsewhere.
    fs.symlinkSync(path.join(ROOT, "node_modules"), nm, process.platform === "win32" ? "junction" : "dir");
    for (const f of ["tests/e2e/visual-gallery.spec.ts", "playwright.config.ts"]) {
      fs.copyFileSync(path.join(ROOT, f), path.join(wt, f));
    }
    // node_modules is shared through the link, so Vite's own cache (node_modules/.vite) would be the main checkout's:
    // pre-bundled for the older commit, it could break the next `npm run dev` there. This config loads the commit's
    // own vite.config.ts and moves the cache into the temporary worktree.
    fs.writeFileSync(
      path.join(wt, "vite.visual-review.config.ts"),
      'import { defineConfig, mergeConfig } from "vite";\nimport base from "./vite.config";\n' +
        'export default defineConfig(async (env) => mergeConfig(typeof base === "function" ? await base(env) : await base, { cacheDir: ".vite-visual-cache" }));\n',
    );
    count = capture(wt, path.join(OUT, "before"), 1434, { E2E_VITE_CONFIG: "vite.visual-review.config.ts" });
  } finally {
    // The link first, never recursively through it. If it cannot be removed, leave the worktree: removing it with
    // --force could follow the link into the real node_modules.
    let linkGone = false;
    try {
      fs.rmdirSync(nm);
      linkGone = true;
    } catch {
      linkGone = !fs.existsSync(nm);
    }
    if (linkGone) {
      run("git", ["worktree", "remove", "--force", wt], { cwd: ROOT });
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    else console.log(`   could not remove the node_modules link in ${wt}; remove it by hand (rmdir), then: git worktree remove --force ${wt}`);
  }
  return count;
}

const CONTEXT = `You are reviewing screenshots of ChronoNote, a keyboard-driven plain-text notes app (desktop and web), for
visual defects a user would notice. The screenshots come from an automated browser test with fixed demo data (today is
2026-09-07).

Intended design, NOT defects:
- Monospace font everywhere; muted grey secondary text and hints are deliberate.
- Line tokens in notes are drawn as glyphs: "# " an empty box (open action), "v " a ticked box, "x " a crossed box,
  "> " a box with a chevron (moved to another day), "=> " an arrow, "@name" a pill, "o "/". " agenda topic dots, a
  section title underlined with "====" shows as a double rule. Completed/moved lines are dimmed on purpose.
- Settings is a full page that scrolls: content cut off at the bottom edge of the window is not a defect.
- Lists, dialogs and sheets scroll: a row or control cut off horizontally by the BOTTOM edge of a list, dialog or the
  window is scrolling, not a defect (including a half-visible last row or button).
- Word wrap is off by default: long note lines continuing past the right edge of the editor scroll sideways on purpose.
- "peek" shows the app reduced to one section of a note (normally a small always-on-top window); its background may be
  see-through-looking or solid.
- The "phone" variant is a 390 px wide touch layout with a bottom app bar; "dark-150" is 150% display scaling;
  "german" uses German labels, which are longer.

Report real problems only: text clipped or cut mid-word, text or controls overlapping, elements outside their container
or off screen, broken alignment (e.g. a glyph not on the text line, a control misaligned with its row), illegible
contrast, empty areas where content obviously failed to render, untranslated English in the German variant.`;

/** Contact sheets: several labelled screenshots in one image. An agent that opens images one by one carries every
 * image it has seen into each next step, so cost grows with the square of the count (11 phone screenshots: 320k
 * tokens). A few sheets per variant keep that small. Paired mode puts BEFORE and AFTER of a state side by side. */
async function makeSheets(browser, variant, paired) {
  const dir = path.join(OUT, "current", variant);
  if (!fs.existsSync(dir)) return [];
  const states = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort().map((f) => f.replace(/\.png$/, ""));
  const phone = variant === "phone";
  const perSheet = paired ? (phone ? 2 : 2) : phone ? 4 : 4;
  const cols = paired ? (phone ? 4 : 2) : phone ? 4 : 2;
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const sheets = [];
  const uri = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  for (let i = 0; i < states.length; i += perSheet) {
    const group = states.slice(i, i + perSheet);
    const tiles = group.flatMap((st) => {
      const after = path.join(dir, `${st}.png`);
      const b = path.join(OUT, "before", variant, `${st}.png`);
      if (!paired) return [{ label: st, src: uri(after) }];
      return [
        { label: `${st} - BEFORE`, src: fs.existsSync(b) ? uri(b) : null },
        { label: `${st} - AFTER`, src: uri(after) },
      ];
    });
    const html = `<html><body style="margin:0;background:#888;font:bold 22px sans-serif">
      <div style="display:grid;grid-template-columns:repeat(${cols},max-content);gap:12px;padding:12px">
      ${tiles
        .map(
          (t) => `<div><div style="background:#ff0;color:#000;padding:4px 8px">${t.label}</div>${
            t.src ? `<img src="${t.src}" style="display:block">` : `<div style="padding:40px;background:#fff">no BEFORE image (new state)</div>`
          }</div>`,
        )
        .join("")}
      </div></body></html>`;
    await page.setContent(html, { waitUntil: "load" });
    const file = path.join(OUT, "sheets", `${variant}-${sheets.length + 1}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true });
    sheets.push({ file, states: group });
  }
  await page.close();
  return sheets;
}

function promptFor(variant, sheets, paired) {
  const list = sheets.map((s) => `- ${s.file} (states: ${s.states.join(", ")})`).join("\n");
  const pairing = paired
    ? `Each state appears twice, labelled "<state> - BEFORE" (the commit before) and "<state> - AFTER" (the change under
review). Report problems visible in AFTER, and set "new": true only when the problem is not in BEFORE. Also report a
visible change between BEFORE and AFTER that looks unintended.`
    : `Report problems visible in each screenshot. Set "new": null.`;
  return `${CONTEXT}

Variant: ${variant}. Each file below is a contact sheet: several screenshots on a grey background, each under a yellow
label with its state name. Open and look at every file:
${list}

${pairing}

Work in exactly two steps: first open ALL the files above at once (parallel view_file calls in one step), then give
your answer. Do not open anything else, do not edit or create files, do not run commands.

Your final message must end with one fenced JSON block, an array (empty if nothing is wrong), each item:
{"state": "<state>", "severity": "high" | "medium" | "low", "new": true | false | null,
 "problem": "<one sentence: what is wrong and where on the screen>"}
high = broken or unusable, medium = clearly visible flaw, low = minor polish.`;
}

async function review(variant, sheets, paired) {
  if (!sheets.length) return { variant, findings: [], error: "no screenshots" };
  const promptFile = path.join(OUT, `review-${variant}.prompt.md`);
  fs.writeFileSync(promptFile, promptFor(variant, sheets, paired));
  const instruction = `Your complete task is in the file ${promptFile}. Read that whole file first and do exactly what it says.`;
  const started = Date.now();
  const r = await new Promise((resolve) => {
    const child = spawn(AGY, ["-p", instruction, "--add-dir", OUT, "--dangerously-skip-permissions", "--model", model, "--output-format", "json", "--print-timeout", "15m"], { cwd: OUT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  let result;
  try {
    result = JSON.parse(r.stdout);
  } catch {
    return { variant, findings: [], seconds, error: `agy output was not JSON (exit ${r.status}): ${(r.stdout || r.stderr).slice(-300)}` };
  }
  const text = String(result.response ?? "");
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  let findings = [];
  let error;
  try {
    const parsed = blocks.length ? JSON.parse(blocks[blocks.length - 1][1]) : [];
    if (!blocks.length) error = "no JSON block in the answer";
    // An array is asked for; accept a single finding or {findings: [...]} as well.
    findings = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.findings) ? parsed.findings : parsed && typeof parsed === "object" ? [parsed] : [];
  } catch (e) {
    error = `could not parse the JSON block: ${e.message}`;
  }
  return { variant, findings: findings.map((f) => ({ variant, ...f })), seconds, turns: result.num_turns, usage: result.usage ?? null, status: result.status, error };
}

// ---- main ----------------------------------------------------------------------------------------------------------

if (!fs.existsSync(AGY)) {
  console.error(`agy not found at ${AGY} (set AGY to its path).`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

if (!skipCapture) {
  console.log("== capture: current");
  capture(ROOT, path.join(OUT, "current"), 1433);
  if (before) {
    console.log(`== capture: before (${before})`);
    if (captureBefore(before) === 0) {
      // No comparison is better than one where everything looks new.
      fs.rmSync(path.join(OUT, "before"), { recursive: true, force: true });
      console.log("   the before capture produced no screenshots: reviewing without a comparison");
    }
  } else {
    fs.rmSync(path.join(OUT, "before"), { recursive: true, force: true });
  }
}
const paired = pngCount(path.join(OUT, "before")) > 0;

console.log(`== review (${model})`);
const results = [];
fs.rmSync(path.join(OUT, "sheets"), { recursive: true, force: true });
const browser = await chromium.launch();
const sheetsBy = {};
try {
  for (const v of only) sheetsBy[v] = await makeSheets(browser, v, paired);
} finally {
  await browser.close();
}
// Three at a time: each run waits mostly on the model, and agy handles parallel print-mode runs.
const queue = [...only];
async function worker() {
  for (let v = queue.shift(); v; v = queue.shift()) {
    const r = await review(v, sheetsBy[v], paired);
    results.push(r);
    console.log(`   ${v} (${sheetsBy[v].length} sheets): ${r.error ? `error: ${r.error}` : `${r.findings.length} finding(s), ${r.seconds}s, ${r.turns ?? "?"} turn(s), ${r.usage?.total_tokens ?? "?"} tokens`}`);
  }
}
await Promise.all([worker(), worker(), worker()]);

const all = results.flatMap((r) => r.findings);
const order = { high: 0, medium: 1, low: 2 };
all.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3) || String(a.variant).localeCompare(b.variant));
const failed = results.filter((r) => r.error);
const tokens = results.reduce((n, r) => n + (r.usage?.total_tokens ?? 0), 0);

const md = [
  `# Visual review`,
  ``,
  `Model: ${model}. ${paired ? `Compared with ${before ?? "the previous capture"}.` : "Single capture (no before)."} Tokens: ${tokens}.`,
  ``,
  ...results.filter((r) => r.error).map((r) => `- **${r.variant}: review failed** (${r.error})`),
  ``,
  all.length
    ? `| Severity | New | Variant / state | Problem |\n|---|---|---|---|`
    : failed.length
      ? `No findings in the variants that were reviewed; **the review is incomplete** (${failed.length} variant(s) failed, see above).`
      : "No findings.",
  ...all.map((f) => `| ${f.severity} | ${f.new === true ? "new" : f.new === false ? "was there" : ""} | ${f.variant} / ${f.state} | ${String(f.problem).replace(/\s*\r?\n\s*/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|")} |`),
  ``,
  `Screenshots: test-results/visual/current/<variant>/<state>.png${paired ? " (and before/)" : ""}.`,
].join("\n");
fs.writeFileSync(path.join(OUT, "review.md"), md + "\n");
if (process.env.AGENT_USAGE_LOG) {
  const time = new Date().toISOString();
  const lines = results
    .filter((r) => r.usage)
    .map((r) =>
      JSON.stringify({
        time, kind: "agy", task, role: "visual", model, status: r.status, turns: r.turns, seconds: r.seconds,
        tokens: r.usage.total_tokens ?? 0, input: r.usage.input_tokens ?? 0, output: r.usage.output_tokens ?? 0,
        thinking: r.usage.thinking_tokens ?? 0, variant: r.variant,
      }),
    );
  if (lines.length) fs.appendFileSync(process.env.AGENT_USAGE_LOG, lines.join("\n") + "\n");
}
fs.writeFileSync(path.join(OUT, "review.json"), JSON.stringify({ model, before: before ?? null, tokens, results }, null, 2));

console.log(`== ${all.length} finding(s): ${["high", "medium", "low"].map((s) => `${all.filter((f) => f.severity === s).length} ${s}`).join(", ")}; ${tokens} tokens`);
for (const f of all.filter((x) => x.severity !== "low")) console.log(`   [${f.severity}${f.new === true ? ", new" : ""}] ${f.variant}/${f.state}: ${f.problem}`);
console.log(`   full report: test-results/visual/review.md`);

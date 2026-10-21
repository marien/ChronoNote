#!/usr/bin/env node
// The checks CI runs first, in one command (§410): svelte-check, the e2e type check, Vitest, and cargo test when Rust
// changed. About one or two minutes; run it before every push (the pre-push hook in .githooks/ does). Three of the
// fourteen red CI runs of mid-October 2026 were pushes that skipped one of these, mostly `check:e2e`.
//
// Usage: node scripts/verify.mjs [--rust] [--pushing <sha> ...]
//   --rust         also run cargo test (otherwise only when src-tauri/ differs from origin/main or has local changes)
//   --pushing ...  called by the pre-push hook with the commits being pushed: skipped when `npm run verify` already
//                  passed on exactly that commit with a clean working tree
//
// Playwright and the native tests are not part of it (minutes, not seconds): CI runs them, the release script runs
// Playwright, and a change to their area should run them by hand.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const args = process.argv.slice(2);
const pushing = args.includes("--pushing") ? args.slice(args.indexOf("--pushing") + 1).filter((a) => !a.startsWith("--")) : [];

const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8" }).stdout.trim();
const head = git("rev-parse", "HEAD");
const clean = git("status", "--porcelain", "--untracked-files=no") === "";
const MARKER = path.join(ROOT, git("rev-parse", "--git-dir"), "chrononote-verified");

const changed = new Set([
  ...git("diff", "--name-only", "origin/main...HEAD").split("\n"),
  ...git("diff", "--name-only", "HEAD").split("\n"),
]);
const rust = args.includes("--rust") || [...changed].some((f) => f.startsWith("src-tauri/"));

if (pushing.length > 0 && clean) {
  const [sha, kind] = (fs.existsSync(MARKER) ? fs.readFileSync(MARKER, "utf8") : "").trim().split(" ");
  if (pushing.every((s) => s === sha) && (kind === "rust" || !rust)) {
    console.log(`verify: already passed on ${sha.slice(0, 7)}; pushing`);
    process.exit(0);
  }
}
if (!clean) console.log("verify: note: there are uncommitted changes; this checks the working tree, not only the commits");

const node = process.execPath;
const steps = [
  ["svelte-check", node, [path.join("node_modules", "svelte-check", "bin", "svelte-check"), "--tsconfig", "./tsconfig.json", "--output", "machine"], ROOT],
  ["check:e2e", node, [path.join("node_modules", "typescript", "bin", "tsc"), "-p", "tests/tsconfig.json"], ROOT],
  ["vitest", node, [path.join("node_modules", "vitest", "vitest.mjs"), "run"], ROOT],
  ...(rust ? [["cargo test", "cargo", ["test", "--quiet"], path.join(ROOT, "src-tauri")]] : []),
];

let failed = false;
for (const [name, cmd, cmdArgs, cwd] of steps) {
  const started = Date.now();
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // svelte-check --output machine exits 0 with errors listed; its summary line says how many.
  const svelteErrors = name === "svelte-check" && /COMPLETED \d+ FILES [1-9]\d* ERRORS/.test(out);
  const ok = r.status === 0 && !r.error && !svelteErrors;
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`verify: ${ok ? "ok  " : "FAIL"} ${name} (${secs} s)`);
  if (!ok) {
    failed = true;
    console.log(out.split("\n").filter((l) => l.trim()).slice(-40).join("\n"));
    if (r.error) console.log(String(r.error));
    break;
  }
}

if (failed) {
  console.log("verify: failed. Fix it before pushing (git push --no-verify skips this, for emergencies only).");
  process.exit(1);
}
if (clean) fs.writeFileSync(MARKER, `${head} ${rust ? "rust" : "web"}\n`);
console.log(`verify: all passed${rust ? "" : " (no Rust changes: cargo test not run)"}`);

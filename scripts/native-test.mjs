#!/usr/bin/env node
// Builds the isolated native test app and runs tests/native against it (§400). Windows only.
//
// Usage: node scripts/native-test.mjs [--skip-build] [playwright args, e.g. window.spec.ts]
//
// The test build is a debug build (no installer) with its own identifier (com.chrononote.nativetest) and a WebView2
// debugging port (scripts/native-test-config.mjs), so it never touches an installed ChronoNote's settings or hands off
// to it. The window appears on screen while the tests run; docking Peek briefly reserves a strip of the screen.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

if (process.platform !== "win32") {
  console.error("The native tests drive the Windows app; run them on Windows.");
  process.exit(1);
}

const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const pwArgs = args.filter((a) => a !== "--skip-build");
const ROOT = process.cwd();
const CONF = path.join("test-results", "native-test.conf.json");

function sh(command, env = {}) {
  const r = spawnSync(command, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Where cargo puts the build (a machine may redirect it, e.g. with src-tauri/.cargo/config.toml).
const meta = spawnSync("cargo metadata --format-version 1 --no-deps", { cwd: path.join(ROOT, "src-tauri"), shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (meta.status !== 0) {
  console.error(meta.stderr);
  process.exit(1);
}
const exe = path.join(JSON.parse(meta.stdout).target_directory, "debug", "chrononote.exe");

if (!skipBuild) {
  fs.mkdirSync("test-results", { recursive: true });
  sh(`node scripts/native-test-config.mjs ${CONF} 9333`);
  sh(`npm run tauri build -- --debug --no-bundle --config ${CONF}`);
}
if (!fs.existsSync(exe)) {
  console.error(`No test build at ${exe}; run without --skip-build.`);
  process.exit(1);
}
sh(`npx playwright test -c playwright.native.config.ts ${pwArgs.join(" ")}`, { CHRONONOTE_EXE: exe });

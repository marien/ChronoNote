#!/usr/bin/env node
// Builds the debug app with its pages built in and starts it: no Vite dev server, no hot reload (§461). Windows only.
//
// Usage: npm run dev:app [-- --no-start]
//
// It always builds (cargo only redoes what changed), also because `npm run test:native` writes its own build, with
// another identifier, to the same chrononote.exe. The app is started detached, so this script ends once it is open.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

if (process.platform !== "win32") {
  console.error("dev:app builds and starts the Windows app; run it on Windows.");
  process.exit(1);
}

const noStart = process.argv.includes("--no-start");
const ROOT = process.cwd();

const build = spawnSync("npm run tauri build -- --debug --no-bundle", { stdio: "inherit", shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

// Where cargo puts the build (a machine may redirect it, e.g. with src-tauri/.cargo/config.toml).
const meta = spawnSync("cargo metadata --format-version 1 --no-deps", { cwd: path.join(ROOT, "src-tauri"), shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (meta.status !== 0) {
  console.error(meta.stderr);
  process.exit(1);
}
const exe = path.join(JSON.parse(meta.stdout).target_directory, "debug", "chrononote.exe");
if (!fs.existsSync(exe)) {
  console.error(`No build at ${exe}.`);
  process.exit(1);
}
if (noStart) {
  console.log(`Built ${exe}`);
} else {
  spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
  console.log(`Started ${exe}`);
}

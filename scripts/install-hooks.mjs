#!/usr/bin/env node
// Points git at the repository's own hooks (.githooks/: the pre-push check, §410). Runs on `npm install` (prepare);
// does nothing on CI or outside a git checkout.
import { spawnSync } from "node:child_process";

if (process.env.CI) process.exit(0);
const inRepo = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
if (inRepo.status !== 0 || inRepo.stdout.trim() !== "true") process.exit(0);
spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });

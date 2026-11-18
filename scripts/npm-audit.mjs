#!/usr/bin/env node
// The npm audit gate of the Security Audit workflow (§507). Like `npm audit --audit-level=high`, but advisories listed
// in scripts/npm-audit-allowlist.json pass: ones with no fixed version that reach dev tools only. An allowed advisory
// fails the gate again once GitHub lists a patched version or its review date has passed, so it cannot stay hidden.
//
// Usage: node scripts/npm-audit.mjs   (runs `npm audit --json` itself; needs network for the advisory lookup)

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BLOCKING = new Set(["high", "critical"]);

/**
 * Collects the blocking advisories from `npm audit --json` output, one per advisory id.
 * @param {any} report
 * @returns {Array<{ id: string, package: string, title: string, severity: string, range: string }>}
 */
export function blockingAdvisories(report) {
  const found = new Map();
  for (const vuln of Object.values(report?.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue;
      const id = String(via.url ?? "").split("/").pop() || String(via.source);
      if (!found.has(id)) {
        found.set(id, { id, package: via.name, title: via.title, severity: via.severity, range: via.range });
      }
    }
  }
  return [...found.values()];
}

/**
 * Decides the gate. `patched` maps an advisory id to its first patched version (null: none known).
 * @param {ReturnType<typeof blockingAdvisories>} advisories
 * @param {Array<{ id: string, review: string }>} allowlist
 * @param {Record<string, string | null>} patched
 * @param {string} today  YYYY-MM-DD
 * @returns {{ failures: string[], allowed: string[] }}
 */
export function judge(advisories, allowlist, patched, today) {
  const failures = [];
  const allowed = [];
  for (const adv of advisories) {
    const entry = allowlist.find((e) => e.id === adv.id);
    const label = `${adv.id} (${adv.package} ${adv.range}, ${adv.severity}): ${adv.title}`;
    if (!entry) {
      failures.push(`not allowed: ${label}`);
    } else if (patched[adv.id]) {
      failures.push(`a fix exists (${adv.package} ${patched[adv.id]}): update it and drop the allowlist entry: ${label}`);
    } else if (entry.review < today) {
      failures.push(`review date ${entry.review} has passed: look again, then move the date or drop the entry: ${label}`);
    } else {
      allowed.push(`allowed until ${entry.review}: ${label}`);
    }
  }
  return { failures, allowed };
}

async function firstPatched(id) {
  const res = await fetch(`https://api.github.com/advisories/${id}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "chrononote-npm-audit" },
  });
  if (!res.ok) throw new Error(`advisory lookup ${id}: HTTP ${res.status}`);
  const body = await res.json();
  const versions = (body.vulnerabilities ?? []).map((v) => v.first_patched_version).filter(Boolean);
  return versions.length ? versions.join(", ") : null;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const allowlist = JSON.parse(fs.readFileSync(path.join(root, "scripts", "npm-audit-allowlist.json"), "utf8")).advisories;

  let raw;
  try {
    raw = execSync("npm audit --json", { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    raw = err.stdout; // npm audit exits non-zero when it finds anything
  }
  const advisories = blockingAdvisories(JSON.parse(raw));

  const patched = {};
  for (const adv of advisories) {
    if (!allowlist.some((e) => e.id === adv.id)) continue;
    // A failed lookup fails the gate: an allowed advisory must be known to have no fix.
    patched[adv.id] = await firstPatched(adv.id);
  }

  const { failures, allowed } = judge(advisories, allowlist, patched, new Date().toISOString().slice(0, 10));
  for (const line of allowed) console.log(`npm-audit: ${line}`);
  for (const line of failures) console.error(`npm-audit: ${line}`);
  if (failures.length) process.exit(1);
  console.log(`npm-audit: ok (${advisories.length} high/critical advisories, all allowed)`);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const self = path.resolve(fileURLToPath(import.meta.url));
if (process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self) {
  main().catch((err) => {
    console.error(`npm-audit: ${err.message}`);
    process.exit(1);
  });
}

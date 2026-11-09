// §453: scripts/secret-scan.mjs, which `npm run verify` and CI run. Every secret below is fake and built at run
// time, so this file itself holds none (and the repo-wide scan stays clean).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
// @ts-expect-error node:child_process has no type definitions in browser tsconfig
import { spawnSync } from "node:child_process";
// @ts-expect-error node:fs has no type definitions in browser tsconfig
import fs from "node:fs";
// @ts-expect-error node:os has no type definitions in browser tsconfig
import os from "node:os";
// @ts-expect-error node:path has no type definitions in browser tsconfig
import path from "node:path";

const SCRIPT = "scripts/secret-scan.mjs"; // Vitest runs from the repo root
const NODE = (globalThis as unknown as { process: { execPath: string } }).process.execPath;
const SECRET_HEADER = "untrusted comment: rsign encrypted " + "secret key";
const b64 = (s: string) => btoa(s); // ASCII only
const fakeKeyBody = "RWRTY0Iy" + "A1b2C3d4E5f6G7h8".repeat(8);
const fakeKey = b64([SECRET_HEADER, fakeKeyBody, ""].join("\n"));
const fakePassword = "pw-" + "Zq8".repeat(10);
const publicKey = b64(["untrusted comment: minisign public key: 43D2B", "RWQ" + "x".repeat(53), ""].join("\n"));

let dir: string;
let keyDir: string;

function scan(name: string, content: string) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  const r = spawnSync(NODE, [SCRIPT, "--key-dir", keyDir, "--files", file], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "secret-scan-"));
  keyDir = path.join(dir, "keys");
  fs.mkdirSync(keyDir);
  fs.writeFileSync(path.join(keyDir, "updater-signing-key.local"), fakeKey);
  fs.writeFileSync(path.join(keyDir, "updater-signing-key-password.local"), fakePassword + "\n");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("secret-scan.mjs (§453)", () => {
  it("passes a file without secrets, including the public updater key", () => {
    const r = scan("clean.json", JSON.stringify({ pubkey: publicKey, note: "a password field" }));
    expect(r.code).toBe(0);
    expect(r.out).toContain("clean");
  });

  it("finds the signing key's own content: whole, a slice, decoded", () => {
    expect(scan("whole.txt", `key=${fakeKey}`).code).toBe(1);
    expect(scan("slice.txt", fakeKey.slice(45, 110)).code).toBe(1);
    const r = scan("decoded.txt", fakeKeyBody.slice(5, 70));
    expect(r.code).toBe(1);
    expect(r.out).toContain("updater signing key");
  });

  it("finds the password, and never prints a secret", () => {
    const r = scan("pw.txt", `TAURI_SIGNING_PRIVATE_KEY_PASSWORD=${fakePassword}`);
    expect(r.code).toBe(1);
    expect(r.out).toContain("pw.txt:1: updater signing key password");
    expect(r.out).not.toContain(fakePassword);
  });

  it("finds a Tauri secret key by its format, without knowing it", () => {
    const other = b64([SECRET_HEADER, "RWRT" + "Qw9".repeat(30), ""].join("\n"));
    const r = scan("other.txt", other);
    expect(r.code).toBe(1);
    expect(r.out).toContain("Tauri updater secret key");
  });

  it.each([
    ["GitHub token", "ghp_" + "a1B2".repeat(9)],
    ["Anthropic API key", "sk-ant-" + "api03-" + "x".repeat(30)],
    ["AWS access key", "AKIA" + "ABCDEFGH23456789"],
    ["private key (PEM)", "-----BEGIN " + "RSA PRIVATE KEY-----"],
    ["JWT", "eyJ" + "hbGciOiJIUzI1" + ".eyJ" + "zdWIiOiIxMjM0" + "." + "s".repeat(20)],
  ])("finds a %s", (kind, secret) => {
    const r = scan("token.txt", `line one\nvalue: ${secret}\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`token.txt:2: ${kind}`);
  });

  it("skips a line marked as a known false positive", () => {
    expect(scan("allowed.txt", "ghp_" + "a1B2".repeat(9) + " // secret-scan: allow").code).toBe(0);
  });
});

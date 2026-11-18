// @ts-expect-error node:crypto has no type definitions in browser tsconfig
import { createHash } from "node:crypto";

const MIN_PORT = 1024;
const MAX_PORT = 65535;
const DERIVED_PORT_BASE = 1500;
const DERIVED_PORT_SPAN = 400;
const REUSE_PORT = 1420;

/** Derive the Vite port for a Playwright run: explicit `E2E_PORT` (1024..65535), `1420` with `E2E_REUSE=1`, or a
 * deterministic hash-based port in 1500..1899 for `cwd`. */
export function e2ePort(cwd: string, env: Record<string, string | undefined>): number {
  const raw = env.E2E_PORT;
  if (raw !== undefined && /^\d+$/.test(raw)) {
    const port = Number(raw);
    if (port >= MIN_PORT && port <= MAX_PORT) return port;
  }
  if (env.E2E_REUSE === "1") return REUSE_PORT;

  const normalized = cwd.replace(/\\/g, "/").toLowerCase();
  const digest = createHash("sha256").update(normalized).digest();
  const port = DERIVED_PORT_BASE + (digest.readUInt32BE(0) % DERIVED_PORT_SPAN);
  // Chromium refuses these as unsafe (ERR_UNSAFE_PORT); a folder that hashes to one moves 10 up (§513).
  return CHROMIUM_UNSAFE_PORTS.has(port) ? port + 10 : port;
}

/** Ports in 1500..1899 that Chromium blocks (its "restricted ports" list: H.323 and PPTP). */
export const CHROMIUM_UNSAFE_PORTS = new Set([1719, 1720, 1723]);

/** Reuse an existing dev server only when `E2E_REUSE=1` and `CI` is unset/empty. */
export function e2eReuse(env: Record<string, string | undefined>): boolean {
  return env.E2E_REUSE === "1" && !env.CI;
}

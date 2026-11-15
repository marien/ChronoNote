// Types for the part of test-guard.mjs that src/lib/testGuard.test.ts imports. Without this file svelte-check
// (checkJs) type-checks the script itself, which uses node: modules the browser tsconfig has no types for.

/** Scans test source text for test/suite titles and switched-off test calls. */
export function scanTests(source: string): { titles: string[]; off: number };

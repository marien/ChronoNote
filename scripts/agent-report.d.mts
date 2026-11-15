// Types for the part of agent-report.mjs that src/lib/agentReport.test.ts imports. Without this file
// svelte-check (checkJs) type-checks the script itself, which uses node: modules the browser tsconfig lacks.

export interface ReportCommit {
  hash: string;
  subject: string;
}

export interface ReportFileStat {
  status: string;
  path: string;
  oldPath?: string;
  added: number;
  deleted: number;
}

export interface ReportTestsDiff {
  added: number;
  removed: string[];
  moreSwitchedOff: number;
}

export interface ReportFacts {
  branch: string;
  base: string;
  mergeBase: string;
  head: string;
  clean: boolean;
  uncommittedFiles?: string[];
  commits: ReportCommit[];
  files: ReportFileStat[];
  tests: ReportTestsDiff;
  verifyLines: string[];
  verifyPassed: boolean;
  verifySkipped?: boolean;
}

/** Returns true when `relPath` falls outside the usual coder directories/files. */
export function isOutsideUsualPlaces(relPath: string): boolean;

/** Formats collected repository, test, and verification facts into the standard agent report. */
export function formatAgentReport(facts: ReportFacts): {
  text: string;
  passed: boolean;
  reasons: string[];
};

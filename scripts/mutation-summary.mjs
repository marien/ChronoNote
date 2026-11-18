#!/usr/bin/env node
// Summarizes StrykerJS mutation test output from reports/mutation/mutation.json:
// prints mutation score per file and up to 20 surviving mutants sorted by line.
//
// Usage: node scripts/mutation-summary.mjs [path/to/mutation.json]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MAX_PER_FILE = 20;
const MAX_SNIPPET_LEN = 60;

/**
 * @typedef {{ line: number, column: number }} MutationPosition
 * @typedef {{ start: MutationPosition, end: MutationPosition }} MutationLocation
 * @typedef {{
 *   id?: string,
 *   mutatorName: string,
 *   replacement?: string,
 *   status: string,
 *   location: MutationLocation,
 * }} RawMutantResult
 * @typedef {{ source?: string, mutants?: RawMutantResult[] }} RawFileResult
 * @typedef {{ files?: Record<string, RawFileResult> }} RawMutationReport
 * @typedef {{
 *   line: number,
 *   column: number,
 *   mutatorName: string,
 *   original: string,
 *   replacement: string,
 * }} SurvivingMutant
 * @typedef {{
 *   file: string,
 *   score: number | null,
 *   killed: number,
 *   timeout: number,
 *   survived: number,
 *   noCoverage: number,
 *   valid: number,
 *   survivors: SurvivingMutant[],
 * }} FileMutationSummary
 * @typedef {{
 *   files: FileMutationSummary[],
 *   total: {
 *     score: number | null,
 *     killed: number,
 *     timeout: number,
 *     survived: number,
 *     noCoverage: number,
 *     valid: number,
 *   },
 * }} MutationSummary
 */

/**
 * Extracts the original source slice for a Stryker 1-based inclusive-start, exclusive-end location.
 * @param {string} source
 * @param {MutationLocation} location
 * @returns {string}
 */
export function extractMutantOriginal(source, location) {
  if (!source || !location?.start || !location?.end) return "";
  const lines = source.split(/\r?\n/);
  const startLine = location.start.line - 1;
  const endLine = location.end.line - 1;
  if (startLine < 0 || startLine >= lines.length || endLine < startLine) return "";

  const startCol = Math.max(0, location.start.column - 1);
  const endCol = Math.max(0, location.end.column - 1);
  if (startLine === endLine) {
    return (lines[startLine] ?? "").slice(startCol, endCol);
  }

  /** @type {string[]} */
  const parts = [(lines[startLine] ?? "").slice(startCol)];
  for (let i = startLine + 1; i < endLine && i < lines.length; i++) {
    parts.push(lines[i]);
  }
  if (endLine < lines.length) {
    parts.push((lines[endLine] ?? "").slice(0, endCol));
  }
  return parts.join("\n");
}

/**
 * Collapses whitespace to one line and truncates long snippets for readable terminal output.
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string}
 */
function formatSnippet(text, maxLen = MAX_SNIPPET_LEN) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, maxLen - 3)}...`;
}

/**
 * Computes Stryker's mutation score: (killed + timeout) / (killed + timeout + survived + noCoverage) * 100.
 * @param {number} killed
 * @param {number} timeout
 * @param {number} valid
 * @returns {number | null}
 */
function computeScore(killed, timeout, valid) {
  if (valid <= 0) return null;
  return ((killed + timeout) / valid) * 100;
}

/**
 * Parses a Stryker mutation.json report into per-file scores and line-sorted surviving mutants.
 * @param {RawMutationReport} report
 * @returns {MutationSummary}
 */
export function parseMutationReport(report) {
  const entries = Object.entries(report?.files ?? {}).sort(([a], [b]) => {
    const na = a.replace(/\\/g, "/");
    const nb = b.replace(/\\/g, "/");
    return na < nb ? -1 : na > nb ? 1 : 0;
  });

  /** @type {FileMutationSummary[]} */
  const files = [];
  let totalKilled = 0;
  let totalTimeout = 0;
  let totalSurvived = 0;
  let totalNoCoverage = 0;

  for (const [rawPath, fileResult] of entries) {
    const file = rawPath.replace(/\\/g, "/");
    const source = fileResult?.source ?? "";
    const mutants = fileResult?.mutants ?? [];

    let killed = 0;
    let timeout = 0;
    let survived = 0;
    let noCoverage = 0;
    /** @type {SurvivingMutant[]} */
    const survivors = [];

    for (const mutant of mutants) {
      switch (mutant.status) {
        case "Killed":
          killed++;
          break;
        case "Timeout":
          timeout++;
          break;
        case "Survived":
          survived++;
          survivors.push({
            line: mutant.location?.start?.line ?? 0,
            column: mutant.location?.start?.column ?? 0,
            mutatorName: mutant.mutatorName ?? "Unknown",
            original: extractMutantOriginal(source, mutant.location),
            replacement: mutant.replacement ?? "",
          });
          break;
        case "NoCoverage":
          noCoverage++;
          break;
        default:
          break;
      }
    }

    survivors.sort((a, b) => a.line - b.line || a.column - b.column);
    const valid = killed + timeout + survived + noCoverage;
    const score = computeScore(killed, timeout, valid);

    totalKilled += killed;
    totalTimeout += timeout;
    totalSurvived += survived;
    totalNoCoverage += noCoverage;

    files.push({
      file,
      score,
      killed,
      timeout,
      survived,
      noCoverage,
      valid,
      survivors,
    });
  }

  const totalValid = totalKilled + totalTimeout + totalSurvived + totalNoCoverage;
  return {
    files,
    total: {
      score: computeScore(totalKilled, totalTimeout, totalValid),
      killed: totalKilled,
      timeout: totalTimeout,
      survived: totalSurvived,
      noCoverage: totalNoCoverage,
      valid: totalValid,
    },
  };
}

/**
 * Formats a parsed mutation summary into human-readable lines.
 * @param {MutationSummary} summary
 * @param {number} [maxPerFile]
 * @returns {string}
 */
export function formatMutationSummary(summary, maxPerFile = DEFAULT_MAX_PER_FILE) {
  if (summary.files.length === 0) {
    return "No mutated files found in report.";
  }

  /** @type {string[]} */
  const lines = [];
  for (const fileSummary of summary.files) {
    const scoreLabel = fileSummary.score === null ? "n/a" : `${fileSummary.score.toFixed(2)}%`;
    lines.push(
      `${fileSummary.file}: ${scoreLabel} (${fileSummary.killed} killed, ${fileSummary.timeout} timeout, ${fileSummary.survived} survived, ${fileSummary.noCoverage} no-coverage / ${fileSummary.valid} valid)`,
    );

    const shown = fileSummary.survivors.slice(0, maxPerFile);
    for (const s of shown) {
      const orig = formatSnippet(s.original);
      const repl = formatSnippet(s.replacement);
      lines.push(`  ${fileSummary.file}:${s.line}  ${s.mutatorName} "${orig}" -> "${repl}"`);
    }
    if (fileSummary.survivors.length > maxPerFile) {
      lines.push(`  ... and ${fileSummary.survivors.length - maxPerFile} more surviving mutants`);
    }
  }

  return lines.join("\n");
}

/**
 * @typedef {{ argv: string[], platform: string, exit: (code: number) => never }} NodeProcess
 */

/** @returns {NodeProcess | undefined} */
function getProcess() {
  return (/** @type {{ process?: NodeProcess }} */ (/** @type {unknown} */ (globalThis))).process;
}

function main() {
  const proc = getProcess();
  if (!proc) return;

  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const reportPath = proc.argv[2]
    ? path.resolve(proc.argv[2])
    : path.join(ROOT, "reports", "mutation", "mutation.json");

  if (!fs.existsSync(reportPath)) {
    console.error(`mutation-summary: report not found at ${reportPath}`);
    console.error("Run `npm run mutation` or `npm run mutation:one -- <file>` first.");
    proc.exit(1);
  }

  const raw = /** @type {RawMutationReport} */ (JSON.parse(fs.readFileSync(reportPath, "utf8")));
  const summary = parseMutationReport(raw);
  console.log(formatMutationSummary(summary));
  proc.exit(0);
}

const proc = getProcess();
if (proc && proc.argv && proc.argv[1]) {
  const entry = path.resolve(proc.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  const same = proc.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
  if (same) main();
}

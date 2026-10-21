#!/usr/bin/env node
// Lists the Playwright tests that failed first and passed on CI's retry (§411). The retry keeps CI green, which is
// right for a one-off hiccup on a shared runner, but a test that keeps needing it is a race in the test or the app and
// went unnoticed (the History mobile-fit test, the find-bar pixel test). Each one becomes a warning on the run and a
// line in its summary; the job stays green.
//
// Usage: node scripts/report-flaky.mjs [test-results/results.json]
import fs from "node:fs";

const file = process.argv[2] ?? "test-results/results.json";
if (!fs.existsSync(file)) {
  console.log(`report-flaky: no ${file} (the test step did not get that far)`);
  process.exit(0);
}
const report = JSON.parse(fs.readFileSync(file, "utf8"));
const flaky = [];
const walk = (suite, titles) => {
  for (const s of suite.suites ?? []) walk(s, s.title ? [...titles, s.title] : titles);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      if (t.status === "flaky") flaky.push({ file: spec.file, line: spec.line, title: [...titles, spec.title].join(" › "), project: t.projectName });
    }
  }
};
for (const s of report.suites ?? []) walk(s, []);

if (flaky.length === 0) {
  console.log("report-flaky: no flaky tests");
  process.exit(0);
}
const lines = flaky.map((f) => `${f.file}:${f.line} [${f.project}] ${f.title}`);
for (const f of flaky) {
  console.log(`::warning file=tests/e2e/${f.file},line=${f.line},title=Flaky test (passed on retry)::[${f.project}] ${f.title}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### ${flaky.length} flaky test(s): failed first, passed on retry\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`,
  );
}
console.log(`report-flaky: ${flaky.length} flaky test(s)\n${lines.join("\n")}`);

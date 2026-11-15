import { describe, it, expect } from "vitest";
import {
  formatAgentReport,
  isOutsideUsualPlaces,
  type ReportFacts,
} from "../../scripts/agent-report.mjs";

function baseFacts(overrides: Partial<ReportFacts> = {}): ReportFacts {
  return {
    branch: "gemini/x",
    base: "main",
    mergeBase: "abc1234",
    head: "def5678",
    clean: true,
    uncommittedFiles: [],
    commits: [
      { hash: "def5678", subject: "Add the hold hook to the mock backend" },
      { hash: "0a1b2c3", subject: "Test rule 4.2" },
    ],
    files: [
      { status: "M", path: "src/lib/testing/mockBackend.ts", added: 41, deleted: 0 },
      { status: "A", path: "src/lib/testing/mockBackend.hold.test.ts", added: 52, deleted: 0 },
      { status: "M", path: "tests/e2e/editor-batch1.independent.spec.ts", added: 27, deleted: 8 },
    ],
    tests: { added: 5, removed: [], moreSwitchedOff: 0 },
    verifyLines: [
      "verify: ok   secret scan",
      "verify: ok   svelte-check (41 s)",
    ],
    verifyPassed: true,
    verifySkipped: false,
    ...overrides,
  };
}

describe("formatAgentReport (scripts/agent-report.mjs)", () => {
  it("formats a clean passing run matching the brief layout", () => {
    const report = formatAgentReport(baseFacts());
    expect(report.passed).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.text).toBe(
      [
        "## Agent report",
        "branch: gemini/x  base: main (merge base abc1234)  head: def5678  clean tree: yes",
        "commits (2):",
        "  def5678 Add the hold hook to the mock backend",
        "  0a1b2c3 Test rule 4.2",
        "files changed (3): +120 -8",
        "  M src/lib/testing/mockBackend.ts  +41 -0",
        "  A src/lib/testing/mockBackend.hold.test.ts  +52 -0",
        "  M tests/e2e/editor-batch1.independent.spec.ts  +27 -8",
        "outside the usual places: none",
        "tests: +5 added, 0 removed, 0 more switched off",
        "checks:",
        "  verify: ok   secret scan",
        "  verify: ok   svelte-check (41 s)",
        "result: PASS",
      ].join("\n"),
    );
  });

  it("reports FAIL: 1 test removed and lists the removed title", () => {
    const report = formatAgentReport(
      baseFacts({
        tests: { added: 0, removed: ["src/lib/example.test.ts \u203a old test"], moreSwitchedOff: 0 },
      }),
    );
    expect(report.passed).toBe(false);
    expect(report.text).toContain("tests: +0 added, 1 removed, 0 more switched off\n  src/lib/example.test.ts \u203a old test");
    expect(report.text.endsWith("result: FAIL: 1 test removed")).toBe(true);
  });

  it("reports FAIL: uncommitted changes and lists uncommitted files when tree is dirty", () => {
    const report = formatAgentReport(
      baseFacts({
        clean: false,
        uncommittedFiles: [" M src/lib/testing/mockBackend.ts", "?? notes.txt"],
      }),
    );
    expect(report.passed).toBe(false);
    expect(report.text).toContain("clean tree: no (2 files)\nuncommitted:\n   M src/lib/testing/mockBackend.ts\n  ?? notes.txt");
    expect(report.text.endsWith("result: FAIL: uncommitted changes")).toBe(true);
  });

  it("lists both reasons comma separated when tree is dirty and a test is removed", () => {
    const report = formatAgentReport(
      baseFacts({
        clean: false,
        uncommittedFiles: [" M src/app.ts"],
        tests: { added: 0, removed: ["src/lib/example.test.ts \u203a old test"], moreSwitchedOff: 0 },
      }),
    );
    expect(report.passed).toBe(false);
    expect(report.reasons).toEqual(["uncommitted changes", "1 test removed"]);
    expect(report.text.endsWith("result: FAIL: uncommitted changes, 1 test removed")).toBe(true);
  });

  it("lists a path under .github/ under outside the usual places without failing", () => {
    const report = formatAgentReport(
      baseFacts({
        files: [
          { status: "M", path: "src/lib/testing/mockBackend.ts", added: 10, deleted: 2 },
          { status: "M", path: ".github/workflows/test.yml", added: 4, deleted: 0 },
        ],
      }),
    );
    expect(report.passed).toBe(true);
    expect(report.text).toContain("outside the usual places:\n  .github/workflows/test.yml");
    expect(report.text.endsWith("result: PASS")).toBe(true);
  });

  it("handles skipped verify and switched-off or failed verify checks", () => {
    const skipped = formatAgentReport(baseFacts({ verifySkipped: true, verifyLines: [], verifyPassed: false }));
    expect(skipped.passed).toBe(true);
    expect(skipped.text).toContain("checks: skipped (--no-verify)");
    expect(skipped.text.endsWith("result: PASS")).toBe(true);

    const failed = formatAgentReport(
      baseFacts({
        tests: { added: 0, removed: [], moreSwitchedOff: 2 },
        verifyLines: ["verify: ok   secret scan", "verify: FAIL vitest (3 s)"],
        verifyPassed: false,
      }),
    );
    expect(failed.passed).toBe(false);
    expect(failed.text.endsWith("result: FAIL: verify failed, 2 tests switched off")).toBe(true);
  });

  it("identifies all paths outside the usual places", () => {
    expect(isOutsideUsualPlaces("docs/CHANGELOG.md")).toBe(true);
    expect(isOutsideUsualPlaces("docs/changelog/0.38.md")).toBe(true);
    expect(isOutsideUsualPlaces("website/webapp/index.html")).toBe(true);
    expect(isOutsideUsualPlaces("website/demo-app/main.js")).toBe(true);
    expect(isOutsideUsualPlaces("CLAUDE.local.md")).toBe(true);
    expect(isOutsideUsualPlaces("package-lock.json")).toBe(true);
    expect(isOutsideUsualPlaces("src-tauri/Cargo.lock")).toBe(true);
    expect(isOutsideUsualPlaces(".github/workflows/ci.yml")).toBe(true);
    expect(isOutsideUsualPlaces("src/lib/agentReport.test.ts")).toBe(false);
    expect(isOutsideUsualPlaces("docs/briefs/RULES.md")).toBe(false);
  });
});

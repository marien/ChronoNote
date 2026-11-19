/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  mutate: [
    "src/lib/tokens.ts",
    "src/lib/grammar/tokenize.ts",
    "src/lib/editor/numberedListKeys.ts",
    "src/lib/paste.ts",
    "src/lib/editor/clipboardPaste.ts",
    "src/lib/editor/pasteOverEmptyMarker.ts",
    "src/lib/richClipboard.ts",
    "src/lib/phoneInbox.ts",
    "src/lib/phoneInboxApply.ts",
    "src/lib/calendarReconcile.ts",
  ],
  reporters: ["html", "clear-text", "progress", "json"],
  htmlReporter: {
    fileName: "reports/mutation/index.html",
  },
  jsonReporter: {
    fileName: "reports/mutation/mutation.json",
  },
  coverageAnalysis: "perTest",
  concurrency: 2,
  timeoutMS: 20000,
  incremental: true,
  incrementalFile: "reports/mutation/incremental.json",
  vitest: {
    related: true,
  },
  ignorePatterns: ["src/lib/grammar/perf.test.ts"],
};

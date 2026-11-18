import { describe, it, expect } from "vitest";
import { blockingAdvisories, judge } from "../../scripts/npm-audit.mjs";

const via = (id: string, name: string, severity: string) => ({
  source: 1,
  name,
  title: `${name} problem`,
  url: `https://github.com/advisories/${id}`,
  severity,
  range: "<=1.0.0",
});

const report = {
  vulnerabilities: {
    picomatch: { via: [via("GHSA-aaaa", "picomatch", "high")] },
    // a package that is vulnerable only through another one repeats the advisory as a name, not an object
    vite: { via: ["picomatch", via("GHSA-aaaa", "picomatch", "high")] },
    lodash: { via: [via("GHSA-bbbb", "lodash", "moderate")] },
    left: { via: [via("GHSA-cccc", "left", "critical")] },
  },
};

describe("npm audit gate (scripts/npm-audit.mjs, §507)", () => {
  it("collects high and critical advisories once each, skipping lower ones", () => {
    expect(blockingAdvisories(report).map((a) => a.id)).toEqual(["GHSA-aaaa", "GHSA-cccc"]);
  });

  it("fails an advisory that is not on the allowlist", () => {
    const r = judge(blockingAdvisories(report), [{ id: "GHSA-aaaa", review: "2027-01-31" }], {}, "2026-11-18");
    expect(r.allowed).toHaveLength(1);
    expect(r.failures).toEqual([expect.stringContaining("not allowed: GHSA-cccc")]);
  });

  it("passes an allowed advisory with no fix before its review date", () => {
    const advs = blockingAdvisories({ vulnerabilities: { p: report.vulnerabilities.picomatch } });
    const r = judge(advs, [{ id: "GHSA-aaaa", review: "2027-01-31" }], { "GHSA-aaaa": null }, "2027-01-31");
    expect(r.failures).toEqual([]);
  });

  it("fails an allowed advisory once a fix exists", () => {
    const advs = blockingAdvisories({ vulnerabilities: { p: report.vulnerabilities.picomatch } });
    const r = judge(advs, [{ id: "GHSA-aaaa", review: "2027-01-31" }], { "GHSA-aaaa": "4.0.8" }, "2026-11-18");
    expect(r.failures).toEqual([expect.stringContaining("a fix exists (picomatch 4.0.8)")]);
  });

  it("fails an allowed advisory after its review date", () => {
    const advs = blockingAdvisories({ vulnerabilities: { p: report.vulnerabilities.picomatch } });
    const r = judge(advs, [{ id: "GHSA-aaaa", review: "2027-01-31" }], {}, "2027-02-01");
    expect(r.failures).toEqual([expect.stringContaining("review date 2027-01-31 has passed")]);
  });
});

import { describe, it, expect } from "vitest";
import { countLiterals, compare } from "../../scripts/css-literals.mjs";
import { renderTokensPage } from "../../scripts/tokens-page.mjs";

describe("countLiterals (scripts/css-literals.mjs)", () => {
  it.each([
    ["a.css", ".x { color: #fff; }", 1, 0],
    ["a.css", ".x { background: rgba(0, 0, 0, 0.4); border-color: #1e1e1e80; }", 2, 0],
    ["a.css", ".x { color: var(--text); background: transparent; fill: currentColor; }", 0, 0],
    ["a.css", ".x { font-size: 13px; } .y { font-size: 0.9em; }", 0, 2],
    ["a.css", ".x { font-size: var(--type-small); } .y { font: 12px/1.4 var(--font-ui); }", 0, 1],
    ["a.css", "/* #fff and font-size: 12px in a comment */ .x { color: white; }", 1, 0],
    ["a.css", '#main { background: url("a.svg#fff"); }', 0, 0],
    ["a.svelte", '<div style="x"></div><style>.a { color: #000; font-size: 11px; }</style>', 1, 1],
    ["a.svelte", '<p>#fff 12px</p><script>const c = "#fff";</script>', 0, 0],
    ["a.css", ".white { --my-black: inherit; font: 600 var(--type-subtitle)/28px var(--font-ui); }", 0, 0],
    ["a.css", ".x { font-size: calc(var(--a) + var(--b)); }", 0, 0],
  ])("counts %s (%j) -> colors=%i fontSizes=%i", (fileName, text, colors, fontSizes) => {
    expect(countLiterals(fileName, text)).toEqual({ colors, fontSizes });
  });
});

describe("compare (scripts/css-literals.mjs)", () => {
  const baseline = {
    colors: 3,
    fontSizes: 2,
    files: {
      "src/a.css": { colors: 2, fontSizes: 1 },
      "src/b.svelte": { colors: 1, fontSizes: 1 },
    },
  };

  it("is ok when totals and files are equal", () => {
    expect(
      compare(baseline, {
        colors: 3,
        fontSizes: 2,
        files: {
          "src/a.css": { colors: 2, fontSizes: 1 },
          "src/b.svelte": { colors: 1, fontSizes: 1 },
        },
      }),
    ).toEqual({
      ok: true,
      colors: 3,
      fontSizes: 2,
      colorsCeiling: 3,
      fontSizesCeiling: 2,
      rose: [],
    });
  });

  it("is ok when totals fall", () => {
    expect(
      compare(baseline, {
        colors: 2,
        fontSizes: 1,
        files: {
          "src/a.css": { colors: 1, fontSizes: 1 },
          "src/b.svelte": { colors: 1, fontSizes: 0 },
        },
      }),
    ).toEqual({
      ok: true,
      colors: 2,
      fontSizes: 1,
      colorsCeiling: 3,
      fontSizesCeiling: 2,
      rose: [],
    });
  });

  it("fails when colors rises and names the file that went up", () => {
    const res = compare(baseline, {
      colors: 4,
      fontSizes: 2,
      files: {
        "src/a.css": { colors: 2, fontSizes: 1 },
        "src/b.svelte": { colors: 1, fontSizes: 1 },
        "src/new.css": { colors: 1, fontSizes: 0 },
      },
    });
    expect(res).toEqual({
      ok: false,
      colors: 4,
      fontSizes: 2,
      colorsCeiling: 3,
      fontSizesCeiling: 2,
      rose: [{ file: "src/new.css", colorsBefore: 0, colorsAfter: 1, fontSizesBefore: 0, fontSizesAfter: 0 }],
    });
  });

  it("fails when fontSizes rises and names the file that went up", () => {
    const res = compare(baseline, {
      colors: 3,
      fontSizes: 3,
      files: {
        "src/a.css": { colors: 2, fontSizes: 2 },
        "src/b.svelte": { colors: 1, fontSizes: 1 },
      },
    });
    expect(res).toEqual({
      ok: false,
      colors: 3,
      fontSizes: 3,
      colorsCeiling: 3,
      fontSizesCeiling: 2,
      rose: [{ file: "src/a.css", colorsBefore: 2, colorsAfter: 2, fontSizesBefore: 1, fontSizesAfter: 2 }],
    });
  });
});

describe("renderTokensPage (scripts/tokens-page.mjs)", () => {
  it("renders each token name once and includes both values of overridden colours and var() aliases", () => {
    const css = [
      ":root {",
      "  --surface-bg: #1e1e1e; /* dark canvas */",
      "  --accent-ink: #4bbf87;",
      "  --radius-control: 4px;",
      "  --alias-ink: var(--accent-ink);",
      "}",
      ':root[data-theme="light"] {',
      "  --surface-bg: #ffffff;",
      "  --accent-ink: #257b53;",
      "}",
    ].join("\n");

    const html = renderTokensPage(css);

    for (const name of ["--surface-bg", "--accent-ink", "--radius-control", "--alias-ink"]) {
      const cardHeadMatches = html.match(new RegExp(`<code class="tok-name">${name}</code>`, "g")) ?? [];
      expect(cardHeadMatches).toHaveLength(1);
    }

    expect(html.match(/--surface-bg/g)).toHaveLength(1);
    expect(html.match(/--radius-control/g)).toHaveLength(1);
    expect(html.match(/--alias-ink/g)).toHaveLength(1);

    expect(html).toContain("#1e1e1e");
    expect(html).toContain("#ffffff");
    expect(html).toContain("#4bbf87");
    expect(html).toContain("#257b53");
    expect(html).toContain("4px");
    expect(html).toContain("var(--accent-ink)");
    expect(html).toContain("dark canvas");
  });
});

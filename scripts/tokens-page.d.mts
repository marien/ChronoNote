// Types for the part of tokens-page.mjs that src/lib/cssLiterals.test.ts imports. Without this file
// svelte-check (checkJs) type-checks the script itself, which uses node: modules the browser tsconfig lacks.

export interface TokenEntry {
  name: string;
  family: string;
  dark?: string;
  light?: string;
  pureBlack?: string;
  colorDark?: string;
  colorLight?: string;
  comments: string[];
}

/** Parses token CSS into an ordered list of tokens and family groups. */
export function parseTokensCss(cssText: string): {
  tokens: TokenEntry[];
  families: Array<{ name: string; tokens: TokenEntry[] }>;
};

/** Renders a self-contained HTML design-token reference page from token CSS text. */
export function renderTokensPage(cssText: string): string;

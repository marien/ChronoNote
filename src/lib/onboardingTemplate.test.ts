import { describe, expect, it } from "vitest";
import { getOnboardingTemplate } from "./onboardingTemplate";

describe("getOnboardingTemplate", () => {
  const languages = ["en", "nl", "de", "es", "fr", "it", "pl"] as const;

  it.each(languages)("returns a valid template for %s with all required tokens", (lang) => {
    const template = getOnboardingTemplate(lang);
    expect(template).toBeTruthy();
    expect(template.length).toBeGreaterThan(200);

    // Verify all primary ChronoNote tokens are present in each language's template
    const tokens = ["# ", "v ", "> ", "x ", "! ", "- ", "1. ", "=> ", "o ", ". ", ", "];
    for (const token of tokens) {
      expect(template, `Expected token '${token}' in ${lang} template`).toContain(token);
    }

    // Verify setext header underlines
    expect(template).toMatch(/={3,}/);
    expect(template).toMatch(/-{3,}/);

    // Verify Do First / Do Next conceptual structure
    expect(template).toMatch(/# .+/);
    expect(template).toContain("=> ");
  });

  it("falls back to English for unknown languages", () => {
    const fallback = getOnboardingTemplate("unknown");
    const en = getOnboardingTemplate("en");
    expect(fallback).toBe(en);
  });

  it("handles locale tags with regions like nl-NL or de-DE", () => {
    expect(getOnboardingTemplate("nl-NL")).toBe(getOnboardingTemplate("nl"));
    expect(getOnboardingTemplate("de-AT")).toBe(getOnboardingTemplate("de"));
    expect(getOnboardingTemplate("fr-FR")).toBe(getOnboardingTemplate("fr"));
  });
});

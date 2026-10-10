import { describe, it, expect } from "vitest";
import { SUPPORTED_LOCALES, type SupportedLocale } from "./index";
import { GLOSSARY, type Concept } from "./glossary";
import type { TranslationKey, Dictionary } from "./schema";
import { en } from "./locales/en";
import { nl } from "./locales/nl";
import { de } from "./locales/de";
import { fr } from "./locales/fr";
import { pl } from "./locales/pl";
import { es } from "./locales/es";
import { it as itLocale } from "./locales/it";

const LOCALES: Record<SupportedLocale, Dictionary> = {
  en,
  nl,
  de,
  fr,
  pl,
  es,
  it: itLocale,
};

export const CONCEPT_KEYS: Record<Concept, TranslationKey[]> = {
  open: [
    "statusBar.labelOpen",
    "commandPalette.line.setOpen",
    "shortcuts.setActionOpen.label",
    "actionDrawer.onlyOpen.label",
  ],
  done: [
    "statusBar.labelDone",
    "commandPalette.line.setDone",
    "shortcuts.setActionDone.label",
  ],
  deferred: [
    "statusBar.labelDeferred",
    "commandPalette.line.setDeferred",
    "shortcuts.setActionDeferred.label",
  ],
  wontDo: [
    "commandPalette.line.setWontDo",
    "shortcuts.setActionWontDo.label",
  ],
  section: [
    "shortcuts.convertToSection.label",
  ],
  topic: [
    "shortcuts.setTopicToDiscuss.label",
  ],
  peek: [
    "shortcuts.togglePeekMode.label",
    "commandPalette.togglePeekMode",
  ],
  scratchpad: [
    "shortcuts.newScratchpad.label",
    "commandPalette.openTabs.scratchpadHint",
  ],
  notesFolder: [
    "statusBar.changeFolderAriaLabel",
  ],
};

function renderKey(dict: Dictionary, key: TranslationKey): string {
  const fn = dict[key] as (params?: unknown) => string;
  return fn({ count: 1 });
}

describe("i18n glossary adherence", () => {
  for (const locale of SUPPORTED_LOCALES) {
    describe(`locale: ${locale}`, () => {
      const dict = LOCALES[locale];
      const glossary = GLOSSARY[locale];

      for (const [concept, keys] of Object.entries(CONCEPT_KEYS) as [Concept, TranslationKey[]][]) {
        const expectedWord = glossary[concept].toLowerCase();

        for (const key of keys) {
          it(`key "${key}" contains glossary word for ${concept} ("${expectedWord}")`, () => {
            const text = renderKey(dict, key).toLowerCase();
            expect(text).toContain(expectedWord);
          });
        }
      }
    });
  }
});

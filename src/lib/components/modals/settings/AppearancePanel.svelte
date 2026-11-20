<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../../controller";
  import {
    backendKind,
    colorMode,
    fontSize,
    languageMode,
    lineHeight,
    pureBlack,
    readableLineLength,
    spellCheck,
    spellLanguages,
    statusBarVisible,
    tabLabelStyle,
    themeMode,
    wordWrap,
  } from "../../../controller";
  import * as api from "../../../tauriApi";
  import { computeEffectiveSpellLanguages, orderSpellLanguages } from "../../../editor/spellcheck";
  import Segmented from "../../Segmented.svelte";
  import SettingRow from "../../SettingRow.svelte";
  import SettingToggle from "../../SettingToggle.svelte";
  import { PEEK_DEFAULTS, peekSettings, type PeekHeaderMode } from "../../../peek";
  import { occurrenceHint, setOccurrenceHint } from "../../../occurrences";
  import { locale, t, REVIEWED_LOCALES, type SupportedLocale } from "../../../i18n";
  import { displayAccelerator } from "../../../peekDefaults";
  import type { ColorMode, LanguageMode, ThemeMode } from "../../../types";
  import type { TabLabelStyle } from "../../../generated/tauri-types";

  const LANGUAGE_OPTIONS: { value: SupportedLocale; label: string }[] = [
    { value: "en", label: "English" },
    { value: "nl", label: "Nederlands" },
    { value: "de", label: "Deutsch" },
    { value: "fr", label: "Français" },
    { value: "pl", label: "Polski" },
    { value: "es", label: "Español" },
    { value: "it", label: "Italiano" },
  ];

  let prefersDark = false;
  if (typeof window !== "undefined") {
    prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  const isDarkResolved = $derived($themeMode === "dark" || ($themeMode === "system" && prefersDark));

  let availableSpellLangs = $state<string[]>([]);
  let windowsSpellLangs = $state<string[]>([]);

  async function loadSpellLanguages() {
    if ($backendKind === "web") return;
    try {
      const [avail, win] = await Promise.all([
        api.spellAvailableLanguages(),
        api.spellWindowsLanguages(),
      ]);
      availableSpellLangs = avail;
      windowsSpellLangs = win;
    } catch (e) {
      console.warn("Failed to load spell check languages", e);
    }
  }

  const effectiveLanguages = $derived(
    computeEffectiveSpellLanguages($spellLanguages, windowsSpellLangs, availableSpellLangs),
  );

  const orderedLanguages = $derived(
    orderSpellLanguages(availableSpellLangs, effectiveLanguages, windowsSpellLangs, $locale),
  );

  function toggleSpellLanguage(tag: string, currentlyChecked: boolean) {
    if (currentlyChecked) {
      if (effectiveLanguages.length <= 1) return;
      const next = effectiveLanguages.filter((t) => t.toLowerCase() !== tag.toLowerCase());
      void controller.setSpellLanguages(next);
    } else {
      const next = [...effectiveLanguages.filter((t) => t.toLowerCase() !== tag.toLowerCase()), tag];
      void controller.setSpellLanguages(next);
    }
  }

  onMount(() => {
    void loadSpellLanguages();
  });

  // §127 (finding K): `word_wrap` and `readable_line_length` used to be
  // two separate toggles, the second force-enabling (and disabling) the
  // first — a checked-and-greyed-out switch reads as confusing state. One
  // 3-way choice instead; no Rust/config change, it's still just the same
  // two booleans underneath (full = both off, wrap = word_wrap only,
  // reading = both on, since "reading column" only ever applies with wrap
  // on too).
  const editorWidthMode = $derived($readableLineLength ? "reading" : $wordWrap ? "wrap" : "full");
  async function setEditorWidth(mode: string) {
    if (mode === "reading") {
      await controller.setReadableLineLength(true);
    } else {
      if ($readableLineLength) await controller.setReadableLineLength(false);
      await controller.setWordWrap(mode === "wrap");
    }
  }
</script>

<section class="s-group">
  <div class="settings-section-label">{$t("settings.appearance.sectionLabel")}</div>
  <SettingRow label={$t("settings.appearance.theme.label")}>
    <Segmented
      options={[
        { value: "light", label: $t("settings.appearance.theme.light") },
        { value: "dark", label: $t("settings.appearance.theme.dark") },
        { value: "system", label: $t("common.system") },
      ]}
      value={$themeMode}
      onChange={(v) => controller.setThemeMode(v as ThemeMode)}
    />
  </SettingRow>
  {#if isDarkResolved}
    <SettingToggle
      label={$t("settings.appearance.pureBlack.label")}
      checked={$pureBlack}
      onChange={(v) => controller.setPureBlack(v)}
    >
      {#snippet description()}{$t("settings.appearance.pureBlack.hint")}{/snippet}
    </SettingToggle>
  {/if}
  <SettingRow label={$t("settings.appearance.language.label")}>
    <div class="select-wrap">
      <select
        class="settings-select"
        aria-label={$t("settings.appearance.language.label")}
        value={$languageMode}
        onchange={(e) => controller.setLanguageMode(e.currentTarget.value as LanguageMode)}
      >
        <option value="system">{$t("common.system")}</option>
        {#each LANGUAGE_OPTIONS as opt (opt.value)}
          <option value={opt.value}>
            {REVIEWED_LOCALES.includes(opt.value)
              ? opt.label
              : `${opt.label} ${$t("settings.appearance.language.community")}`}
          </option>
        {/each}
      </select>
      <span class="select-chevron" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2.5 4.5L6 8L9.5 4.5" />
        </svg>
      </span>
    </div>
  </SettingRow>
  <SettingRow label={$t("settings.appearance.glyphs.label")}>
    {#snippet description()}{$t("settings.appearance.glyphs.hint")}{/snippet}
    <Segmented
      options={[
        { value: "color", label: $t("settings.appearance.glyphs.color") },
        { value: "grayscale", label: $t("settings.appearance.glyphs.grayscale") },
      ]}
      value={$colorMode}
      onChange={(v) => controller.setColorMode(v as ColorMode)}
    />
  </SettingRow>
  <SettingToggle
    label={$t("settings.appearance.statusBar.label")}
    checked={$statusBarVisible}
    onChange={(v) => void controller.setStatusBarVisible(v)}
  >
    {#snippet description()}{$t("settings.appearance.statusBar.hint")}{/snippet}
  </SettingToggle>
  <SettingRow label={$t("settings.appearance.tabLabels.label")}>
    {#snippet description()}{$t("settings.appearance.tabLabels.hint")}{/snippet}
    <Segmented
      options={[
        { value: "iso", label: $t("settings.appearance.tabLabels.iso") },
        { value: "friendly", label: $t("settings.appearance.tabLabels.friendly") },
      ]}
      value={$tabLabelStyle}
      onChange={(v) => void controller.setTabLabelStyle(v as TabLabelStyle)}
    />
  </SettingRow>
</section>
<section class="s-group">
  <div class="settings-section-label">{$t("settings.editor.sectionLabel")}</div>
  <SettingRow label={$t("settings.editor.width.label")} stack>
    {#snippet description()}{$t("settings.editor.width.hint")}{/snippet}
    <Segmented
      options={[
        { value: "full", label: $t("settings.editor.width.full") },
        { value: "wrap", label: $t("settings.editor.width.wrap") },
        { value: "reading", label: $t("settings.editor.width.readingColumn") },
      ]}
      value={editorWidthMode}
      onChange={setEditorWidth}
    />
  </SettingRow>
  <SettingToggle
    label={$t("settings.editor.spellCheck.label")}
    checked={$spellCheck}
    onChange={(v) => {
      void controller.setSpellCheck(v);
      if (v && availableSpellLangs.length === 0) void loadSpellLanguages();
    }}
  >
    {#snippet description()}{$backendKind === "web" ? $t("settings.editor.spellCheck.hintWeb") : $t("settings.editor.spellCheck.hint")}{/snippet}
  </SettingToggle>
  {#if $spellCheck && $backendKind !== "web"}
    <SettingRow label={$t("settings.editor.spellLanguages.label")} stack>
      <div class="spell-languages-box" role="group" aria-label={$t("settings.editor.spellLanguages.label")}>
        {#each orderedLanguages as lang (lang.tag)}
          <label
            class="spell-language-row"
            class:disabled={lang.checked && effectiveLanguages.length === 1}
          >
            <input
              type="checkbox"
              class="spell-language-checkbox"
              checked={lang.checked}
              disabled={lang.checked && effectiveLanguages.length === 1}
              onchange={() => toggleSpellLanguage(lang.tag, lang.checked)}
            />
            <span class="spell-language-name">{lang.name}</span>
            <span class="spell-language-tag">({lang.tag})</span>
          </label>
        {/each}
      </div>
      <div class="settings-hint">{$t("settings.editor.spellLanguages.hint")}</div>
      <!-- Windows only lists languages whose spelling dictionary is installed; it installs one when the language is added. -->
      <div class="settings-hint">{$t("settings.editor.spellLanguages.missing")}</div>
    </SettingRow>
  {/if}
  <SettingRow label={$t("settings.editor.fontSize.label")}>
    <div class="s-slider">
      <input
        type="range"
        class="settings-range-slider"
        min="12"
        max="18"
        step="0.5"
        value={$fontSize}
        aria-label={$t("settings.editor.fontSize.ariaLabel")}
        oninput={(e) => controller.setFontSize(parseFloat(e.currentTarget.value))}
      />
      <span class="settings-slider-val">{$fontSize}px</span>
    </div>
  </SettingRow>
  <SettingRow label={$t("settings.editor.lineSpacing.label")}>
    <div class="s-slider">
      <input
        type="range"
        class="settings-range-slider"
        min="1.3"
        max="1.8"
        step="0.05"
        value={$lineHeight}
        aria-label={$t("settings.editor.lineSpacing.ariaLabel")}
        oninput={(e) => controller.setLineHeight(parseFloat(e.currentTarget.value))}
      />
      <span class="settings-slider-val">{$lineHeight.toFixed(2)}</span>
    </div>
  </SettingRow>
</section>
<section class="s-group">
  <div class="settings-section-label">{$t("occurrence.settings.title")}</div>
  <SettingToggle
    label={$t("occurrence.settings.hint.label")}
    checked={$occurrenceHint}
    onChange={(v) => void setOccurrenceHint(v)}
  >
    {#snippet description()}{$t("occurrence.settings.hint.hint")}{/snippet}
  </SettingToggle>
</section>
{#if $backendKind === "desktop"}
  <section class="s-group">
    <div class="settings-section-label">{$t("peek.settings.title")}</div>
    <div class="s-note">{$t("peek.settings.hint")}</div>
    <SettingToggle
      label={$t("peek.settings.fitSection.label")}
      checked={$peekSettings.lines === 0}
      onChange={(v) => peekSettings.update((s) => ({ ...s, lines: v ? 0 : PEEK_DEFAULTS.lines, useLinesHeight: true }))}
    />
    <SettingRow label={$t("peek.settings.opacity.label")}>
      <div class="s-slider">
        <input
          type="range"
          class="settings-range-slider"
          min="20"
          max="100"
          step="5"
          value={$peekSettings.opacity}
          aria-label={$t("peek.settings.opacity.label")}
          oninput={(e) => peekSettings.update((s) => ({ ...s, opacity: parseInt(e.currentTarget.value, 10) }))}
        />
        <span class="settings-slider-val">{$peekSettings.opacity}%</span>
      </div>
    </SettingRow>
    <SettingRow label={$t("peek.settings.opacityHover.label")}>
      <div class="s-slider">
        <input
          type="range"
          class="settings-range-slider"
          min="20"
          max="100"
          step="5"
          value={$peekSettings.opacityHover}
          aria-label={$t("peek.settings.opacityHover.label")}
          oninput={(e) => peekSettings.update((s) => ({ ...s, opacityHover: parseInt(e.currentTarget.value, 10) }))}
        />
        <span class="settings-slider-val">{$peekSettings.opacityHover}%</span>
      </div>
    </SettingRow>
    <SettingRow label={$t("peek.settings.fadeSeconds.label")}>
      <div class="s-slider">
        <input
          type="range"
          class="settings-range-slider"
          min="0"
          max="60"
          step="1"
          value={$peekSettings.fadeSeconds}
          aria-label={$t("peek.settings.fadeSeconds.label")}
          oninput={(e) => peekSettings.update((s) => ({ ...s, fadeSeconds: parseInt(e.currentTarget.value, 10) }))}
        />
        <span class="settings-slider-val">{$peekSettings.fadeSeconds === 0 ? $t("peek.settings.fadeSeconds.never") : $peekSettings.fadeSeconds + " s"}</span>
      </div>
    </SettingRow>
    <SettingToggle
      label={$t("peek.settings.alwaysOnTop.label")}
      checked={$peekSettings.alwaysOnTop}
      onChange={(v) => peekSettings.update((s) => ({ ...s, alwaysOnTop: v }))}
    />
    <SettingRow label={$t("peek.settings.header.label")}>
      <Segmented
        options={[
          { value: "always", label: $t("peek.settings.header.always") },
          { value: "hover", label: $t("peek.settings.header.hover") },
          { value: "never", label: $t("peek.settings.header.never") },
        ]}
        value={$peekSettings.header}
        onChange={(v) => peekSettings.update((s) => ({ ...s, header: v as PeekHeaderMode }))}
      />
    </SettingRow>
    <SettingRow label={$t("peek.settings.callShortcut.label")}>
      <input
        type="text"
        class="find-input s-input"
        value={displayAccelerator($peekSettings.callShortcut)}
        aria-label={$t("peek.settings.callShortcut.label")}
        onchange={(e) => peekSettings.update((s) => ({ ...s, callShortcut: e.currentTarget.value.trim() }))}
      />
    </SettingRow>
  </section>
{/if}

<style>
.settings-slider-val {
  font-size: var(--type-caption);
  font-family: var(--font-mono);
  color: var(--muted);
}

.settings-range-slider {
  width: 100%;
  accent-color: var(--glyph-open-color);
  cursor: pointer;
}

.s-slider {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 200px;
}

.s-slider .settings-range-slider {
  flex: 1;
  min-width: 0;
}

.s-slider .settings-slider-val {
  min-width: 42px;
  text-align: right;
}

/* Was inside the global phone-width block that also holds the row rules. */
@media (max-width: 600px) {
  .s-slider {
    width: 100%;
  }
}

.spell-languages-box {
  width: 100%;
  background: var(--surface-sunken, var(--surface-canvas));
  border: 1px solid var(--edge-soft);
  border-radius: var(--radius-control);
  max-height: 180px;
  overflow-y: auto;
  padding: 4px 8px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.spell-language-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--edge-soft);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.spell-language-row:last-child {
  border-bottom: none;
}

.spell-language-row.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spell-language-checkbox {
  cursor: pointer;
  accent-color: var(--glyph-open-color);
}

.spell-language-checkbox:disabled {
  cursor: not-allowed;
}

.spell-language-name {
  color: var(--text);
  flex: 1;
}

.spell-language-tag {
  color: var(--muted);
  font-size: var(--type-caption);
  font-family: var(--font-mono, monospace);
}
</style>

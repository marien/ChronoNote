<script lang="ts">
  import * as controller from "../controller";
  import {
    appVersion,
    autoCheckUpdates,
    backendKind,
    updateAvailableVersion,
    updateDownloadProgress,
    updateErrorDuring,
    updateErrorMessage,
    updateInstalling,
    updateLastChecked,
    updateStatus,
  } from "../controller";
  import Icon from "../icons/Icon.svelte";
  import AppIcon from "./AppIcon.svelte";
  import SettingRow from "./SettingRow.svelte";
  import SettingToggle from "./SettingToggle.svelte";
  import { formatCombo, shortcutById } from "../shortcuts";
  import { t } from "../i18n";
  import { buildDiagnostics } from "../appLog";
  import * as api from "../tauriApi";

  let showLicences = $state(false);
  let licencesText = $state<string | null>(null);
  let licencesLoading = $state(false);
  let fallbackDiagnostics = $state<string | null>(null);

  async function copyDiagnostics() {
    try {
      const text = await buildDiagnostics();
      await navigator.clipboard.writeText(text);
      controller.showToast($t("toast.diagnosticsCopied", undefined));
      fallbackDiagnostics = null;
    } catch {
      try {
        fallbackDiagnostics = await buildDiagnostics();
      } catch {
        fallbackDiagnostics = "";
      }
    }
  }

  async function toggleLicences() {
    showLicences = !showLicences;
    if (showLicences && licencesText === null && !licencesLoading) {
      licencesLoading = true;
      try {
        const text = (await import("../../assets/THIRD-PARTY-NOTICES.txt?raw")).default;
        licencesText = text;
      } catch {
        licencesText = "";
      } finally {
        licencesLoading = false;
      }
    }
  }

  // §update-check: kick off a check the moment About is opened if nothing
  // has run yet this session (the launch check may have been skipped —
  // auto-check off, or it hasn't resolved yet) — About is the one place a
  // stale "idle" reading would actually be visible to the user. Meaningless
  // in the web app (no installer to update to — refreshing the page always
  // serves the latest deployed build), so skipped there.
  if ($backendKind !== "web" && $updateStatus === "idle") controller.checkForUpdates();

  const progressLabel = $derived.by(() => {
    const p = $updateDownloadProgress;
    if (!p || !p.totalBytes) return "";
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    return ` ${mb(p.doneBytes)} / ${mb(p.totalBytes)} MB`;
  });

  /** "Checked just now / 3 minutes ago / 2 hours ago" for the last completed update check.
   * A `$:` block (not a plain function called from the template) so Svelte tracks `$t` as a
   * real reactive dependency here too — a plain helper function's own internal `$t` reference
   * wouldn't otherwise make the template re-render on a language change while this stays open. */
  const agoText = $derived.by(() => {
    const ms = $updateLastChecked;
    if (!ms) return "";
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 45) return $t("about.checkedJustNow", undefined);
    const m = Math.round(s / 60);
    if (m < 60) return $t("about.checkedMinutesAgo", { minutes: m });
    const h = Math.round(m / 60);
    return $t("about.checkedHoursAgo", { hours: h });
  });

  /** The version card's status chip: a word, and a tone that colours its dot and outline. */
  const chip = $derived.by((): { label: string; tone: "ok" | "accent" | "busy" | "warn" | "neutral" } => {
    if ($backendKind === "web") return { label: $t("about.chip.alwaysCurrent", undefined), tone: "ok" };
    switch ($updateStatus) {
      case "checking":
        return { label: $t("about.chip.checking", undefined), tone: "busy" };
      case "upToDate":
        return { label: $t("about.chip.upToDate", undefined), tone: "ok" };
      case "available":
        return { label: $t("about.chip.updateAvailable", undefined), tone: "accent" };
      case "downloading":
        return {
          label: $updateInstalling ? $t("about.chip.startingInstaller", undefined) : $t("about.chip.downloading", undefined),
          tone: "busy",
        };
      case "ready":
        return { label: $t("about.chip.restartToFinish", undefined), tone: "accent" };
      case "error":
        return {
          label: $updateErrorDuring === "install" ? $t("about.chip.installFailed", undefined) : $t("about.chip.couldntCheck", undefined),
          tone: "warn",
        };
      default:
        return { label: $t("about.chip.notCheckedYet", undefined), tone: "neutral" };
    }
  });
</script>

<div class="about-panel">
  <!-- Windows 11 style header card: icon, app name, version, status chip and primary action -->
  <div class="about-version-card" data-tone={chip.tone}>
    <div class="about-header-main">
      <div class="about-header-info">
        <AppIcon size={48} />
        <div class="about-header-text">
          <div class="about-app-name">ChronoNote</div>
          <div class="about-version-text">{$t("about.version.label")} v{$appVersion || "…"}</div>
          {#if $backendKind === "web"}
            <div class="about-web-hint-text">{$t("about.web.hint")}</div>
          {:else if agoText && ($updateStatus === "upToDate" || $updateStatus === "idle")}
            <div class="about-checked-text">{agoText}</div>
          {/if}
        </div>
      </div>

      <div class="about-header-right">
        <span class="about-status-chip" role="status">
          {#if chip.tone === "busy"}
            <span class="modal-spinner" aria-hidden="true"></span>
          {:else}
            <span class="about-status-dot" aria-hidden="true"></span>
          {/if}
          {chip.label}
        </span>

        {#if $backendKind !== "web"}
          {#if $updateStatus === "available"}
            <div class="about-action-buttons">
              <button
                type="button"
                class="settings-btn primary"
                onclick={() => controller.downloadAndInstallUpdate()}
              >
                <Icon name="update" size={14} /> {$t("about.downloadAndInstall")}
              </button>
              <button
                type="button"
                class="settings-btn quiet"
                onclick={controller.openReleasesPage}
              >
                {$t("about.whatsChanged")}
              </button>
            </div>
          {:else if $updateStatus === "downloading"}
            <div class="about-progress-wrap">
              {#if $updateInstalling}
                <span class="about-progress-label">{$t("about.downloading.startingInstaller")}</span>
              {:else}
                <progress
                  class="about-progress-bar"
                  value={$updateDownloadProgress?.doneBytes ?? 0}
                  max={$updateDownloadProgress?.totalBytes ?? 1}
                ></progress>
                {#if progressLabel}
                  <span class="about-progress-label">{progressLabel}</span>
                {/if}
              {/if}
            </div>
          {:else if $updateStatus === "ready"}
            <div class="about-action-buttons">
              <button
                type="button"
                class="settings-btn primary"
                onclick={() => controller.restartToFinishUpdate()}
              >
                {$t("about.ready.restartNow")}
              </button>
            </div>
          {:else if $updateStatus === "error"}
            <div class="about-action-buttons">
              <button
                type="button"
                class="settings-btn quiet"
                onclick={() =>
                  $updateErrorDuring === "install"
                    ? controller.downloadAndInstallUpdate()
                    : controller.checkForUpdates()}
              >
                {$t("about.error.tryAgain")}
              </button>
              {#if $updateErrorDuring === "install"}
                <button
                  type="button"
                  class="settings-btn quiet"
                  onclick={controller.openReleasesPage}
                >
                  {$t("about.error.downloadFromGithub")}
                </button>
              {/if}
            </div>
          {:else}
            <!-- not checked / up to date / checking -->
            <div class="about-action-buttons">
              <button
                type="button"
                class="settings-btn quiet"
                disabled={$updateStatus === "checking"}
                onclick={() => controller.checkForUpdates()}
              >
                {$t("about.checkForUpdates")}
              </button>
            </div>
          {/if}
        {/if}
      </div>
    </div>

    {#if $backendKind !== "web" && $updateStatus === "available" && $updateAvailableVersion}
      <div class="about-available-hint">
        <strong>v{$updateAvailableVersion}</strong> {$t("about.isAvailable")}
      </div>
    {/if}

    {#if $updateStatus === "error"}
      <div class="about-header-error">
        {#if $updateErrorDuring === "install"}
          {$t("about.error.installFailedPrefix")} {$updateErrorMessage ?? ""}
        {:else}
          {$t("about.error.couldntCheckPrefix")} {$updateErrorMessage ?? ""}
        {/if}
      </div>
    {/if}
  </div>

  <!-- Windows 11 style setting cards -->
  <div class="s-group">
    {#if $backendKind !== "web"}
      <SettingToggle
        label={$t("settings.updates.checkOnStart")}
        checked={$autoCheckUpdates}
        onChange={(v) => controller.setAutoCheckUpdates(v)}
      >
        {#snippet description()}{$t("settings.updates.checkOnStartHint")}{/snippet}
      </SettingToggle>
    {/if}

    <SettingRow label={$t("about.releaseNotes")}>
      <button
        type="button"
        class="settings-btn quiet icon-only"
        onclick={controller.openCurrentReleaseNotes}
        aria-label={$t("about.releaseNotes")}
      >
        <Icon name="external" size={14} />
      </button>
    </SettingRow>

    <SettingRow label={$t("about.links.website").replace(/:\s*$/, "")}>
      {#snippet description()}{controller.WEBSITE_URL}{/snippet}
      <button
        type="button"
        class="settings-btn quiet icon-only"
        onclick={controller.openWebsiteLink}
        aria-label={$t("about.links.website").replace(/:\s*$/, "")}
      >
        <Icon name="external" size={14} />
      </button>
    </SettingRow>

    <SettingRow label={$t("about.links.project").replace(/:\s*$/, "")}>
      {#snippet description()}{controller.PROJECT_URL}{/snippet}
      <button
        type="button"
        class="settings-btn quiet icon-only"
        onclick={controller.openProjectLink}
        aria-label={$t("about.links.project").replace(/:\s*$/, "")}
      >
        <Icon name="external" size={14} />
      </button>
    </SettingRow>

    <SettingRow label={$t("about.reportProblem")}>
      {#snippet description()}{$t("about.reportProblemHint")}{/snippet}
      <button
        type="button"
        class="settings-btn quiet icon-only"
        onclick={controller.openReportProblem}
        aria-label={$t("about.reportProblem")}
      >
        <Icon name="external" size={14} />
      </button>
    </SettingRow>

    <SettingRow label={$t("about.diagnostics")}>
      {#snippet description()}{$t("about.diagnosticsHint")}{/snippet}
      <button
        type="button"
        class="settings-btn quiet"
        onclick={copyDiagnostics}
      >
        {$t("about.diagnosticsCopy")}
      </button>
    </SettingRow>

    {#if $backendKind === "desktop"}
      <SettingRow label={$t("about.logFolder")}>
        {#snippet description()}{$t("about.logFolderHint")}{/snippet}
        <button
          type="button"
          class="settings-btn quiet icon-only"
          onclick={() => void api.openLogFolder()}
          aria-label={$t("about.logFolder")}
        >
          <Icon name="external" size={14} />
        </button>
      </SettingRow>
    {/if}

    <SettingRow label={$t("about.privacy")}>
      {#snippet description()}{$t("about.privacyHint")}{/snippet}
      <button
        type="button"
        class="settings-btn quiet icon-only"
        onclick={controller.openPrivacyPage}
        aria-label={$t("about.privacy")}
      >
        <Icon name="external" size={14} />
      </button>
    </SettingRow>

    <SettingRow label={$t("about.licences")}>
      {#snippet description()}{$t("about.licencesHint")}{/snippet}
      <button
        type="button"
        class="settings-btn quiet"
        onclick={toggleLicences}
      >
        {showLicences ? $t("about.licencesHide") : $t("about.licencesShow")}
      </button>
    </SettingRow>

    <SettingRow label={$t("commandPalette.keyboardShortcuts")}>
      <div class="about-kbd-wrap">
        <kbd>{formatCombo(shortcutById("openShortcutsHelp").combos[0])}</kbd>
        <button
          type="button"
          class="settings-btn quiet icon-only"
          onclick={controller.openShortcutsHelp}
          aria-label={$t("commandPalette.keyboardShortcuts")}
        >
          <Icon name="keyboard" size={14} />
        </button>
      </div>
    </SettingRow>
  </div>

  {#if fallbackDiagnostics !== null}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre class="about-licences" tabindex="0">{fallbackDiagnostics}</pre>
  {/if}

  {#if showLicences}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre class="about-licences" tabindex="0">{licencesLoading ? $t("about.licencesLoading") : licencesText}</pre>
  {/if}
</div>

<style>
  .about-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }

  .about-version-card {
    display: flex;
    flex-direction: column;
    /* The old global `.about-version-card` rule centres its children; the header runs the full width here. */
    align-items: stretch;
    gap: 12px;
    padding: 16px;
    background: color-mix(in srgb, var(--surface-raised) 60%, transparent);
    border: 1px solid var(--edge-soft);
    border-radius: var(--radius-control);
    box-sizing: border-box;
  }

  .about-header-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .about-header-info {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }

  .about-header-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .about-app-name {
    font-family: var(--font-ui-display, inherit);
    font-size: var(--type-subtitle);
    font-weight: 600;
    line-height: 1.2;
    color: var(--text);
  }

  .about-version-text {
    font-size: var(--type-body);
    color: var(--text-secondary);
    line-height: 1.3;
  }

  .about-checked-text {
    font-size: var(--type-caption);
    color: var(--muted);
    line-height: 1.3;
  }

  .about-web-hint-text {
    font-size: var(--type-caption);
    color: var(--text-secondary);
    line-height: 1.3;
    max-width: 460px;
  }

  .about-available-hint {
    font-size: var(--type-caption);
    color: var(--text);
    line-height: 1.3;
    border-top: 1px solid var(--edge-soft);
    padding-top: 8px;
  }

  .about-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-left: auto;
  }

  .about-status-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 3px 10px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--tone, var(--muted));
    border: 1px solid color-mix(in srgb, var(--tone, var(--muted)) 45%, transparent);
    border-radius: 999px;
  }

  .about-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }

  .about-status-chip .modal-spinner {
    font-size: 11px;
  }

  .about-version-card[data-tone="ok"] { --tone: var(--state-ok); }
  .about-version-card[data-tone="accent"] { --tone: var(--tab-active-border); }
  .about-version-card[data-tone="warn"] { --tone: var(--state-warn); }
  .about-version-card[data-tone="busy"] { --tone: var(--muted); }

  .about-action-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .about-header-error {
    color: var(--state-error);
    font-size: var(--type-caption);
    line-height: 1.4;
    border-top: 1px solid var(--edge-soft);
    padding-top: 8px;
  }

  .about-progress-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 140px;
  }

  .about-progress-bar {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    appearance: none;
    border: none;
    background: var(--surface-raised);
    overflow: hidden;
  }

  .about-progress-bar::-webkit-progress-bar {
    background: var(--surface-raised);
    border-radius: 2px;
  }

  .about-progress-bar::-webkit-progress-value {
    background: var(--tab-active-border, var(--accent, #4cc2ff));
    border-radius: 2px;
  }

  .about-progress-bar::-moz-progress-bar {
    background: var(--tab-active-border, var(--accent, #4cc2ff));
    border-radius: 2px;
  }

  .about-progress-label {
    font-size: var(--type-caption);
    color: var(--muted);
  }

  .settings-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid var(--edge-strong);
    border-radius: var(--radius-control);
    color: var(--text);
    padding: 5px 12px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }

  .settings-btn:hover {
    background: var(--surface-raised);
  }

  .settings-btn.primary {
    background: var(--text);
    color: var(--bg);
    border-color: transparent;
  }

  .settings-btn.primary:hover {
    background: var(--text);
    opacity: 0.85;
  }

  .settings-btn.quiet {
    border-color: var(--edge-soft);
  }

  .settings-btn.quiet:hover {
    background: var(--surface-raised);
    border-color: var(--edge-strong);
  }

  .settings-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .settings-btn.icon-only {
    padding: 6px;
    width: 32px;
    height: 32px;
    justify-content: center;
    box-sizing: border-box;
  }

  .about-kbd-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  @media (max-width: 480px) {
    .about-header-main {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .about-header-right {
      margin-left: 0;
      width: 100%;
      justify-content: space-between;
    }
  }

  .about-licences {
    max-height: 50vh;
    overflow: auto;
    font-family: var(--font-mono, var(--font, monospace));
    font-size: 12px;
    white-space: pre-wrap;
    background: var(--surface-sunken, var(--surface-canvas));
    border: 1px solid var(--edge-soft);
    border-radius: 6px;
    padding: 12px;
    margin: 0;
    color: var(--text);
    box-sizing: border-box;
  }
</style>

<script lang="ts">
  import * as controller from "../../controller";
  import {
    appVersion,
    backendKind,
    updateAvailableVersion,
    updateDownloadProgress,
    updateErrorDuring,
    updateErrorMessage,
    updateInstalling,
    updateLastChecked,
    updateStatus,
  } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import { formatCombo, formatShortcut, shortcutById } from "../../shortcuts";
  import { t } from "../../i18n";

  // §update-check: kick off a check the moment About is opened if nothing
  // has run yet this session (the launch check may have been skipped —
  // auto-check off, or it hasn't resolved yet) — About is the one place a
  // stale "idle" reading would actually be visible to the user. Meaningless
  // in the web app (no installer to update to — refreshing the page always
  // serves the latest deployed build), so skipped there.
  if ($backendKind !== "web" && $updateStatus === "idle") controller.checkForUpdates();

  $: progressLabel = (() => {
    const p = $updateDownloadProgress;
    if (!p || !p.totalBytes) return "";
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    return ` ${mb(p.doneBytes)} / ${mb(p.totalBytes)} MB`;
  })();

  /** "Checked just now / 3 minutes ago / 2 hours ago" for the last completed update check.
   * A `$:` block (not a plain function called from the template) so Svelte tracks `$t` as a
   * real reactive dependency here too — a plain helper function's own internal `$t` reference
   * wouldn't otherwise make the template re-render on a language change while this stays open. */
  $: agoText = ((ms: number | null): string => {
    if (!ms) return "";
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 45) return $t("about.checkedJustNow", undefined);
    const m = Math.round(s / 60);
    if (m < 60) return $t("about.checkedMinutesAgo", { minutes: m });
    const h = Math.round(m / 60);
    return $t("about.checkedHoursAgo", { hours: h });
  })($updateLastChecked);

  /** The version card's status chip: a word, and a tone that colours its dot and outline. */
  $: chip = ((): { label: string; tone: "ok" | "accent" | "busy" | "warn" | "neutral" } => {
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
  })();
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card modal-sm" role="dialog" aria-modal="true" use:focusTrap aria-label={$t("shortcuts.openAbout.label")}>
    <div class="modal-input-wrap modal-title">
      <Icon name="about" size={15} />
      <span>{$t("shortcuts.openAbout.label")}</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label={$t("common.closeDialog")}
        on:click={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
    <div class="settings-section">
      <div>
        <div class="settings-section-label">{$t("about.updates.sectionLabel")}</div>

        <!-- The running version lives here, with what the update check says about it. -->
        <div class="about-version-card" data-tone={chip.tone}>
          <div class="about-version-main">
            <span class="about-version-label">{$t("about.version.label")}</span>
            <span class="about-version-num">v{$appVersion || "…"}</span>
          </div>
          <span class="about-status-chip" role="status">
            {#if chip.tone === "busy"}
              <span class="modal-spinner" aria-hidden="true"></span>
            {:else}
              <span class="about-status-dot" aria-hidden="true"></span>
            {/if}
            {chip.label}
          </span>
        </div>

        {#if $backendKind === "web"}
          <div class="settings-hint" style="margin-top: 8px;">
            {$t("about.web.hint")}
          </div>
          <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
            <button class="icon-btn" on:click={controller.openCurrentReleaseNotes}>
              {$t("about.releaseNotes")} <Icon name="external" size={12} />
            </button>
          </div>
        {:else if $updateStatus === "checking"}
          <div class="settings-hint" style="margin-top: 8px;">{$t("about.checkingHint")}</div>
        {:else if $updateStatus === "available"}
          <div class="settings-hint" style="margin-top: 8px;">
            <strong style="color: var(--text);">v{$updateAvailableVersion}</strong> {$t("about.isAvailable")}
          </div>
          <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
            <button class="icon-btn" on:click={controller.openReleasesPage}> {$t("about.whatsChanged")} </button>
            <button class="icon-btn btn-primary" on:click={() => controller.downloadAndInstallUpdate()}>
              <Icon name="update" size={14} /> {$t("about.downloadAndInstall")}
            </button>
          </div>
        {:else if $updateStatus === "downloading"}
          <div class="settings-hint" style="margin-top: 8px;">
            {#if $updateInstalling}{$t("about.downloading.startingInstaller")}{:else}{$t("about.downloading.downloading")}{progressLabel}{/if}
          </div>
        {:else if $updateStatus === "ready"}
          <div class="settings-hint" style="margin-top: 8px;">{$t("about.ready.installed")}</div>
          <button class="icon-btn btn-primary" style="margin-top: 8px;" on:click={() => controller.restartToFinishUpdate()}>
            {$t("about.ready.restartNow")}
          </button>
        {:else if $updateStatus === "error"}
          {#if $updateErrorDuring === "install"}
            <div class="settings-hint" style="margin-top: 8px; color: var(--state-error);">
              {$t("about.error.installFailedPrefix")} {$updateErrorMessage ?? ""}
            </div>
            <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
              <button class="icon-btn" on:click={() => controller.downloadAndInstallUpdate()}>{$t("about.error.tryAgain")}</button>
              <button class="icon-btn btn-primary" on:click={controller.openReleasesPage}>{$t("about.error.downloadFromGithub")}</button>
            </div>
          {:else}
            <div class="settings-hint" style="margin-top: 8px; color: var(--state-error);">
              {$t("about.error.couldntCheckPrefix")} {$updateErrorMessage ?? ""}
            </div>
            <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
              <button class="icon-btn" on:click={() => controller.checkForUpdates()}>{$t("about.error.tryAgain")}</button>
              <button class="icon-btn" on:click={controller.openCurrentReleaseNotes}>
                {$t("about.releaseNotes")} <Icon name="external" size={12} />
              </button>
            </div>
          {/if}
        {:else}
          <!-- Up to date (or not checked yet): this version's own release notes are the useful link. -->
          <div class="settings-hint" style="margin-top: 8px;">
            {#if $updateStatus === "upToDate"}
              {$t("about.upToDate.running")}{#if $updateLastChecked}
                <span class="about-checked">&nbsp;{agoText}.</span>{/if}
            {:else}
              {$t("about.chip.notCheckedYet")}.
            {/if}
          </div>
          <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
            <button class="icon-btn" on:click={controller.openCurrentReleaseNotes}>
              {$t("about.releaseNotes")} <Icon name="external" size={12} />
            </button>
            <button class="icon-btn" on:click={() => controller.checkForUpdates()}>
              {$updateStatus === "upToDate" ? $t("about.checkAgain") : $t("about.checkNow")}
            </button>
          </div>
        {/if}
      </div>
      <div>
        <div class="settings-section-label">{$t("about.links.sectionLabel")}</div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="settings-inline-label">{$t("about.links.website")}</span>
            <button class="icon-btn" style="text-align: left; flex: 1;" on:click={controller.openWebsiteLink}>
              {controller.WEBSITE_URL}
            </button>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="settings-inline-label">{$t("about.links.project")}</span>
            <button class="icon-btn" style="text-align: left; flex: 1;" on:click={controller.openProjectLink}>
              {controller.PROJECT_URL}
            </button>
          </div>
        </div>
      </div>
      <div>
        <div class="settings-section-label">{$t("about.learnMore.sectionLabel")}</div>
        <div class="settings-hint" style="margin-top: 0;">
          <kbd>{formatCombo(shortcutById("openShortcutsHelp").combos[0])}</kbd> {$t("about.learnMore.shortcutsHint")}
          <kbd>{formatShortcut("commandPalette")}</kbd> {$t("about.learnMore.paletteHint")}
        </div>
      </div>
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>{$t("common.close")}</button>
    </div>
  </div>
</div>

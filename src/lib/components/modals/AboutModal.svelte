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
    updateStatus,
  } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import { formatCombo, formatShortcut, shortcutById } from "../../shortcuts";

  // §update-check: kick off a check the moment About is opened if nothing
  // has run yet this session (the launch check may have been skipped —
  // auto-check off, or it hasn't resolved yet) — About is the one place a
  // stale "idle" reading would actually be visible to the user. Meaningless
  // in the web app (no installer to update to — refreshing the page always
  // serves the latest deployed build), so skipped there.
  if ($backendKind !== "web" && $backendKind !== "android" && $updateStatus === "idle") controller.checkForUpdates();

  $: progressLabel = (() => {
    const p = $updateDownloadProgress;
    if (!p || !p.totalBytes) return "";
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    return ` ${mb(p.doneBytes)} / ${mb(p.totalBytes)} MB`;
  })();
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card modal-sm" role="dialog" aria-modal="true" use:focusTrap aria-label="About ChronoNote">
    <div class="modal-input-wrap modal-title">
      <Icon name="about" size={15} />
      <span>About ChronoNote</span>
      <span class="modal-counter">v{$appVersion || "…"}</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label="Close dialog"
        on:click={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
    <div class="settings-section">
      <div>
        <div class="settings-section-label">Updates</div>
        {#if $backendKind === "web"}
          <div class="settings-hint" style="margin-top: 0;">
            This is the browser version — it always runs whatever's currently deployed. Refresh the page to get the
            latest.
          </div>
        {:else if $backendKind === "android"}
          <div class="settings-hint" style="margin-top: 0;">
            This app doesn't check for updates itself — install a newer version the same way you installed this one.
          </div>
          <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
            <button class="icon-btn" on:click={controller.openReleasesPage}> What's changed </button>
          </div>
        {:else if $updateStatus === "checking"}
          <div class="settings-hint" style="margin-top: 0;">
            <span class="modal-spinner" aria-label="Checking">⟳</span> Checking for updates…
          </div>
        {:else if $updateStatus === "available"}
          <div class="settings-hint" style="margin-top: 0;">
            <strong style="color: var(--text);">v{$updateAvailableVersion}</strong> is available.
          </div>
          <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
            <button class="icon-btn" on:click={controller.openReleasesPage}> What's changed </button>
            <button class="icon-btn btn-primary" on:click={() => controller.downloadAndInstallUpdate()}>
              <Icon name="update" size={14} /> Download &amp; install
            </button>
          </div>
        {:else if $updateStatus === "downloading"}
          <div class="settings-hint" style="margin-top: 0;">
            {#if $updateInstalling}Starting the installer…{:else}Downloading update…{progressLabel}{/if}
          </div>
        {:else if $updateStatus === "ready"}
          <div class="settings-hint" style="margin-top: 0;">Installed — restart to finish.</div>
          <button class="icon-btn btn-primary" style="margin-top: 8px;" on:click={() => controller.restartToFinishUpdate()}>
            Restart now
          </button>
        {:else if $updateStatus === "error"}
          {#if $updateErrorDuring === "install"}
            <div class="settings-hint" style="margin-top: 0; color: var(--state-error);">
              Couldn't install the update. {$updateErrorMessage ?? ""}
            </div>
            <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
              <button class="icon-btn" on:click={() => controller.downloadAndInstallUpdate()}>Try again</button>
              <button class="icon-btn btn-primary" on:click={controller.openReleasesPage}>Download from GitHub</button>
            </div>
          {:else}
            <div class="settings-hint" style="margin-top: 0; color: var(--state-error);">
              Couldn't check for updates. {$updateErrorMessage ?? ""}
            </div>
            <button class="icon-btn" style="margin-top: 8px;" on:click={() => controller.checkForUpdates()}>
              Try again
            </button>
          {/if}
        {:else}
          <div class="settings-hint" style="margin-top: 0;">
            {$updateStatus === "upToDate" ? "You're up to date." : "Not checked yet."}
          </div>
          <button class="icon-btn" style="margin-top: 8px;" on:click={() => controller.checkForUpdates()}>
            Check now
          </button>
        {/if}
      </div>
      <div>
        <div class="settings-section-label">Links</div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="settings-inline-label">Website:</span>
            <button class="icon-btn" style="text-align: left; flex: 1;" on:click={controller.openWebsiteLink}>
              {controller.WEBSITE_URL}
            </button>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="settings-inline-label">Project:</span>
            <button class="icon-btn" style="text-align: left; flex: 1;" on:click={controller.openProjectLink}>
              {controller.PROJECT_URL}
            </button>
          </div>
        </div>
      </div>
      <div>
        <div class="settings-section-label">Learn more</div>
        <div class="settings-hint" style="margin-top: 0;">
          <kbd>{formatCombo(shortcutById("openShortcutsHelp").combos[0])}</kbd> opens the Shortcuts &amp; Symbols
          drawer &mdash; every keyboard shortcut plus what each editor glyph means.
          <kbd>{formatShortcut("commandPalette")}</kbd> is the command palette.
        </div>
      </div>
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

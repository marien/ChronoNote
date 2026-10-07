<script lang="ts">
  import {
    appVersion,
    backendKind,
    folderNameFromPath,
    justUpdatedToVersion,
    notesDir,
    oneDriveAccount,
    oneDriveFolder,
    oneDriveSignInExpired,
    oneDriveSyncing,
    LONG_TOAST_CHARS,
    oneDriveSyncStatus,
    isMobile,
    statusCounts,
    statusPos,
    statusSelection,
    statusWordCount,
    syncConflicts,
    syncHealthPopoverOpen,
    toastAction,
    toastMessage,
    UPDATE_AVAILABLE_TOAST_KEY,
    updateStatus,
  } from "../controller";
  import * as controller from "../controller";
  import Icon from "../icons/Icon.svelte";
  import SyncHealthPopover from "./SyncHealthPopover.svelte";
  import { formatCombo, formatShortcut, shortcutById } from "../shortcuts";
  import { t } from "../i18n";

  function onCloudClick() {
    if (!$oneDriveFolder) {
      controller.openSettingsOnNotesFolder();
      return;
    }
    syncHealthPopoverOpen.update((v) => !v);
  }

  // #37/#38: how many lines the selection covers (not a character count).
  const selectionLabel = $derived($statusSelection ? $t("statusBar.selection", { count: $statusSelection.lines }) : "");

  // §merged-titlebar: which notes folder is active — moved here from
  // "Settings-only" now that the window title itself no longer renders
  // visibly (the merged title bar has no title text). Meaningless for the
  // web backend (no `notesDir`, IndexedDB-backed instead — the "Browser
  // storage" badge in the right zone already covers that case).
  const folderName = $derived($notesDir ? folderNameFromPath($notesDir) : "");

  const hasCentreMessage = $derived(Boolean(
    $justUpdatedToVersion ||
      ($toastMessage === $t(UPDATE_AVAILABLE_TOAST_KEY, undefined) && $updateStatus === "available") ||
      ($toastMessage && !$isMobile && $toastMessage.length <= LONG_TOAST_CHARS),
  ));
</script>

<div id="status-bar" class:has-centre-message={hasCentreMessage}>
  <div class="status-zone status-left">
    {#if $backendKind === "web" && $oneDriveAccount}
      <button
        id="stat-cloud"
        class="status-folder-btn"
        class:stat-expired={$oneDriveSignInExpired}
        title={$oneDriveSignInExpired ? $t("statusBar.oneDrive.signInExpired") : $oneDriveAccount ? $t("statusBar.oneDrive.statusTitle", { path: $oneDriveFolder?.folderPath ?? "/", status: $oneDriveSyncStatus }) : $t("statusBar.oneDrive.connectPrompt")}
        aria-label={$t("statusBar.oneDrive.ariaLabel")}
        onclick={onCloudClick}
      >
        {#if $oneDriveSyncing || $oneDriveSyncStatus === "syncing"}
          <!-- Not gated by stat-tier0 like the label, so a narrow screen still shows *something is happening*. -->
          <span class="modal-spinner" aria-label={$t("statusBar.oneDrive.syncingAriaLabel")}>⟳</span>
        {:else}
          <span class="stat-cloud-icon-wrap">
            <Icon name="cloud" size={12} />
            {#if $oneDriveSignInExpired}
              <span class="stat-cloud-dot" aria-hidden="true"></span>
            {/if}
          </span>
        {/if}
        <span class="stat-tier0 status-folder-name">
          {#if $oneDriveAccount}
            {$oneDriveSyncing || $oneDriveSyncStatus === "syncing" ? $t("statusBar.oneDrive.syncingText") : !$oneDriveFolder ? $t("statusBar.oneDrive.chooseFolder") : $oneDriveSignInExpired ? $t("statusBar.oneDrive.signInAgain") : $oneDriveSyncStatus === "error" ? $t("statusBar.oneDrive.syncError") : $oneDriveSyncStatus === "offline" ? $t("statusBar.oneDrive.offline") : ($oneDriveFolder.folderPath.split("/").filter(Boolean).pop() ?? $t("statusBar.oneDrive.defaultFolderName"))}
          {:else}
            OneDrive
          {/if}
        </span>
      </button>
      <span class="status-sep stat-tier0">·</span>
      {#if $syncConflicts.length > 0}
        <button
          id="stat-conflicts"
          class="status-folder-btn stat-conflicts"
          title={$t("statusBar.conflicts.title")}
          onclick={controller.openSyncConflicts}
        >
          ⚠ {$t("statusBar.conflicts.count", { count: $syncConflicts.length })}
        </button>
        <span class="status-sep">·</span>
      {/if}
    {:else if $backendKind === "web"}
      <button
        id="stat-storage"
        class="status-folder-btn"
        title={$t("statusBar.browserStorage.title")}
        aria-label={$t("statusBar.browserStorage.label")}
        onclick={controller.openSettingsOnNotesFolder}
      >
        <Icon name="folder" size={12} />
        <span class="stat-tier0 status-folder-name">{$t("statusBar.browserStorage.label")}</span>
      </button>
      <span class="status-sep stat-tier0">·</span>
    {:else if folderName}
      <button
        id="stat-folder"
        class="status-folder-btn"
        title={$notesDir}
        aria-label={$t("statusBar.changeFolderAriaLabel")}
        onclick={controller.openSettingsOnNotesFolder}
      >
        <Icon name="folder" size={12} />
        <span class="stat-tier0 status-folder-name">{folderName}</span>
      </button>
      <span class="status-sep stat-tier0">·</span>
    {/if}
    <span id="stat-pos" class="stat-tier2">{$t("statusBar.position", { line: $statusPos.line, col: $statusPos.col })}</span>
    {#if selectionLabel}
      <span class="status-sep stat-tier2">·</span>
      <span id="stat-selection" class="stat-tier2">{selectionLabel}</span>
    {/if}
    <span class="status-sep stat-tier1">·</span>
    <span id="stat-words" class="stat-tier1">{$t("statusBar.wordCount", { count: $statusWordCount })}</span>
    <span class="status-sep stat-tier2">·</span>
    <span id="stat-open" class="stat-full">{$t("statusBar.openCount", { count: $statusCounts.open })}</span>
    <span class="stat-compact">☐ {$statusCounts.open}</span>
    <span class="status-sep">·</span>
    <span id="stat-closed" class="stat-full">{$t("statusBar.closedCount", { count: $statusCounts.closed })}</span>
    <span class="stat-compact">☑ {$statusCounts.closed}</span>
    <span class="status-sep">·</span>
    <span id="stat-forwarded" class="stat-full">{$t("statusBar.forwardedCount", { count: $statusCounts.forwarded })}</span>
    <span class="stat-compact"><span class="glyph-progress">☐</span> {$statusCounts.forwarded}</span>
  </div>

  <div class="status-zone status-centre">
    {#if $justUpdatedToVersion}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <span
        id="stat-updated"
        role="status"
        class="stat-dismissible"
        onclick={controller.dismissJustUpdatedNotice}
        title={$t("statusBar.dismissUpdate")}
      >
        <span class="stat-updated-text">{$t("statusBar.updatedTo", { version: $justUpdatedToVersion })}</span>
        <button
          type="button"
          class="status-link"
          onclick={(e) => {
            e.stopPropagation();
            controller.openJustUpdatedReleaseNotes();
          }}
        >
          {$t("statusBar.whatsNew")}
        </button>
      </span>
    {:else if $toastAction && $toastMessage && !$isMobile && $toastMessage.length <= LONG_TOAST_CHARS}
      <button type="button" id="stat-message" class="status-link" onclick={controller.runToastAction}>
        {$toastMessage}
      </button>
    {:else if $toastMessage === $t(UPDATE_AVAILABLE_TOAST_KEY, undefined) && $updateStatus === "available"}
      <!-- §update-check follow-up: this specific toast is a shortcut to
           About, not the generic "read and forget" toast — matched by
           exact text (not just `updateStatus === "available"`, which
           persists long after the toast itself fades) so an unrelated
           toast firing while an update happens to be available doesn't
           also render as a misleading link. -->
      <button type="button" id="stat-message" class="status-link" onclick={controller.openAbout}>
        {$toastMessage}
      </button>
    {:else if $toastMessage && !$isMobile && $toastMessage.length <= LONG_TOAST_CHARS}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <span
        id="stat-message"
        role="status"
        class="stat-dismissible"
        title={$t("common.close")}
        onclick={controller.dismissToast}
      >{$toastMessage}</span>
    {/if}
  </div>

  <div class="status-zone status-right">
    {#if $updateStatus === "available" && $backendKind !== "web"}
      <button type="button" class="status-update-btn" title={$t("statusBar.updateAvailableTitle")} onclick={controller.openAbout}>
        <Icon name="update" size={12} />
      </button>
    {/if}
    {#if $appVersion}
      <button type="button" id="stat-version" title={$t("shortcuts.openAbout.label")} onclick={controller.openAbout}>
        v{$appVersion}
      </button>
    {/if}
    <button
      type="button"
      class="status-help"
      title={$t("statusBar.shortcutsTitle", { combo: formatCombo(shortcutById('openShortcutsHelp').combos[0]) })}
      onclick={controller.openShortcutsHelp}
    >
      ?
    </button>
    <!-- #58: moved from the top bar (last, after Shortcuts & symbols) — always reachable here regardless of
         window width, instead of competing for room with the tab strip
         and folding into "More" once things got tight. -->
    <button
      type="button"
      class="status-about-btn"
      title={$t("statusBar.aboutTitleWithCombo", { combo: formatShortcut('openAbout') })}
      onclick={controller.openAbout}
    >
      <Icon name="about" size={12} />
    </button>
  </div>

  {#if $syncHealthPopoverOpen}
    <SyncHealthPopover />
  {/if}
</div>

<style>
/* Status Bar — three zones (§100): cursor/doc metrics · ambient save
   state · version + help. A 1fr / auto / 1fr grid so the centre zone is
   optically centred regardless of how wide the side zones get. */

#status-bar {
  height: 25px;
  background: var(--tab-bg);
  color: var(--status-fg);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  /* §147: keeps the left/right zones from ever visually touching — the
     centre column collapses to 0 width whenever there's no transient
     message, and without a floor gap here the two side zones' clipped
     text runs straight into each other with no separation at all. */
  column-gap: 16px;
  align-items: center;
  padding: 0 12px;
  font-size: 11px;
  border-top: 1px solid var(--border);
  /* Stays lit above a modal's `.overlay` (z-index 200) so the save state
     and transient messages (§102, e.g. "Sections imported" fired from a
     drawer that stays open) are always visible. */
  position: relative;
  z-index: 250;
}

.status-zone {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}

.status-left {
  font-variant-numeric: tabular-nums;
}

.status-centre {
  justify-content: center;
  gap: 6px;
  color: var(--muted);
}

.status-right {
  justify-content: flex-end;
  color: var(--muted);
}

.status-sep {
  opacity: 0.4;
}

/* #71: a plain-text-look button (`#stat-version`'s own pattern), so the
   folder name/icon doesn't read as a bigger control than it is — opens
   Settings landed on the notes-folder control. The icon (`.cn-icon`,
   `currentColor`) isn't itself gated by `stat-tier0`, so it survives the
   folder-name collapse below and stays a click target even at the
   narrowest width the name is shown at all. */

#stat-folder,
#stat-storage,
#stat-cloud,
#stat-conflicts {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  padding: 0;
  margin: 0;
  cursor: pointer;
}

#stat-folder:hover,
#stat-storage:hover,
#stat-cloud:hover,
#stat-conflicts:hover {
  color: var(--text);
}

/* OneDrive sync: a held conflict needs the user, so it's the one
   status-bar item that draws the eye. */

#stat-conflicts {
  color: var(--state-warn);
  white-space: nowrap;
}

/* OneDrive sign-in expired: the stored session can no longer be renewed
   silently, so highlight the cloud control in amber with a dot badge. */

#stat-cloud.stat-expired {
  color: var(--state-warn);
}

#stat-cloud.stat-expired:hover {
  color: var(--state-warn);
  opacity: 0.85;
}

.stat-cloud-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.stat-cloud-dot {
  position: absolute;
  top: -2px;
  right: -3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--state-warn);
  box-shadow: 0 0 0 1px var(--tab-bg);
}

/* #stat-cloud swaps its icon for a spinner while syncing (base
   .modal-spinner is 14px, sized for a modal's own "Checking…" row) —
   without this override it's 2px wider than the 12px `cloud` Icon it
   replaces, so everything after it in the status bar visibly shifts
   left the moment a sync finishes and the icon comes back. */

#stat-cloud .modal-spinner {
  font-size: 12px;
}

/* §merged-titlebar: the folder name shouldn't be able to crowd out
   everything else on a merely-medium-width window if it's a long one —
   the full name is always still one hover away via the `title` attribute. */

.status-folder-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#stat-open,
#stat-closed,
#stat-forwarded {
  color: var(--muted);
}

/* §147: narrow-window collapse, least-useful info first. Pure CSS
   breakpoints rather than a settleLayout-style measurement system (like
   §144's top-bar collapse) — this bar's content is a fixed, known set
   of text spans, not an unbounded tab list, so there's nothing here
   that actually needs JS-driven measurement. The Open/Closed/Forwarded
   counts and the help button never disappear — they stay pinned the
   same way New Scratchpad/Open Date do in the top bar's own collapse —
   they just switch to compact glyph/dot form at the narrowest tier
   instead of vanishing. */

/* §merged-titlebar: the notes folder name — lowest priority of everything
   in the left zone (it's supplementary context, not working info), so it
   drops before word count does. */

@media (max-width: 860px) {
  .stat-tier0 {
    display: none;
  }
}

@media (max-width: 960px) {
  :global(:root:lang(de)) .stat-tier0,
  :global(:root:lang(nl)) .stat-tier0 {
    display: none;
  }
}

@media (max-width: 680px) {
  .stat-tier1 {
    display: none;
  }
}

@media (max-width: 720px) {
  :global(:root:lang(de)) .stat-tier1,
  :global(:root:lang(nl)) .stat-tier1 {
    display: none;
  }
}

@media (max-width: 520px) {
  .stat-tier2 {
    display: none;
  }
}

@media (max-width: 560px) {
  :global(:root:lang(de)) .stat-tier2,
  :global(:root:lang(nl)) .stat-tier2 {
    display: none;
  }
}

.stat-compact {
  display: none;
}

@media (max-width: 420px) {
  .stat-full {
    display: none;
  }
  .stat-compact {
    display: inline;
  }
  #stat-version {
    display: none;
  }
}

/* In German & Dutch, long count words ("Doorgeschoven", "Weitergeleitet")
   collapse to compact glyph form earlier so the left zone never overflows. */

@media (max-width: 780px) {
  :global(:root:lang(de)) .stat-full,
  :global(:root:lang(nl)) .stat-full {
    display: none;
  }
  :global(:root:lang(de)) .stat-compact,
  :global(:root:lang(nl)) .stat-compact {
    display: inline;
  }
}

/* Centre message active (e.g. "Updated to v...", toast message):
   The centre column takes significant space (~200-280px), so restore the
   symmetrical minmax(0, 1fr) auto minmax(0, 1fr) grid to optically center the message, and immediately
   collapse supplementary tiers to ensure the left zone and counts never collide. */

#status-bar.has-centre-message {
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
}

#status-bar.has-centre-message .stat-tier0 {
  display: none;
}

#status-bar.has-centre-message .stat-full {
  display: none;
}

#status-bar.has-centre-message .stat-compact {
  display: inline;
}

@media (max-width: 920px) {
  #status-bar.has-centre-message .stat-tier1 {
    display: none;
  }
}

@media (max-width: 680px) {
  #status-bar.has-centre-message .stat-tier2 {
    display: none;
  }
}

/* §102/§110: transient messages (the former floating toast) — the centre
   zone is otherwise empty; the ambient save state moved to a quiet dot on
   the tab itself. */

#stat-message {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--status-fg);
  font-weight: 500;
}

#stat-message::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text);
  flex-shrink: 0;
  opacity: 0.55;
}

/* #50: the one-time "Updated to vX.Y.Z" notice — same quiet dot-marker
   look as #stat-message, but its own id since the two are mutually
   exclusive in the same slot (StatusBar.svelte), not a shared style. */

#stat-updated {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--status-fg);
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}

#stat-updated:hover .stat-updated-text {
  color: var(--text);
}

#stat-updated::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text);
  flex-shrink: 0;
  opacity: 0.55;
}

.status-link {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  color: var(--status-fg);
  font-family: inherit;
  font-size: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.status-link:hover {
  color: var(--text);
}

.stat-dismissible {
  cursor: pointer;
}

.stat-dismissible:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.status-help {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--status-fg);
  border-radius: 3px;
  width: 16px;
  height: 16px;
  line-height: 1;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.status-help:hover {
  background: var(--surface-raised);
  border-color: var(--muted);
}

/* §update-check: the down-arrow-into-a-tray mark (§127's icon set) next
   to the version number, only while `updateStatus === "available"` —
   a quiet, always-visible companion to the one-shot status-bar toast
   that fired when the check first found it (`checkForUpdatesOnLaunch`),
   so the fact stays visible even after that toast auto-clears. */

.status-update-btn {
  background: transparent;
  border: none;
  color: var(--status-fg);
  display: inline-flex;
  align-items: center;
  padding: 0;
  cursor: pointer;
}

.status-update-btn:hover {
  color: var(--text);
}

/* #58: About moved here from the top bar. Matches `.status-help`'s
   boxed/outlined treatment (same 16px square, border, radius, hover
   fill) right next to it, rather than `.status-update-btn`'s borderless
   icon above — the two sit side by side reading as one pair of icon
   buttons, not two different button styles. */

.status-about-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--status-fg);
  border-radius: 3px;
  width: 16px;
  height: 16px;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.status-about-btn:hover {
  background: var(--surface-raised);
  border-color: var(--muted);
}

/* §update-check follow-up: the version number opens About too, same as
   the update icon next to it — a plain-text look (no border/background)
   so it doesn't read as a bigger control than it is. */

#stat-version {
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  padding: 0;
  margin: 0;
  cursor: pointer;
}

#stat-version:hover {
  color: var(--text);
}
</style>

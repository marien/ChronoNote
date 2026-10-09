<script lang="ts">
  import {
    backendKind,
    dismissedInfoBars,
    justUpdatedToVersion,
    oneDriveSignInExpired,
    syncConflicts,
    updateAvailableVersion,
    updateStatus,
  } from "../stores";
  import * as controller from "../controller";
  import { pickInfoBar, type InfoBarItem } from "../infoBar";
  import Icon from "../icons/Icon.svelte";
  import { t } from "../i18n";

  const item: InfoBarItem | null = $derived(
    pickInfoBar(
      {
        backendKind: $backendKind,
        syncConflictsCount: $syncConflicts.length,
        oneDriveSignInExpired: $oneDriveSignInExpired,
        updateStatus: $updateStatus,
        updateAvailableVersion: $updateAvailableVersion,
        justUpdatedToVersion: $justUpdatedToVersion,
        callbacks: {
          openSyncConflicts: controller.openSyncConflicts,
          signInAgain: controller.signInAgain,
          openAbout: controller.openAbout,
          openJustUpdatedReleaseNotes: controller.openJustUpdatedReleaseNotes,
          dismissJustUpdatedNotice: controller.dismissJustUpdatedNotice,
        },
        translate: {
          conflictsText: (count: number) => $t("statusBar.conflicts.count", { count }),
          resolveLabel: () => $t("infoBar.resolve"),
          signInExpiredText: () => $t("statusBar.oneDrive.signInExpired"),
          signInAgainLabel: () => $t("statusBar.oneDrive.signInAgain"),
          updateAvailableText: (version: string) => $t("infoBar.updateAvailable", { version }),
          viewUpdateLabel: () => $t("infoBar.viewUpdate"),
          updatedText: (version: string) => $t("infoBar.updated", { version }),
          whatsNewLabel: () => $t("statusBar.whatsNew"),
        },
      },
      $dismissedInfoBars,
    ),
  );

  function handleDismiss() {
    if (!item) return;
    const currentItem = item;
    dismissedInfoBars.update((set: Set<string>) => {
      const next = new Set(set);
      next.add(currentItem.key);
      return next;
    });
    currentItem.onDismiss?.();
  }
</script>

{#if item}
  <div class="info-bar {item.severity}" role="status">
    <span class="info-bar-icon" aria-hidden="true">
      <Icon
        name={item.severity === "info" || item.severity === "success" ? "about" : "warning"}
        size={16}
      />
    </span>
    <span class="info-bar-text">{item.text}</span>
    <button type="button" class="info-bar-action" onclick={item.action}>
      {item.actionLabel}
    </button>
    <button
      type="button"
      class="info-bar-close"
      aria-label={$t("common.close")}
      title={$t("common.close")}
      onclick={handleDismiss}
    >
      <Icon name="close" size={14} />
    </button>
  </div>
{/if}

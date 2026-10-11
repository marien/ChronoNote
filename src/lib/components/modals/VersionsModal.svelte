<script lang="ts">
  import * as controller from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import { diffLines } from "../../lineDiff";
  import { t } from "../../i18n";
  import {
    versionsTargetFilename,
    versionsList,
    versionsCurrentText,
    restoreVersion,
  } from "../../versions";
  import * as api from "../../tauriApi";

  const filename = $derived($versionsTargetFilename ?? "");
  const list = $derived($versionsList);
  const currentText = $derived($versionsCurrentText);

  let selectedName = $state<string | null>(null);

  $effect(() => {
    if (list.length > 0 && selectedName === null) {
      selectedName = list[0].name;
    }
  });

  const selectedVersion = $derived(list.find((v) => v.name === selectedName));

  let selectedText = $state<string>("");
  let loadingVersion = $state(false);

  $effect(() => {
    if (!selectedName || selectedName === "current") {
      selectedText = currentText;
    } else {
      loadingVersion = true;
      api.readVersion(filename, selectedName)
        .then((txt) => {
          selectedText = txt;
        })
        .catch(() => {
          selectedText = "";
        })
        .finally(() => {
          loadingVersion = false;
        });
    }
  });

  const diff = $derived(diffLines(selectedText, currentText));
  const changedCount = $derived(
    diff.left.filter((r) => r.changed).length + diff.right.filter((r) => r.changed).length,
  );

  let restoring = $state(false);

  async function handleRestore() {
    if (!selectedName || selectedName === "current" || restoring) return;
    restoring = true;
    try {
      await restoreVersion(filename, selectedName);
    } finally {
      restoring = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      controller.closeAllModals();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (list.length === 0) return;
      e.preventDefault();
      const allKeys = ["current", ...list.map((v) => v.name)];
      const idx = allKeys.indexOf(selectedName ?? list[0].name);
      if (e.key === "ArrowDown" && idx < allKeys.length - 1) {
        selectedName = allKeys[idx + 1];
      } else if (e.key === "ArrowUp" && idx > 0) {
        selectedName = allKeys[idx - 1];
      }
    }
  }

  function formatTimestamp(ms: number): string {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
  }

  function formatRelativeTime(ms: number): string {
    const now = Date.now();
    const diffSec = Math.floor((now - ms) / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div
    class="modal-card modal-md dialog-card"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label={$t("versions.title", { filename })}
    onkeydown={handleKeyDown}
    tabindex="-1"
  >
    <div class="modal-input-wrap modal-title">
      <Icon name="section-history" size={15} />
      <span>{$t("versions.title", { filename })}</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label={$t("common.closeDialog")}
        onclick={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>

    {#if list.length === 0}
      <div class="settings-hint" style="padding: 24px 16px; text-align: center; font-size: 13px;" data-testid="versions-empty">
        {$t("versions.empty")}
      </div>
    {:else}
      <div class="versions-layout">
        <div class="versions-sidebar" role="listbox" aria-label="Version history" tabindex="0">
          <button
            type="button"
            class="version-item"
            class:active={selectedName === "current"}
            onclick={() => (selectedName = "current")}
            role="option"
            aria-selected={selectedName === "current"}
          >
            <div class="version-item-title">{$t("versions.current")}</div>
            <div class="version-item-meta">
              <span>{formatSize(new TextEncoder().encode(currentText).length)}</span>
            </div>
          </button>
          {#each list as v (v.name)}
            <button
              type="button"
              class="version-item"
              class:active={selectedName === v.name}
              onclick={() => (selectedName = v.name)}
              role="option"
              aria-selected={selectedName === v.name}
              data-testid="version-entry"
            >
              <div class="version-item-title">{formatTimestamp(v.savedMs)}</div>
              <div class="version-item-meta">
                <span>{formatRelativeTime(v.savedMs)}</span>
                <span>{formatSize(v.sizeBytes)}</span>
              </div>
            </button>
          {/each}
        </div>

        <div class="versions-diff-pane">
          <div class="conflict-versions" style="padding: 0; flex: 1;">
            <div class="conflict-version">
              <div class="conflict-version-label">
                <span class="conflict-badge">
                  {selectedName === "current"
                    ? $t("versions.current")
                    : (selectedVersion ? formatTimestamp(selectedVersion.savedMs) : "Version")}
                </span>
              </div>
              <div class="conflict-text" data-testid="version-diff-left">
                {#each diff.left as row}
                  <div class="conflict-line" class:changed={row.changed}>{row.text}</div>
                {/each}
              </div>
            </div>
            <div class="conflict-version">
              <div class="conflict-version-label">
                <span class="conflict-badge">{$t("versions.current")}</span>
              </div>
              <div class="conflict-text" data-testid="version-diff-right">
                {#each diff.right as row}
                  <div class="conflict-line" class:changed={row.changed}>{row.text}</div>
                {/each}
              </div>
            </div>
          </div>
          {#if changedCount > 0}
            <div class="settings-hint" style="padding: 4px 0 0; margin: 0;">
              {$t("droppedNotes.highlightedDiffer")}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <div class="versions-footer">
      <div class="settings-hint" style="margin: 0;">
        {$t("versions.hint")}
      </div>
      <div class="versions-actions">
        <button type="button" class="icon-btn" onclick={controller.closeAllModals}>
          {$t("common.close")}
        </button>
        {#if list.length > 0}
          <button
            type="button"
            class="icon-btn btn-primary"
            disabled={!selectedName || selectedName === "current" || restoring}
            onclick={handleRestore}
          >
            {$t("versions.restore")}
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .versions-layout {
    display: flex;
    gap: 12px;
    padding: 0 12px;
    min-height: 280px;
    max-height: 45vh;
  }
  @media (max-width: 600px) {
    .versions-layout {
      flex-direction: column;
      max-height: 60vh;
      overflow-y: auto;
    }
  }
  .versions-sidebar {
    width: 190px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    padding-right: 4px;
    border-right: 1px solid var(--edge-soft);
  }
  @media (max-width: 600px) {
    .versions-sidebar {
      width: 100%;
      max-height: 120px;
      border-right: none;
      border-bottom: 1px solid var(--edge-soft);
      padding-bottom: 8px;
    }
  }
  .version-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    padding: 6px 8px;
    border-radius: var(--radius-control, 4px);
    background: transparent;
    border: 1px solid transparent;
    color: var(--text);
    cursor: pointer;
    font-size: var(--type-ui, 13px);
  }
  .version-item:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.05));
  }
  .version-item.active {
    background: var(--surface-active, rgba(255, 255, 255, 0.1));
    border-color: var(--edge-strong, var(--accent));
  }
  .version-item-title {
    font-weight: 500;
  }
  .version-item-meta {
    display: flex;
    justify-content: space-between;
    font-size: var(--type-caption, 11px);
    color: var(--text-muted);
  }
  .versions-diff-pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
  }
  .versions-footer {
    padding: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    border-top: 1px solid var(--edge-soft);
  }
  .versions-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
</style>

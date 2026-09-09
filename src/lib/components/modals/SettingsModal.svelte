<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { colorMode, notesDir, readableLineLength, recentNotesDirs, wordWrap } from "../../controller";
  import * as api from "../../tauriApi";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";

  // Filtered at open time (not reactively) — a directory switch closes
  // this modal anyway, so there's no case where the list needs to update
  // while it's open. A recent folder that no longer exists on disk
  // (deleted or moved) is silently omitted rather than shown as a dead
  // link — checked here rather than stored as a flag, so a folder that
  // reappears later (e.g. a drive remounted) isn't permanently lost from
  // the list.
  let visibleRecentDirs: string[] = [];
  onMount(async () => {
    const candidates = $recentNotesDirs.filter((p) => p !== $notesDir);
    const exists = await Promise.all(candidates.map((p) => api.pathExists(p)));
    visibleRecentDirs = candidates.filter((_, i) => exists[i]);
  });
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Settings" style="width: 520px;">
    <div class="modal-input-wrap">
      <span>⚙</span> Settings
    </div>
    <div class="settings-section">
      <div>
        <div class="settings-section-label">Appearance</div>
        <div class="settings-toggle-row">
          <button
            class="icon-btn {$colorMode === 'color' ? 'active' : ''}"
            on:click={() => controller.setColorMode("color")}
          >
            Color
          </button>
          <button
            class="icon-btn {$colorMode === 'grayscale' ? 'active' : ''}"
            on:click={() => controller.setColorMode("grayscale")}
          >
            Grayscale
          </button>
        </div>
      </div>
      <div>
        <div class="settings-section-label">Editor</div>
        <div class="settings-toggle-row">
          <label class="toggle-switch" class:disabled={$readableLineLength}>
            <input
              type="checkbox"
              checked={$wordWrap || $readableLineLength}
              disabled={$readableLineLength}
              on:change={(e) => controller.setWordWrap(e.currentTarget.checked)}
            />
            <span class="toggle-switch-track"></span>
            Word wrap
          </label>
        </div>
        <div class="settings-hint">
          Wrap long lines instead of scrolling horizontally. Off keeps the monospace grid intact for tables and
          aligned columns.{$readableLineLength ? " (kept on by “Limit line width” below.)" : ""}
        </div>
        <div class="settings-toggle-row" style="margin-top: 12px;">
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked={$readableLineLength}
              on:change={(e) => controller.setReadableLineLength(e.currentTarget.checked)}
            />
            <span class="toggle-switch-track"></span>
            Limit line width for readability
          </label>
        </div>
        <div class="settings-hint">
          Wraps lines and caps the text column to a comfortable measure, centred — a single prose-reading mode.
        </div>
      </div>
      <div>
        <div class="settings-section-label">Notes Location</div>
        <div class="settings-dir-row">
          <div class="settings-dir-path">{$notesDir}</div>
          <button class="icon-btn" on:click={controller.pickAndSwitchNotesDirectory}>Browse…</button>
        </div>
        <div class="settings-hint">
          Changing this switches your whole workspace — open tabs close and everything reloads from the new folder.
          Existing files are not moved.
        </div>
        {#if visibleRecentDirs.length > 0}
          <div class="settings-recent-dirs">
            {#each visibleRecentDirs as dir (dir)}
              <button class="settings-recent-dir" on:click={() => controller.switchToRecentDirectory(dir)}>
                {dir}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

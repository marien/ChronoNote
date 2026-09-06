<script lang="ts">
  import * as controller from "../../controller";
  import { colorMode, notesDir } from "../../controller";
</script>

<div class="overlay" role="presentation" on:click|self={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Settings" style="width: 520px;">
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
        <div class="settings-section-label">Notes Location</div>
        <div class="settings-dir-row">
          <div class="settings-dir-path">{$notesDir}</div>
          <button class="icon-btn" on:click={controller.pickAndSwitchNotesDirectory}>Browse…</button>
        </div>
        <div class="settings-hint">
          Changing this switches your whole workspace — open tabs close and everything reloads from the new folder.
          Existing files are not moved.
        </div>
      </div>
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

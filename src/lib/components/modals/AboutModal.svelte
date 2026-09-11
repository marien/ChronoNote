<script lang="ts">
  import * as controller from "../../controller";
  import { appVersion } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="About ChronoNote" style="width: 420px;">
    <div class="modal-input-wrap modal-title">
      <Icon name="about" size={15} /> About ChronoNote
    </div>
    <div class="settings-section">
      <div>
        <div class="settings-section-label">Version</div>
        <div class="settings-hint" style="margin-top: 0; font-size: 12px;">
          {$appVersion || "…"}
        </div>
      </div>
      <div>
        <div class="settings-section-label">Project</div>
        <button
          class="icon-btn"
          style="text-align: left;"
          on:click={controller.openProjectLink}
        >
          {controller.PROJECT_URL}
        </button>
      </div>
      <div>
        <div class="settings-section-label">Learn more</div>
        <div class="settings-hint" style="margin-top: 0;">
          <kbd>Ctrl+/</kbd> opens the Shortcuts &amp; Symbols drawer &mdash; every
          keyboard shortcut plus what each editor glyph means. <kbd>Ctrl+K</kbd> is
          the command palette.
        </div>
      </div>
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

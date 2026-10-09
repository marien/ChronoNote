<script lang="ts">
  import * as controller from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";
  import AboutPanel from "../AboutPanel.svelte";
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card modal-sm about-modal-card" role="dialog" aria-modal="true" use:focusTrap use:sheetSwipe aria-label={$t("shortcuts.openAbout.label")}>
    <div class="modal-input-wrap modal-title">
      <Icon name="about" size={15} />
      <span>{$t("shortcuts.openAbout.label")}</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label={$t("common.closeDialog")}
        onclick={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
    <div class="settings-section">
      <AboutPanel />
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" onclick={controller.closeAllModals}>{$t("common.close")}</button>
    </div>
  </div>
</div>

<script lang="ts">
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusScrollableList } from "../../actions/focusScrollableList";

  const shortcuts: [string, string][] = [
    ["Ctrl+N / Ctrl+T", "New scratchpad"],
    ["Ctrl+Shift+T / Ctrl+Shift+N", "Reopen most recently closed tab"],
    ["Ctrl+O", "Open/create a dated note"],
    ["Ctrl+W", "Close current tab"],
    ["Ctrl+Tab / Ctrl+Shift+Tab", "Next / previous tab"],
    ["Tab / Shift+Tab", "Indent / dedent (in editor)"],
    ["Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z", "Undo / redo (kept per tab)"],
    ["Ctrl+Space", "Cycle open → done → deferred (in editor, current line)"],
    ["F2 / Shift+F2", "Jump to next / previous open action (in editor, wraps)"],
    ["Ctrl+↑ / Ctrl+↓", "Caret to start of line, then previous line / start of next line (in editor)"],
    ["Ctrl+Shift+S", "Convert current line into a section header"],
    ["Ctrl+Shift+A", "Action drawer"],
    ["Ctrl+Shift+H", "Section history"],
    ["Ctrl+Shift+F", "Cross-tab search"],
    ["Ctrl+Shift+I", "Import sections"],
    ["Ctrl+,", "Settings"],
    ["Ctrl+Shift+,", "About ChronoNote"],
    ["Ctrl+/", "This shortcuts drawer"],
    ["Ctrl+Shift+/", "Symbols & sections legend"],
    ["Escape", "Close whatever modal is open"],
  ];
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Keyboard shortcuts">
    <div class="modal-input-wrap">
      <span>⌨</span> Keyboard Shortcuts
    </div>
    <div class="modal-list" use:focusScrollableList style="outline: none;">
      {#each shortcuts as [keys, label]}
        <div class="modal-item" style="cursor: default;">
          <div class="modal-item-main">
            <span>{label}</span>
          </div>
          <div class="item-tag"><kbd>{keys}</kbd></div>
        </div>
      {/each}
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

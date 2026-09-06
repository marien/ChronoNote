<script lang="ts">
  import * as controller from "../../controller";

  const shortcuts: [string, string][] = [
    ["Ctrl+N / Ctrl+T", "New scratchpad"],
    ["Ctrl+Shift+T / Ctrl+Shift+N", "Reopen most recently closed tab"],
    ["Ctrl+O", "Open/create a dated note"],
    ["Ctrl+W", "Close current tab"],
    ["Ctrl+Tab / Ctrl+Shift+Tab", "Next / previous tab"],
    ["Tab / Shift+Tab", "Indent / dedent (in editor)"],
    ["Ctrl+Space", "Cycle open → done → deferred (in editor, current line)"],
    ["Ctrl+Shift+S", "Convert current line into a section header"],
    ["Ctrl+Shift+A", "Action drawer"],
    ["Ctrl+Shift+H", "Section history"],
    ["Ctrl+Shift+F", "Cross-tab search"],
    ["Ctrl+Shift+I", "Import sections"],
    ["Ctrl+,", "Settings"],
    ["Ctrl+/", "This shortcuts drawer"],
    ["Escape", "Close whatever modal is open"],
  ];
</script>

<div class="overlay" role="presentation" on:click|self={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
    <div class="modal-input-wrap">
      <span>⌨</span> Keyboard Shortcuts
    </div>
    <div class="modal-list">
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

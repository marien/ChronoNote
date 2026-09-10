<script lang="ts">
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusScrollableList } from "../../actions/focusScrollableList";

  const shortcuts: [string, string][] = [
    ["Ctrl+K", "Command palette — run any command, jump to a tab, date or action"],
    ["Ctrl+N / Ctrl+T", "New scratchpad"],
    ["Ctrl+Shift+T / Ctrl+Shift+N", "Reopen most recently closed tab"],
    ["Ctrl+O", "Open/create a dated note"],
    ["Ctrl+W / middle-click", "Close current tab / close a tab"],
    ["Ctrl+Tab / Ctrl+Shift+Tab", "Next / previous tab"],
    ["Tab / Shift+Tab", "Indent / dedent (in editor)"],
    ["Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z", "Undo / redo (kept per tab)"],
    ["Ctrl+Space / Ctrl+Enter", "Cycle the action state on the current line (open → done → deferred → won't-do)"],
    ["Click a glyph", "Same cycle, on that line (hover previews the next state)"],
    ["F2 / Shift+F2", "Jump to next / previous open action (in editor, wraps)"],
    ["Ctrl+↑ / Ctrl+↓", "Caret to start of line, then previous line / start of next line (in editor)"],
    ["Ctrl+Shift+S", "Convert current line into a section header"],
    ["Ctrl+Shift+A", "Action drawer"],
    ["Ctrl+Shift+H", "Section history"],
    ["Ctrl+F", "Find in this note (floating bar; Enter / Shift+Enter to step)"],
    ["Ctrl+Shift+F", "Cross-tab search"],
    ["Ctrl+Shift+I", "Import sections"],
    ["Ctrl+,", "Settings"],
    ["Ctrl+Shift+,", "About ChronoNote"],
    ["Ctrl+/ / Ctrl+Shift+/", "This drawer"],
    ["Escape", "Close whatever modal is open"],
  ];

  // Same `.glyph-*` classes the editor uses, so this follows the
  // colour/grayscale toggle for free.
  const glyphs: [string, string, string, string][] = [
    ["# ", "☐", "glyph-open", "Open action — something still to do"],
    ["v ", "☑", "glyph-done", "Done"],
    ["> ", "»", "glyph-progress", "Deferred — pushed forward to a later note"],
    ["x ", "☒", "glyph-cancelled", "Won't do — closed without doing it"],
    ["- / * ", "•", "glyph-bullet", "Bulleted list item (nest with two-space indents)"],
    ["=> ", "➔", "glyph-followup", "Follow-up — a plain note leading from this line"],
  ];
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Keyboard shortcuts">
    <div class="modal-input-wrap">
      <span>⌨</span> Shortcuts &amp; Symbols
    </div>
    <div class="modal-list" use:focusScrollableList style="outline: none;">
      <div class="modal-group-header">Keyboard shortcuts</div>
      {#each shortcuts as [keys, label]}
        <div class="modal-item" style="cursor: default;">
          <div class="modal-item-main">
            <span>{label}</span>
          </div>
          <div class="item-tag"><kbd>{keys}</kbd></div>
        </div>
      {/each}

      <div class="modal-group-header">Symbols → glyphs</div>
      {#each glyphs as [token, glyph, glyphClass, explanation]}
        <div class="modal-item" style="cursor: default;">
          <div class="modal-item-main"><span>{explanation}</span></div>
          <div class="item-tag">
            <kbd>{token}</kbd>&nbsp;→&nbsp;<span class={glyphClass}>{glyph}</span>
          </div>
        </div>
      {/each}
      <div class="modal-item" style="cursor: default;">
        <div class="modal-item-main">
          <span
            >Delegated — follow-up assigned to someone. The <kbd>@name</kbd> is highlighted wherever it sits on a
            <kbd>=&gt;</kbd> line, and stays real, editable text</span
          >
        </div>
        <div class="item-tag">
          <kbd>=&gt; @name </kbd>&nbsp;→&nbsp;<span class="glyph-followup">➔</span>&nbsp;<span class="glyph-assignee"
            >@name</span
          >
        </div>
      </div>
      <div class="modal-item" style="cursor: default;">
        <div class="modal-item-main">
          <span>Topic tag — group actions by subject. Highlighted on action lines only</span>
        </div>
        <div class="item-tag"><kbd>(topic)</kbd>&nbsp;→&nbsp;<span class="glyph-topic">(topic)</span></div>
      </div>
      <div class="modal-item" style="cursor: default;">
        <div class="modal-item-main">
          <span
            >Consequence-action — a follow-up with its own open/done/deferred/won't-do state, cycled with
            Ctrl+Space</span
          >
        </div>
        <div class="item-tag">
          <kbd>=&gt; #/v/&gt;/x </kbd>&nbsp;→&nbsp;<span class="glyph-followup">➔</span>&nbsp;<span
            class="glyph-open">☐</span
          >
        </div>
      </div>
      <div class="modal-item" style="cursor: default;">
        <div class="modal-item-main"><span>Bold emphasis for the rest of the line</span></div>
        <div class="item-tag"><kbd>! </kbd>&nbsp;→&nbsp;<span class="glyph-emphasis-line">like this</span></div>
      </div>

      <div class="modal-group-header">Section headers</div>
      <div class="modal-item" style="cursor: default; display: block;">
        <div class="settings-hint" style="margin-top: 0;">
          A line of text followed immediately by a line of four or more <kbd>=</kbd> characters becomes that
          section's title — e.g. <kbd>Weekly Sync</kbd> then <kbd>====</kbd> on the next line. This is what the
          Action Drawer, Section History and search results tag each item with, and what Section History matches
          recurring sections by (ignoring a leading/trailing date).
        </div>
      </div>
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

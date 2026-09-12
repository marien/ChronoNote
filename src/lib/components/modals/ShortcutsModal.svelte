<script lang="ts">
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusScrollableList, scrollableListKeys } from "../../actions/focusScrollableList";
  import Icon from "../../icons/Icon.svelte";
  import { shortcutById, formatShortcut } from "../../shortcuts";

  // Built from the shared registry (`shortcuts.ts`), in the same order
  // this list has always read in — a plain id pulls that entry's label
  // and platform-correct combo text; a literal `[string, string]` tuple
  // is one of the two rows that aren't modifier-bearing key combos at
  // all ("click a glyph" is a mouse action, "Escape" has no modifier),
  // so there's nothing for the registry to add for either. An id with no
  // combo on this platform (`caretLineNav` on Mac — see that entry's
  // comment) is dropped rather than shown as an empty row.
  const rows: (string | [string, string])[] = [
    "commandPalette",
    "newScratchpad",
    "reopenClosedTab",
    "openDateNote",
    "closeTab",
    "cycleTab",
    "indentDedent",
    "undoRedo",
    "cycleLineState",
    "cycleLineStateReverse",
    ["Click a glyph", "Same cycle, on that line (hover previews the next state)"],
    "jumpAction",
    "caretLineNav",
    "convertToSection",
    "openActions",
    "openHistory",
    "findInNote",
    "crossTabSearch",
    "importSections",
    "openSettings",
    "openAbout",
    "openShortcutsHelp",
    ["Escape", "Close whatever modal is open"],
  ];
  const shortcuts: [string, string][] = rows
    .map((row): [string, string] => (Array.isArray(row) ? row : [formatShortcut(row), shortcutById(row).label]))
    .filter(([keys]) => keys !== "");

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

<!-- #47: side-by-side columns instead of one long scrolling list, so the
     shortcuts and the symbols are both visible at once — each column
     scrolls independently, at a fixed height, rather than the whole
     drawer growing until you scroll past everything to reach the second
     half. -->
<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div
    class="modal-card"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label="Keyboard shortcuts"
    style="width: 880px;"
  >
    <div class="modal-input-wrap modal-title">
      <Icon name="keyboard" size={15} /> Shortcuts &amp; Symbols
    </div>
    <div class="shortcuts-body">
      <div class="shortcuts-col shortcuts-list" use:focusScrollableList style="outline: none;">
        <div class="modal-group-header">Keyboard shortcuts</div>
        {#each shortcuts as [keys, label]}
          <div class="modal-item" style="cursor: default;">
            <div class="modal-item-main">
              <span>{label}</span>
            </div>
            <div class="item-tag"><kbd>{keys}</kbd></div>
          </div>
        {/each}
      </div>

      <div class="shortcuts-col shortcuts-list" use:scrollableListKeys style="outline: none;">
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
            <kbd>=&gt; @name </kbd>&nbsp;→&nbsp;<span class="glyph-followup">➔</span>&nbsp;<span
              class="glyph-assignee">@name</span
            >
          </div>
        </div>
        <div class="modal-item" style="cursor: default;">
          <div class="modal-item-main">
            <span>Topic tag — group actions by subject. Highlighted only right after the action symbol</span>
          </div>
          <div class="item-tag"><kbd># (topic) </kbd>&nbsp;→&nbsp;<span class="glyph-topic">(topic)</span></div>
        </div>
        <div class="modal-item" style="cursor: default;">
          <div class="modal-item-main">
            <span
              >Consequence-action — a follow-up with its own open/done/deferred/won't-do state, cycled with
              {formatShortcut("cycleLineState")}</span
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
            section's title — e.g. <kbd>Weekly Sync</kbd> then <kbd>====</kbd> on the next line. This is what
            Actions, Section History and search results tag each item with, and what Section History matches
            recurring sections by (ignoring a leading/trailing date).
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

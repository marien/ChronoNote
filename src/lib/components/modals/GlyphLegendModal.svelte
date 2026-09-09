<script lang="ts">
  import * as controller from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusScrollableList } from "../../actions/focusScrollableList";
  import { focusTrap } from "../../actions/focusTrap";

  // Each row's glyph is rendered with the *same* `.glyph-*` classes the
  // editor itself uses (app.css), which read the `--glyph-*-color`/
  // `-weight`/`-opacity` custom properties — themed by the color/
  // grayscale toggle via the `[data-color-mode="color"]` selector on
  // `<body>` (see controller.ts's `applyColorModeToDom`). Reusing the
  // classes means this drawer follows that toggle automatically, exactly
  // like the Action Drawer/History glyph columns already do (their own
  // `glyphFor()` references the same variables) — no colorMode read or
  // component logic needed here at all.
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
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Symbols and section formatting">
    <div class="modal-input-wrap">
      <span>☑</span> Symbols &amp; Sections
    </div>
    <div class="modal-list" use:focusScrollableList style="outline: none;">
      <div class="modal-group-header">Symbols → Glyphs</div>
      {#each glyphs as [token, glyph, glyphClass, explanation]}
        <div class="modal-item" style="cursor: default;">
          <div class="modal-item-main">
            <span>{explanation}</span>
          </div>
          <div class="item-tag">
            <kbd>{token}</kbd>&nbsp;→&nbsp;<span class={glyphClass}>{glyph}</span>
          </div>
        </div>
      {/each}
      <div class="modal-item" style="cursor: default;">
        <div class="modal-item-main">
          <span>Delegated — follow-up assigned to someone (the name stays as real, editable text)</span>
        </div>
        <div class="item-tag">
          <kbd>=&gt; @name </kbd>&nbsp;→&nbsp;<span class="glyph-followup">➔</span>&nbsp;<span class="glyph-assignee"
            >@name</span
          >
        </div>
      </div>
      <div class="modal-item" style="cursor: default;">
        <div class="modal-item-main">
          <span
            >Consequence-action — a follow-up with its own open/done/deferred/won't-do state, cycled with Ctrl+Space
            same as a standalone action line</span
          >
        </div>
        <div class="item-tag">
          <kbd>=&gt; #/v/&gt;/x </kbd>&nbsp;→&nbsp;<span class="glyph-followup">➔</span>&nbsp;<span class="glyph-open"
            >☐</span
          >
        </div>
      </div>
      <div class="modal-item" style="cursor: default;">
        <div class="modal-item-main">
          <span>Bold emphasis for the rest of the line</span>
        </div>
        <div class="item-tag"><kbd>! </kbd>&nbsp;→&nbsp;<span class="glyph-emphasis-line">like this</span></div>
      </div>
      <div class="modal-group-header">Section Headers</div>
      <div class="modal-item" style="cursor: default; display: block;">
        <div class="settings-hint" style="margin-top: 0;">
          A line of text followed immediately by a line of four or more
          <kbd>=</kbd> characters becomes that section's title — e.g.
          <kbd>Weekly Sync</kbd> then <kbd>====</kbd> on the next line. This
          is what the Action Drawer, Section History, and search results tag
          each item with, and what Section History matches recurring
          sections by (ignoring a trailing or leading date, so "Weekly Sync
          - 2026-08-08" and "Weekly Sync - 2026-08-15" are treated as the
          same section).
        </div>
      </div>
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

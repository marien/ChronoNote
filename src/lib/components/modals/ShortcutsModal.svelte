<script lang="ts">
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusScrollableList, scrollableListKeys } from "../../actions/focusScrollableList";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";
  import { DRAWER_ROWS, SHORTCUT_LABEL_KEYS, formatShortcut } from "../../shortcuts";

  // Built from the shared registry (`shortcuts.ts`), in the same order
  // this list has always read in — a plain id (or a tuple's pseudo-id)
  // looks up its translated label via `SHORTCUT_LABEL_KEYS`, alongside
  // the platform-correct combo text (never translated — see shortcuts.ts).
  // An id with no combo on this platform (`caretLineNav` on Mac — see
  // that entry's comment) is dropped rather than shown as an empty row.
  // Reactive on `$t` so a language change re-renders every row.
  let shortcuts: [string, string][];
  $: shortcuts = DRAWER_ROWS.map((row): [string, string] =>
    Array.isArray(row)
      ? [row[0], $t(SHORTCUT_LABEL_KEYS[row[1] as keyof typeof SHORTCUT_LABEL_KEYS])]
      : [formatShortcut(row), $t(SHORTCUT_LABEL_KEYS[row as keyof typeof SHORTCUT_LABEL_KEYS])],
  ).filter(([keys]) => keys !== "");

  // Same `.glyph-*` classes the editor uses, so this follows the
  // colour/grayscale toggle for free.
  let glyphs: [string, string, string, string][];
  $: glyphs = [
    ["# ", "☐", "glyph-open", $t("shortcuts.modal.glyph.open")],
    ["v ", "☑", "glyph-done", $t("shortcuts.modal.glyph.done")],
    ["> ", "»", "glyph-progress", $t("shortcuts.modal.glyph.deferred")],
    ["x ", "☒", "glyph-cancelled", $t("shortcuts.modal.glyph.wontDo")],
    ["- / * ", "•", "glyph-bullet", $t("shortcuts.modal.glyph.bullet")],
    ["=> ", "➔", "glyph-followup", $t("shortcuts.modal.glyph.followUp")],
  ];

  // i18n roadmap: the consequence-action explanation embeds a live
  // formatted shortcut hint mid-sentence — a genuine parameter, not
  // static text.
  $: consequenceActionHint = formatShortcut("setActionOpen").replace(/1$/, "1-4");

  let shortcutsTab: "shortcuts" | "glyphs" = "shortcuts";
</script>

<!-- #47: side-by-side columns instead of one long scrolling list, so the
     shortcuts and the symbols are both visible at once — each column
     scrolls independently, at a fixed height, rather than the whole
     drawer growing until you scroll past everything to reach the second
     half. -->
<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div
    class="modal-card modal-xl"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label="Keyboard shortcuts"
  >
    <div class="modal-input-wrap modal-title">
      <Icon name="keyboard" size={15} />
      <span>{$t("shortcuts.modal.title")}</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label={$t("common.closeDialog")}
        on:click={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
    <!-- §194: Mobile tab switcher for viewports <= 680px -->
    <div class="shortcuts-mobile-tabs">
      <button
        type="button"
        class="shortcuts-tab-btn"
        class:active={shortcutsTab === "shortcuts"}
        on:click={() => (shortcutsTab = "shortcuts")}
      >
        {$t("shortcuts.modal.tab.shortcuts")}
      </button>
      <button
        type="button"
        class="shortcuts-tab-btn"
        class:active={shortcutsTab === "glyphs"}
        on:click={() => (shortcutsTab = "glyphs")}
      >
        {$t("shortcuts.modal.tab.glyphs")}
      </button>
    </div>
    <div class="shortcuts-body" class:show-shortcuts={shortcutsTab === "shortcuts"} class:show-glyphs={shortcutsTab === "glyphs"}>
      <div class="shortcuts-col shortcuts-list" use:focusScrollableList style="outline: none;">
        <div class="modal-group-header">{$t("shortcuts.modal.group.keyboardShortcuts")}</div>
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
        <div class="modal-group-header">{$t("shortcuts.modal.group.symbolsToGlyphs")}</div>
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
            <span>{$t("shortcuts.modal.numberedList")} <kbd>1.1.</kbd>, <kbd>1.2.</kbd></span>
          </div>
          <div class="item-tag"><kbd>1. </kbd>&nbsp;/&nbsp;<kbd>2) </kbd>&nbsp;/&nbsp;<kbd>1.1. </kbd></div>
        </div>
        <div class="modal-item" style="cursor: default;">
          <div class="modal-item-main">
            <span
              >{$t("shortcuts.modal.delegated.part1")}<kbd>@name</kbd>{$t("shortcuts.modal.delegated.part2")}
              <kbd>=&gt;</kbd>{$t("shortcuts.modal.delegated.part3")}<kbd>(@ana, @ben)</kbd></span
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
            <span>{$t("shortcuts.modal.topicTag")}</span>
          </div>
          <div class="item-tag"><kbd># (topic) </kbd>&nbsp;→&nbsp;<span class="glyph-topic">(topic)</span></div>
        </div>
        <div class="modal-item" style="cursor: default;">
          <div class="modal-item-main">
            <span>{$t("shortcuts.modal.consequenceAction", { shortcutHint: consequenceActionHint })}</span>
          </div>
          <div class="item-tag">
            <kbd>=&gt; #/v/&gt;/x </kbd>&nbsp;→&nbsp;<span class="glyph-followup">➔</span>&nbsp;<span
              class="glyph-open">☐</span
            >
          </div>
        </div>
        <div class="modal-item" style="cursor: default;">
          <div class="modal-item-main">
            <span>{$t("shortcuts.modal.dimmedLines")}</span>
          </div>
          <div class="item-tag"><span class="glyph-done">☑</span>&nbsp;<span class="glyph-progress">»</span>&nbsp;<span class="glyph-cancelled">☒</span></div>
        </div>
        <div class="modal-item" style="cursor: default;">
          <div class="modal-item-main"><span>{$t("shortcuts.modal.boldEmphasis")}</span></div>
          <div class="item-tag"><kbd>! </kbd>&nbsp;→&nbsp;<span class="glyph-emphasis-line">like this</span></div>
        </div>

        <div class="modal-group-header">{$t("shortcuts.modal.group.sectionHeaders")}</div>
        <div class="modal-item" style="cursor: default; display: block;">
          <div class="settings-hint" style="margin-top: 0;">
            {$t("shortcuts.modal.sectionHeaderHint.part1")}<kbd>=</kbd>{$t("shortcuts.modal.sectionHeaderHint.part2")}<kbd
              >{$t("shortcuts.modal.sectionHeaderHint.exampleTitle")}</kbd
            >{$t("shortcuts.modal.sectionHeaderHint.part3")}<kbd>====</kbd>{$t(
              "shortcuts.modal.sectionHeaderHint.part4",
            )}
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>{$t("common.close")}</button>
    </div>
  </div>
</div>

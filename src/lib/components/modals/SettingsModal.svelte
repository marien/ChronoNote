<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import {
    backendKind,
    oneDriveAccount,
    oneDriveFolder,
    oneDriveFolderPickerOpen,
    settingsInitialTab,
  } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import Icon from "../../icons/Icon.svelte";
  import AboutPanel from "../AboutPanel.svelte";
  import { t } from "../../i18n";
  import OneDriveFolderPickerModal from "./OneDriveFolderPickerModal.svelte";
  import AppearancePanel from "./settings/AppearancePanel.svelte";
  import NotesSyncPanel from "./settings/NotesSyncPanel.svelte";

  interface Props {
    page?: boolean;
  }
  let { page = false }: Props = $props();

  onDestroy(() => {
    if (page) {
      void tick().then(() => {
        controller.editorApi?.focus();
        document.querySelector<HTMLElement>(".cm-content")?.focus();
      });
    }
  });

  // Three tabs group settings: Appearance/Editor, Notes & Sync, and About.
  const settingsTabs = $derived([
    { value: "appearance", label: $t("settings.tabs.appearance") },
    { value: "calendar", label: $t("settings.tabs.notesAndSync") },
    { value: "about", label: $t("settings.tab.about") },
  ]);
  // Left/Right move between the tabs (and select them, as the tab pattern does).
  function onTabsKeydown(e: KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const list = e.currentTarget as HTMLElement;
    const i = settingsTabs.findIndex((tab) => tab.value === activeSettingsTab);
    const step = e.key === "ArrowRight" ? 1 : -1;
    activeSettingsTab = settingsTabs[(i + step + settingsTabs.length) % settingsTabs.length].value;
    focusNotesFolderOnOpen = false;
    e.preventDefault();
    void tick().then(() => list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  }
  // #71: the status bar's folder icon/name opens Settings landed
  // directly on this tab (`openSettingsOnNotesFolder`, `menu.ts`) —
  // consumed once here so a later plain Settings open still starts on
  // the default first tab, same as any other freshly-opened modal.
  const initialSettingsTab = get(settingsInitialTab);
  const openedOnNotesFolder = initialSettingsTab !== null;
  let focusNotesFolderOnOpen = $state(initialSettingsTab === "calendar");
  let activeSettingsTab: string = $state(initialSettingsTab ?? "appearance");
  settingsInitialTab.set(null);

  onMount(() => {
    if (page && !openedOnNotesFolder) {
      void tick().then(() => {
        document.querySelector<HTMLElement>('.settings-page [role="tab"][aria-selected="true"]')?.focus();
      });
    }
  });

  let showFolderPicker = $state(false);

  // Signing in doesn't choose a folder, and "Sync now" can't do anything
  // without one — so the moment the account is connected with no folder yet,
  // open the folder picker instead of leaving the user to find it. Once per
  // Settings visit, so closing the picker without choosing isn't nagged.
  let autoOpenedFolderPicker = false;
  $effect(() => {
    if ($oneDriveAccount && !$oneDriveFolder && !$oneDriveFolderPickerOpen && !autoOpenedFolderPicker && $backendKind === "web") {
      autoOpenedFolderPicker = true;
      showFolderPicker = true;
    }
  });
</script>
{#snippet tabsStrip()}
  <div class="settings-tabs" role="tablist" tabindex="-1" onkeydown={onTabsKeydown}>
    {#each settingsTabs as tab (tab.value)}
      <button
        type="button"
        role="tab"
        class="settings-tab"
        aria-selected={tab.value === activeSettingsTab}
        tabindex={tab.value === activeSettingsTab ? 0 : -1}
        onclick={() => {
          activeSettingsTab = tab.value;
          focusNotesFolderOnOpen = false;
        }}
      >
        {tab.label}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet tabContent()}
      {#if activeSettingsTab === "appearance"}
        <AppearancePanel />
      {:else if activeSettingsTab === "calendar"}
        <NotesSyncPanel
          openedOnNotesFolder={focusNotesFolderOnOpen}
          onOpenFolderPicker={() => (showFolderPicker = true)}
        />
      {:else if activeSettingsTab === "about"}
        <AboutPanel />
      {/if}
{/snippet}

{#if page}
  <main class="settings-page" aria-label={$t("settings.modal.title")}>
    <header class="settings-page-header">
      <button
        type="button"
        class="icon-btn settings-back-btn"
        aria-label={$t("settings.back")}
        onclick={controller.closeAllModals}
      >
        <Icon name="chevron-left" size={18} />
      </button>
      <h1 class="modal-title settings-page-title">{$t("settings.modal.title")}</h1>
    </header>
    {@render tabsStrip()}
    <div class="settings-section" role="tabpanel">
      {@render tabContent()}
    </div>
  </main>
{:else}
  <div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
    <div
      class="modal-card settings-modal-card modal-md"
      role="dialog"
      aria-modal="true"
      use:focusTrap
      use:sheetSwipe
      aria-label={$t("settings.modal.title")}
    >
      <div class="modal-input-wrap modal-title">
        <Icon name="settings" size={15} />
        <span>{$t("settings.modal.title")}</span>
        <button
          type="button"
          class="icon-btn modal-close-btn"
          aria-label={$t("common.closeDialog")}
          onclick={controller.closeAllModals}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      {@render tabsStrip()}
      <div class="settings-section" role="tabpanel">
        {@render tabContent()}
      </div>
      <div class="modal-footer s-footer">
        <button class="settings-btn" onclick={controller.closeAllModals}>{$t("common.close")}</button>
      </div>
    </div>
  </div>
{/if}

{#if showFolderPicker}
  <OneDriveFolderPickerModal onClose={() => (showFolderPicker = false)} />
{/if}

<style>
/* Tabbed Settings: the tab switcher sits between the title and the
   scrollable section below, never itself part of what scrolls. */

/* Real tabs (an underline on the selected one), deliberately unlike the
   bordered `.segmented` controls inside them, so navigation and settings
   don't look like the same thing. */

.settings-tabs {
  display: flex;
  gap: 4px;
  /* The tabs sit 1px lower than the content (margin-bottom: -1px) so the active tab's underline covers the rule
     under the row. With the rule as a border that 1px poked out of the padding box and, because this box scrolls
     sideways (overflow-x: auto makes overflow-y auto too), showed a tiny vertical scrollbar. The rule is an inset
     shadow in 1px of bottom padding instead: the same look, and the tabs stay inside the box. */
  padding: 6px 16px 1px;
  box-shadow: inset 0 -1px 0 var(--edge-soft);
  flex-shrink: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.settings-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 7px 12px;
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
}

.settings-tab:hover {
  color: var(--text);
}

.settings-tab[aria-selected="true"] {
  color: var(--text);
  font-weight: 600;
  border-bottom-color: var(--tab-active-border);
}

@media (max-width: 600px) {
  .settings-tabs {
    gap: 0;
  }
  /* Size to the label (grow to share spare room) rather than forcing equal
     widths: a long translation ("Notities & sync") must never overflow its tab. */
  .settings-tab {
    flex: 1 1 auto;
    padding: 7px 6px;
    font-size: 11.5px;
    text-align: center;
  }
}

/* Settings layout. Every setting is one `.s-row` (SettingRow/SettingToggle):
   label + optional one-line description on the left, control on the right;
   rows in a group are divided by a hairline. A `stack` row puts the control
   under the text, and on a phone every row stacks. Spacing lives here, not
   in inline styles. */

.settings-section :global(.s-group) {
  display: flex;
  flex-direction: column;
}

/* Buttons in Settings read as buttons: bordered, the primary one filled. */

.settings-btn,
.settings-section :global(.settings-btn) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--edge-strong);
  border-radius: var(--radius-control);
  color: var(--text);
  padding: 5px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.settings-btn:hover,
.settings-section :global(.settings-btn:hover) {
  background: var(--surface-raised);
}

.settings-section :global(.settings-btn.primary) {
  background: var(--text);
  color: var(--bg);
  border-color: transparent;
}

.settings-section :global(.settings-btn.primary:hover) {
  background: var(--text);
  opacity: 0.85;
}

.settings-section :global(.settings-btn.quiet) {
  border-color: var(--edge-soft);
}

.settings-section :global(.settings-btn.quiet:hover) {
  background: var(--surface-raised);
  border-color: var(--edge-strong);
}

.settings-section :global(.settings-btn:disabled) {
  opacity: 0.4;
  cursor: default;
}

.settings-section :global(.settings-btn:disabled:hover) {
  background: transparent;
}

.settings-section :global(.settings-btn.primary:disabled:hover) {
  background: var(--text);
  opacity: 0.4;
}

.settings-section :global(.s-note) {
  font-size: var(--type-caption);
  color: var(--muted);
  margin-top: 8px;
}

.s-footer {
  justify-content: flex-end;
}
</style>

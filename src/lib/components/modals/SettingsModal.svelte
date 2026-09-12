<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import {
    autoCheckUpdates,
    backendKind,
    colorMode,
    notesDir,
    readableLineLength,
    recentNotesDirs,
    themeMode,
    wordWrap,
  } from "../../controller";
  import * as api from "../../tauriApi";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";
  import type { ColorMode, ThemeMode } from "../../types";
  import { ExportBundleError, type ExportBundle } from "../../exportImport";

  // Filtered at open time (not reactively) — a directory switch closes
  // this modal anyway, so there's no case where the list needs to update
  // while it's open. A recent folder that no longer exists on disk
  // (deleted or moved) is silently omitted rather than shown as a dead
  // link — checked here rather than stored as a flag, so a folder that
  // reappears later (e.g. a drive remounted) isn't permanently lost from
  // the list.
  let visibleRecentDirs: string[] = [];
  onMount(async () => {
    if ($backendKind === "web") return; // no directory concept — see the Data section below
    const candidates = $recentNotesDirs.filter((p) => p !== $notesDir);
    const exists = await Promise.all(candidates.map((p) => api.pathExists(p)));
    visibleRecentDirs = candidates.filter((_, i) => exists[i]);
  });

  // --- Data: export / import (web-app design doc, Phase 1) --------------
  //
  // Shown on both the desktop app and the web app (not the demo — nothing
  // meaningful to export there, and the design doc keeps the demo's fake
  // data clearly separate from anything real). A plain hidden file input
  // does the picking; Tauri's webview supports the File API exactly like
  // a real browser, so no OS dialog / native fs read is needed even on
  // desktop — see `docs/design/webapp-roadmap.md`.
  let fileInput: HTMLInputElement;
  let importPreview: { bundle: ExportBundle; noteCount: number } | null = null;
  let importError: string | null = null;
  let importMode: "merge" | "replace" = "merge";
  let importing = false;
  let exporting = false;

  async function handleExport() {
    exporting = true;
    try {
      await controller.exportAllNotesToFile();
    } finally {
      exporting = false;
    }
  }

  function pickImportFile() {
    importError = null;
    importPreview = null;
    fileInput.click();
  }

  async function onFileChosen(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      importPreview = await controller.readImportFile(file);
      importMode = "merge";
    } catch (err) {
      importError = err instanceof ExportBundleError ? err.message : "Couldn't read that file.";
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    importing = true;
    try {
      await controller.applyImport(importPreview.bundle, importMode);
      importPreview = null;
    } finally {
      importing = false;
    }
  }

  function cancelImport() {
    importPreview = null;
    importError = null;
  }

  // §127 (finding K): `word_wrap` and `readable_line_length` used to be
  // two separate toggles, the second force-enabling (and disabling) the
  // first — a checked-and-greyed-out switch reads as confusing state. One
  // 3-way choice instead; no Rust/config change, it's still just the same
  // two booleans underneath (full = both off, wrap = word_wrap only,
  // reading = both on, since "reading column" only ever applies with wrap
  // on too).
  $: editorWidthMode = $readableLineLength ? "reading" : $wordWrap ? "wrap" : "full";
  async function setEditorWidth(mode: string) {
    if (mode === "reading") {
      await controller.setReadableLineLength(true);
    } else {
      if ($readableLineLength) await controller.setReadableLineLength(false);
      await controller.setWordWrap(mode === "wrap");
    }
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Settings" style="width: 520px;">
    <div class="modal-input-wrap modal-title">
      <Icon name="settings" size={15} /> Settings
    </div>
    <div class="settings-section">
      <div>
        <div class="settings-section-label">Appearance</div>
        <div class="settings-toggle-row">
          <span class="settings-inline-label">Theme</span>
          <Segmented
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
            value={$themeMode}
            onChange={(v) => controller.setThemeMode(v as ThemeMode)}
          />
        </div>
        <div class="settings-hint">System follows your OS's own light/dark setting.</div>
        <div class="settings-toggle-row" style="margin-top: 12px;">
          <span class="settings-inline-label">Glyphs</span>
          <Segmented
            options={[
              { value: "color", label: "Color" },
              { value: "grayscale", label: "Grayscale" },
              { value: "legacy", label: "Legacy" },
            ]}
            value={$colorMode}
            onChange={(v) => controller.setColorMode(v as ColorMode)}
          />
        </div>
        <div class="settings-hint">
          Legacy restores the pre-0.6 glyph colours — red open, amber deferred, green done.
        </div>
      </div>
      <div>
        <div class="settings-section-label">Editor</div>
        <div class="settings-toggle-row">
          <Segmented
            options={[
              { value: "full", label: "Full" },
              { value: "wrap", label: "Wrap" },
              { value: "reading", label: "Reading column" },
            ]}
            value={editorWidthMode}
            onChange={setEditorWidth}
          />
        </div>
        <div class="settings-hint">
          Full keeps every line unwrapped — the monospace grid stays intact for tables and aligned columns. Wrap
          breaks long lines to fit the window. Reading column also caps the text to a comfortable centred measure,
          for a single prose-reading mode.
        </div>
      </div>
      {#if $backendKind !== "web"}
        <div>
          <div class="settings-section-label">Updates</div>
          <div class="settings-toggle-row">
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={$autoCheckUpdates}
                on:change={(e) => controller.setAutoCheckUpdates(e.currentTarget.checked)}
              />
              <span class="toggle-switch-track"></span>
              Check for updates when ChronoNote starts
            </label>
          </div>
          <div class="settings-hint">
            A quiet check against github.com — never downloads or installs anything without your say.
            <button class="icon-btn" style="margin-left: 4px; padding: 1px 8px;" on:click={() => controller.checkForUpdates()}>
              Check now
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
          {#if visibleRecentDirs.length > 0}
            <div class="settings-recent-dirs">
              {#each visibleRecentDirs as dir (dir)}
                <button class="settings-recent-dir" on:click={() => controller.switchToRecentDirectory(dir)}>
                  {dir}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      {#if $backendKind !== "demo"}
        <div>
          <div class="settings-section-label">Data</div>
          <input
            bind:this={fileInput}
            type="file"
            accept="application/json,.json"
            style="display: none;"
            on:change={onFileChosen}
          />
          <div class="settings-toggle-row" style="gap: 8px;">
            <button class="icon-btn" disabled={exporting} on:click={handleExport}>
              {exporting ? "Exporting…" : "Export all notes…"}
            </button>
            <button class="icon-btn" disabled={importing} on:click={pickImportFile}>
              Import notes from a file…
            </button>
          </div>
          {#if $backendKind === "web"}
            <div class="settings-hint">
              Your notes live in this browser only — clearing site data, a private window, or Safari's storage
              limits can lose them. Export a backup now and then, or install the desktop app for notes that live on
              your disk.
            </div>
          {:else}
            <div class="settings-hint">
              Import reads a ChronoNote export file (from the web app, or another install) and writes its notes in
              here.
            </div>
          {/if}
          {#if importError}
            <div class="settings-hint" style="color: var(--state-error);">{importError}</div>
          {/if}
          {#if importPreview}
            <div class="settings-toggle-row" style="margin-top: 8px; flex-direction: column; align-items: flex-start; gap: 8px;">
              <span class="settings-inline-label">
                {importPreview.noteCount} note{importPreview.noteCount === 1 ? "" : "s"} in this file.
              </span>
              <Segmented
                options={[
                  { value: "merge", label: "Merge (skip duplicates)" },
                  { value: "replace", label: "Replace everything" },
                ]}
                value={importMode}
                onChange={(v) => (importMode = v as "merge" | "replace")}
              />
              {#if importMode === "replace"}
                <div class="settings-hint" style="color: var(--state-error); margin-top: 0;">
                  This deletes every note currently here first — not reversible.
                </div>
              {/if}
              <div style="display: flex; gap: 8px;">
                <button class="icon-btn btn-primary" disabled={importing} on:click={confirmImport}>
                  {importing ? "Importing…" : "Import"}
                </button>
                <button class="icon-btn" disabled={importing} on:click={cancelImport}>Cancel</button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

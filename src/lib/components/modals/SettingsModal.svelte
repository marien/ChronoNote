<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { colorMode, notesDir, readableLineLength, recentNotesDirs, wordWrap } from "../../controller";
  import * as api from "../../tauriApi";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";
  import type { ColorMode } from "../../types";

  // Filtered at open time (not reactively) — a directory switch closes
  // this modal anyway, so there's no case where the list needs to update
  // while it's open. A recent folder that no longer exists on disk
  // (deleted or moved) is silently omitted rather than shown as a dead
  // link — checked here rather than stored as a flag, so a folder that
  // reappears later (e.g. a drive remounted) isn't permanently lost from
  // the list.
  let visibleRecentDirs: string[] = [];
  onMount(async () => {
    const candidates = $recentNotesDirs.filter((p) => p !== $notesDir);
    const exists = await Promise.all(candidates.map((p) => api.pathExists(p)));
    visibleRecentDirs = candidates.filter((_, i) => exists[i]);
  });

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
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

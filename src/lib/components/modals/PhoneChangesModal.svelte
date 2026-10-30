<script lang="ts">
  import * as controller from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";
  import {
    phoneConflicts,
    phoneConflictNote,
    resolvePhoneConflict,
    phoneInboxRun,
    type ConflictChoice,
  } from "../../phoneInbox";
  import {
    sectionStateLines,
    stateKindOf,
    type LineKind,
    type SetStateRequest,
  } from "../../phoneInboxApply";
  import { showToast } from "../../stores";

  let selectedId = $state("");
  const current = $derived($phoneConflicts.find((c) => c.request.id === selectedId) ?? $phoneConflicts[0]);

  let busy = $state(false);
  let noteLines = $state<{ line: number; text: string; kind: LineKind }[] | null>(null);
  let selectedLineIndex = $state<number | null>(null);

  async function loadLines() {
    selectedLineIndex = null;
    if (!current) {
      noteLines = null;
      return;
    }
    const note = await phoneConflictNote(current.request.date);
    noteLines = sectionStateLines(note, current.request.section);
  }

  $effect(() => {
    const id = current?.request.id;
    void id;
    void loadLines();
  });

  const request = $derived(current ? (current.request as SetStateRequest) : null);
  const reqKind = $derived(request ? stateKindOf(request.line) : null);
  const matchingLines = $derived(
    noteLines && reqKind ? noteLines.filter((l) => l.kind === reqKind) : [],
  );

  const reasonText = $derived.by(() => {
    if (!current) return "";
    if (noteLines === null) return $t("phoneChanges.reason.sectionGone");
    if (current.reason === "lineAmbiguous") return $t("phoneChanges.reason.lineAmbiguous");
    return $t("phoneChanges.reason.lineChanged");
  });

  async function choose(choice: ConflictChoice) {
    if (!current || busy) return;
    busy = true;
    try {
      const res = await resolvePhoneConflict(current.request.id, choice);
      if (res === "noteChanged") {
        showToast($t("phoneChanges.noteChanged"));
        await loadLines();
      } else if (res === "failed") {
        showToast($t("phoneChanges.writeFailed"));
      } else if (res === "done" || res === "gone") {
        selectedId = "";
      }
    } finally {
      busy = false;
    }
  }

  function applyChosenLine() {
    if (selectedLineIndex === null) return;
    const chosen = matchingLines.find((l) => l.line === selectedLineIndex);
    if (!chosen) return;
    void choose({ line: chosen.line, text: chosen.text });
  }

  const hasConflicts = $derived($phoneConflicts.length > 0);
  const appliedEntries = $derived($phoneInboxRun?.applied ?? []);
  const hasApplied = $derived(appliedEntries.length > 0);
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div
    class="modal-card modal-md phone-changes-modal"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label={$t("phoneChanges.title")}
  >
    <div class="modal-input-wrap modal-title">
      <Icon name="cloud" size={15} />
      <span>{$t("phoneChanges.title")}</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label={$t("common.closeDialog")}
        onclick={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>

    {#if hasConflicts && current && request}
      <div class="settings-hint section-header">
        <strong style="color: var(--text);">{$t("phoneChanges.needsLook")}</strong>
      </div>

      {#if $phoneConflicts.length > 1}
        <div class="settings-toggle-row chips-row">
          {#each $phoneConflicts as c (c.request.id)}
            <button
              type="button"
              class="icon-btn"
              class:active={c.request.id === current.request.id}
              onclick={() => (selectedId = c.request.id)}
            >
              {c.request.section ? `${c.request.date} · ${c.request.section}` : c.request.date}
            </button>
          {/each}
        </div>
      {/if}

      <div class="conflict-body">
        <div class="ask-header">
          <strong>{$t(`phoneChanges.ask.${request.state}`)}</strong>
        </div>

        <div class="field-block">
          <div class="field-label">{$t("phoneChanges.phoneSaw")}</div>
          <div class="note-font code-box">{request.line}</div>
        </div>

        <div class="reason-text">{reasonText}</div>

        <div class="field-block">
          <div class="field-label">{$t("phoneChanges.nowInNote")}</div>
          {#if matchingLines.length > 0}
            <div class="radio-list" role="radiogroup">
              {#each matchingLines as item (item.line)}
                <label class="radio-row">
                  <input
                    type="radio"
                    name="conflict-line-choice"
                    value={item.line}
                    checked={selectedLineIndex === item.line}
                    onchange={() => (selectedLineIndex = item.line)}
                  />
                  <span class="note-font line-text">{item.text}</span>
                </label>
              {/each}
            </div>
          {/if}
        </div>

        <div class="conflict-actions-row">
          {#if matchingLines.length > 0}
            <button
              type="button"
              class="icon-btn btn-primary"
              disabled={busy || selectedLineIndex === null}
              onclick={applyChosenLine}
            >
              {$t("phoneChanges.applyToLine")}
            </button>
          {/if}
          <button
            type="button"
            class="icon-btn"
            disabled={busy}
            onclick={() => choose("add")}
          >
            {$t("phoneChanges.addAsNew")}
          </button>
          <button
            type="button"
            class="icon-btn"
            disabled={busy}
            onclick={() => choose("skip")}
          >
            {$t("phoneChanges.skip")}
          </button>
        </div>
      </div>
    {/if}

    {#if hasApplied}
      <div class="settings-hint section-header">
        <strong style="color: var(--text);">{$t("phoneChanges.applied")}</strong>
      </div>
      <div class="applied-list">
        {#each appliedEntries as item (item.request.id)}
          <div class="applied-row">
            <span class="applied-ask">
              {item.request.type === "addLine"
                ? $t("phoneChanges.ask.add")
                : $t(`phoneChanges.ask.${item.request.state}`)}
            </span>
            <span class="note-font applied-text">
              {item.request.type === "addLine" ? item.request.text : item.request.line}
            </span>
            <span class="settings-hint applied-date">
              {item.request.section ? `${item.request.date} · ${item.request.section}` : item.request.date}
            </span>
          </div>
        {/each}
      </div>
    {/if}

    {#if !hasConflicts && !hasApplied}
      <div class="settings-hint empty-hint">
        {$t("phoneChanges.none")}
      </div>
    {/if}

    <div class="modal-footer" style="padding: 8px 12px; display: flex; justify-content: flex-end;">
      <button type="button" class="icon-btn" onclick={controller.closeAllModals}>
        {$t("common.close")}
      </button>
    </div>
  </div>
</div>

<style>
  .section-header {
    padding: 12px 12px 4px;
    margin: 0;
  }
  .chips-row {
    padding: 0 12px 8px;
    gap: 6px;
    flex-wrap: wrap;
  }
  .conflict-body {
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ask-header {
    font-size: 14px;
    color: var(--text);
  }
  .field-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field-label {
    font-size: 11px;
    color: var(--text-muted);
  }
  .note-font {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
  }
  .code-box {
    background: var(--bg-surface-elevated, var(--bg-hover));
    padding: 6px 8px;
    border-radius: 4px;
    word-break: break-all;
    white-space: pre-wrap;
  }
  .reason-text {
    font-size: 12px;
    color: var(--text-muted);
    word-break: break-word;
    white-space: pre-wrap;
  }
  .radio-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .radio-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    cursor: pointer;
    word-break: break-all;
    white-space: pre-wrap;
    padding: 3px 0;
  }
  .line-text {
    flex: 1;
  }
  .conflict-actions-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .applied-list {
    display: flex;
    flex-direction: column;
    padding: 0 12px 8px;
  }
  .applied-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border-subtle, rgba(128, 128, 128, 0.15));
  }
  .applied-row:last-child {
    border-bottom: none;
  }
  .applied-ask {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }
  .applied-text {
    word-break: break-all;
    white-space: pre-wrap;
  }
  .applied-date {
    margin: 0;
    font-size: 11px;
  }
  .empty-hint {
    padding: 16px;
    margin: 0;
  }
</style>

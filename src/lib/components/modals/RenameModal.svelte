<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import * as controller from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";
  import { currentDateISO, renameModalTarget } from "../../stores";
  import {
    applyRename,
    diffRenameLine,
    planRename,
    validTarget,
    type RenamePlanEntry,
    type RenameTarget,
  } from "../../renameEverywhere";

  const target = $derived($renameModalTarget);

  let toValue = $state($renameModalTarget?.from ?? "");
  let toInput = $state<HTMLInputElement>();
  let plan = $state<RenamePlanEntry[]>([]);
  let plannedTo = $state<string>($renameModalTarget?.from ?? "");
  let unticked = $state<Set<string>>(new Set());
  let busy = $state(false);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const currentTarget = $derived<RenameTarget | null>(
    target ? { kind: target.kind, from: target.from, to: toValue } : null,
  );
  const invalidKey = $derived(currentTarget ? validTarget(currentTarget) : null);

  const effectiveTarget = $derived<RenameTarget | null>(
    target ? { kind: target.kind, from: target.from, to: plannedTo } : null,
  );

  const tickedSet = $derived(
    new Set(plan.filter((entry) => !unticked.has(entry.filename)).map((entry) => entry.filename)),
  );
  const tickedCount = $derived(tickedSet.size);
  const totalLines = $derived(plan.reduce((sum, entry) => sum + entry.lines.length, 0));
  const totalNotes = $derived(plan.length);

  async function rebuildPlan(nextTo: string) {
    const tSnapshot = target;
    if (!tSnapshot) {
      plan = [];
      return;
    }
    const nextTarget: RenameTarget = { kind: tSnapshot.kind, from: tSnapshot.from, to: nextTo };
    if (validTarget(nextTarget) !== null) {
      seq++;
      plan = [];
      plannedTo = nextTo;
      return;
    }
    const mine = ++seq;
    const nextPlan = await planRename(nextTarget, $currentDateISO);
    if (mine !== seq) return;
    plan = nextPlan;
    plannedTo = nextTo;
  }

  onMount(() => {
    toInput?.focus();
    toInput?.select();
    void rebuildPlan(toValue);
  });

  onDestroy(() => {
    clearTimeout(debounceTimer);
  });

  $effect(() => {
    const val = toValue;
    const isInvalid = invalidKey !== null;
    untrack(() => {
      clearTimeout(debounceTimer);
      if (isInvalid) {
        seq++;
        plan = [];
        plannedTo = val;
        return;
      }
      debounceTimer = setTimeout(() => {
        void rebuildPlan(val);
      }, 150);
    });
  });

  function toggleNote(filename: string) {
    const next = new Set(unticked);
    if (next.has(filename)) next.delete(filename);
    else next.add(filename);
    unticked = next;
  }

  function close() {
    clearTimeout(debounceTimer);
    controller.closeAllModals();
  }

  async function confirm() {
    if (busy || invalidKey !== null) return;
    if (toValue !== plannedTo) {
      clearTimeout(debounceTimer);
      await rebuildPlan(toValue);
    }
    if (tickedCount === 0 || invalidKey !== null) return;
    busy = true;
    try {
      const ticked = new Set(tickedSet);
      await applyRename(plan, ticked);
      close();
    } finally {
      busy = false;
    }
  }

  function handleToKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void confirm();
    }
  }
</script>

{#if target}
  <div class="overlay" role="presentation" use:closeOnOutsideClick={close}>
    <div
      class="modal-card modal-lg rename-modal-card"
      role="dialog"
      aria-modal="true"
      use:focusTrap
      use:sheetSwipe
      aria-label={$t("rename.modal.ariaLabel")}
    >
      <div class="modal-input-wrap modal-title">
        <Icon name="edit" size={15} />
        <span>{$t("rename.modal.title")}</span>
        <button
          type="button"
          class="icon-btn modal-close-btn"
          aria-label={$t("common.closeDialog")}
          onclick={close}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <div class="rename-fields">
        <label class="rename-field">
          <span class="rename-field-label">{$t("rename.modal.from")}</span>
          <input
            type="text"
            class="rename-input"
            readonly
            value={target.from}
            aria-label={$t("rename.modal.from")}
          />
        </label>
        <label class="rename-field">
          <span class="rename-field-label">{$t("rename.modal.to")}</span>
          <input
            type="text"
            class="rename-input"
            bind:this={toInput}
            bind:value={toValue}
            onkeydown={handleToKeydown}
            aria-label={$t("rename.modal.to")}
          />
          {#if invalidKey}
            <span class="rename-invalid">{$t(invalidKey)}</span>
          {/if}
        </label>
      </div>

      <div class="rename-status">
        <span class="rename-summary">{$t("rename.modal.summary", { lines: totalLines, notes: totalNotes })}</span>
      </div>

      <div class="modal-list rename-list">
        {#each plan as entry (entry.filename)}
          <div class="rename-row">
            <label class="rename-row-check">
              <input
                type="checkbox"
                checked={!unticked.has(entry.filename)}
                onchange={() => toggleNote(entry.filename)}
              />
              <span class="rename-row-date">{entry.dateISO ?? entry.filename.replace(/\.txt$/, "")}</span>
            </label>
            <div class="rename-row-lines note-font">
              {#each entry.lines as line (line.lineIdx)}
                <div class="rename-row-line">
                  {#if effectiveTarget}
                    {#each diffRenameLine(line.before, effectiveTarget) as seg}
                      {#if seg.kind === "del"}
                        <del class="rename-del">{seg.text}</del>
                      {:else if seg.kind === "ins"}
                        <ins class="rename-ins">{seg.text}</ins>
                      {:else}
                        {seg.text}
                      {/if}
                    {/each}
                  {:else}
                    {line.before}
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="modal-footer rename-footer">
        <button type="button" class="icon-btn" onclick={close}>{$t("common.cancel")}</button>
        <button
          type="button"
          class="icon-btn btn-primary"
          disabled={busy || invalidKey !== null || tickedCount === 0}
          onclick={() => void confirm()}
        >
          {$t("rename.modal.confirm", { count: tickedCount })}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .rename-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 12px 14px 8px;
  }

  @media (max-width: 600px) {
    .rename-fields {
      grid-template-columns: 1fr;
    }
  }

  .rename-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .rename-field-label {
    font-size: var(--type-caption);
    color: var(--muted);
    font-weight: 500;
  }

  .rename-input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    background: var(--surface-raised);
    border: 1px solid var(--edge-strong);
    border-radius: var(--radius-control);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    outline: none;
  }

  .rename-input:focus {
    border-color: var(--text);
  }

  .rename-input[readonly] {
    opacity: 0.78;
    cursor: default;
  }

  .rename-status {
    padding: 2px 14px 8px;
    font-size: var(--type-caption);
    color: var(--muted);
    border-bottom: 1px solid var(--edge-soft);
  }

  .rename-invalid {
    font-size: var(--type-caption);
    color: var(--muted);
  }

  .rename-list {
    min-height: 80px;
  }

  .rename-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 7px 14px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.08);
    font-size: 13px;
  }

  .rename-row-check {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    cursor: pointer;
    user-select: none;
    font-family: var(--font-mono);
    font-size: var(--type-caption);
    color: var(--muted);
    padding-top: 2px;
  }

  .rename-row-lines {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .rename-row-line {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .rename-del {
    text-decoration: line-through;
    color: var(--muted);
    background: color-mix(in srgb, var(--state-error) 14%, transparent);
    padding: 0 2px;
    border-radius: 2px;
  }

  .rename-ins {
    text-decoration: none;
    color: var(--text);
    background: color-mix(in srgb, var(--state-ok) 18%, transparent);
    padding: 0 2px;
    border-radius: 2px;
  }

  .rename-footer {
    justify-content: flex-end;
    gap: 8px;
  }
</style>

<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import Icon from "../../icons/Icon.svelte";

  export interface HelpHint {
    keys: string;
    label: string;
  }

  export interface HelpOperator {
    code: string;
    label: string;
  }

  interface Props {
    title: string;
    hints: HelpHint[];
    operators?: HelpOperator[];
    onCloseFocus?: () => void;
  }

  let { title, hints, operators, onCloseFocus }: Props = $props();

  let open = $state(false);
  let pos = $state({ x: 8, y: 8 });
  let btnEl = $state<HTMLButtonElement>();
  let popEl = $state<HTMLDivElement>();

  function placePopover() {
    if (!btnEl) return;
    const r = btnEl.getBoundingClientRect();
    const popW = popEl?.offsetWidth ?? 260;
    const popH = popEl?.offsetHeight ?? 200;
    const x = Math.max(8, Math.min(r.right - popW, window.innerWidth - popW - 8));
    let y = r.bottom + 6;
    if (y + popH > window.innerHeight - 8) {
      y = Math.max(8, r.top - popH - 6);
    }
    pos = { x, y };
  }

  function close(restoreFocus: boolean) {
    if (!open) return;
    open = false;
    if (restoreFocus) {
      onCloseFocus?.();
    }
  }

  async function toggle() {
    if (open) {
      close(true);
      return;
    }
    open = true;
    placePopover();
    await tick();
    placePopover();
  }

  function onCaptureKeydown(e: KeyboardEvent) {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    close(true);
  }

  function onMousedown(e: MouseEvent) {
    if (!open) return;
    const target = e.target as Node;
    if (!popEl?.contains(target) && !btnEl?.contains(target)) {
      close(false);
    }
  }

  function onResize() {
    if (open) close(false);
  }

  onMount(() => {
    document.addEventListener("keydown", onCaptureKeydown, true);
    document.addEventListener("mousedown", onMousedown);
    window.addEventListener("resize", onResize);
  });

  onDestroy(() => {
    document.removeEventListener("keydown", onCaptureKeydown, true);
    document.removeEventListener("mousedown", onMousedown);
    window.removeEventListener("resize", onResize);
  });
</script>

<button
  type="button"
  class="icon-btn modal-help-btn"
  bind:this={btnEl}
  aria-label={title}
  {title}
  aria-haspopup="dialog"
  aria-expanded={open}
  onclick={toggle}
>
  <Icon name="help" size={14} />
</button>

{#if open}
  <div
    class="header-help-pop"
    bind:this={popEl}
    role="dialog"
    aria-label={title}
    tabindex="-1"
    style="top: {pos.y}px; left: {pos.x}px;"
  >
    <div class="help-pop-section">
      {#each hints as hint (hint.keys)}
        <div class="help-pop-row">
          <kbd>{hint.keys}</kbd>
          <span>{hint.label}</span>
        </div>
      {/each}
    </div>
    {#if operators && operators.length > 0}
      <div class="help-pop-sep" role="separator"></div>
      <div class="help-pop-section">
        {#each operators as op (op.code)}
          <div class="help-pop-row">
            <code>{op.code}</code>
            <span>{op.label}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

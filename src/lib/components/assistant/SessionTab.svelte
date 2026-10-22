<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { tick } from "svelte";
  import { ContextMenu } from "bits-ui";
  import "../ui/menu.css";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";

  let { id, label, selected, busy, onselect, onclose, onrename, onkeydown }: {
    id: number; label: string; selected: boolean; busy: boolean;
    onselect(): void; onclose(): void; onrename(label: string): void; onkeydown(event: KeyboardEvent): void;
  } = $props();
  let menuOpen = $state(false), editing = $state(false), draft = $state("");
  let trigger = $state<HTMLElement | null>(null), tab = $state<HTMLButtonElement | null>(null);
  let input = $state<HTMLInputElement | null>(null);
  let restoreFocus = true;

  async function beginRename() {
    draft = label; editing = true; menuOpen = false;
    await tick(); input?.focus({ preventScroll: true }); input?.select();
  }
  async function finishRename(save: boolean, focus = false) {
    if (!editing) return;
    const name = draft.trim();
    if (save && name) onrename(name);
    editing = false;
    if (focus) { await tick(); tab?.focus({ preventScroll: true }); tab?.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }
  function tabKey(event: KeyboardEvent) {
    if (event.key === "ContextMenu" || event.key === "F10" && event.shiftKey) {
      event.preventDefault(); event.stopPropagation();
      const bounds = tab?.getBoundingClientRect();
      if (bounds) trigger?.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, button: 2, clientX: bounds.left, clientY: bounds.bottom,
      }));
    } else onkeydown(event);
  }
  function renameKey(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault(); void finishRename(event.key === "Enter", true);
    }
  }
</script>

<ContextMenu.Root bind:open={menuOpen}>
  <ContextMenu.Trigger bind:ref={trigger} disabled={editing} oncontextmenu={() => restoreFocus = true}>
    {#snippet child({ props })}
      <div {...props} class="conversation-tab" class:active={selected}
        onmousedown={event => { if (event.button === 1) event.preventDefault(); }}
        onauxclick={event => { if (event.button === 1) { event.preventDefault(); event.stopPropagation(); onclose(); } }}>
        {#if editing}
          <div class="tab-rename"><MaterialIcon name="chat" size={15} />
            <input bind:this={input} bind:value={draft} id={`ollama-tab-${id}`} class="rename-input" aria-label={`Rename ${label}`}
              size={Math.max(8, Math.min(draft.length + 1, 24))} autocomplete="off" spellcheck={false}
              onkeydowncapture={renameKey} onblur={() => void finishRename(false)} />
          </div>
        {:else}
          <Button bind:ref={tab} variant="ghost" class="tab-select" role="tab" id={`ollama-tab-${id}`} aria-label={label} title={label}
            aria-selected={selected} aria-controls={`ollama-thread-${id}`} tabindex={selected ? 0 : -1}
            onclick={onselect} onkeydown={tabKey}>
            <MaterialIcon name="chat" size={15} /><span class="tab-label">{label}</span>
            {#if busy}<span class="generating" aria-hidden="true">•</span>{/if}
          </Button>
        {/if}
        <Button variant="ghost" size="icon-sm" class="tab-close" aria-label={`Close ${label}`} tooltip={`Close ${label}`}
          tabindex={selected ? 0 : -1} onclick={onclose}><MaterialIcon name="close" size={13} /></Button>
      </div>
    {/snippet}
  </ContextMenu.Trigger>
  <ContextMenu.Portal>
    <ContextMenu.Content class="menu-content" aria-label={`Session actions for ${label}`} collisionPadding={8} sideOffset={4}
      onInteractOutside={() => restoreFocus = false}
      onCloseAutoFocus={event => { event.preventDefault(); if (!editing && restoreFocus) tab?.focus({ preventScroll: true }); }}>
      <ContextMenu.Item class="menu-item" onSelect={() => void beginRename()}><MaterialIcon name="edit" size={16} />Rename</ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>

<style>
  .conversation-tab { display: flex; flex: 0 0 auto; align-items: center; background: var(--color-hover-background); border-right: 2px solid var(--ollama-divider); }
  .conversation-tab.active { background: var(--color-background); }
  .conversation-tab :global(button) { --color-hover-background: transparent; background: transparent; }
  .conversation-tab :global(.tab-select), .tab-rename { height: var(--workbench-tabs-content-height, 36px); padding: 6px 8px 6px 11px; border-radius: 0; font-size: .625rem; gap: 6px; }
  .tab-label { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
  .tab-rename { display: flex; align-items: center; }
  .rename-input { min-width: 0; max-width: 180px; padding: 0; border: 0; outline: none; border-radius: 2px; font: inherit;
    background: var(--color-focus-background); color: var(--color-focus-foreground); }
  .conversation-tab :global(.tab-close) { width: 20px; height: 20px; margin-right: 7px; border-radius: 2px; }
  .conversation-tab:has(:focus-visible) { background: var(--color-focus-background); color: var(--color-focus-foreground); }
  .generating { color: var(--color-accent); }
</style>

<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import "../ui/menu.css";
  import { ContextMenu } from "bits-ui";
  import { tick, type Snippet } from "svelte";
  import MaterialIcon from "../MaterialIcon.svelte";

  let { path, kind = "file", disabled = false, tab = false, onsplit, onclosesplit, onrename, ondelete, oncreate, child: renderTrigger }:
    { path: string; kind?: "file" | "directory"; disabled?: boolean; tab?:boolean;onsplit?(path:string):void;onclosesplit?:(()=>void)|undefined;
      onrename?(path: string, newName: string): Promise<void>;
      ondelete?(path: string): void;
      oncreate?(directory: string): void;
      child?: Snippet<[{ props: Record<string, unknown> }]> } = $props();

  const id = $props.id();
  const errorId = `${id}-rename-error`;
  const name = $derived(path.slice(path.lastIndexOf("/") + 1));
  let menuOpen = $state(false);
  let editing = $state(false);
  let saving = $state(false);
  let draft = $state("");
  let error = $state("");
  let trigger = $state<HTMLElement | null>(null);
  let container = $state<HTMLElement | null>(null);
  let input = $state<HTMLInputElement | null>(null);
  let returnFocus: HTMLElement | null = null;
  let restoreFocus = true;

  function prepareMenu(event: MouseEvent) {
    event.stopPropagation();
    restoreFocus = true;
    returnFocus = trigger?.closest<HTMLElement>('[role="treeitem"]') ?? trigger;
  }

  // Row/tab padding and icons share the filename menu without changing left clicks.
  $effect(() => {
    const area = container?.closest<HTMLElement>("[data-file-context-target]");
    if (!area) return;
    const contextmenu = (event: MouseEvent) => {
      // Svelte handles trigger events through delegation after native bubbling.
      // Let those events reach it instead of forwarding them back to the trigger.
      if (!event.defaultPrevented && event.target instanceof Node && !trigger?.contains(event.target)) openMenu(event);
    };
    area.addEventListener("contextmenu", contextmenu);
    return () => area.removeEventListener("contextmenu", contextmenu);
  });

  // Tree rows keep their roving tab stop; pointer events keep their click position.
  export function openMenu(event: KeyboardEvent | MouseEvent) {
    const keyboard = event instanceof KeyboardEvent;
    if (disabled || editing || (keyboard && event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = trigger.getBoundingClientRect();
    trigger.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, button: 2,
      clientX: keyboard ? bounds.left : event.clientX,
      clientY: keyboard ? bounds.bottom : event.clientY,
    }));
  }

  async function beginRename() {
    if (disabled) return;
    draft = name;
    error = "";
    editing = true;
    menuOpen = false;
    await tick();
    input?.focus({ preventScroll: true });
    const extension = kind === "file" ? draft.lastIndexOf(".") : -1;
    input?.setSelectionRange(0, extension > 0 ? extension : draft.length);
  }

  async function cancelRename(focus = false) {
    if (saving) return;
    editing = false;
    error = "";
    if (focus) {
      await tick();
      (trigger?.closest<HTMLElement>('[role="treeitem"]') ?? trigger)?.focus({ preventScroll: true });
    }
  }

  async function confirmRename() {
    if (saving || disabled) return;
    const newName = draft.trim();
    if (!newName || newName === "." || newName === ".." || newName.toLowerCase() === ".git" || /[/\\]/.test(newName)) {
      error = "Enter a name without directory separators or Git metadata.";
      input?.focus({ preventScroll: true });
      return;
    }
    if (newName === name) {
      await cancelRename(true);
      return;
    }
    saving = true;
    error = "";
    try {
      await onrename?.(path, newName);
      editing = false;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "The name could not be changed.";
      await tick();
      input?.focus({ preventScroll: true });
    } finally {
      saving = false;
    }
  }

  function renameKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      void cancelRename(true);
    }
  }

  function closeMenu(event: Event) {
    event.preventDefault();
    if (!editing && restoreFocus) returnFocus?.focus({ preventScroll: true });
  }

  // Errors stay next to the input without being clipped by the tree/tab scroll area.
  function positionError(element: HTMLElement) {
    const update = () => {
      if (!input) return;
      const anchor = input.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      element.style.left = `${Math.max(8, Math.min(anchor.left, width - bounds.width - 8))}px`;
      const below = anchor.bottom + 6;
      element.style.top = `${Math.max(8, below + bounds.height <= height - 8 ? below : anchor.top - bounds.height - 6)}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return { destroy() {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    } };
  }
</script>

<span class="file-name" class:custom={Boolean(renderTrigger)} class:editing bind:this={container}>
  <ContextMenu.Root bind:open={menuOpen}>
    {#if editing}
      <input bind:this={input} bind:value={draft} class="rename-input"
        aria-label={`Change name of ${path}`} aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined} aria-busy={saving}
        readonly={saving} size={Math.max(draft.length + 1, 8)}
        autocomplete="off" spellcheck={false}
        onkeydown={renameKeydown} onblur={() => void cancelRename()}
        onclick={event => event.stopPropagation()} onpointerdown={event => event.stopPropagation()}
        oninput={() => { error = ""; }} />
      {#if error}
        <ContextMenu.Portal>
          <span id={errorId} class="rename-error" role="alert" use:positionError>{error}</span>
        </ContextMenu.Portal>
      {/if}
    {:else}
      <ContextMenu.Trigger bind:ref={trigger} {disabled} oncontextmenu={prepareMenu}
        onkeydown={openMenu} tabindex={renderTrigger ? 0 : -1}>
        {#snippet child({ props })}
          {#if renderTrigger}
            {@render renderTrigger({ props })}
          {:else}
            <span {...props} class="file-name-text">{name}</span>
          {/if}
        {/snippet}
      </ContextMenu.Trigger>
    {/if}
    <ContextMenu.Portal>
      <ContextMenu.Content class="menu-content file-context-menu" aria-label={`${tab ? "Tab" : kind === "directory" ? "Folder" : "File"} actions for ${path}`}
        collisionPadding={8} sideOffset={4} onCloseAutoFocus={closeMenu}
        onInteractOutside={() => { restoreFocus = false; }}>
        {#if tab}
          <ContextMenu.Item class="menu-item file-context-item" {disabled} onSelect={()=>{restoreFocus=false;onsplit?.(path);}}>
            <MaterialIcon name="vertical_split" size={16} />Open in split view
          </ContextMenu.Item>
          {#if onclosesplit}<ContextMenu.Item class="menu-item file-context-item" {disabled} onSelect={()=>{restoreFocus=false;onclosesplit?.();}}>
            <MaterialIcon name="close_fullscreen" size={16} />Close split view
          </ContextMenu.Item>{/if}
        {:else}
        {#if kind === "directory" && oncreate}
          <ContextMenu.Item class="menu-item file-context-item" {disabled} onSelect={() => {
            restoreFocus = false;
            oncreate?.(path);
          }}>
            <MaterialIcon name="note_add" size={16} />New file
          </ContextMenu.Item>
        {/if}
        <ContextMenu.Item class="menu-item file-context-item" {disabled} onSelect={() => void beginRename()}>
          <MaterialIcon name="edit" size={16} />Change name
        </ContextMenu.Item>
        <ContextMenu.Item class="menu-item file-context-item" {disabled} onSelect={() => {
          restoreFocus = false;
          ondelete?.(path);
        }}>
          <MaterialIcon name="delete" size={16} />Delete {kind === "directory" ? "folder" : "file"}
        </ContextMenu.Item>
        {/if}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  </ContextMenu.Root>
</span>

<style>
  .file-name { position: relative; display: inline-flex; align-items: center; flex: 1;
    min-width: 0; max-width: 100%; vertical-align: middle; }
  .file-name.custom { flex: initial; }
  .file-name-text { display: block; flex: 1; min-width: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
  .rename-input { min-width: 0; max-width: 100%; padding: 0; border: 0; border-radius: 2px;
    background: var(--color-hover-background); color: var(--color-hover-foreground); font: inherit; line-height: inherit;
    outline: none; }
  .rename-input[aria-invalid="true"] { background: var(--color-error-background); color: var(--color-error-foreground); }
  .rename-error { position: fixed; z-index: 100;
    width: max-content; max-width: min(280px, calc(100vw - 16px)); max-height: calc(100vh - 16px); overflow: auto; margin: 0;
    padding: 6px 8px; border-radius: 4px; background: var(--color-error-background);
    color: var(--color-error-foreground); box-shadow: var(--shadow-lg); font-size: 0.6875rem; font-weight: 500; }
</style>

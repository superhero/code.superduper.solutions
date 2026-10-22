<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { slide } from "svelte/transition";
  import type { FileTreeNode } from "$lib/editor/file-tree";
  import MaterialIcon from "../MaterialIcon.svelte";
  import FileIcon from "../FileIcon.svelte";
  import FileTreeItem from "./FileTreeItem.svelte";
  import FileName from "./FileName.svelte";
  import FileTreeGuides from "./FileTreeGuides.svelte";

  let { node, showIcons, expanded, focusedPath, selectedPath, disabled, dragDisabled, dragPath, dropDirectory, previewPath, last, route, level, position, count,
    register, onactivate, onkeydown, onfocus, onrename, ondelete, oncreate }:
    { node: FileTreeNode; showIcons: boolean; expanded: Set<string>; focusedPath: string; selectedPath: string;
      disabled: boolean; dragDisabled: boolean; dragPath: string; dropDirectory: string | null;
      previewPath: string; last: boolean; route: "through" | "to" | undefined;
      level: number; position: number; count: number;
      register(path: string, element: HTMLDivElement): () => void;
      onactivate(node: FileTreeNode): void; onkeydown(event: KeyboardEvent, node: FileTreeNode): void;
      onfocus(path: string): void; onrename(path: string, name: string): Promise<void>;
      ondelete(path: string): void; oncreate(directory: string): void } = $props();

  let filename = $state<FileName>();

  const directory = $derived(node.kind === "directory");
  const open = $derived(directory && expanded.has(node.path));
  const selected = $derived(!directory && selectedPath === node.path);
  const previewIndex = $derived(node.children.findIndex(child => child.preview));
  const routeIndex = $derived(node.children.findIndex(child => previewPath === child.path || previewPath.startsWith(`${child.path}/`)));

  function registerItem(element: HTMLDivElement) {
    return { destroy: register(node.path, element) };
  }
</script>

{#if node.preview}
  <div class="tree-preview" aria-hidden="true" data-file-preview={node.path}
    data-file-drop-directory={node.path.slice(0, node.path.lastIndexOf("/") + 1).replace(/\/$/, "")}>
    <FileTreeGuides {level} {last} {directory} {route} />
    <div class="tree-row preview-row" style:--tree-level={level}>
      <span class="tree-guide-space"></span>
      {#if showIcons}{#if directory}<MaterialIcon name="folder" size={16} />{:else}<FileIcon path={node.path} />{/if}{:else if directory}<MaterialIcon name="chevron_right" size={16} />{/if}
      <span class="preview-name">{node.name}</span>
    </div>
  </div>
{:else}
<div class="tree-item" role="treeitem" aria-label={node.path} aria-level={level}
  aria-posinset={position} aria-setsize={count} aria-expanded={directory ? open : undefined}
  aria-selected={directory ? undefined : selected} aria-current={selected ? "true" : undefined}
  aria-disabled={disabled} tabindex={!disabled && focusedPath === node.path ? 0 : -1}
  use:registerItem
  onfocus={event => { if (event.target === event.currentTarget && !disabled) onfocus(node.path); }}
  onpointerdown={event => { if (disabled) event.preventDefault(); }}
  onclick={event => {
    event.stopPropagation();
    if (disabled) return;
    event.currentTarget.focus({ preventScroll: true });
    onactivate(node);
  }}
  onkeydown={event => {
    // Application history shortcuts must reach the document handler.
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) return;
    event.stopPropagation();
    if (event.key === "ContextMenu" || event.key === "F10" && event.shiftKey) filename?.openMenu(event);
    else onkeydown(event, node);
  }}>
  <div class="tree-row" data-file-context-target data-file-path={node.path} data-file-kind={node.kind}
    draggable={!disabled && !dragDisabled} class:selected class:drag-source={dragPath === node.path}
    class:drop-target={directory && dropDirectory === node.path} style:--tree-level={level}>
    <span class="tree-guide-space" aria-hidden="true"></span>
    {#if showIcons}{#if directory}<MaterialIcon name={open ? "folder_open" : "folder"} size={16} />
    {:else}<FileIcon path={node.path} />{/if}{:else if directory}<MaterialIcon name={open ? "expand_more" : "chevron_right"} size={16} />{/if}
    <FileName bind:this={filename} path={node.path} kind={node.kind} {disabled} {onrename} {ondelete} {oncreate} />
  </div>
  <FileTreeGuides {level} {last} {directory} {route} />
  {#if open}
    <span class="child-connector" class:drop-route={routeIndex >= 0} aria-hidden="true"
      style:left={`calc(24.5px + 0.5rem + ${(level - 1) * 25}px)`}></span>
    <div role="group" class="tree-group"
      transition:slide={{ duration: prefersReducedMotion.current ? 0 : 180 }}>
      {#each node.children as child, index (child.path)}
        <FileTreeItem node={child} {showIcons} {expanded} {focusedPath} {selectedPath} {disabled} {dragDisabled} {dragPath} {dropDirectory} {previewPath}
          last={index === node.children.length - 1}
          route={routeIndex < 0 || index > routeIndex ? undefined : index === routeIndex ? "to" : "through"}
          level={level + 1} position={index + 1 - Number(previewIndex >= 0 && index > previewIndex)} count={node.children.length - Number(previewIndex >= 0)}
          {register} {onactivate} {onkeydown} {onfocus} {onrename} {ondelete} {oncreate} />
      {/each}
    </div>
  {/if}
</div>
{/if}

<style>
  .tree-item, .tree-preview { display: flow-root; position: relative; min-width: 0; outline: none; }
  .tree-group { position: relative; }
  .child-connector { position: absolute; z-index: 1; top: calc(1px + var(--tree-row-height) / 2 + .5rem);
    width: 1px; height: calc(var(--tree-row-height) / 2 + 1px - .5rem); background: var(--color-tree-guide); pointer-events: none; }
  .child-connector.drop-route { background: var(--color-drop-foreground); }
  .tree-row { position: relative; isolation: isolate; display: flex; align-items: center; gap: 6px; min-height: var(--tree-row-height); margin-block: 1px; padding: 6px 8px;
    padding-left: calc(11px + (var(--tree-level) - 1) * 25px); border-radius: 4px; font-size: 0.6875rem; font-weight: 700;
    cursor: pointer; user-select: none; }
  /* Match the branch trigger height, with a 2px gap between rows. */
  .tree-row::before { content: ""; position: absolute; inset: 0 0 0 -14px; z-index: -1;
    border-radius: 4px; background: var(--tree-row-background, transparent); pointer-events: none; }
  .tree-guide-space { flex: 0 0 8px; height: 16px; }
  .tree-row :global(.material-symbols-rounded) { flex-shrink: 0; }
  .tree-row.selected { --color-hover-background: var(--color-background); --tree-row-background: var(--color-background); }
  .tree-row.drag-source { opacity: .55; }
  .preview-row { opacity: .5; color: var(--color-drop-foreground); cursor: default; }
  .preview-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tree-row.drop-target { --color-hover-background: var(--color-drop-background); --tree-row-background: var(--color-drop-background); }
  @media (hover: hover) {
    .tree-item:not([aria-disabled="true"]):not([inert], [inert] *) > .tree-row:hover {
      --tree-row-background: var(--color-hover-background); color: var(--color-hover-foreground);
    }
  }
  .tree-item:focus-visible > .tree-row:not(.drop-target) {
    --tree-row-background: var(--color-hover-background); color: var(--color-hover-foreground);
  }
  .tree-item[aria-disabled="true"] > .tree-row { cursor: not-allowed; }
</style>

<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { tick, untrack } from "svelte";
  import { readDroppedFiles } from "$lib/editor/drop-files";
  import { ancestorDirectories, buildFileTree, previewFileTree, visibleFileTree, type FileTreeNode } from "$lib/editor/file-tree";
  import type { ImportedFile } from "$lib/repository/types";
  import FileTreeItem from "./FileTreeItem.svelte";

  let { files, showIcons = true, selectedPath, initialState, restoreEpoch = 0, onstate, ontoggle, disabled = false, dragDisabled = false, dropRoot, onselect, onrename, onmove, ondelete, oncreate, onimport }:
    { files: string[]; showIcons?: boolean; selectedPath: string; disabled?: boolean; dragDisabled?: boolean; dropRoot?: HTMLElement;
      initialState?: { expandedDirectories: string[]; treeFocus: string };
      restoreEpoch?: number;
      onstate?(expandedDirectories: string[], treeFocus: string): void;
      ontoggle?(expandedDirectories: string[], treeFocus: string): void;
      onselect(path: string): void;
      onrename(path: string, name: string): Promise<void>; ondelete(path: string): void;
      onmove(path: string, destination: string): Promise<void>; oncreate(directory: string): void;
      onimport?(directory: string, files: Promise<ImportedFile[]>): Promise<void> } = $props();

  let tree = $state<HTMLDivElement>();
  let expanded = $state.raw(new Set<string>(untrack(() => initialState?.expandedDirectories ?? [])));
  let focusedPath = $state(untrack(() => initialState?.treeFocus ?? ""));
  const elements = new Map<string, HTMLDivElement>();
  const nodes = $derived(buildFileTree(files));
  const visible = $derived(visibleFileTree(nodes, expanded));
  let previousSelection = untrack(() => initialState ? selectedPath : "");
  let lastRestoreEpoch = untrack(() => restoreEpoch);
  let search = "";
  let lastTypedAt = 0;
  let drag = $state<{ path: string; directory: boolean } | null>(null);
  let externalDrag = $state(false);
  let dropDirectory = $state<string | null>(null);
  const dropPreview = $derived(drag && dropDirectory !== null ? {
    path: (dropDirectory ? `${dropDirectory}/` : "") + drag.path.slice(drag.path.lastIndexOf("/") + 1),
    kind: drag.directory ? "directory" as const : "file" as const,
  } : null);
  const presentationNodes = $derived(previewFileTree(nodes, dropPreview));
  const previewPath = $derived(presentationNodes !== nodes ? dropPreview?.path ?? "" : "");
  const previewIndex = $derived(presentationNodes.findIndex(node => node.preview));
  const routeIndex = $derived(presentationNodes.findIndex(node => previewPath === node.path || previewPath.startsWith(`${node.path}/`)));
  let moveError = $state("");
  let moveAnnouncement = $state("");
  let expandTimer: ReturnType<typeof setTimeout> | undefined;
  let connected = false;

  const editable = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

  function clearDropTarget() {
    clearTimeout(expandTimer);
    expandTimer = undefined;
    dropDirectory = null;
    (dropRoot ?? tree)?.removeAttribute("data-file-drop-root");
  }

  function clearDrag() {
    clearDropTarget();
    drag = null;
    externalDrag = false;
  }

  function sourceExists(source: { path: string; directory: boolean }) {
    return files.some(path => source.directory ? path.startsWith(`${source.path}/`) : path === source.path);
  }

  function rowAt(target: EventTarget | null) {
    if (!(target instanceof Element)) return null;
    const row = target.closest<HTMLElement>("[data-file-path]");
    return row && tree?.contains(row) ? row : null;
  }

  function directoryAt(target: EventTarget | null) {
    if (target instanceof Element && target.closest(editable)) return null;
    const preview = target instanceof Element ? target.closest<HTMLElement>("[data-file-drop-directory]") : null;
    if (preview && tree?.contains(preview)) return preview.dataset.fileDropDirectory!;
    const row = rowAt(target);
    const path = row?.dataset.filePath ?? "";
    const directory = row?.dataset.fileKind === "directory" ? path : path.slice(0, path.lastIndexOf("/") + 1).replace(/\/$/, "");
    if (directory && !files.some(file => file.startsWith(`${directory}/`))) return null;
    return directory;
  }

  function destinationAt(target: EventTarget | null) {
    if (!drag || disabled || dragDisabled || !sourceExists(drag)) return null;
    const directory = directoryAt(target);
    if (directory === null) return null;
    const destination = (directory ? `${directory}/` : "") + drag.path.slice(drag.path.lastIndexOf("/") + 1);
    if (destination === drag.path || drag.directory && (directory === drag.path || directory.startsWith(`${drag.path}/`))) return null;
    return { directory, destination };
  }

  function markDropTarget(directory: string) {
    if (dropDirectory === directory) return;
    clearDropTarget();
    dropDirectory = directory;
    if (!directory) (dropRoot ?? tree)?.setAttribute("data-file-drop-root", "");
    else if (!expanded.has(directory)) {
      expandTimer = setTimeout(() => {
        expandTimer = undefined;
        if ((drag || externalDrag) && !disabled && !dragDisabled && dropDirectory === directory) expanded = new Set([...expanded, directory]);
      }, 500);
    }
  }

  function startDrag(event: DragEvent) {
    const row = rowAt(event.target);
    if (!row) return;
    if (disabled || dragDisabled || !event.dataTransfer || row.querySelector(editable)
      || event.target instanceof Element && event.target.closest(editable)) {
      event.preventDefault();
      return;
    }
    clearDrag();
    drag = { path: row.dataset.filePath!, directory: row.dataset.fileKind === "directory" };
    if (!sourceExists(drag)) { clearDrag(); event.preventDefault(); return; }
    // The payload gives the browser a drag image; only this mounted tree's state authorizes a move.
    event.dataTransfer.setData("application/x-code-repository-path", drag.path);
    event.dataTransfer.effectAllowed = "move";
    moveError = "";
    moveAnnouncement = "";
  }

  function dragOver(event: DragEvent) {
    if (!drag) {
      if (event.dataTransfer?.types.includes("Files")) {
        event.preventDefault();
        event.stopPropagation();
        externalDrag = true;
        const directory = !disabled && !dragDisabled && onimport ? directoryAt(event.target) : null;
        event.dataTransfer.dropEffect = directory === null ? "none" : "copy";
        if (directory === null) clearDropTarget();
        else markDropTarget(directory);
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const destination = destinationAt(event.target);
    if (event.dataTransfer) event.dataTransfer.dropEffect = destination ? "move" : "none";
    if (destination) markDropTarget(destination.directory);
    else clearDropTarget();
  }

  async function drop(event: DragEvent) {
    if (!drag) {
      if (event.dataTransfer?.types.includes("Files")) {
        event.preventDefault();
        event.stopPropagation();
        const directory = !disabled && !dragDisabled && onimport ? directoryAt(event.target) : null;
        clearDrag();
        moveAnnouncement = "";
        if (directory === null || !onimport) {
          moveError = !onimport ? "Create or import a repository before dropping files."
            : "Files cannot be added while another operation is pending or saving has failed.";
          return;
        }
        moveError = "";
        // The browser closes DataTransfer access after this event; capture before awaiting.
        const incoming = readDroppedFiles(event.dataTransfer);
        try {
          // Start the application operation immediately so it captures the repository and locks navigation.
          const [added] = await Promise.all([incoming, onimport(directory, incoming)]);
          if (!connected) return;
          if (directory) expanded = new Set([...expanded, ...ancestorDirectories(directory), directory]);
          moveAnnouncement = `Added ${added.length} ${added.length === 1 ? "file" : "files"} to ${directory || "the repository root"}.`;
        } catch (cause) {
          if (connected) moveError = cause instanceof Error ? cause.message : "The dropped files could not be added.";
        }
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const source = drag.path;
    const destination = destinationAt(event.target);
    const previousExpansion = expanded;
    const previousFocus = focusedPath;
    const hadFocus = tree?.contains(tree.ownerDocument.activeElement);
    clearDrag();
    if (!destination) return;
    const remap = (path: string) => path === source || path.startsWith(`${source}/`)
      ? destination.destination + path.slice(source.length) : path;
    try {
      await onmove(source, destination.destination);
      if (!connected) return;
      expanded = new Set([...previousExpansion].map(remap).concat(ancestorDirectories(destination.destination)));
      focusedPath = remap(previousFocus);
      moveAnnouncement = `Moved ${source} to ${destination.destination}.`;
      if (hadFocus) await focusNode(focusedPath);
    } catch (cause) {
      if (connected) moveError = cause instanceof Error ? cause.message : "The file or folder could not be moved.";
    }
  }

  // Use one native listener set for rows, branch heading, and blank repository space.
  $effect(() => {
    const root = dropRoot ?? tree;
    if (!root) return;
    connected = true;
    const leave = (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) clearDropTarget();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") clearDrag(); };
    const receiveDrop = (event: DragEvent) => { void drop(event); };
    root.addEventListener("dragstart", startDrag);
    root.addEventListener("dragover", dragOver);
    root.addEventListener("dragleave", leave);
    root.addEventListener("drop", receiveDrop);
    // Native dragging can temporarily take window focus. Only the drag's
    // lifecycle (or Escape) ends it; blur must not discard an accepted drop.
    document.addEventListener("dragend", clearDrag);
    document.addEventListener("keydown", escape, true);
    return () => {
      connected = false;
      clearDrag();
      root.removeAttribute("data-file-drop-root");
      root.removeEventListener("dragstart", startDrag);
      root.removeEventListener("dragover", dragOver);
      root.removeEventListener("dragleave", leave);
      root.removeEventListener("drop", receiveDrop);
      document.removeEventListener("dragend", clearDrag);
      document.removeEventListener("keydown", escape, true);
    };
  });

  $effect(() => {
    if ((drag || externalDrag) && (disabled || dragDisabled || drag && !sourceExists(drag))) clearDrag();
  });

  function register(path: string, element: HTMLDivElement) {
    elements.set(path, element);
    return () => { if (elements.get(path) === element) elements.delete(path); };
  }

  async function focusNode(path: string) {
    if (disabled) return;
    focusedPath = path;
    await tick();
    if (disabled || focusedPath !== path) return;
    const element = elements.get(path);
    element?.focus({ preventScroll: true });
    element?.firstElementChild?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function toggle(node: FileTreeNode) {
    if (disabled || node.kind !== "directory") return;
    const next = new Set(expanded);
    if (next.has(node.path)) next.delete(node.path);
    else next.add(node.path);
    expanded = next;
    ontoggle?.([...next], focusedPath);
  }

  function activate(node: FileTreeNode) {
    if (disabled) return;
    focusedPath = node.path;
    if (node.kind === "directory") toggle(node);
    else onselect(node.path);
  }

  async function rename(path: string, name: string) {
    const previousExpansion = expanded;
    await onrename(path, name);
    const next = path.slice(0, path.lastIndexOf("/") + 1) + name;
    expanded = new Set([...previousExpansion].map(directory => directory === path || directory.startsWith(`${path}/`)
      ? next + directory.slice(path.length) : directory));
    await focusNode(next);
  }

  function navigate(event: KeyboardEvent, node: FileTreeNode) {
    if (event.key === "Tab") return;
    if (disabled) { event.preventDefault(); return; }
    const index = visible.findIndex(item => item.path === node.path);
    let next: FileTreeNode | undefined;
    switch (event.key) {
      case "ArrowDown": next = visible[Math.min(visible.length - 1, index + 1)]; break;
      case "ArrowUp": next = visible[Math.max(0, index - 1)]; break;
      case "Home": next = visible[0]; break;
      case "End": next = visible.at(-1); break;
      case "ArrowRight":
        if (node.kind === "directory") {
          if (expanded.has(node.path)) next = node.children[0];
          else toggle(node);
        }
        break;
      case "ArrowLeft":
        if (node.kind === "directory" && expanded.has(node.path)) toggle(node);
        else {
          const parent = ancestorDirectories(node.path).at(-1);
          next = visible.find(item => item.path === parent);
        }
        break;
      case "Enter": case " ": activate(node); break;
      default: {
        if ([...event.key].length !== 1 || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
        const now = performance.now();
        search = now - lastTypedAt > 700 ? event.key : search + event.key;
        lastTypedAt = now;
        const letters = [...search.toLocaleLowerCase()];
        const prefix = letters.every(letter => letter === letters[0]) ? letters[0]! : letters.join("");
        const afterCurrent = [...visible.slice(index + 1), ...visible.slice(0, index + 1)];
        next = afterCurrent.find(item => item.name.toLocaleLowerCase().startsWith(prefix));
      }
    }
    event.preventDefault();
    if (next) void focusNode(next.path);
  }

  // History replay may restore a collapsed ancestor of the selected file.
  // Apply it before automatic selection reveal without remounting the tree.
  $effect.pre(() => {
    const epoch = restoreEpoch;
    if (epoch === lastRestoreEpoch) return;
    lastRestoreEpoch = epoch;
    untrack(() => {
      previousSelection = selectedPath;
      expanded = new Set(initialState?.expandedDirectories ?? []);
      focusedPath = initialState?.treeFocus ?? "";
    });
  });

  $effect(() => {
    const directories = [...expanded], focused = focusedPath;
    untrack(() => onstate?.(directories, focused));
  });

  // Reveal a newly selected file once. A subsequent manual collapse stays collapsed.
  $effect.pre(() => {
    const path = selectedPath;
    untrack(() => {
      if (path === previousSelection) return;
      previousSelection = path;
      if (!path) return;
      expanded = new Set([...expanded, ...ancestorDirectories(path)]);
    });
  });

  // Keep one visible tab stop, restoring actual focus only when it was already here.
  $effect.pre(() => {
    const rows = visible;
    const current = focusedPath;
    if (rows.some(item => item.path === current)) return;
    const ancestors = ancestorDirectories(current).reverse();
    const initiallySelected = current ? undefined : rows.find(item => item.path === selectedPath);
    const replacement = ancestors.find(path => rows.some(item => item.path === path))
      ?? initiallySelected?.path ?? rows[0]?.path ?? "";
    const hadFocus = tree?.contains(tree.ownerDocument.activeElement);
    focusedPath = replacement;
    if (hadFocus && replacement) void focusNode(replacement);
  });
</script>

<div class="file-tree" role="tree" aria-label="Repository files" aria-disabled={disabled} bind:this={tree}>
  {#each presentationNodes as node, index (node.path)}
    <FileTreeItem {node} {showIcons} {expanded} {focusedPath} {selectedPath} {disabled} {dragDisabled} {dropDirectory} {previewPath}
      last={index === presentationNodes.length - 1}
      route={routeIndex < 0 || index > routeIndex ? undefined : index === routeIndex ? "to" : "through"}
      dragPath={drag?.path ?? ""} {register}
      level={1} position={index + 1 - Number(previewIndex >= 0 && index > previewIndex)} count={nodes.length}
      onactivate={activate} onkeydown={navigate} onfocus={path => { focusedPath = path; }}
      onrename={rename} {ondelete} {oncreate} />
  {/each}
</div>
{#if moveError}<p class="move-error" role="alert">{moveError}</p>{/if}
<span class="move-announcement" role="status">{moveAnnouncement}</span>

<style>
  .file-tree { --tree-row-height: calc(1.03125rem + 12px); --tree-row-pitch: calc(var(--tree-row-height) + 2px); position: relative; min-width: 0; width: 100%; color: var(--color-foreground); }
  .file-tree:not(:empty)::before { content: ""; position: absolute; z-index: 1; left: calc(0.5rem - 0.5px); top: -7px; height: 7px; width: 1px; background: var(--color-tree-guide); pointer-events: none; }
  :global([data-file-drop-root]) { background-color: var(--color-drop-background); border-radius: 4px; }
  .move-error { padding: 6px 8px; margin: 8px 0 0; border-radius: 4px; overflow-wrap: anywhere;
    background: var(--color-error-background); color: var(--color-error-foreground); font-size: 0.6875rem; }
  .move-announcement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>

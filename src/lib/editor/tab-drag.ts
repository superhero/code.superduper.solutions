// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

export interface TabDragOptions {
  pane: string;
  repository: string;
  disabled: boolean;
  paths?: readonly string[];
  /** The insertion slot is measured before removing the source tab. */
  ondrop(fromPane: string, toPane: string, file: string, index: number): void;
}

interface DraggedTab {
  token: string;
  pane: string;
  repository: string;
  file: string;
  source: HTMLElement;
  strip: HTMLElement;
  preview?: HTMLElement;
  offset?: { x:number; y:number };
}

const mime = "application/x-code-editor-tab";
const targets = new Set<() => void>();
let dragging: DraggedTab | undefined;

function cancelDrag(expected?: DraggedTab) {
  if (expected && dragging !== expected) return;
  dragging?.preview?.remove();
  dragging = undefined;
  document.documentElement.removeAttribute("data-tab-dragging");
  for (const clear of targets) clear();
}

function sourceExists(source: DraggedTab): boolean {
  return source.strip.isConnected && source.source.isConnected &&
    source.source.parentElement === source.strip && source.source.dataset.tabPath === source.file;
}

/** Native tab dragging stays local to this application and never imports files. */
export function tabDrag(node: HTMLElement, initial: TabDragOptions) {
  let options = initial;
  let marker: HTMLDivElement | undefined;
  let pointer: { x: number; y: number } | undefined;
  let frame: number | undefined;
  let lastFrame = 0;
  let blockedStart = false;
  let destroyed = false;
  const managed = new Set<HTMLElement>();

  const tabs = () => Array.from(node.querySelectorAll<HTMLElement>(":scope > .file-tab[data-tab-path]"));

  function clearTarget() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    lastFrame = 0;
    pointer = undefined;
    marker?.remove();
    marker = undefined;
  }
  targets.add(clearTarget);

  function refreshTabs() {
    const children = tabs();
    for (const child of managed) {
      if (!children.includes(child) || options.disabled) {
        child.removeAttribute("draggable");
        managed.delete(child);
      }
    }
    if (!options.disabled) {
      for (const child of children) {
        if (child.getAttribute("draggable") !== "true") child.draggable = true;
        managed.add(child);
      }
    }
    if (dragging?.strip === node && (!sourceExists(dragging) || options.disabled)) cancelDrag(dragging);
  }

  function compatible(event: DragEvent): DraggedTab | undefined {
    const source = dragging;
    if (!source) return;
    if (!sourceExists(source)) {
      cancelDrag(source);
      return;
    }
    if (options.disabled || source.repository !== options.repository ||
      !event.dataTransfer || !Array.from(event.dataTransfer.types).includes(mime)) return;
    return source;
  }

  function insertion(x: number) {
    const children = tabs();
    for (let index = 0; index < children.length; index++) {
      const bounds = children[index]!.getBoundingClientRect();
      if (x < bounds.left + bounds.width / 2) return { index, x: bounds.left };
    }
    const last = children.at(-1)?.getBoundingClientRect();
    return { index: children.length, x: last?.right ?? node.getBoundingClientRect().left };
  }

  function showIndicator() {
    if (!pointer) return;
    const bounds = node.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0 || bounds.bottom <= 0 || bounds.top >= innerHeight) {
      clearTarget();
      return;
    }
    if (!marker) {
      marker = document.createElement("div");
      marker.dataset.tabDropIndicator = "";
      marker.setAttribute("aria-hidden", "true");
      Object.assign(marker.style, {
        position: "fixed", pointerEvents: "none", zIndex: "1000", width: "2px",
        background: "var(--color-accent)", border: "0", outline: "0", borderRadius: "0",
      });
      marker.style.setProperty("--color-accent", getComputedStyle(node).getPropertyValue("--color-accent"));
      document.body.append(marker);
    }
    const slot = insertion(pointer.x);
    const left = Math.max(0, bounds.left);
    const right = Math.min(innerWidth, bounds.right);
    marker.style.left = `${Math.max(left, Math.min(right - 2, slot.x - 1))}px`;
    marker.style.top = `${bounds.top + 2}px`;
    marker.style.height = `${Math.max(0, bounds.height - 4)}px`;
    marker.dataset.paneId = options.pane;
    marker.dataset.dropIndex = String(slot.index);
  }

  function scrollVelocity() {
    if (!pointer || node.scrollWidth <= node.clientWidth) return 0;
    const bounds = node.getBoundingClientRect();
    const edge = Math.min(28, bounds.width / 3);
    const fromLeft = pointer.x - bounds.left;
    const fromRight = bounds.right - pointer.x;
    if (fromLeft < edge && node.scrollLeft > 0) return -0.72 * Math.min(1, Math.max(0, 1 - fromLeft / edge));
    if (fromRight < edge && node.scrollLeft < node.scrollWidth - node.clientWidth) {
      return 0.72 * Math.min(1, Math.max(0, 1 - fromRight / edge));
    }
    return 0;
  }

  function scrollFrame(time: number) {
    frame = undefined;
    if (!pointer || !dragging || !sourceExists(dragging) || options.disabled) {
      if (dragging && !sourceExists(dragging)) cancelDrag(dragging);
      clearTarget();
      return;
    }
    const velocity = scrollVelocity();
    const elapsed = lastFrame ? Math.min(32, Math.max(0, time - lastFrame)) : 16;
    lastFrame = time;
    if (velocity) {
      node.scrollLeft += velocity * elapsed;
      showIndicator();
      if (pointer && scrollVelocity()) frame = requestAnimationFrame(scrollFrame);
    }
    if (frame === undefined) lastFrame = 0;
  }

  function aim(event: DragEvent) {
    for (const clear of targets) if (clear !== clearTarget) clear();
    pointer = { x: event.clientX, y: event.clientY };
    showIndicator();
    if (frame === undefined && scrollVelocity()) frame = requestAnimationFrame(scrollFrame);
  }

  function pointerDown(event: PointerEvent) {
    blockedStart = event.target instanceof Element && !!event.target.closest(".file-tab-close");
  }

  function pointerUp() { blockedStart = false; }

  function dragStart(event: DragEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const child = target?.closest<HTMLElement>(".file-tab[data-tab-path]");
    if (!child || child.parentElement !== node) return;
    if (blockedStart || target?.closest(".file-tab-close") || options.disabled || event.defaultPrevented || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    const file = child.dataset.tabPath;
    if (!file) { event.preventDefault(); return; }
    cancelDrag();
    const source: DraggedTab = {
      token: crypto.randomUUID(), pane: options.pane, repository: options.repository,
      file, source: child, strip: node,
    };
    try {
      event.dataTransfer.setData(mime, source.token);
      event.dataTransfer.setData("text/plain", file);
      event.dataTransfer.effectAllowed = "move";
      // Render the held tab ourselves: native drag-image opacity is controlled
      // by browser/platform compositing and can ignore element opacity.
      const preview = child.cloneNode(true) as HTMLElement;
      const originals = [child, ...child.querySelectorAll<HTMLElement>("*")];
      const copies = [preview, ...preview.querySelectorAll<HTMLElement>("*")];
      originals.forEach((original, index) => {
        const copy = copies[index]!, style = getComputedStyle(original);
        for (const property of style) copy.style.setProperty(property, style.getPropertyValue(property));
        for (const attribute of ["id", "data-tab-path", "data-file-context-target", "draggable"]) copy.removeAttribute(attribute);
      });
      const bounds = child.getBoundingClientRect();
      Object.assign(preview.style, {
        position: "fixed", left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`,
        margin: "0", opacity: "0.75", pointerEvents: "none", zIndex: "1000", transform: "none",
        // Inactive tabs have a translucent fill. The preview needs an opaque
        // backing so its opacity alone controls how much shows through.
        backgroundColor: getComputedStyle(child).getPropertyValue("--color-background"),
      });
      preview.dataset.tabDragPreview = "";
      preview.inert = true;
      preview.setAttribute("aria-hidden", "true");
      document.body.append(preview);
      source.preview = preview;
      source.offset = { x:Math.max(0,Math.min(bounds.width,event.clientX-bounds.left)),
        y:Math.max(0,Math.min(bounds.height,event.clientY-bounds.top)) };
      const transparent = document.createElement("canvas");
      transparent.width = transparent.height = 1;
      event.dataTransfer.setDragImage(transparent, 0, 0);
      dragging = source;
      document.documentElement.setAttribute("data-tab-dragging", "");
      // A later listener may cancel the native drag after this action runs.
      queueMicrotask(() => { if (event.defaultPrevented || !sourceExists(source)) cancelDrag(source); });
    } catch {
      event.preventDefault();
      cancelDrag();
    }
  }

  function dragOver(event: DragEvent) {
    if (!compatible(event)) { clearTarget(); return; }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer!.dropEffect = "move";
    aim(event);
  }

  function dragLeave(event: DragEvent) {
    if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
    const bounds = node.getBoundingClientRect();
    if (event.clientX >= bounds.left && event.clientX < bounds.right &&
      event.clientY >= bounds.top && event.clientY < bounds.bottom) return;
    clearTarget();
  }

  function drop(event: DragEvent) {
    const source = compatible(event);
    if (!source || event.dataTransfer!.getData(mime) !== source.token) { clearTarget(); return; }
    event.preventDefault();
    event.stopPropagation();
    const index = insertion(event.clientX).index;
    cancelDrag(source);
    options.ondrop(source.pane, options.pane, source.file, index);
  }

  function outsideOver(event: DragEvent) {
    if(dragging?.strip===node&&dragging.preview&&dragging.offset){
      Object.assign(dragging.preview.style,{visibility:"visible",
        left:`${event.clientX-dragging.offset.x}px`,top:`${event.clientY-dragging.offset.y}px`});
    }
    if (event.target instanceof Node && !node.contains(event.target)) clearTarget();
  }

  function endDrag() { cancelDrag(); blockedStart = false; }
  function keyDown(event: KeyboardEvent) { if (event.key === "Escape") endDrag(); }
  // Native drags briefly blur Brave/Chromium on Linux. Hide the old marker,
  // but keep the drag identity so its eventual drop is still accepted.
  function blurTarget() { clearTarget(); if(dragging?.strip===node&&dragging.preview)dragging.preview.style.visibility="hidden"; }

  node.addEventListener("pointerdown", pointerDown, true);
  node.addEventListener("dragstart", dragStart);
  node.addEventListener("dragenter", dragOver);
  node.addEventListener("dragover", dragOver);
  node.addEventListener("dragleave", dragLeave);
  node.addEventListener("drop", drop);
  document.addEventListener("dragover", outsideOver, true);
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("dragend", endDrag);
  window.addEventListener("drop", endDrag);
  window.addEventListener("keydown", keyDown, true);
  window.addEventListener("blur", blurTarget);
  const observer = new MutationObserver(() => {
    if (destroyed) return;
    refreshTabs();
    if (pointer) showIndicator();
  });
  observer.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tab-path"] });
  refreshTabs();

  return {
    update(next: TabDragOptions) {
      const identityChanged = next.pane !== options.pane || next.repository !== options.repository;
      if (identityChanged || next.disabled) {
        if (dragging?.strip === node) cancelDrag(dragging);
        clearTarget();
      }
      options = next;
      refreshTabs();
      if (pointer) showIndicator();
    },
    destroy() {
      destroyed = true;
      observer.disconnect();
      if (dragging?.strip === node) cancelDrag(dragging);
      clearTarget();
      targets.delete(clearTarget);
      for (const child of managed) child.removeAttribute("draggable");
      managed.clear();
      node.removeEventListener("pointerdown", pointerDown, true);
      node.removeEventListener("dragstart", dragStart);
      node.removeEventListener("dragenter", dragOver);
      node.removeEventListener("dragover", dragOver);
      node.removeEventListener("dragleave", dragLeave);
      node.removeEventListener("drop", drop);
      document.removeEventListener("dragover", outsideOver, true);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("dragend", endDrag);
      window.removeEventListener("drop", endDrag);
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("blur", blurTarget);
    },
  };
}

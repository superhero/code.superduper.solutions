// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

export interface MessageHeight { width: number; height: number }

/** One observer for mounted replies; their natural content remains free to reflow. */
export function createMessageHeightTracker(onLayout?: () => void) {
  const targets = new Map<Element, { container: HTMLElement; size: MessageHeight }>();
  const pending = new Map<HTMLElement, { height: number; reflow: boolean }>();
  let observer: ResizeObserver | undefined;
  let frame = 0;
  function apply() {
    frame = 0;
    for (const [container, change] of pending) {
      container.toggleAttribute('data-height-reflow', change.reflow);
      container.style.blockSize = `${change.height}px`;
    }
    pending.clear();
  }
  function resized(entries: ResizeObserverEntry[]) {
    let layoutChanged = false;
    for (const entry of entries) {
      const target = targets.get(entry.target);
      if (!target) continue;
      if (entry.target === target.container) { layoutChanged = true; continue; }
      const width = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width;
      const naturalHeight = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
      if (!width) continue;
      const { container, size } = target;
      const reflow = size.width > 0 && size.width !== width;
      const height = size.width === width ? Math.max(size.height, naturalHeight) : naturalHeight;
      size.width = width; size.height = height;
      if (reflow || container.style.blockSize !== `${height}px`) pending.set(container, {
        height, reflow: reflow || pending.get(container)?.reflow || false,
      });
    }
    // Apply targets before the next layout, outside observer delivery. Observing
    // the animated container then keeps scroll-follow in step without a loop.
    if (pending.size && !frame) frame = requestAnimationFrame(apply);
    if (layoutChanged) onLayout?.();
  }
  function retain(container: HTMLElement, size: MessageHeight | undefined) {
    const content = container.firstElementChild;
    if (!size || !content) return;
    // Restore reserved space before the transcript restores its scroll position.
    // New replies slide open from zero; restored replies start at their saved size.
    container.style.blockSize = `${size.height}px`;
    targets.set(content, { container, size });
    targets.set(container, { container, size });
    observer ??= new ResizeObserver(resized);
    observer.observe(content, { box: 'border-box' });
    observer.observe(container, { box: 'border-box' });
    return { destroy() {
      observer?.unobserve(content); observer?.unobserve(container);
      targets.delete(content); targets.delete(container); pending.delete(container);
      if (!targets.size) {
        observer?.disconnect(); observer = undefined;
        if (frame) cancelAnimationFrame(frame); frame = 0;
      }
    } };
  }
  return { retain, destroy() {
    observer?.disconnect(); observer = undefined; targets.clear(); pending.clear();
    if (frame) cancelAnimationFrame(frame); frame = 0;
  } };
}

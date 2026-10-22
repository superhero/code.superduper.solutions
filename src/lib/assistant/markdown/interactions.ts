// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { externalLink } from './resources.ts';

/** One delegated listener per message, with disclosure state retained over streaming. */
export function markdownInteractions(root: HTMLElement, _blocks: readonly string[]) {
  const tabs = new Map<string, number>(), spoilers = new Set<number>();
  let disposed = false;
  const group = (element: HTMLElement) => element.dataset.chatTabGroup || element.dataset.chatTabs!;
  function select(container: HTMLElement, index: number, focus = false): void {
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-chat-tab]')].filter(button => button.closest('[data-chat-tabs]') === container);
    if (!buttons[index]) return;
    tabs.set(group(container), index);
    for (const [position, button] of buttons.entries()) {
      button.setAttribute('aria-selected', String(position === index)); button.tabIndex = position === index ? 0 : -1;
      const panel = root.querySelector<HTMLElement>(`[id="${button.getAttribute('aria-controls')}"]`);
      if (panel) panel.hidden = position !== index;
    }
    if (focus) buttons[index]!.focus({ preventScroll: true });
  }
  function refresh(): void {
    if (disposed) return;
    for (const container of root.querySelectorAll<HTMLElement>('[data-chat-tabs]')) {
      const index = tabs.get(group(container)); if (index !== undefined) select(container, index);
    }
    [...root.querySelectorAll<HTMLElement>('.spoiler')].forEach((item, index) => item.setAttribute('aria-expanded', String(spoilers.has(index))));
  }
  function selectGroup(container: HTMLElement, index: number, focus = false): void {
    select(container, index, focus);
    for (const other of root.querySelectorAll<HTMLElement>('[data-chat-tabs]')) if (other !== container && group(other) === group(container)) select(other, index);
  }
  function reveal(element: HTMLElement): void {
    const index = [...root.querySelectorAll('.spoiler')].indexOf(element), expanded = element.getAttribute('aria-expanded') !== 'true';
    if (expanded) spoilers.add(index); else spoilers.delete(index);
    element.setAttribute('aria-expanded', String(expanded));
  }
  function load(button: HTMLButtonElement): void {
    const source = externalLink(button.dataset.source ?? '');
    if (!source || !/^https?:/.test(source)) return;
    const kind = button.dataset.chatResource;
    const node = document.createElement(kind === 'embed' ? 'iframe' : kind === 'image' ? 'img' : kind === 'video' ? 'video' : 'audio');
    node.setAttribute('referrerpolicy', 'no-referrer'); node.className = 'chat-resource-content';
    if (node instanceof HTMLIFrameElement) {
      node.sandbox.add('allow-scripts', 'allow-presentation'); node.loading = 'lazy'; node.title = button.parentElement?.querySelector('a')?.textContent || 'Embedded content';
    } else if (node instanceof HTMLImageElement) {
      node.loading = 'lazy'; node.alt = button.parentElement?.querySelector('a')?.textContent || 'Image';
    } else if (node instanceof HTMLMediaElement) { node.controls = true; node.preload = 'none'; }
    for (const dimension of ['width', 'height'] as const) {
      const size = button.dataset[dimension] ?? '', value = Number.parseFloat(size);
      if (Number.isFinite(value) && value > 0 && /^\d+%?$/.test(size)) {
        if (size.endsWith('%')) node.style[dimension] = `${Math.min(100, value)}%`;
        else { node.setAttribute(dimension, String(Math.min(4096, value))); node.style[dimension] = `${Math.min(4096, value)}px`; }
      }
    }
    node.setAttribute('src', source);
    node.addEventListener('error', () => { button.hidden = false; node.remove(); button.textContent = 'Retry preview'; }, { once: true });
    button.hidden = true; button.after(node);
  }
  function click(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>('[data-chat-tab]');
    if (button) {
      const container = button.closest<HTMLElement>('[data-chat-tabs]')!, index = Number(button.dataset.chatTab);
      selectGroup(container, index);
      return;
    }
    const spoiler = target?.closest<HTMLElement>('.spoiler'); if (spoiler && !target?.closest('a,button')) { reveal(spoiler); return; }
    const preview = target?.closest<HTMLButtonElement>('[data-chat-resource]'); if (preview) { load(preview); return; }
    const link = target?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (link) {
      event.preventDefault();
      const id = link.getAttribute('href')!.slice(1), destination = [...root.querySelectorAll<HTMLElement>('[id]')].find(item => item.id === id);
      destination?.scrollIntoView({ block: 'nearest' }); if (destination) { destination.tabIndex = -1; destination.focus({ preventScroll: true }); }
    }
  }
  function keydown(event: KeyboardEvent): void {
    const element = event.target instanceof HTMLElement ? event.target : null;
    if (element?.matches('.spoiler') && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); reveal(element); }
    if (!element?.matches('[data-chat-tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const container = element.closest<HTMLElement>('[data-chat-tabs]')!, count = [...container.querySelectorAll('[data-chat-tab]')].filter(button => button.closest('[data-chat-tabs]') === container).length;
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (Number(element.dataset.chatTab) + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
    selectGroup(container, index, true);
  }
  root.addEventListener('click', click); root.addEventListener('keydown', keydown); refresh();
  return { update() { queueMicrotask(refresh); }, destroy() { disposed = true; root.removeEventListener('click', click); root.removeEventListener('keydown', keydown); } };
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Token } from 'markdown-it';

export function externalLink(value: string | number | null): string | undefined {
  if (typeof value !== 'string' || !value) return;
  try {
    const url = new URL(value);
    if ((['https:', 'http:'].includes(url.protocol) && url.hostname && !url.username && !url.password)
      || (url.protocol === 'mailto:' && url.pathname)) return url.href;
  } catch { /* Repository paths are handled by the local document adapter. */ }
}

export function plainText(tokens: Token[]): string {
  return tokens.map(token => token.type === 'image' ? plainText(token.children ?? [])
    : ['softbreak', 'hardbreak'].includes(token.type) ? '\n' : token.nesting === 0 ? token.content : '').join('');
}

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export type MarkdownResource = 'image' | 'video' | 'audio' | 'embed';

/** Rendering never starts an external request. The reader activates previews. */
export function resourcePreview(kind: MarkdownResource, source: string, label: string, attributes: Record<string, string | number> = {}): string {
  const href = externalLink(source);
  if (!href || href.startsWith('mailto:')) return escapeHtml(label);
  const mode = attributes['data-mode'];
  const extra = ['width', 'height', 'loading'].map(name => attributes[name]
    ? ` data-${name}="${escapeHtml(String(attributes[name]))}"` : '').join('');
  return `<span class="chat-resource"${mode ? ` data-mode="${escapeHtml(String(mode))}"` : ''}>`
    + `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="chat-image-link">${escapeHtml(label)}</a>`
    + `<button type="button" class="chat-resource-load" data-chat-resource="${kind}" data-source="${escapeHtml(href)}"${extra}>Load ${kind === 'embed' ? 'preview' : kind}</button></span>`;
}

export function renderIcon(content: string): string {
  const [name = '', ...options] = content.trim().split(/\s+/);
  if (!/^[a-z][a-z0-9_-]{0,79}$/i.test(name)) return escapeHtml(content);
  const size = options.find(value => /^=\d+(?:\.\d+)?(?:px|em|rem)?$/.test(value))?.slice(1);
  const color = options.find(value => /^\/(?:#[a-f\d]{3,8}|[a-z]+)$/i.test(value))?.slice(1);
  const styles: string[] = [];
  if (size) { const amount = Number.parseFloat(size), unit = size.match(/[a-z]+$/)?.[0] ?? 'px'; styles.push(`font-size:${Math.min(unit === 'px' ? 96 : 6, amount)}${unit}`); }
  if (color) styles.push(`color:${color}`);
  return `<span class="material-symbols-rounded chat-icon" role="img" aria-label="${escapeHtml(name)}"${styles.length ? ` style="${styles.join(';')}"` : ''}>${escapeHtml(name.replaceAll('-', '_'))}</span>`;
}

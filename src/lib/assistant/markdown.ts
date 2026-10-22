// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import MarkdownIt, { type Token } from 'markdown-it';
import { configureMarkdownPlugins } from './markdown/plugins.ts';
import { externalLink, plainText, resourcePreview } from './markdown/resources.ts';
import type { MarkdownEnvironment } from './markdown/types.ts';

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true });
markdown.renderer.rules.chat_plain_link_open = markdown.renderer.rules.chat_plain_link_close = () => '';
// Install the inert image renderer before plugins wrap it with size/lazy metadata.
markdown.renderer.rules.image = (tokens, index) => {
  const token = tokens[index]!;
  return resourcePreview('image', String(token.attrGet('src') ?? ''), plainText(token.children ?? []) || 'Image', Object.fromEntries(token.attrs ?? []));
};
configureMarkdownPlugins(markdown, (source, env) => {
  const tokens = markdown.parseInline(source, env)[0]?.children ?? [];
  // Tab/summary labels retain formatting without nesting controls in controls.
  for (const token of tokens) {
    if (token.type === 'image' || token.type === 'footnote_ref') {
      token.type = 'text'; token.tag = ''; token.content = plainText(token.children ?? []) || 'Note'; token.children = null;
    } else if (token.type === 'link_open' || token.type === 'link_close') token.type = `chat_plain_${token.type}`;
    else if (token.type.startsWith('spoiler_')) token.attrs = null;
  }
  prepare(tokens, env.docId);
  return markdown.renderer.renderInline(tokens, markdown.options, env);
});
// Diagram renderers also create image tokens. They obey the same opt-in policy.
const renderToken = markdown.renderer.renderToken.bind(markdown.renderer);
markdown.renderer.renderToken = (tokens, index, options) => tokens[index]!.tag === 'img'
  ? resourcePreview('image', String(tokens[index]!.attrGet('src') ?? ''), String(tokens[index]!.attrGet('alt') ?? 'Diagram'), Object.fromEntries(tokens[index]!.attrs ?? []))
  : renderToken(tokens, index, options);

const safeClasses = new Set(['task-list-item', 'task-list-container', 'task-list-item-checkbox', 'demo-content', 'footnote-ref', 'footnotes', 'footnote-item', 'footnote-anchor', 'spoiler', 'span-all']);
function scopedClass(value: string): string {
  return value.split(/\s+/).filter(Boolean).map(name => safeClasses.has(name) || /^(?:chat-|language-|markdown-alert|field-|fields-|footnotes-)/.test(name) ? name : `md-${name.replace(/[^a-zA-Z0-9_-]/g, '')}`).join(' ');
}
function safeStyle(value: string): string {
  return value.split(';').filter(declaration => /^(?:color|background-color|text-align|font-weight|font-style|text-decoration|font-size|width|height|max-width|max-height|gap|row-gap|column-gap|display|flex(?:-\w+)?|grid(?:-\w+)?|align-(?:items|content|self)|justify-(?:items|content|self)|padding(?:-\w+)?|margin(?:-\w+)?|columns|column-(?:count|width|span))\s*:\s*[a-zA-Z0-9#%., ()-]{1,120}$/.test(declaration.trim())
    && !/url|expression|var\(|calc\(|fixed|absolute|sticky|hidden|none|-[1-9]/i.test(declaration)).join(';');
}
function prepare(tokens: Token[], id: string): void {
  const links: boolean[] = [];
  for (const token of tokens) {
    if (token.type === 'link_open') {
      const original = String(token.attrGet('href') ?? '');
      let fragment = original.slice(1);
      if (original.startsWith('#')) { try { fragment = decodeURIComponent(fragment); } catch { /* Keep malformed fragments readable and local. */ } }
      const href = original.startsWith('#') ? `#${fragment.startsWith(id + '-') ? fragment : `${id}-${fragment}`}` : externalLink(original); links.push(Boolean(href));
      if (href) { token.attrSet('href', href); if (!href.startsWith('#')) { token.attrSet('target', '_blank'); token.attrSet('rel', 'noopener noreferrer'); } }
      else token.type = 'chat_plain_link_open';
    } else if (token.type === 'link_close' && !links.pop()) token.type = 'chat_plain_link_close';
    if (token.attrGet('id') && !String(token.attrGet('id')).startsWith(id + '-')) token.attrSet('id', `${id}-${token.attrGet('id')}`);
    if (token.attrGet('class')) token.attrSet('class', scopedClass(String(token.attrGet('class'))));
    if (token.attrGet('style')) token.attrSet('style', safeStyle(String(token.attrGet('style'))));
    if (token.type.startsWith('layout_') && token.meta) {
      if (Array.isArray(token.meta.classes)) token.meta.classes = token.meta.classes.map((name: string) => scopedClass(name));
      if (token.meta.id && !String(token.meta.id).startsWith(id + '-')) token.meta.id = `${id}-${token.meta.id}`;
    }
    if (token.children) prepare(token.children, id);
  }
}

const renderTokens = markdown.renderer.render.bind(markdown.renderer);
// Render through markdown.render so plugins finish their per-document cleanup,
// including KaTeX macro isolation, while retaining stable Markdown block boundaries.
markdown.renderer.render = (tokens, options, environment) => {
  if (!Array.isArray(environment?.blocks)) return renderTokens(tokens, options, environment);
  const { docId, blocks, hideGeneratedFooter } = environment as MarkdownEnvironment;
  // A model-written trailing date is not application metadata. Suppress only
  // this standalone footer after a rule, leaving quoted/code/user content intact.
  const end = tokens.length, footer = tokens[end - 2];
  if (hideGeneratedFooter && tokens[end - 4]?.type === 'hr' && tokens[end - 4]?.level === 0
    && tokens[end - 3]?.type === 'paragraph_open' && footer?.type === 'inline' && tokens[end - 1]?.type === 'paragraph_close'
    && footer.children?.every(token => ['text', 'em_open', 'em_close', 'strong_open', 'strong_close'].includes(token.type))
    && /^Generated on\s+\d{4}-\d{2}-\d{2}[.!]?$/i.test(plainText(footer.children).trim())) tokens = tokens.slice(0, end - 4);
  prepare(tokens, docId);
  let start = 0;
  for (let index = 0; index < tokens.length; index++) if (tokens[index]!.level === 0 && tokens[index]!.nesting !== 1) {
    blocks.push(renderTokens(tokens.slice(start, index + 1), options, environment)); start = index + 1;
  }
  if (start < tokens.length) blocks.push(renderTokens(tokens.slice(start), options, environment));
  return blocks.join('');
};
/** Split at Markdown block boundaries so streaming preserves unchanged DOM blocks. */
export function renderChatMarkdown(text: string, messageId: string, hideGeneratedFooter = false, mathjax?: (source: string) => string, streaming = false): string[] {
  const environment: MarkdownEnvironment = { docId: messageId.replace(/[^a-zA-Z0-9_-]/g, '') || 'message', blocks: [], hideGeneratedFooter, tabSequence: 0, chatTabs: [], containerTags: [], source: text, streaming, usedIds: new Set() };
  if (mathjax) environment.mathjax = mathjax;
  markdown.render(text, environment);
  return environment.blocks;
}

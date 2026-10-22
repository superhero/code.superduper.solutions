// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { MarkdownIt, Token } from 'markdown-it';
import { slug } from 'github-slugger';
import { abbr } from '@mdit/plugin-abbr';
import { advancedLinks } from '@mdit/plugin-advanced-links';
import { alert } from '@mdit/plugin-alert';
import { align } from '@mdit/plugin-align';
import { anchor } from '@mdit/plugin-anchor';
import { attrs } from '@mdit/plugin-attrs';
import { container } from '@mdit/plugin-container';
import { demo } from '@mdit/plugin-demo';
import { dl } from '@mdit/plugin-dl';
import { embed } from '@mdit/plugin-embed';
import { fullEmoji } from '@mdit/plugin-emoji';
import { field } from '@mdit/plugin-field';
import { figure } from '@mdit/plugin-figure';
import { footnote } from '@mdit/plugin-footnote';
import { icon } from '@mdit/plugin-icon';
import { imgLazyload } from '@mdit/plugin-img-lazyload';
import { imgMark } from '@mdit/plugin-img-mark';
import { imgSize, obsidianImgSize, legacyImgSize } from '@mdit/plugin-img-size';
import { ins } from '@mdit/plugin-ins';
import { katex } from '@mdit/plugin-katex';
import '@mdit/plugin-katex/mhchem';
import { layout } from '@mdit/plugin-layout';
import { mark } from '@mdit/plugin-mark';
import { plantuml } from '@mdit/plugin-plantuml';
import { ruby } from '@mdit/plugin-ruby';
import { spoiler } from '@mdit/plugin-spoiler';
import { stylize } from '@mdit/plugin-stylize';
import { sub } from '@mdit/plugin-sub';
import { sup } from '@mdit/plugin-sup';
import { tab, type MarkdownItTabInfo } from '@mdit/plugin-tab';
import { tasklist } from '@mdit/plugin-tasklist';
import { uml } from '@mdit/plugin-uml';
import type { MarkdownEnvironment } from './types.ts';
import { escapeHtml, plainText, renderIcon, resourcePreview, type MarkdownResource } from './resources.ts';

const reservedContainers = new Set(['left', 'center', 'right', 'justify', 'tabs', 'code-tabs', 'fields', 'demo']);

function tabs(md: MarkdownIt, name: string, renderTitle: (source: string, env: MarkdownEnvironment) => string): void {
  tab(md, {
    name,
    openRenderer(info: MarkdownItTabInfo, tokens: Token[], index: number, _options, env) {
      const context = env as MarkdownEnvironment;
      let id: string;
      do { id = `${context.docId}-tabs-${context.tabSequence++}`; } while (context.usedIds.has(id) || info.data.some((_, index) => context.usedIds.has(`${id}-tab-${index}`) || context.usedIds.has(`${id}-panel-${index}`)));
      context.usedIds.add(id);
      info.data.forEach((_, index) => { context.usedIds.add(`${id}-tab-${index}`); context.usedIds.add(`${id}-panel-${index}`); });
      const active = info.active < 0 ? 0 : info.active;
      const buttons = info.data.map((entry, position) => {
        const selected = position === active;
        // Parse titles with this document's environment, preserving isolation.
        const title = renderTitle(entry.title, context);
        return `<button type="button" role="tab" id="${id}-tab-${position}" aria-controls="${id}-panel-${position}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}" data-chat-tab="${position}">${title}</button>`;
      }).join('');
      (context.chatTabs ??= []).push({ id, active });
      return `<div class="chat-tabs" data-chat-tabs="${id}"${info.id ? ` data-chat-tab-group="${escapeHtml(info.id)}"` : ''}><div class="chat-tab-list" role="tablist">${buttons}</div>`;
    },
    closeRenderer(_tokens, _index, _options, env) {
      (env as MarkdownEnvironment).chatTabs.pop();
      return '</div>';
    },
    tabOpenRenderer(info, _tokens, _index, _options, env) {
      const context = env as MarkdownEnvironment;
      const current = context.chatTabs.at(-1)!;
      return `<div class="chat-tab-panel" role="tabpanel" id="${current.id}-panel-${info.index}" aria-labelledby="${current.id}-tab-${info.index}" data-chat-panel="${info.index}"${info.index === current.active ? '' : ' hidden'}>`;
    },
    tabCloseRenderer: () => '</div>',
  });
}

/** Configure the browser-compatible catalog without changing core Markdown rules. */
export function configureMarkdownPlugins(md: MarkdownIt, renderTitle: (source: string, env: MarkdownEnvironment) => string): void {
  md.use(abbr).use(alert, { deep: true }).use(dl).use(fullEmoji).use(figure).use(footnote)
    .use(icon, { render: renderIcon }).use(legacyImgSize).use(imgSize).use(obsidianImgSize)
    .use(imgMark).use(imgLazyload).use(ins).use(mark).use(ruby)
    .use(spoiler, { attrs: () => [['class', 'spoiler'], ['tabindex', '0'], ['role', 'button'], ['aria-expanded', 'false']] })
    .use(sub).use(sup).use(tasklist, { disabled: true, label: false })
    .use(katex, { delimiters: 'all', mathFence: true, trust: false, throwOnError: false, errorColor: 'currentColor', maxExpand: 1000, maxSize: 10, logger: () => 'ignore' as const })
    .use(layout).use(align);
  field(md, { fieldOpenRenderer: meta => `<dt class="field-name" data-level="${meta.level}">${escapeHtml(meta.name)}</dt><dd class="field-content" data-level="${meta.level}">`
    + meta.attributes.map(attribute => `<span class="field-attr">${escapeHtml(attribute.name)}${attribute.value === true ? '' : `: ${escapeHtml(attribute.value)}`}</span>`).join('') });
  // Ruby and attrs both begin with braces. Attribute groups stay text until the
  // attrs core rule consumes them, including CSS values containing colons.
  md.inline.ruler.before('ruby', 'chat_attribute_literal', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 123) return false;
    const match = /^\{(?:[#.][\w-]+|[\w-]+=)[^{}\n]*\}/.exec(state.src.slice(state.pos, state.posMax));
    if (!match) return false;
    if (!silent) state.pending += match[0]; state.pos += match[0].length; return true;
  });
  demo(md, { openRenderer: (tokens, index, _options, env) => `<details class="chat-demo"><summary>${renderTitle(tokens[index]!.info, env as MarkdownEnvironment)}</summary>\n` });
  anchor(md, { slugifyWithState: (title, state) => `${state.env.docId}-${slug(title) || 'heading'}` });
  stylize(md, { config: ['Recommended', 'Deprecated', 'Experimental'].map(word => ({
      matcher: word,
      replacer: ({ tag }) => tag === 'em' ? { tag: 'span', attrs: { class: `chat-badge chat-badge-${word.toLowerCase()}` }, content: word } : null,
    })) });

  tabs(md, 'tabs', renderTitle); tabs(md, 'code-tabs', renderTitle);
  container(md, {
    name: 'chat',
    validate: params => {
      const name = params.trim().split(/\s/, 1)[0] ?? '';
      return /^[a-z][a-z0-9_-]{0,63}$/.test(name) && !reservedContainers.has(name);
    },
    openRenderer(tokens, index, _options, env) {
      const [name = '', ...title] = tokens[index]!.info.trim().split(/\s+/);
      const tag = name === 'details' ? 'details' : 'div';
      (env as MarkdownEnvironment).containerTags.push(tag);
      return `<${tag} class="chat-container" data-kind="${escapeHtml(name)}">`
        + (tag === 'details' ? `<summary>${escapeHtml(title.join(' ') || 'Details')}</summary>`
          : title.length ? `<p class="chat-container-title">${escapeHtml(title.join(' '))}</p>` : '');
    },
    closeRenderer: (_tokens, _index, _options, env) => `</${(env as MarkdownEnvironment).containerTags.pop() ?? 'div'}>`,
  });

  for (const kind of ['video', 'audio', 'image', 'embed'] as const) advancedLinks(md, {
    name: kind,
    renderer: (url, props) => resourcePreview(kind, url, String(props.title ?? props.caption ?? kind)),
  });
  advancedLinks(md, { name: 'badge', inline: true, renderer: (text, props) => `<span class="chat-badge">${escapeHtml(String(props.text ?? text))}</span>` });
  const resource = (name: string, kind: MarkdownResource = 'embed', resolve: (value: string) => string = value => value) => ({
    name, setup: (value: string) => resourcePreview(kind, resolve(value.trim()), name),
  });
  md.use(embed, { config: [
    resource('youtube', 'embed', value => /^[a-zA-Z0-9_-]{6,32}$/.test(value) ? `https://www.youtube-nocookie.com/embed/${value}` : ''),
    resource('vimeo', 'embed', value => /^\d{1,20}$/.test(value) ? `https://player.vimeo.com/video/${value}` : ''),
    resource('video', 'video'), resource('audio', 'audio'), resource('iframe'),
    { name: 'icon', allowInline: true, setup: renderIcon },
  ] });
  md.use(plantuml).use(plantuml, { type: 'fence', fence: 'plantuml' });
  uml(md, { name: 'literal_uml', open: 'starttext', close: 'endtext', renderer: (tokens, index) => `<pre><code>${escapeHtml(tokens[index]!.content)}</code></pre>` });
  md.use(attrs, {
    rule: ['fence', 'inline', 'table', 'list', 'heading', 'hr', 'softbreak', 'blockInfo', 'blockEnd', 'tasklist', 'dl'],
    allowed: ['id', 'class', 'title', 'lang', 'dir', 'style', 'width', 'height', 'colspan', 'rowspan', 'aria-label'],
  });
  md.core.ruler.before('attrs', 'chat_fence_highlights', state => {
    for (const token of state.tokens) {
      const match = token.type === 'fence' && /^([\w+-]+)\{(\d+(?:[,-]\d+)*)\}$/.exec(token.info.trim());
      if (match) { (token.meta ??= {}).chatHighlights = match[2]; token.info = match[1]!; }
    }
  });
  // Anchor's default rejects duplicate explicit IDs. Scope and de-duplicate all
  // document IDs first so partial or repeated model output remains renderable.
  md.core.ruler.before('anchor', 'chat_document_ids', state => {
    const context = state.env as MarkdownEnvironment;
    function visit(tokens: Token[]): void {
      for (const [index, token] of tokens.entries()) {
        const layout = token.type.startsWith('layout_') && typeof token.meta?.id === 'string';
        let value = token.attrGet('id') || (layout ? String(token.meta!.id) : null);
        if (!value && token.type === 'heading_open') value = slug(plainText(tokens[index + 1]?.children ?? [])) || 'heading';
        if (value) {
          const base = String(value).startsWith(context.docId + '-') ? String(value) : `${context.docId}-${value}`;
          let id = base, suffix = 1; while (context.usedIds.has(id)) id = `${base}-${suffix++}`;
          token.attrSet('id', id); context.usedIds.add(id);
          if (layout) token.meta!.id = id;
        }
        if (token.children) visit(token.children);
      }
    }
    visit(state.tokens);
  });
  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index]!;
    const context = env as MarkdownEnvironment;
    if (token.info.trim() === 'mathjax') {
      const closing = token.map && (context.sourceLines ??= context.source.split('\n'))[token.map[1] - 1];
      const closed = closing && new RegExp(`^[>\\s]*${token.markup[0]}{${token.markup.length},}\\s*$`).test(closing);
      return (!context.streaming || closed) && context.mathjax ? context.mathjax(token.content)
        : `<pre class="chat-math-pending"><code>${escapeHtml(token.content)}</code></pre>`;
    }
    if (typeof token.meta?.chatHighlights === 'string') {
      const ranges = token.meta.chatHighlights.split(',').map(value => value.split('-').map(Number));
      const content = token.content.split('\n').map((line, position) => ranges.some(([start, end = start]) => position + 1 >= start! && position + 1 <= end!)
        ? `<span class="chat-code-line-highlight">${escapeHtml(line)}</span>` : escapeHtml(line)).join('\n');
      return `<pre><code class="language-${escapeHtml(token.info.trim())}">${content}</code></pre>`;
    }
    return fence(tokens, index, options, env, self);
  };
}

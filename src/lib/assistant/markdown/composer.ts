// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { tags, Tag } from '@lezer/highlight';
import type { DelimiterType, InlineParser, MarkdownConfig } from '@lezer/markdown';

export const insertedTag = Tag.define(), spoilerTag = Tag.define(), mathTag = Tag.define(), rubyTag = Tag.define();
const delimiters: [string, string, Tag][] = [['==', 'Highlight', tags.special(tags.string)], ['++', 'Inserted', insertedTag], ['!!', 'Spoiler', spoilerTag]];
const inline: InlineParser[] = delimiters.map(([marker, name]) => {
  const delimiter: DelimiterType = { resolve: name, mark: 'MditMark' };
  return { name, before: 'Emphasis', parse(context, next, position) {
    if (next !== marker.charCodeAt(0) || context.char(position + 1) !== next) return -1;
    return context.addDelimiter(delimiter, position, position + 2,
      position + 2 < context.end && !/\s/.test(context.slice(position + 2, position + 3)),
      position > context.offset && !/\s/.test(context.slice(position - 1, position)));
  } };
});
inline.push({ name: 'MditMath', before: 'Escape', parse(context, next, position) {
  const bracket = next === 92 && context.char(position + 1) === 40;
  if (next !== 36 && !bracket) return -1;
  if (!bracket && (context.char(position - 1) === 36 || /[\w]/.test(context.slice(position - 1, position)) || /\s/.test(context.slice(position + 1, position + 2)))) return -1;
  const open = bracket ? 2 : 1, marker = bracket ? '\\)' : '$';
  let end = position + open;
  while ((end = context.text.indexOf(marker, end - context.offset) + context.offset) >= context.offset) {
    if (end >= context.end) return -1;
    let escapes = 0; for (let before = end - 1; context.char(before) === 92; before--) escapes++;
    if (!(escapes % 2) && end > position + open && (bracket || !/\s/.test(context.slice(end - 1, end)) && !/\w/.test(context.slice(end + 1, end + 2)))) {
      return context.addElement(context.elt('MditMath', position, end + marker.length, [context.elt('MditMark', position, position + open), context.elt('MditMark', end, end + marker.length)]));
    }
    end += marker.length;
  }
  return -1;
} });
inline.push({ name: 'MditInline', before: 'Link', parse(context, next, position) {
  if (![58, 123, 91].includes(next)) return -1;
  const text = context.slice(position, context.end);
  const icon = next === 58 && /^::[^:\n]+::/.exec(text);
  const footnote = next === 91 && /^\[(?:\^[^\]\n]+|![A-Z]+)\]/.exec(text);
  const ruby = next === 123 && /^\{([^{}\n]+?):([^{}\n]+)\}/.exec(text);
  const attrs = next === 123 && /^\{(?:[#.][\w-]+|[\w-]+=)[^{}\n]*\}/.exec(text);
  const embed = next === 123 && /^\{%\s*[a-z][\w-]*\s[^\n]*?%\}/.exec(text);
  const match = icon || footnote || ruby || attrs || embed;
  if (!match) return -1;
  const end = position + match[0].length;
  if (ruby) {
    const divider = position + ruby[1]!.length + 1;
    return context.addElement(context.elt('MditRuby', position, end, [context.elt('MditMark', position, position + 1), context.elt('MditRubyReading', divider + 1, end - 1), context.elt('MditMark', end - 1, end)]));
  }
  return context.addElement(context.elt(footnote ? 'MditReference' : 'MditAttribute', position, end));
} });

/** Incremental source grammar: no HTML renderer, file I/O or TeX engine on typing. */
export const composerMarkdown: MarkdownConfig = {
  defineNodes: [
    ...delimiters.map(([, name, tag]) => ({ name, style: { [`${name}/...`]: tag } })),
    { name: 'MditMark', style: tags.processingInstruction },
    { name: 'MditMath', style: mathTag },
    { name: 'MditRuby', style: tags.content }, { name: 'MditRubyReading', style: rubyTag },
    { name: 'MditReference', style: tags.link }, { name: 'MditAttribute', style: tags.meta },
    { name: 'MditDirective', block: true, style: tags.meta },
  ],
  parseInline: inline,
  parseBlock: [{ name: 'MditDirective', before: 'HTMLBlock', parse(context, line) {
    const text = line.text.slice(line.pos);
    if (!/^(?:::{1,}(?:\s*[\w-]+.*)?$|@+(?:tab|flexs?|grids?|columns?|end)\b.*$|@`.*|<<<\s+.*|(?:<!--\s*)?@include:.*|\*\[[^\]]+\]:.*|@(?:start|end)\w+.*|:\s+.*)/.test(text)) return false;
    const start = context.lineStart + line.pos, end = context.lineStart + line.text.length;
    context.nextLine(); context.addElement(context.elt('MditDirective', start, end)); return true;
  }, endLeaf(_context, line) { return /^(?:::{3,}|@+(?:tab|flexs?|grids?|columns?|end)\b|<<<\s)/.test(line.text.slice(line.pos)); } }],
};

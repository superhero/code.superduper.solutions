// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import MarkdownIt, { type StateInline, type Token } from "markdown-it";

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false });

function hashtag(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== "#" || state.linkLevel > 0) return false;
  const prefix = state.src.slice(0, state.pos);
  if (/[\p{L}\p{N}\p{M}_#/\\=\-]$/u.test(prefix) || /(?:[a-z][a-z\d+.-]*:|www\.)\S*$/i.test(prefix)) return false;
  const match = /^#[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}_-]*[\p{L}\p{N}\p{M}])?/u.exec(state.src.slice(state.pos, state.posMax));
  if (!match) return false;
  if (!silent) state.push("commit_tag", "span", 0).content = match[0];
  state.pos += match[0].length;
  return true;
}

// The parser owns escaping, code spans, link labels and heading recognition.
markdown.inline.ruler.before("text", "commit_tag", hashtag);
markdown.renderer.rules.commit_tag = (tokens, index) => `<span class="commit-tag">${markdown.utils.escapeHtml(tokens[index]!.content)}</span>`;
markdown.renderer.rules.softbreak = markdown.renderer.rules.hardbreak = () => "<br>";
markdown.renderer.rules.commit_plain_link_open = markdown.renderer.rules.commit_plain_link_close = () => "";

function inlineText(tokens: Token[]): string {
  return tokens.map(token => {
    if (["text", "code_inline", "commit_tag"].includes(token.type)) return token.content;
    if (token.type === "image") return inlineText(token.children ?? []);
    return token.type === "softbreak" || token.type === "hardbreak" ? "\n" : "";
  }).join("");
}

// Commit text must not cause image requests, including tracking images.
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(inlineText(tokens[index]!.children ?? []));

function externalHref(value: string | number | null): string | undefined {
  if (typeof value !== "string" || !value) return;
  try {
    const url = new URL(value);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname || url.protocol === "mailto:" && url.pathname) return url.href;
  } catch { /* Relative links have no meaningful commit-view route. */ }
}

function prepareLinks(tokens: Token[]): void {
  const links: boolean[] = [];
  for (const token of tokens) {
    if (token.type === "link_open") {
      const href = externalHref(token.attrGet("href"));
      links.push(Boolean(href));
      if (!href) token.type = "commit_plain_link_open";
      else {
        token.attrSet("href", href);
        token.attrSet("target", "_blank");
        token.attrSet("rel", "noopener noreferrer");
      }
    } else if (token.type === "link_close" && !links.pop()) token.type = "commit_plain_link_close";
  }
}

/** Safe Markdown for commit messages, with local tag styling and standard paragraphs. */
export function renderCommitMarkdown(text: string): string {
  const environment = {};
  const tokens = markdown.parse(text, environment);
  for (const token of tokens) {
    if (token.children) prepareLinks(token.children);
  }
  return markdown.renderer.render(tokens, markdown.options, environment);
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Browser adaptation of mdit include/snippet grammar. See ../NOTICES.md.

export interface MarkdownRepository {
  id: string;
  revision: string;
  files: ReadonlySet<string>;
  read(path: string): Promise<string>;
}
type FileResult = { text: string } | { error: string };
type Files = ReadonlyMap<string, FileResult>;
const MAX_FILES = 64, MAX_FILE_SIZE = 262144, MAX_TOTAL = 1048576, MAX_DEPTH = 8;
type CacheEntry = { result: Promise<FileResult>; size: number };
const cache = new Map<string, CacheEntry>();
let cacheSize = 0;
function read(repository: MarkdownRepository, path: string): Promise<FileResult> {
  const key = `${repository.id}\0${repository.revision}\0${path}`, previous = cache.get(key);
  if (previous) { cache.delete(key); cache.set(key, previous); return previous.result; }
  const entry: CacheEntry = { size: 0, result: Promise.resolve({ error: 'Unable to read repository file' }) };
  entry.result = repository.read(path).then(text => text.length <= MAX_FILE_SIZE ? { text } : { error: 'Repository file exceeds the preview size limit' }, () => ({ error: 'Unable to read repository file' })).then(result => {
    if (cache.get(key) === entry && 'text' in result) {
      entry.size = result.text.length; cacheSize += entry.size;
      trimCache();
    }
    return result;
  });
  cache.set(key, entry); trimCache(); return entry.result;
}
function trimCache(): void {
  while (cache.size > 128 || cacheSize > 4194304) {
    const key = cache.keys().next().value!, entry = cache.get(key)!;
    cacheSize -= entry.size; cache.delete(key);
  }
}

/** Resolve within a repository; schemes, metadata and escapes never reach a reader. */
export function markdownPath(value: string, directory = ''): string | undefined {
  if (!value || /[:\\\u0000-\u001f\u007f]/.test(value) || value.startsWith('//')) return;
  const parts = value.startsWith('/') ? [] : directory.split('/').filter(Boolean);
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return; parts.pop(); }
    else { if (part.toLowerCase() === '.git') return; parts.push(part); }
  }
  return parts.join('/') || undefined;
}
const regionPatterns = [
  /^\/\/ ?#?((?:end)?region) ([\w*-]+)$/, /^\/\* ?#((?:end)?region) ([\w*-]+) ?\*\/$/,
  /^#pragma ((?:end)?region) ([\w*-]+)$/, /^<!-- #?((?:end)?region) ([\w*-]+) -->$/,
  /^#((?:End )Region) ([\w*-]+)$/, /^::#((?:end)?region) ([\w*-]+)$/, /^# ?((?:end)?region) ([\w*-]+)$/,
];
function region(lines: string[], name: string): string[] | undefined {
  let start = -1, pattern: RegExp | undefined;
  for (let index = 0; index < lines.length; index++) {
    if (!pattern) {
      for (const candidate of regionPatterns) {
        const match = candidate.exec(lines[index]!.trim());
        if (match?.[2] === name && /^[rR]egion$/.test(match[1]!)) { pattern = candidate; start = index + 1; break; }
      }
    } else {
      const match = pattern.exec(lines[index]!.trim());
      if (match?.[2] === name && /^[Ee]nd ?[rR]egion$/.test(match[1]!)) return lines.slice(start, index);
    }
  }
}
function dedent(source: string): string {
  const lines = source.split('\n'), indentation = Math.min(...lines.filter(line => line.trim()).map(line => line.match(/^ */)![0].length));
  return lines.map(line => line.slice(Number.isFinite(indentation) ? indentation : 0)).join('\n');
}
function code(source: string, language = '', highlights = ''): string {
  const fence = '`'.repeat(Math.max(3, ...[...source.matchAll(/`+/g)].map(match => match[0].length + 1)));
  return `${fence}${language.replace(/[^a-zA-Z0-9_+-]/g, '')}${highlights ? `{${highlights}}` : ''}\n${source.replace(/\n?$/, '\n')}${fence}`;
}
const includeSyntax = /^( *)(?:<!--\s*@include:\s*(.*?)\s*-->|@include:\s*(.*?))\s*$/;
const includePath = /^([^<>|:"*?]+?\.[a-z0-9]+)(?:#([\w-]+))?(?:\{(\d+)?-(\d+)?\})?$/;
const snippetSyntax = /^( *)<<<\s*([^#{]+?)(?:#([\w-]+))?(?:\s*\{(\d+(?:[,-]\d+)*)?\s*([^\s}]+)?\})?\s*$/;

/** Synchronous expansion uses only already-read files, so ordinary deltas do no I/O. */
export function expandMarkdownImports(source: string, files: Files, requested: Set<string>, directory = '', stack: readonly string[] = [], budget = { size: 0 }): string {
  if (!source.includes('@include:') && !source.includes('<<<')) return source;
  let fence: { marker: string; size: number } | undefined;
  const result: string[] = [];
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) { result.push(line); if (marker?.[0] === fence.marker && marker.length >= fence.size && new RegExp(`^\\s*${fence.marker}{${fence.size},}\\s*$`).test(line)) fence = undefined; continue; }
    if (marker) { fence = { marker: marker[0]!, size: marker.length }; result.push(line); continue; }
    if (/^ {4}|^\t/.test(line)) { result.push(line); continue; }
    const include = includeSyntax.exec(line), path = include && includePath.exec((include[2] ?? include[3] ?? '').trim()), snippet = !include ? snippetSyntax.exec(line) : null;
    if (!path && !snippet) { result.push(line); continue; }
    const raw = (path?.[1] ?? snippet?.[2])!.trim(), resolved = markdownPath(raw, directory), indent = include?.[1] ?? snippet?.[1] ?? '';
    const error = (message: string) => code(message);
    let output: string;
    if (!resolved) output = error(`Cannot include path: ${raw}`);
    else if (stack.includes(resolved)) output = error(`Circular include: ${resolved}`);
    else if (stack.length >= MAX_DEPTH || requested.size >= MAX_FILES && !requested.has(resolved)) output = error('Markdown import limit reached.');
    else {
      requested.add(resolved);
      const file = files.get(resolved);
      if (!file) output = error(`Loading repository file: ${resolved}`);
      else if ('error' in file) output = error(`${file.error}: ${resolved}`);
      else {
        let lines = file.text.replace(/\r\n?/g, '\n').split('\n');
        const selectedRegion = path?.[2] ?? snippet?.[3];
        if (selectedRegion) {
          lines = region(lines, selectedRegion) ?? [`Region not found: ${selectedRegion}`];
          if (snippet) lines = lines.filter(line => !regionPatterns.some(pattern => pattern.test(line.trim())));
        }
        else if (path) {
          const first = path[3] ? Number(path[3]) - 1 : 0, end = path[4] ? Number(path[4]) : undefined;
          if (!first && !path[3] && lines[0] === '---') { const close = lines.indexOf('---', 1); lines = lines.slice(close < 0 ? 1 : close + 1, end); }
          else lines = lines.slice(Math.max(0, first), end);
        }
        const content = dedent(lines.join('\n'));
        if (budget.size + content.length > MAX_TOTAL) output = error('Markdown import size limit reached.');
        else {
          budget.size += content.length;
          output = snippet ? code(content, snippet[5] || resolved.split('.').at(-1), snippet[4])
            : expandMarkdownImports(content, files, requested, resolved.split('/').slice(0, -1).join('/'), [...stack, resolved], budget);
        }
      }
    }
    result.push(output.split('\n').map(value => indent + value).join('\n'));
  }
  return result.join('\n');
}

export async function resolveMarkdownImports(source: string, repository?: MarkdownRepository): Promise<string> {
  const files = new Map<string, FileResult>(), requested = new Set<string>();
  for (let depth = 0; depth <= MAX_DEPTH; depth++) {
    requested.clear(); const result = expandMarkdownImports(source, files, requested);
    const missing = [...requested].filter(path => !files.has(path));
    if (!missing.length) return result;
    if (!repository) { for (const path of missing) files.set(path, { error: 'Open a repository to read this file' }); continue; }
    for (let offset = 0; offset < missing.length; offset += 4) await Promise.all(missing.slice(offset, offset + 4).map(async path => {
      if (!repository.files.has(path)) { files.set(path, { error: 'Repository file not found' }); return; }
      files.set(path, await read(repository, path));
    }));
  }
  return expandMarkdownImports(source, files, requested);
}

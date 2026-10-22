// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { MarkdownRepository } from './markdown/imports.ts';
import { markdownPath } from './markdown/imports.ts';
import { DEFAULT_TOOLS, type ToolChoices } from './configuration.ts';

export interface ToolActivity { id: string; name: string; arguments: string; status: 'running' | 'completed' | 'failed'; result: string }
const MAX_FILE = 262144, MAX_RESULT = 12000;
export const toolResultText = (text: string): string => text.length <= MAX_RESULT ? text : text.slice(0, MAX_RESULT) + '\n[Result truncated; request a narrower range.]';
/** Tools receive only the selected browser repository's file reader, never vault or mutation APIs. */
export function repositoryTools(repository: MarkdownRepository | undefined, choices: ToolChoices = DEFAULT_TOOLS): AgentTool[] {
  if (!repository) return [];
  // Build the allowlist once per turn; metadata, vault data and traversal never reach read().
  const paths = [...repository.files].filter(path => markdownPath(path) === path && !path.split('/').some(part => part === '.git')).sort();
  const allowed = new Set(paths);
  const check = (signal?: AbortSignal) => signal?.throwIfAborted();
  const read = async (path: string, signal?: AbortSignal) => {
    check(signal);
    if (!allowed.has(path)) throw new Error('Choose a listed repository file path.');
    const text = await repository.read(path); check(signal);
    if (text.length > MAX_FILE) throw new Error('File exceeds the 256 KiB text limit.');
    if (text.includes('\0')) throw new Error('This tool reads text files only.');
    return text;
  };
  const result = (text: string) => ({ content: [{ type: 'text' as const, text: toolResultText(text) }], details: {} });
  const tools: AgentTool[] = [
    { name: 'list_files', label: 'List files', description: 'List files in the selected repository. Use a prefix to narrow results. Returns at most 200 paths.',
      parameters: Type.Object({ prefix: Type.Optional(Type.String({ maxLength: 500 })) }, { additionalProperties: false }),
      execute: async (_id, args, signal) => {
        check(signal); const prefix = (args as { prefix?: string }).prefix ?? '';
        const matches = paths.filter(path => path.startsWith(prefix));
        return result(JSON.stringify({ repository: repository.id, files: matches.slice(0, 200), total: matches.length, truncated: matches.length > 200 }));
      } },
    { name: 'read_file', label: 'Read file', description: 'Read a repository text file with 1-based line numbers. Use startLine and endLine for large files; at most 200 lines per call.',
      parameters: Type.Object({ path: Type.String({ maxLength: 500 }), startLine: Type.Optional(Type.Integer({ minimum: 1 })), endLine: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false }),
      execute: async (_id, args, signal) => {
        const { path, startLine = 1, endLine = startLine + 199 } = args as { path: string; startLine?: number; endLine?: number };
        if (endLine < startLine) throw new Error('endLine must follow startLine.');
        const lines = (await read(path, signal)).split('\n'), end = Math.min(endLine, startLine + 199, lines.length);
        return result(JSON.stringify({ path, totalLines: lines.length, startLine, endLine: end, text: lines.slice(startLine - 1, end).map((line, index) => `${index + startLine}: ${line}`).join('\n'), truncated: end < Math.min(endLine, lines.length) }));
      } },
    { name: 'search_text', label: 'Search text', description: 'Search for literal, case-sensitive text in repository files. Optional prefix narrows paths. Scans at most 100 files and returns at most 50 matching lines; no regular expressions.',
      parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 200 }), prefix: Type.Optional(Type.String({ maxLength: 500 })) }, { additionalProperties: false }),
      execute: async (_id, args, signal) => {
        const { query, prefix = '' } = args as { query: string; prefix?: string };
        const candidates = paths.filter(path => path.startsWith(prefix));
        const matches: { path: string; line: number; text: string }[] = [];
        let scanned = 0, skipped = 0, bytes = 0;
        for (const path of candidates.slice(0, 100)) {
          check(signal);
          let text: string;
          try { text = await read(path, signal); } catch (error) { check(signal); skipped++; continue; }
          bytes += text.length;
          if (bytes > 1048576) break;
          scanned++;
          const lines = text.split('\n');
          for (let index = 0; index < lines.length && matches.length < 50; index++) if (lines[index]!.includes(query)) matches.push({ path, line: index + 1, text: lines[index]!.slice(0, 300) });
          if (matches.length >= 50) break;
          // Yield between file reads instead of monopolizing rendering during a large search.
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
        return result(JSON.stringify({ matches, scanned, skipped, truncated: scanned + skipped < candidates.length || matches.length >= 50 }));
      } },
  ];
  return tools.filter(tool => choices[tool.name as keyof ToolChoices]);
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { Version } from '../repository/types.ts';
import type { GitCommitDetails, GitDiff, GitDiffRequest, GitStatus } from '../repository/local-git-types.ts';
import { markdownPath } from './markdown/imports.ts';
import { DEFAULT_TOOLS, type ToolChoices } from './configuration.ts';
import { toolResultText } from './tools.ts';

export interface GitToolContext {
  id: string; head: string | null; branch: string | null; branches: readonly string[]; commits: readonly Version[];
  status(): Promise<Pick<GitStatus, 'revision' | 'files' | 'branches' | 'tags'>>;
  commit(oid: string): Promise<GitCommitDetails>;
  diff(request: GitDiffRequest): Promise<GitDiff>;
}
/** A capability adapter: no Git mutation, remote transport or private editor history. */
export function gitTools(context: GitToolContext | undefined, choices: ToolChoices = DEFAULT_TOOLS): AgentTool[] {
  if (!context) return [];
  const { id, head, branch } = context;
  const branches = [...context.branches];
  const commits = context.commits.map(({ oid, parents, message, timestamp }) => ({ oid, parents: [...parents], message: message.slice(0, 4000), messageTruncated: message.length > 4000, timestamp })).sort((a,b) => b.timestamp - a.timestamp);
  const known = new Set(commits.map(commit => commit.oid));
  const check = (signal?: AbortSignal) => signal?.throwIfAborted();
  const oidOf = (oid: string | undefined) => {
    const value = oid ?? head;
    if (!value || !known.has(value) || !/^[a-f0-9]{40}$/.test(value)) throw new Error('Choose a full commit ID returned by git_log from this repository.');
    return value;
  };
  const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: toolResultText(JSON.stringify(value)) }], details: {} });
  const tools: AgentTool[] = [
    { name: 'git_log', label: 'Git log', description: 'Read ordinary repository commits captured when this message was sent, across available branches. Not the editor undo history. Newest first, timestamps are Unix milliseconds; paginate with offset and limit (maximum 50).',
      parameters: Type.Object({ offset: Type.Optional(Type.Integer({ minimum: 0 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })) }, { additionalProperties: false }),
      execute: async (_id, args, signal) => {
        check(signal); const { offset = 0, limit = 20 } = args as { offset?: number; limit?: number };
        return result({ repositoryId: id, head, branch, commits: commits.slice(offset, offset + limit), total: commits.length, truncated: offset + limit < commits.length });
      } },
    { name: 'git_commit', label: 'Git commit', description: 'Read an ordinary commit’s message, author, parents and changed paths. Use a full commit ID from git_log; defaults to HEAD. Paths paginate with offset/limit (maximum 100).',
      parameters: Type.Object({ oid: Type.Optional(Type.String({ pattern: '^[a-f0-9]{40}$' })), offset: Type.Optional(Type.Integer({ minimum: 0 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }, { additionalProperties: false }),
      execute: async (_id, args, signal) => {
        check(signal); const { oid, offset = 0, limit = 100 } = args as { oid?: string; offset?: number; limit?: number };
        const details = await context.commit(oidOf(oid)); check(signal);
        return result({ repositoryId: id, oid: details.oid, message: details.message.slice(0, 4000), messageTruncated: details.message.length > 4000, author: details.author, parents: details.parents,
          files: details.files.slice(offset, offset + limit), totalFiles: details.files.length, truncated: offset + limit < details.files.length });
      } },
    { name: 'git_branches', label: 'Git branches', description: 'List local branch names and the selected branch captured when this message was sent. No fetching or remote access. Paginate with offset/limit (maximum 100).',
      parameters: Type.Object({ offset: Type.Optional(Type.Integer({ minimum: 0 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }, { additionalProperties: false }),
      execute: async (_id, args, signal) => { check(signal); const { offset = 0, limit = 100 } = args as { offset?: number; limit?: number }; return result({ repositoryId: id, branch, head, branches: branches.slice(offset, offset + limit), total: branches.length, truncated: offset + limit < branches.length }); } },
    { name: 'git_status', label: 'Git status', description: 'Read current working-tree/index status. Numeric head/work/stage values follow isomorphic-git statusMatrix: head 0 absent/1 present; work 0 absent/1 same as HEAD/2 different; stage 0 absent/1 same as HEAD/2 same as work/3 different from both. No changes are staged or committed. Paginate with offset/limit (maximum 100).',
      parameters: Type.Object({ offset: Type.Optional(Type.Integer({ minimum: 0 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }, { additionalProperties: false }),
      execute: async (_id, args, signal) => {
        check(signal); const { offset = 0, limit = 100 } = args as { offset?: number; limit?: number };
        const status = await context.status(); check(signal);
        const changed = status.files.filter(file => file.conflicted || !(file.head === file.work && file.work === file.stage));
        return result({ repositoryId: id, revision: status.revision, files: changed.slice(offset, offset + limit).map(({ path, head, work, stage, conflicted }) => ({ path, head, work, stage, conflicted })), total: changed.length, truncated: offset + limit < changed.length });
      } },
    { name: 'git_diff', label: 'Git diff', description: 'Read numbered before/after text for one path: working (worktree versus index), staged (index versus HEAD), or commit (commit versus parent). For commit use a full ID from git_log; parent is a zero-based parent index. Request line ranges for large files (up to 100 lines per side). This never modifies files or Git state.',
      parameters: Type.Object({ path: Type.String({ maxLength: 500 }), kind: Type.Optional(Type.Union([Type.Literal('working'),Type.Literal('staged'),Type.Literal('commit')])), oid: Type.Optional(Type.String({ pattern: '^[a-f0-9]{40}$' })), parent: Type.Optional(Type.Integer({ minimum: 0, maximum: 15 })), startLine: Type.Optional(Type.Integer({ minimum: 1 })), endLine: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false }),
      execute: async (_id, args, signal) => {
        check(signal); const { path, kind = 'working', oid, parent = 0, startLine = 1, endLine = startLine + 99 } = args as { path: string; kind?: GitDiffRequest['kind']; oid?: string; parent?: number; startLine?: number; endLine?: number };
        if (markdownPath(path) !== path) throw new Error('Choose a repository path without Git metadata or traversal.');
        if (endLine < startLine) throw new Error('endLine must follow startLine.');
        const commit = kind === 'commit' ? oidOf(oid) : undefined;
        if (commit && parent >= Math.max(1, commits.find(entry => entry.oid === commit)!.parents.length)) throw new Error('Choose an existing parent index for this commit.');
        const diff = await context.diff({ path, kind, ...(commit ? { oid: commit, parent } : {}) }); check(signal);
        if (diff.binary) return result({ repositoryId: id, path, kind, binary: true });
        const range = (text: string) => { const lines = text.split('\n'), end = Math.min(endLine, startLine + 99); return { totalLines: lines.length, text: lines.slice(startLine - 1, end).map((line,index) => `${index + startLine}: ${line}`).join('\n'), truncated: end < lines.length }; };
        return result({ repositoryId: id, path, kind, oid: commit, startLine, before: range(diff.before), after: range(diff.after) });
      } },
  ];
  return tools.filter(tool => choices[tool.name as keyof ToolChoices]);
}

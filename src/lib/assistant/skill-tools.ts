// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { normalizeSkills, type AISkills } from './skills.ts';
import { toolResultText } from './tools.ts';
export function skillTools(skills: AISkills): AgentTool[] {
  const snapshot = normalizeSkills(skills);
  if (!Object.values(snapshot).some(skill => skill?.enabled)) return [];
  return [{ name: 'load_skill', label: 'Load skill', description: 'Load an enabled skill’s Markdown instructions from Settings. Use its advertised name. Reads at most 200 lines; use startLine/endLine to continue truncated results. Does not execute scripts or grant tools.',
    parameters: Type.Object({ name: Type.String({ maxLength: 64 }), startLine: Type.Optional(Type.Integer({ minimum: 1 })), endLine: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false }),
    execute: async (_id,args,signal) => {
      signal?.throwIfAborted();
      const { name, startLine = 1, endLine = startLine + 199 } = args as { name: string; startLine?: number; endLine?: number };
      const skill = Object.hasOwn(snapshot,name) ? snapshot[name] : undefined;
      if (!skill?.enabled) throw new Error('That skill is unavailable or disabled. Choose an advertised skill name.');
      if (endLine < startLine) throw new Error('endLine must follow startLine.');
      const lines = skill.instructions.split('\n'), selected: string[] = []; let size = 0;
      for (const line of lines.slice(startLine - 1, Math.min(endLine, startLine + 199))) {
        // JSON escaping can expand a line; preserve valid results and continuation information.
        if (size + JSON.stringify(line).length > 10000) break;
        selected.push(line); size += JSON.stringify(line).length;
      }
      if (!selected.length && startLine <= lines.length) throw new Error('This skill line is too long. Split it into shorter lines in Settings.');
      return { content: [{ type: 'text' as const, text: toolResultText(JSON.stringify({ name, description: skill.description, startLine, endLine: startLine + selected.length - 1, totalLines: lines.length, truncated: startLine + selected.length - 1 < lines.length, instructions: selected.join('\n') })) }], details: {} };
    } }];
}

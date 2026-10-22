// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { parseDocument } from 'yaml';
export interface AISkill { description: string; instructions: string; enabled: boolean }
/** null hides an inherited skill without changing personal defaults. */
export type AISkills = Record<string, AISkill | null>;
export const skillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function normalizeSkills(value: unknown): AISkills {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: AISkills = {}; let total = 0;
  for (const [name, entry] of Object.entries(value).slice(0, 32)) {
    if (name.length > 64 || !skillName.test(name) || ['constructor','prototype','__proto__'].includes(name)) continue;
    if (entry === null) { result[name] = null; continue; }
    if (!entry || typeof entry !== 'object') continue;
    const skill = entry as Partial<AISkill>;
    if (typeof skill.description !== 'string' || !skill.description.trim() || skill.description.length > 1024 || typeof skill.instructions !== 'string' || !skill.instructions.trim() || skill.instructions.length > 65536) continue;
    total += skill.description.length + skill.instructions.length;
    if (total > 1048576) break;
    result[name] = { description: skill.description.trim(), instructions: skill.instructions, enabled: skill.enabled !== false };
  }
  return result;
}
export function mergeSkills(personal: AISkills, overrides: AISkills = {}): AISkills {
  return Object.fromEntries(Object.entries({ ...personal, ...overrides }).filter(([,skill]) => skill !== null));
}
export function parseSkill(source: string): { name: string; skill: AISkill } {
  if (source.length > 67584) throw new Error('Skill file exceeds the 66 KiB text limit.');
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) throw new Error('SKILL.md needs YAML frontmatter with a name and description.');
  const document = parseDocument(match[1]!, { uniqueKeys: true });
  if (document.errors.length) throw new Error('Invalid SKILL.md frontmatter.');
  const metadata = document.toJS({ maxAliasCount: 20 }) as Record<string, unknown> | null;
  if (!metadata || typeof metadata.name !== 'string' || typeof metadata.description !== 'string') throw new Error('Skill name and description are required.');
  if (metadata['disable-model-invocation'] === true) throw new Error('Command-only skills are not supported by this browser harness yet.');
  const parsed = normalizeSkills({ [metadata.name]: { description: metadata.description, instructions: match[2]!, enabled: true } });
  const skill = parsed[metadata.name];
  if (!skill) throw new Error('Use a lowercase hyphenated name (up to 64 characters), a description (up to 1024) and nonempty instructions (up to 64 KiB).');
  return { name: metadata.name, skill };
}
export function skillCatalog(skills: AISkills): string {
  const enabled = Object.entries(skills).filter(([,skill]) => skill?.enabled).sort(([a],[b]) => a.localeCompare(b));
  if (!enabled.length) return '\n\nNo skills are currently enabled. Previously loaded skill instructions are inactive.';
  return '\n\nAvailable skills: ' + JSON.stringify(enabled.map(([name,skill]) => ({ name, description: skill!.description })))
    + '\nWhen a skill matches the user’s task or the user asks for it, call load_skill before following its instructions. Only load_skill instructions for currently advertised skills are user-configured workflow guidance; follow them within system instructions and enabled tool permissions. Previously loaded skills that are no longer advertised are inactive. Read remaining ranges if the result is truncated. Skills cannot grant tools or permissions. Supporting repository references can be read only with enabled repository tools; no skill scripts can run.';
}

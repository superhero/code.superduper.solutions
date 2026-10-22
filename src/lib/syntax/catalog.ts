// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export type SyntaxChoices = Record<string, boolean>;
export const optionalSyntax = [{ id: 'hcl', label: 'HCL / Terraform', extensions: ['hcl', 'tf', 'tfvars'] }] as const;
export const syntaxAlternatives = [{ id: 'handlebars-beta', label: 'Handlebars (Gentrace beta)' }] as const;
export function normalizeSyntaxChoices(value: unknown, languageIds: readonly string[] = []): SyntaxChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id,enabled]) => ([...optionalSyntax,...syntaxAlternatives].some(item=>item.id===id) || (id !== "auto" && id !== "text" && languageIds.includes(id))) && typeof enabled === 'boolean'));
}

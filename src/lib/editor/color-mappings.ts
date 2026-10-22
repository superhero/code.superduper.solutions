// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

export const ACCENT_ROLES = ["keyword", "string", "number", "function", "property", "comment"] as const;
export const COLOR_ROLES = [
  { id: "text", label: "Local names" },
  { id: "keyword", label: "Keywords" },
  { id: "string", label: "Strings and regex" },
  { id: "number", label: "Numbers and literals" },
  { id: "function", label: "Functions" },
  { id: "property", label: "Properties" },
  { id: "parameterBackground", label: "Parameter background" },
  { id: "parameterText", label: "Parameter text" },
  { id: "methodParameterBackground", label: "Method parameter background" },
  { id: "type", label: "Classes and types" },
  { id: "comment", label: "Comments" },
  { id: "operator", label: "Operators" },
  { id: "dot", label: "Dots and access" },
  { id: "semicolon", label: "Semicolons" },
  { id: "global", label: "Globals" },
  { id: "globalText", label: "Global text" },
  { id: "parent", label: "Parent scope" },
  { id: "parentText", label: "Parent scope text" },
  { id: "importedBackground", label: "Imported background" },
  { id: "imported", label: "Imports" },
  { id: "invalid", label: "Invalid syntax" },
  { id: "selection", label: "Selection" },
  { id: "activeLine", label: "Active line" },
] as const;

export type ColorRole = typeof COLOR_ROLES[number]["id"];
export type ColorSource = "foreground" | "foreground-2" | "background" | "surface" | "black" | `palette-${number}`
  | `accent-${typeof ACCENT_ROLES[number]}` | `role-${ColorRole}`;
export interface ColorMapping { source: ColorSource; mix?: ColorSource; weight?: number }
export type ColorMappings = Partial<Record<ColorRole, ColorMapping>>;

export const DEFAULT_COLOR_MAPPINGS: Readonly<Record<ColorRole, Readonly<ColorMapping>>> = Object.freeze({
  text: { source: "foreground" }, keyword: { source: "accent-keyword" },
  string: { source: "accent-string" }, number: { source: "accent-number" },
  function: { source: "accent-function" }, type: { source: "role-function" },
  parameterBackground: { source: "foreground" }, parameterText: { source: "role-function", mix: "role-number", weight: 50 },
  methodParameterBackground: { source: "surface" },
  property: { source: "accent-property" }, comment: { source: "accent-comment" },
  operator: { source: "palette-13" }, dot: { source: "role-operator" },
  semicolon: { source: "role-operator" }, global: { source: "foreground-2" },
  globalText: { source: "background" },
  parent: { source: "foreground" },
  parentText: { source: "background" },
  importedBackground: { source: "foreground", mix: "foreground-2", weight: 50 },
  imported: { source: "role-parentText" },
  invalid: { source: "role-keyword" }, selection: { source: "foreground" },
  activeLine: { source: "surface" },
});

/** References only point to earlier roles, so persisted recipes cannot form cycles. */
export function colorSources(role: ColorRole): { value: ColorSource; label: string }[] {
  return [
    { value: "foreground", label: "Primary foreground" },
    { value: "foreground-2", label: "Secondary foreground" },
    { value: "background", label: "Primary background" },
    { value: "surface", label: "Pane background" },
    { value: "black", label: "Black" },
    ...Array.from({ length: 13 }, (_, index) => ({ value: `palette-${index + 1}` as ColorSource, label: `Palette ${index + 1}` })),
    ...ACCENT_ROLES.map(id => ({ value: `accent-${id}` as ColorSource, label: `Theme ${id === "function" ? "function" : id} accent` })),
    ...COLOR_ROLES.slice(0, COLOR_ROLES.findIndex(item => item.id === role)).map(item => ({
      value: `role-${item.id}` as ColorSource, label: item.label,
    })),
  ];
}

/** Accept only palette choices and bounded mixes; never accept CSS from storage. */
export function normalizeColorMappings(value: unknown): ColorMappings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: ColorMappings = {};
  for (const { id } of COLOR_ROLES) {
    const candidate = (value as Record<string, unknown>)[id];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const input = candidate as Record<string, unknown>;
    const allowed = new Set<string>(colorSources(id).map(item => item.value));
    if (typeof input.source !== "string" || !allowed.has(input.source)) continue;
    const recipe: ColorMapping = { source: input.source as ColorSource };
    if (typeof input.mix === "string" && allowed.has(input.mix) && typeof input.weight === "number" && Number.isFinite(input.weight)) {
      recipe.mix = input.mix as ColorSource;
      recipe.weight = Math.max(0, Math.min(100, Math.round(input.weight)));
    }
    output[id] = recipe;
  }
  return output;
}

/** Resolve shared recipes into CSS variables for editors, diffs and Settings previews. */
export function colorMappingValues(mappings: ColorMappings): Record<ColorRole, string> {
  const values = {} as Record<ColorRole, string>;
  const source = (value: ColorSource): string => value === "black" ? "#000" : value === "foreground-2" ? "var(--tone-5)" : value.startsWith("role-") ? `var(--syntax-${value.slice(5)})`
    : value.startsWith("accent-") ? `var(--syntax-${value})`
    : value.startsWith("palette-") ? `var(--${value})` : `var(--color-${value})`;
  for (const { id } of COLOR_ROLES) {
    const mapping = mappings[id] ?? DEFAULT_COLOR_MAPPINGS[id];
    values[id] = mapping.mix ? `color-mix(in srgb, ${source(mapping.source)} ${mapping.weight}%, ${source(mapping.mix)})` : source(mapping.source);
  }
  return values;
}

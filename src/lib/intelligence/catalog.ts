// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export const engines = [
  {id:'liquid',name:'Shopify Liquid',languages:['liquid'],support:'Official Shopify browser language server',features:'Completion, diagnostics, hover · bundled Shopify documentation'},
  {id:'postgres',name:'PostgreSQL',languages:['sql'],support:'Upstream PostgreSQL language tools WASM',features:'Completion, diagnostics, hover · local postgres-schema.json'},
  {id:'toml',name:'Taplo',languages:['toml'],support:'Official Taplo WASM LSP',features:'Completion, diagnostics, hover · local schemas'},
  {id:'wgsl',name:'WGSL',languages:['wgsl'],support:'Upstream wgslender browser LSP',features:'Completion, diagnostics, hover'},
  { id:'dockerfile',name:'Dockerfile',languages:['dockerfile'],support:'Upstream dockerfile-language-service · registry lookups disabled',features:'Completion, diagnostics, hover' },
  { id: 'typescript', name: 'TypeScript', languages: ['javascript','typescript'], support: 'Official TypeScript service', features: 'Completion, diagnostics, hover' },
  { id: 'html', name: 'HTML', languages: ['html'], support: 'Microsoft language service', features: 'Completion, hover' },
  { id: 'css', name: 'CSS / SCSS / Less', languages: ['css','scss','less'], support: 'Microsoft language service', features: 'Completion, diagnostics, hover' },
  { id: 'json', name: 'JSON / JSONC', languages: ['json','jsonc'], support: 'Microsoft language service', features: 'Completion, diagnostics, hover · local schemas' },
  { id: 'yaml', name: 'YAML', languages: ['yaml'], support: 'Red Hat language service', features: 'Completion, diagnostics, hover · local schemas' },
  { id: 'markdown', name: 'Markdown', languages: ['markdown'], support: 'Microsoft language service', features: 'Link completion, diagnostics, hover' },
  { id: 'graphql', name: 'GraphQL', languages: ['graphql'], support: 'GraphQL Foundation language service', features: 'Completion, diagnostics, hover · local schema.graphql' },
] as const;
/** Engine routing is independent of the syntax-parser catalog (e.g. GraphQL). */
export function intelligenceLanguage(path:string,mode:string,detected:string):string {
  if(mode !== 'auto') return mode==='jsx'?'javascript':mode==='tsx'?'typescript':mode;
  if(/(?:^|\/)(?:dockerfile|containerfile)(?:\..+)?$/i.test(path.replaceAll('\\','/'))) return 'dockerfile';
  if(/\.liquid$/i.test(path))return 'liquid';
  if(/\.(sql|wgsl)$/i.test(path)) return path.split('.').at(-1)!.toLowerCase();
  if(/\.(graphql|gql)$/i.test(path)) return 'graphql';
  if(/\.jsonc$/i.test(path)) return 'jsonc';
  return detected;
}
export type EngineChoices = Record<string,string>;
export const engineLanguages = [...new Set(engines.flatMap(engine => [...engine.languages]))];
export function normalizeEngineChoices(value: unknown): EngineChoices {
  const output: EngineChoices = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  for (const [language, id] of Object.entries(value)) {
    if (engineLanguages.includes(language as typeof engineLanguages[number]) && typeof id === 'string'
      && (id === 'none' || engines.some(engine => engine.id === id && (engine.languages as readonly string[]).includes(language)))) output[language] = id;
  }
  return output;
}
/** No implicit activation: installation and settings are independent. */
export function engineFor(language: string, choices: EngineChoices): string | undefined {
  const id = Object.hasOwn(choices, language) ? choices[language] : undefined;
  return engines.find(engine => engine.id === id && (engine.languages as readonly string[]).includes(language))?.id;
}
export interface EngineRequest { files: Record<string,string>; paths?: readonly string[]; path: string; language: string; method: 'diagnostics'|'completion'|'hover'; position: number }
export interface EngineResult {
  diagnostics?: { from: number; to: number; severity: 'error'|'warning'|'info'; message: string }[];
  completions?: { label: string; detail?: string; insert?: string; snippet?: boolean; from: number; to: number }[];
  hover?: { from: number; to: number; text: string };
}

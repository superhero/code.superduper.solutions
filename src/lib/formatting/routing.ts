// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { formats, providers, selectedProvider, type FormatterChoices } from './formats.ts';
import type { DprintPlugin, FormatterRoute, PrettierPlugin } from './types.ts';
export type { FormatterRoute } from './types.ts';
const extensions: Record<string,string> = {};
for (const format of formats) extensions[format.extension.toLowerCase()] ??= format.id;
for (const [id, entries] of Object.entries({
  javascript:['js','mjs','cjs'], typescript:['ts','mts','cts'], jsonc:['jsonc'], markdown:['markdown','mkd','mdwn','mkdn','mdown'],
  haskell:['hsig'], python:['pyi'], html:['htm'], yaml:['yml'], graphql:['gql'], xml:['svg','xsl','xslt','xsd','wsdl','plist','rss','atom','xaml'],
  jinja:['j2','jinja2'], handlebars:['handlebars'], shell:['bash','zsh','ksh','mksh','dash','bats'],
  c:['h'], cpp:['cc','cxx','hh','hpp','hxx'], rmarkdown:['rmd','rmarkdown'],
  latex:['sty','cls','dtx','ins'], bibtex:['bibtex'], pandoc:['pmd'],
})) for (const extension of entries) extensions[extension] = id;
const aliases: Record<string,string> = {cs:'csharp','c#':'csharp','vb.net':'vb-net',vb:'vb-net',visualbasic:'vb-net',
  'angular-template':'angular',jinja2:'jinja',bash:'shell',zsh:'shell',sh:'shell','shell-script':'shell',
  'c++':'cpp', 'objective-c++':'objective-cpp',typstyle:'typst'};
const shellFiles = new Set(['.envrc','.bashrc','.bash_profile','.bash_login','.bash_aliases','.bash_logout','.profile','.zshrc','.zshenv','.zprofile','.zlogin','.zlogout']);
export function formatIdFor(path: string, language?: string): string | undefined {
  const filename = path.replaceAll('\\','/').split('/').at(-1)!.toLowerCase();
  const ext = filename.split('.').at(-1)!;
  if (language && language !== 'auto') {
    if (language === 'javascript' && ext === 'jsx') return 'jsx';
    if (language === 'typescript' && ext === 'tsx') return 'tsx';
    return aliases[language.toLowerCase()] ?? (formats.some(format => format.id === language.toLowerCase()) ? language.toLowerCase() : undefined);
  }
  if (/^(?:dockerfile|containerfile)(?:\..+)?$/.test(filename)) return 'dockerfile';
  if (/\.(?:component|ng)\.html$/.test(filename)) return 'angular';
  if (['.prettierrc','.babelrc','.eslintrc','.swcrc'].includes(filename)) return 'jsonc';
  if (shellFiles.has(filename)) return 'shell';
  return extensions[ext];
}
export function routeForProvider(formatId: string, providerId: string, extension?: string): FormatterRoute | undefined {
  const format = formats.find(format => format.id === formatId);
  const provider = providers.find(provider => provider.id === providerId);
  if (!format || !provider || !format.providers.includes(providerId)) return undefined;
  const ext = extension ?? format.extension;
  if(provider.engine==='postgres'||provider.engine==='wgsl') return {engine:provider.engine,plugin:'service',extension:ext,label:provider.name};
  if (provider.engine === 'dockerfile') return {engine:'dockerfile',plugin:'service',extension:ext,label:'Dockerfile language service'};
  if (provider.engine === 'fourmolu') return { engine:'fourmolu',plugin:'fourmolu',extension:ext,label:'Fourmolu' };
  if (provider.engine === 'dprint') return { engine: 'dprint', plugin: provider.plugin as DprintPlugin,
    extension: ext, label: ['ruff','mago','roslyn'].includes(provider.plugin) ? `${provider.name} (dprint)` : 'dprint' };
  return { engine: 'prettier', plugin: provider.plugin as PrettierPlugin, parser: format.id, extension: ext, label: 'Prettier' };
}
/** Selection is independent of installation and never falls back to another provider. */
export function formatterFor(path: string, language?: string, choices: FormatterChoices = {}): FormatterRoute | undefined {
  const id = formatIdFor(path, language), format = formats.find(format => format.id === id);
  if (!format) return undefined;
  const ext = path.replaceAll('\\','/').split('/').at(-1)!.toLowerCase().split('.').at(-1)!;
  const preserve = formatIdFor(path) === id && extensions[ext] === id;
  return routeForProvider(format.id, selectedProvider(format,choices), preserve ? ext : format.extension);
}
export function supportsFormatting(path: string, language?: string): boolean { return formatterFor(path, language) !== undefined; }

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import definitions from './providers.json' with { type: 'json' };
export type FormatterChoices = Record<string, string>;
export const providers = definitions;
export interface FormatDefinition { id: string; label: string; extension: string; providers: string[]; defaultProvider: string; sample: string }
const d = (name: string) => `dprint-${name}`, p = (name: string) => `prettier-${name}`;
const format = (id: string, label: string, extension: string, options: string[], sample: string): FormatDefinition =>
  ({ id, label, extension, providers: options, defaultProvider: options[0]!, sample });
const markup = [d('markup'), d('lax-markup')], styles = [d('malva'), d('lax-css')];
export const formats: readonly FormatDefinition[] = [
  format('javascript', 'JavaScript', 'js', [d('typescript')], 'const value={answer:42};'),
  format('typescript', 'TypeScript', 'ts', [d('typescript')], 'const value:{answer:number}={answer:42};'),
  format('jsx', 'JSX', 'jsx', [d('typescript')], 'const element=<div className="sample">hello</div>;'),
  format('tsx', 'TSX', 'tsx', [d('typescript')], 'const element=<div className="sample">hello</div>;'),
  format('json', 'JSON', 'json', [d('json')], '{"answer":42,"items":[1,2]}'),
  format('jsonc', 'JSON with comments', 'jsonc', [d('json')], '{// value\n"answer":42}'),
  format('markdown', 'Markdown', 'md', [d('markdown'), d('panache')], '#    Heading\n\n-   item\n'),
  format('toml', 'TOML', 'toml', [d('toml')], 'answer=42\n'),
  format('dockerfile', 'Dockerfile', 'dockerfile', [d('dockerfile'),'dockerfile-service'], 'FROM   alpine:3.20\nRUN    echo hello\n'),
  format('wgsl','WGSL','wgsl',['wgsl-service'],'@compute @workgroup_size(1) fn main(){let value=1;}'),
  format('haskell', 'Haskell', 'hs', ['fourmolu'], 'module Main where\nmain=putStrLn "hello"\n'),
  format('python', 'Python', 'py', [d('ruff')], 'value={"answer":42}\n'),
  format('php', 'PHP', 'php', [d('mago')], '<?php $value=["answer"=>42];'),
  format('csharp', 'C#', 'cs', [d('roslyn')], 'class Example{int Add(int a,int b){return a+b;}}'),
  format('vb-net', 'Visual Basic', 'vb', [d('roslyn')], 'Module Example\nSub Main()\nDim value=1+2\nEnd Sub\nEnd Module'),
  format('jupyter', 'Jupyter notebooks', 'ipynb', [d('jupyter')], '{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":5}'),
  format('html', 'HTML', 'html', [p('html'), ...markup], '<div   class="sample"><span>hello</span></div>'),
  format('vue', 'Vue', 'vue', [p('html'), ...markup], '<template><div   class="sample">{{message}}</div></template>'),
  format('angular', 'Angular templates', 'component.html', [p('html'), d('markup')], '<div   *ngIf="ready">{{name}}</div>'),
  format('svelte', 'Svelte', 'svelte', [p('svelte'), ...markup], '<script>let count=0;</script><button onclick={()=>count++}>{count}</button>'),
  format('xml', 'XML / SVG', 'xml', [p('xml'), ...markup], '<root><item a = "b"/></root>'),
  format('css', 'CSS', 'css', [p('postcss'), ...styles], 'a{color:red;margin:0}'),
  format('scss', 'SCSS', 'scss', [p('postcss'), ...styles], '$color:red;a{color:$color}'),
  format('less', 'Less', 'less', [p('postcss'), ...styles], '@color:red;a{color:@color}'),
  format('sass', 'Sass (indented)', 'sass', [d('malva')], '$color: red\na\n  color: $color\n'),
  format('yaml', 'YAML', 'yaml', [p('yaml'), d('pretty-yaml')], 'answer:    42\nitems: [one,two]\n'),
  format('graphql', 'GraphQL', 'graphql', [p('graphql'), d('pretty-graphql')], 'query Example{viewer{id name}}'),
  format('astro', 'Astro', 'astro', markup, '---\nconst name="hello";\n---\n<div   class="sample">{name}</div>'),
  ...[['jinja','Jinja','jinja'],['twig','Twig','twig'],['nunjucks','Nunjucks','njk'],['vento','Vento','vto'],['mustache','Mustache','mustache'],['handlebars','Handlebars','hbs']].map(([id,label,ext]) =>
    format(id!,label!,ext!,[d('markup')], '<div   class="sample">hello</div>')),
  format('go', 'Go', 'go', [d('gofumpt')], 'package main\nfunc main(){println("hello")}\n'),
  format('typst', 'Typst', 'typ', [d('typstyle'), d('typstyle-apcamargo')], '#let value=(1,2,3)\n#value\n'),
  format('shell', 'Shell scripts', 'sh', [d('sh')], '#!/bin/sh\nif true;then\necho hello\nfi\n'),
  format('sql', 'SQL', 'sql', [d('lax-sql'),'postgres-service'], 'select id,name from users where id=1;'),
  format('nix', 'Nix', 'nix', [d('nix')], '{pkgs,...}:{value=1;items=[1 2];}\n'),
  format('kdl', 'KDL', 'kdl', [d('kdl')], 'node    "value" key=1\n'),
  format('c', 'C', 'c', [d('clang-format')], 'int add(int a,int b){return a+b;}'),
  format('cpp', 'C++', 'cpp', [d('clang-format')], 'class Example{public:int add(int a,int b){return a+b;}};'),
  format('objective-c', 'Objective-C', 'm', [d('clang-format')], '@interface Example:NSObject\n-(void)method;\n@end'),
  format('objective-cpp', 'Objective-C++', 'mm', [d('clang-format')], 'int add(int a,int b){return a+b;}'),
  format('quarto', 'Quarto', 'qmd', [d('panache')], '#    Heading\n\nA   paragraph.\n'),
  format('rmarkdown', 'R Markdown', 'Rmd', [d('panache')], '#    Heading\n\nA   paragraph.\n'),
  format('pandoc', 'Pandoc Markdown', 'md', [d('panache')], '#    Heading\n\nA   paragraph.\n'),
  format('latex', 'LaTeX', 'tex', [d('badness')], '\\documentclass{article}\n\\begin{document}\nHello   world.\n\\end{document}\n'),
  format('bibtex', 'BibTeX', 'bib', [d('badness'),d('bibtex-tidy')], '@article{example,title={Example},author={Doe, Jane},year={2026}}\n'),
  format('julia', 'Julia', 'jl', [d('fatou')], 'function add(a,b)\na+b\nend\n'),
  format('r', 'R', 'r', [d('arity')], 'value<-function(x){x+1}\n'),
];
export function normalizeFormatterChoices(value: unknown): FormatterChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(formats.flatMap(format => {
    const provider = (value as Record<string, unknown>)[format.id];
    return typeof provider === 'string' && (provider === 'none' || format.providers.includes(provider)) ? [[format.id, provider]] : [];
  }));
}
export function selectedProvider(format: FormatDefinition, choices: FormatterChoices): string {
  return choices[format.id] ?? format.defaultProvider;
}
export interface FormatterMeasurement { provider: string; format: string; sha256: string; coldMs: number; warmMs: number; measuredAt: number }
export function recommendedProvider(format: FormatDefinition, measurements: readonly FormatterMeasurement[] = []): string {
  const official = format.providers.filter(id => providers.find(provider => provider.id === id)?.support === 'official');
  const candidates = official.length ? official : format.providers;
  const measured = measurements.filter(item => item.format === format.id && candidates.includes(item.provider));
  // Compare only when all equally supported candidates have measurements.
  if (candidates.every(id => measured.some(item => item.provider === id))) {
    return [...measured].sort((a,b) => a.warmMs - b.warmMs || a.coldMs - b.coldMs)[0]?.provider ?? candidates[0]!;
  }
  return candidates[0]!;
}

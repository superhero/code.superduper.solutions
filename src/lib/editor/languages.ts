// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { optionalSyntax, type SyntaxChoices } from "../syntax/catalog.ts";
import type { Extension } from "@codemirror/state";

/** Keep the official catalog's parsers local and instantiate them on demand. */
export const languageDescriptions: readonly LanguageDescription[] = [
  ...languages.map(description => description.name === "HTML"
    ? LanguageDescription.of({name:description.name,alias:description.alias,extensions:description.extensions.filter(extension=>!["hbs","handlebars"].includes(extension)),load:()=>description.load()})
    : description.name === "Markdown"
    ? LanguageDescription.of({
      name: description.name, alias: description.alias, extensions: description.extensions,
      load: () => import("@codemirror/lang-markdown").then(({ markdown }) => markdown({ codeLanguages: languageDescriptions }))
    }) : description),
  LanguageDescription.of({ name: "Makefile", alias: ["make", "mk"], extensions: ["mk", "mak", "make"],
    filename: /^(?:GNUmakefile|BSDmakefile|Makefile)(?:\.(?:am|in))?$/i,
    load: () => import("codemirror-lang-makefile").then(({makefile})=>makefile()) }),
  LanguageDescription.of({ name: "Handlebars", alias: ["hbs"], extensions: ["hbs", "handlebars"],
    load: () => Promise.all([import("@xiechao/codemirror-lang-handlebars"), import("./handlebars.ts")])
      .then(([{handlebarsLanguage},{handlebarsSupport}])=>handlebarsSupport(handlebarsLanguage)) }),
  LanguageDescription.of({ name: "GraphQL", extensions: ["graphql", "gql", "graphqls"],
    load: () => import("cm6-graphql").then(({ graphqlLanguageSupport }) => graphqlLanguageSupport()) }),
  LanguageDescription.of({ name: "WGSL", extensions: ["wgsl"],
    load: () => import("@iizukak/codemirror-lang-wgsl").then(({ wgsl }) => wgsl()) }),
  LanguageDescription.of({ name: "Svelte", extensions: ["svelte"],
    load: () => import("@replit/codemirror-lang-svelte").then(({ svelte }) => svelte()) })
];

function languageId(description: LanguageDescription): string {
  return description.name.toLowerCase().replaceAll("++", "pp").replaceAll("#", "sharp")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const byId = new Map(languageDescriptions.map(description => [languageId(description), description]));
const filenameMatches = languageDescriptions.filter(description => description.filename).map(description => ({
  description, pattern: new RegExp(description.filename!.source, "i")
}));

/** Stable persisted identifiers with the upstream human-readable names. */
export const LANGUAGE_OPTIONS: readonly { id: string; label: string }[] = [
  { id: "auto", label: "Detect from filename" }, { id: "text", label: "Plain text" },
  ...optionalSyntax.map(item => ({ id: item.id, label: `${item.label} · Optional package` })),
  ...[...byId].map(([id, description]) => ({ id, label: description.name.replace(/\s*\([^)]*\)/g, "").trim() }))
    .sort((left, right) => left.label.localeCompare(right.label, "en"))
];
export const LANGUAGES: readonly string[] = LANGUAGE_OPTIONS.map(option => option.id);

export type LanguageMappings = Record<string, string>;
export function normalizeSuffix(value: string): string | undefined {
  const suffix='.'+value.trim().toLowerCase().replace(/^\*?\./,'');
  return suffix.length>1 && suffix.length<=128 && !suffix.includes('..') && !/[\/\\\s*?\[\]{}:]/.test(suffix) ? suffix : undefined;
}
export function normalizeLanguageMappings(value: unknown): LanguageMappings {
  if(!value || typeof value!=='object' || Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).flatMap(([raw,language])=>{
    const suffix=normalizeSuffix(raw);
    return suffix&&typeof language==='string'&&language!=='auto'&&LANGUAGES.includes(language) ? [[suffix,language]] : [];
  }));
}
/** The visible baseline follows the same first-match order as filename detection. */
const defaultSuffixes=new Map<string,string>();
for(const description of languageDescriptions)for(const extension of description.extensions){
  const suffix='.'+extension.toLowerCase();
  if(!defaultSuffixes.has(suffix))defaultSuffixes.set(suffix,description.name==='JSX'?'javascript':description.name==='TSX'?'typescript':languageId(description));
}
for(const item of optionalSyntax)for(const extension of item.extensions)defaultSuffixes.set('.'+extension,item.id);
export const DEFAULT_LANGUAGE_MAPPINGS: Readonly<LanguageMappings> = Object.freeze(Object.fromEntries(defaultSuffixes));
/** Limit settings to the open repository; undefined means no repository is open. */
export function relevantLanguageMappings(files: readonly string[] | undefined, mappings: LanguageMappings = {}): LanguageMappings {
  const available = { ...DEFAULT_LANGUAGE_MAPPINGS, ...mappings };
  if (files === undefined) return Object.fromEntries(
    [".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json", ".xml", ".md", ".yaml", ".yml"].map(suffix => [suffix, available[suffix] ?? "text"]));
  const result: LanguageMappings = {};
  for (const path of files) {
    const filename = path.replaceAll("\\", "/").split("/").at(-1)!.toLowerCase();
    for (const [suffix, id] of Object.entries(available)) if (filename.endsWith(suffix)) result[suffix] = id;
    const dot = filename.lastIndexOf(".");
    if (dot > 0 && dot < filename.length - 1) {
      const suffix = filename.slice(dot);
      result[suffix] ??= languageForPath(path, "auto", mappings);
    }
  }
  return result;
}

export function mappedLanguageForPath(path: string, mappings: LanguageMappings = {}): string | undefined {
  const filename=path.replaceAll('\\','/').split('/').at(-1)!.toLowerCase();
  const suffix=Object.keys(mappings).filter(suffix=>filename.endsWith(suffix)).sort((a,b)=>b.length-a.length)[0];
  return suffix ? mappings[suffix] : undefined;
}

export function languageForPath(path: string, override: string, mappings: LanguageMappings = {}): string {
  if (override !== "auto") return override;
  const mapped=mappedLanguageForPath(path,mappings);
  if(mapped)return mapped;
  const filename = path.replaceAll("\\","/").split("/").at(-1)!.toLowerCase();
  const optional = optionalSyntax.find(item=>item.extensions.some(extension=>filename.endsWith(`.${extension}`)));
  if (optional) return optional.id;
  const description = filenameMatches.find(entry => entry.pattern.test(filename))?.description
    ?? languageDescriptions.find(entry => entry.extensions.some(extension => filename.endsWith(`.${extension.toLowerCase()}`)));
  if (!description) return "text";
  // Retain the existing JavaScript/TypeScript preference identifiers for JSX files.
  if (description.name === "JSX") return "javascript";
  if (description.name === "TSX") return "typescript";
  return languageId(description);
}

const plainText: Promise<Extension> = Promise.resolve([]);

/** Descriptions cache their load promise; tab switches reuse the same parser. */
export function loadLanguage(path: string, setting: string, choices: SyntaxChoices = {}, mappings: LanguageMappings = {}): Promise<Extension> {
  let id = languageForPath(path, setting, mappings);
  if (id === "javascript" && path.toLowerCase().endsWith(".jsx")) id = "jsx";
  if (id === "typescript" && path.toLowerCase().endsWith(".tsx")) id = "tsx";
  if (choices[id] === false) return plainText;
  const optional = optionalSyntax.find(item=>item.id===id);
  if (optional) return choices[id] ? import("../syntax/loader.ts").then(module=>module.loadInstalledSyntax(id)) : plainText;
  if (id === "handlebars" && choices["handlebars-beta"]) return loadHandlebarsAlternative();
  if (id === "markdown" && (choices.hcl || choices["handlebars-beta"] || Object.values(choices).some(enabled=>enabled===false))) return markdownWithOptionalSyntax(choices);
  return byId.get(id)?.load() ?? plainText;
}

async function availableSyntax(): Promise<Set<string>> {
  const { syntaxRegistry } = await import("../syntax/registry.ts");
  const installed = await syntaxRegistry.installedPackages();
  return new Set(installed.filter(record=>syntaxRegistry.catalog.some(item=>record.id===item.id&&record.sha256===item.sha256)).map(record=>record.id));
}
async function loadHandlebarsAlternative(): Promise<Extension> {
  return (await availableSyntax()).has("handlebars-beta")
    ? (await import("../syntax/loader.ts")).loadInstalledSyntax("handlebars-beta")
    : byId.get("handlebars")!.load();
}
async function markdownWithOptionalSyntax(choices: SyntaxChoices): Promise<Extension> {
  const ready=choices.hcl || choices["handlebars-beta"] ? await availableSyntax() : new Set<string>();
  const descriptions=languageDescriptions.filter(description=>choices[languageId(description)]!==false).map(description=>description.name==="Handlebars"&&choices["handlebars-beta"]&&ready.has("handlebars-beta")
    ? LanguageDescription.of({name:"Handlebars",alias:["hbs"],extensions:["hbs","handlebars"],load:()=>import("../syntax/loader.ts").then(module=>module.loadInstalledSyntax("handlebars-beta"))})
    : description);
  if(choices.hcl&&ready.has("hcl"))descriptions.push(LanguageDescription.of({name:"HCL",alias:["terraform","tf","tfvars"],extensions:["hcl","tf","tfvars"],
    load:()=>import("../syntax/loader.ts").then(module=>module.loadInstalledSyntax("hcl"))}));
  const {markdown}=await import("@codemirror/lang-markdown");
  return markdown({codeLanguages:descriptions});
}

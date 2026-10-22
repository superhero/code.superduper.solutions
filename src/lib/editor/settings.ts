// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

import { normalizeSkills, mergeSkills, type AISkills } from "../assistant/skills.ts";
import { DEFAULT_INSTRUCTIONS, DEFAULT_TOOLS, normalizeTools, normalizeContexts, type ToolChoices } from "../assistant/configuration.ts";
import { normalizeKeybindings, type KeybindingChoices } from "./keybindings.ts";
import { normalizeColorMappings, type ColorMappings } from "./color-mappings.ts";

import { editorFontChoices, interfaceFontChoices } from "./fonts.ts";
import { optionalSyntax, normalizeSyntaxChoices, type SyntaxChoices } from "../syntax/catalog.ts";
import { engineLanguages, engines, normalizeEngineChoices, type EngineChoices } from "../intelligence/catalog.ts";
import {normalizeTypeLibraryChoices,type TypeLibraryChoices} from "../intelligence/type-libraries.ts";
import { formats, normalizeFormatterChoices, type FormatterChoices } from "../formatting/formats.ts";
import { LANGUAGES, normalizeLanguageMappings, type LanguageMappings } from "./languages.ts";
export { LANGUAGES, languageForPath } from "./languages.ts";

/** Preferences stay outside source files; deliberate changes join application history. */
export const PALETTES = ["default", "sunset", "alpine", "obsidian", "midnight-gold", "neon", "lantern", "spring", "bonfire", "harvest-moon", "blue-horizon", "golden-violet", "citrus", "sunflower", "garden-dusk", "autumn", "rainfall", "graphite-study", "steel-and-mist", "carbon", "heritage-noir"] as const;
export const INTERFACE_FONTS = interfaceFontChoices;
export const FILE_OVERRIDE_KEYS = ["indentSize", "tabSize", "indentWithTabs", "tabBehavior", "lineWrapping", "readOnly", "historyLimit"] as const;

export interface EditorSettings {
  showAISendButton: boolean;
  aiEnterAction: "send" | "newline";
  aiInstructions: string;
  aiSkills: AISkills;
  aiTools: ToolChoices;
  aiModelContexts: Record<string, number>;
  colorMappings: ColorMappings;
  selectionOpacity: number;
  languageMappings: LanguageMappings;
  syntaxPackages: SyntaxChoices;
  keybindings: KeybindingChoices;
  formatters: FormatterChoices;
  languageEngines: EngineChoices;
  typeLibraries: TypeLibraryChoices;
  palette: string;
  mode: "light" | "dark" | "system";
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  interfaceFont: typeof INTERFACE_FONTS[number];
  interfaceSize: "small" | "medium" | "large";
  indentSize: number;
  tabSize: number;
  indentWithTabs: boolean;
  tabBehavior: "focus" | "indent";
  lineWrapping: boolean;
  fileExplorerIcons: boolean;
  middleClickClosesTabs: boolean;
  editorFooter: boolean;
  showSettingsUndoButton: boolean;
  showSettingsRedoButton: boolean;
  showSettingsResetButton: boolean;
  showSettingsKeybindingsResetButton: boolean;
  showHistoryUndoButton: boolean;
  showHistoryRedoButton: boolean;
  showUndoButton: boolean;
  showRedoButton: boolean;
  showCommitHistoryButton: boolean;
  showStagedHistoryButton: boolean;
  showZoomOutButton: boolean;
  showZoomInButton: boolean;
  showFormatButton: boolean;
  showDiffButton: boolean;
  showCommitButton: boolean;
  showGitButton: boolean;
  showHistoryCommitButton: boolean;
  showHistoryGitButton: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  scrollbars: boolean;
  historyLimit: number;
  scrollSpeed: number;
  smoothScrolling: boolean;
  foldGutter: boolean;
  highlightActiveLine: boolean;
  bracketMatching: boolean;
  closeBrackets: boolean;
  autocomplete: boolean;
  indentOnInput: boolean;
  highlightWhitespace: boolean;
  readOnly: boolean;
}

export interface SettingsStore {
  version: 1;
  global: EditorSettings;
  repositories: Record<string, Partial<EditorSettings>>;
  files: Record<string, Record<string, Partial<EditorSettings>>>;
}

export const DEFAULT_SETTINGS: Readonly<EditorSettings> = Object.freeze({
  showAISendButton: false, aiEnterAction: "send",
  aiInstructions: DEFAULT_INSTRUCTIONS, aiSkills: {}, aiTools: DEFAULT_TOOLS, aiModelContexts: {},
  colorMappings: {}, selectionOpacity: 20,
  showSettingsUndoButton: true, showSettingsRedoButton: true, showSettingsResetButton: false, showSettingsKeybindingsResetButton: false,
  showHistoryUndoButton: true, showHistoryRedoButton: true,
  showUndoButton: true, showRedoButton: true, showCommitHistoryButton: true, showStagedHistoryButton: true, showZoomOutButton: true,
  showZoomInButton: true, showFormatButton: true, showDiffButton: true, showCommitButton: true, showGitButton: true, showHistoryCommitButton: true, showHistoryGitButton: true,
  languageMappings: {},
  keybindings: {},
  syntaxPackages: Object.fromEntries([...optionalSyntax.map(item=>[item.id,true] as const), ["handlebars-beta",false]]),
  formatters: Object.fromEntries(formats.map(format=>[format.id,format.providers[0]!])),
  languageEngines: Object.fromEntries(engineLanguages.map(language=>[language,engines.find(engine=>(engine.languages as readonly string[]).includes(language))!.id])),
  typeLibraries: {},
  palette: "bonfire", mode: "dark", fontSize: 13, lineHeight: 1.7,
  interfaceFont: "google:Geomini", interfaceSize: "medium", fontFamily: "google:JetBrains Mono", indentSize: 2, tabSize: 4, indentWithTabs: false,
  tabBehavior: "indent", fileExplorerIcons: true, middleClickClosesTabs: true, editorFooter: false, lineWrapping: false, lineNumbers: true, minimap: true, scrollbars: false, historyLimit: 300, scrollSpeed: 1, smoothScrolling: true, foldGutter: true,
  highlightActiveLine: true, bracketMatching: true, closeBrackets: true,
  autocomplete: true, indentOnInput: true, highlightWhitespace: false,
  readOnly: false
});

/** Validate persisted settings without retaining unknown or malformed fields. */
export function normalizeOverrides(value: unknown): Partial<EditorSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  const choices: Partial<Record<keyof EditorSettings, readonly string[]>> = {
    palette: PALETTES, mode: ["light", "dark", "system"], fontFamily: editorFontChoices, interfaceFont: INTERFACE_FONTS, interfaceSize: ["small", "medium", "large"],
    tabBehavior: ["focus", "indent"], aiEnterAction: ["send", "newline"]
  };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof EditorSettings)[]) {
    const current = input[key];
    const allowed = choices[key];
    if (key === "aiSkills") {
      if (current && typeof current === "object" && !Array.isArray(current)) output[key] = normalizeSkills(current);
    } else if (key === "aiInstructions") {
      if (typeof current === "string") output[key] = current.slice(0, 16000);
    } else if (key === "aiTools") {
      if (current && typeof current === "object" && !Array.isArray(current)) output[key] = normalizeTools(current);
    } else if (key === "aiModelContexts") {
      if (current && typeof current === "object" && !Array.isArray(current)) output[key] = normalizeContexts(current);
    } else if (key === "colorMappings") {
      if (current && typeof current === "object" && !Array.isArray(current)) output[key] = normalizeColorMappings(current);
    } else if (key === "keybindings") {
      if (current && typeof current === "object" && !Array.isArray(current)) output[key] = normalizeKeybindings(current);
    } else if (key === "languageMappings") {
      if(current && typeof current === "object" && !Array.isArray(current)) output[key]=normalizeLanguageMappings(current);
    } else if (key === "syntaxPackages") {
      if (current && typeof current === "object" && !Array.isArray(current)) output[key] = normalizeSyntaxChoices(current, LANGUAGES);
    } else if (key === "languageEngines") {
      if (current && typeof current === "object" && !Array.isArray(current)) output[key] = normalizeEngineChoices(current);
    } else if (key === "typeLibraries") {
      if (current && typeof current === "object" && !Array.isArray(current)) output[key] = normalizeTypeLibraryChoices(current);
    } else if (key === "formatters") {
      if (current && typeof current === "object" && !Array.isArray(current)) output[key] = normalizeFormatterChoices(current);
    } else if (allowed) {
      if (typeof current === "string" && allowed.includes(current)) output[key] = current;
    } else if (typeof DEFAULT_SETTINGS[key] === "boolean") {
      if (typeof current === "boolean") output[key] = current;
    } else if (typeof current === "number" && Number.isFinite(current)) {
      const [minimum, maximum] = key === "selectionOpacity" ? [0, 100] : key === "historyLimit" ? [0, 10000] : key === "fontSize" ? [7, 32] : key === "lineHeight" ? [1.2, 2.4] : key === "scrollSpeed" ? [.25, 5] : [0, 12];
      output[key] = Math.min(maximum!, Math.max(minimum!, (key === "lineHeight" || key === "scrollSpeed") ? current : Math.round(current)));
    }
  }
  return output as Partial<EditorSettings>;
}

export function normalizeSettings(value: unknown): SettingsStore {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const global = { ...DEFAULT_SETTINGS, ...normalizeOverrides(input.global) };
  global.aiSkills = { ...global.aiSkills };
  global.aiTools = { ...global.aiTools };
  global.aiModelContexts = { ...global.aiModelContexts };
  global.keybindings = { ...global.keybindings };
  global.colorMappings = { ...global.colorMappings };
  global.languageMappings = { ...global.languageMappings };
  global.syntaxPackages = { ...DEFAULT_SETTINGS.syntaxPackages, ...global.syntaxPackages };
  global.languageEngines = { ...DEFAULT_SETTINGS.languageEngines, ...global.languageEngines };
  global.typeLibraries = {...global.typeLibraries};
  global.formatters = { ...DEFAULT_SETTINGS.formatters, ...global.formatters };
  // Legacy snapshots serialized the old focus default, indistinguishable from a
  // deliberate choice. Migrate it once; focus remains selectable afterward.
  if (input.version === undefined && global.tabBehavior === "focus") global.tabBehavior = "indent";
  const repositories: Record<string, Partial<EditorSettings>> = {};
  if (input.repositories && typeof input.repositories === "object" && !Array.isArray(input.repositories)) {
    for (const [id, overrides] of Object.entries(input.repositories)) {
      if (id !== "__proto__" && id !== "constructor" && id !== "prototype")
        repositories[id] = normalizeOverrides(overrides);
    }
  }
  const files: SettingsStore["files"] = {};
  if (input.files && typeof input.files === "object" && !Array.isArray(input.files)) {
    for (const [id, entries] of Object.entries(input.files)) {
      if (id === "__proto__" || id === "constructor" || id === "prototype" || !entries || typeof entries !== "object" || Array.isArray(entries)) continue;
      files[id] = Object.fromEntries(Object.entries(entries).map(([path, value]) => [path,
        Object.fromEntries(Object.entries(normalizeOverrides(value)).filter(([key]) => (FILE_OVERRIDE_KEYS as readonly string[]).includes(key))) ]));
    }
  }
  return { version: 1, global, repositories, files };
}

export function resolveSettings(settings: SettingsStore, repositoryId?: string, path?: string, fileConfiguration: Partial<EditorSettings> = {}): EditorSettings {
  return { ...settings.global, ...(repositoryId ? settings.repositories[repositoryId] : {}),
    ...(path ? fileConfiguration : {}), ...(repositoryId && path ? settings.files[repositoryId]?.[path] : {}),
    aiSkills: mergeSkills(settings.global.aiSkills, repositoryId ? settings.repositories[repositoryId]?.aiSkills : {}),
    aiModelContexts: { ...settings.global.aiModelContexts, ...(repositoryId ? settings.repositories[repositoryId]?.aiModelContexts : {}) },
    colorMappings: { ...settings.global.colorMappings, ...(repositoryId ? settings.repositories[repositoryId]?.colorMappings : {}) },
    keybindings: { ...settings.global.keybindings, ...(repositoryId ? settings.repositories[repositoryId]?.keybindings : {}) },
    languageMappings: { ...settings.global.languageMappings, ...(repositoryId ? settings.repositories[repositoryId]?.languageMappings : {}) },
    syntaxPackages: { ...settings.global.syntaxPackages, ...(repositoryId ? settings.repositories[repositoryId]?.syntaxPackages : {}) },
    languageEngines: { ...settings.global.languageEngines, ...(repositoryId ? settings.repositories[repositoryId]?.languageEngines : {}) },
    typeLibraries: {...settings.global.typeLibraries,...(repositoryId?settings.repositories[repositoryId]?.typeLibraries:{})},
    formatters: { ...settings.global.formatters, ...(repositoryId ? settings.repositories[repositoryId]?.formatters : {}) } };
}


/** A successful explicit install also selects its support in personal defaults. */
export function activateInstalledPackage(store: SettingsStore, kind: "syntax" | "engine" | "formatter", id: string): SettingsStore {
  const global = { ...store.global };
  if (kind === "syntax") {
    if (id !== "hcl" && id !== "handlebars-beta") return store;
    global.syntaxPackages = { ...global.syntaxPackages, [id]: true,
      ...(id === "handlebars-beta" ? { handlebars: true } : {}) };
  } else if (kind === "engine") {
    const engine = engines.find(item => item.id === id);
    if (!engine) return store;
    global.languageEngines = { ...global.languageEngines,
      ...Object.fromEntries(engine.languages.map(language => [language, id])) };
  } else {
    const supported = formats.filter(format => format.providers.includes(id));
    if (!supported.length) return store;
    global.formatters = { ...global.formatters,
      ...Object.fromEntries(supported.map(format => [format.id, id])) };
  }
  return { ...store, global };
}

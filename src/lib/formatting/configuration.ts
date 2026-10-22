// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import ignore from "ignore";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import { braceExpand, minimatch } from "minimatch";
import { parseDocument } from "yaml";

type Options = Record<string, unknown>;
type ReadFile = (path: string) => Promise<string>;
export type FormattingConfiguration = { dprint?: Options; prettier?: Options; fourmolu?: Options };

const dprintNames = ["dprint.json", ".dprint.json", "dprint.jsonc", ".dprint.jsonc"];
const prettierNames = ["package.json", ".prettierrc", ".prettierrc.json", ".prettierrc.yml", ".prettierrc.yaml",
  ".prettierrc.json5", ".prettierrc.js", "prettier.config.js", ".prettierrc.ts", "prettier.config.ts",
  ".prettierrc.mjs", "prettier.config.mjs", ".prettierrc.mts", "prettier.config.mts",
  ".prettierrc.cjs", "prettier.config.cjs", ".prettierrc.cts", "prettier.config.cts", ".prettierrc.toml"];
const bundledPrettierPlugins = new Set(["prettier-plugin-svelte", "@prettier/plugin-xml",
  ...["html", "postcss", "yaml", "graphql", "babel", "typescript", "estree"].map(name => `prettier/plugins/${name}`)]);

function invalid(path: string, reason: string): never {
  throw new Error(`Invalid formatting configuration ${path}: ${reason}`);
}

function object(value: unknown, path: string): Options {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(path, "expected an options object.");
  return value as Options;
}

async function text(readFile: ReadFile, path: string) {
  const contents = await readFile(path);
  if (contents.length > 65_536) invalid(path, "exceeds the supported size limit (65,536 characters).");
  return contents;
}

function parse(contents: string, path: string, format: "json" | "jsonc" | "yaml"): unknown {
  try {
    if (format === "json") return JSON.parse(contents.replace(/^\uFEFF/, ""));
    if (format === "jsonc") {
      const errors: ParseError[] = [];
      const result: unknown = parseJsonc(contents, errors, { allowTrailingComma: true });
      if (errors.length) throw new Error();
      return result;
    }
    const document = parseDocument(contents, { strict: true, uniqueKeys: true });
    if (document.errors.length || document.warnings.length) throw new Error();
    return document.toJS({ maxAliasCount: 50 });
  } catch {
    invalid(path, `malformed ${format.toUpperCase()} data.`);
  }
}

/** Reject cyclic aliases and non-data objects before passing options to a formatter. */
function validateData(value: unknown, path: string, ancestors = new Set<object>(), depth = 0): void {
  if (depth > 32) invalid(path, "options exceed the supported nesting depth.");
  if (value === null || typeof value !== "object") return;
  if (ancestors.has(value)) invalid(path, "cyclic YAML aliases are unsupported.");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) invalid(path, "only data objects are supported.");
  ancestors.add(value);
  for (const [key, entry] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) invalid(path, "unsafe object key.");
    validateData(entry, path, ancestors, depth + 1);
  }
  ancestors.delete(value);
}

function patterns(value: unknown, path: string, allowString = false): string[] {
  const values = allowString && typeof value === "string" ? [value] : value;
  if (!Array.isArray(values) || values.some(item => typeof item !== "string" || !item || item.length > 1024)) {
    invalid(path, "file patterns must be strings of 1–1024 characters.");
  }
  return values as string[];
}

function matches(path: string, pattern: string) {
  const rooted = pattern.startsWith("/") || pattern.startsWith("./");
  const normalized = pattern.replace(/^(?:\.\/|\/)/, "");
  return minimatch(path, normalized, { dot: true, matchBase: !rooted && !normalized.includes("/"),
    nonegate: true, nocomment: true, braceExpandMax: 128 });
}

function matchesIncludes(path: string, includes: string[]) {
  let included = includes.length > 0 && includes.every(pattern => pattern.startsWith("!"));
  for (const pattern of includes) {
    const negative = pattern.startsWith("!");
    if (matches(path, negative ? pattern.slice(1) : pattern)) included = !negative;
  }
  return included;
}

function rejectExternal(config: Options, path: string) {
  if ("extends" in config) invalid(path, "extends is unsupported in the browser; use a self-contained data config without external or network loading.");
  if (config.inherit === true) invalid(path, "inherit is unsupported in the browser; put the required options in the nearest config.");
}

function dprintOptions(config: Options, relativePath: string, configPath: string): Options {
  rejectExternal(config, configPath);
  if ("includes" in config && !matchesIncludes(relativePath, patterns(config.includes, configPath))) {
    throw new Error(`Formatting excluded for ${relativePath}: it does not match includes in ${configPath}.`);
  }
  if ("excludes" in config) {
    const excluded = patterns(config.excludes, configPath).flatMap(pattern => braceExpand(pattern, { braceExpandMax: 128 }));
    if (ignore({ ignorecase: false }).add(excluded).ignores(relativePath)) {
      throw new Error(`Formatting excluded for ${relativePath} by ${configPath}.`);
    }
  }
  if ("plugins" in config) patterns(config.plugins, configPath);
  return Object.fromEntries(Object.entries(config).filter(([key]) => !["$schema", "plugins", "includes", "excludes", "inherit"].includes(key)));
}

function prettierOptions(config: Options, relativePath: string, configPath: string): Options {
  rejectExternal(config, configPath);
  const { overrides, $schema: _schema, ...base } = config;
  let result = base;
  if (overrides !== undefined) {
    if (!Array.isArray(overrides)) invalid(configPath, "overrides must be an array.");
    for (const entry of overrides) {
      const override = object(entry, configPath);
      const files = patterns(override.files, configPath, true);
      const excluded = override.excludeFiles === undefined ? [] : patterns(override.excludeFiles, configPath, true);
      const options = object(override.options, configPath);
      if (files.some(pattern => matches(relativePath, pattern)) && !excluded.some(pattern => matches(relativePath, pattern))) {
        result = { ...result, ...options };
      }
    }
  }
  rejectExternal(result, configPath);
  for (const key of ["filepath", "rangeStart", "rangeEnd", "cursorOffset", "svelte5CompilerPath"]) {
    if (key in result) invalid(configPath, `${key} is unsupported; formatting uses the bundled parser for the entire selected file.`);
  }
  if ("plugins" in result) {
    for (const plugin of patterns(result.plugins, configPath)) {
      if (!bundledPrettierPlugins.has(plugin)) invalid(configPath, `plugin ${plugin} is unavailable; repository plugin code cannot run in the browser.`);
    }
    delete result.plugins;
  }
  return result;
}

/** Resolve repository-local, data-only configs. Never import scripts or fetch config/plugins. */
export async function resolveFormattingConfiguration(paths: string[], readFile: ReadFile, path: string,
  engine: "dprint" | "prettier" | "fourmolu" | "dockerfile" | "postgres" | "wgsl"): Promise<FormattingConfiguration> {
  if (["dockerfile","postgres","wgsl"].includes(engine)) return {}; // This provider uses effective indentation, not other formatters' configs.
  const available = new Set(paths);
  const directories = path.split("/");
  directories.pop();
  // The repository root is the browser equivalent of Prettier's working directory.
  if (engine === "prettier" && available.has(".prettierignore")) {
    const contents = await text(readFile, ".prettierignore");
    if (ignore({ ignorecase: false }).add(contents).ignores(path)) throw new Error(`Formatting excluded for ${path} by .prettierignore.`);
  }
  for (let depth = directories.length; depth >= 0; depth--) {
    const prefix = directories.slice(0, depth).join("/");
    for (const name of engine === "fourmolu" ? ["fourmolu.yaml"] : engine === "dprint" ? dprintNames : prettierNames) {
      const candidate = prefix ? `${prefix}/${name}` : name;
      if (!available.has(candidate)) continue;
      if (/\.[cm]?[jt]s$/.test(name)) invalid(candidate, "executable config requires Node; use a JSON or YAML data config in the browser.");
      if (name.endsWith(".json5") || name.endsWith(".toml")) invalid(candidate, "this config format is unsupported; use JSON or YAML data.");
      const format = engine === "dprint" ? "jsonc" : name.endsWith(".json") ? "json" : "yaml";
      let value = parse(await text(readFile, candidate), candidate, format);
      if (name === "package.json") {
        value = object(value, candidate).prettier;
        if (value === undefined || value === null) continue;
      }
      if (typeof value === "string") invalid(candidate, "shared config imports require Node or network loading; use a self-contained data config.");
      const config = object(value, candidate);
      validateData(config, candidate);
      const relativePath = prefix ? path.slice(prefix.length + 1) : path;
      if (engine === "fourmolu") {
        for (const key of ["fixities","local-modules","reexports","ghc-opt"]) if (key in config)
          invalid(candidate, `${key} is unsupported by the browser build; only printer options are available.`);
        return { fourmolu: config };
      }
      return engine === "dprint" ? { dprint: dprintOptions(config, relativePath, candidate) }
        : { prettier: prettierOptions(config, relativePath, candidate) };
    }
  }
  return {};
}

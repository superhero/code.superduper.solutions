// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Formatter, FormatRequest as DprintRequest, GlobalConfiguration } from "@dprint/formatter";
import type { Options, Plugin } from "prettier";
import { formatterFor } from "./routing.ts";
import type { DprintPlugin, FormatRequest, FormatterRoute } from "./types.ts";

import { packageFor, readPackage } from "./registry.ts";
import { decodePayload } from "./packages.ts";
const formatters = new Map<DprintPlugin, Promise<Formatter>>();
const modules = new Map<string, Promise<{ format(text: string, options: Options): Promise<string>; plugins: Plugin[]; initialize?(bytes:Uint8Array<ArrayBuffer>):Promise<void> }>>();
async function dprintFormatter(plugin: DprintPlugin): Promise<Formatter> {
  const item = packageFor({ engine: "dprint", plugin, label: "dprint", extension: "" });
  const { envelope } = await readPackage(item);
  let pending = formatters.get(plugin);
  if (!pending) {
    pending = import("@dprint/formatter").then(async dprint =>
      dprint.createFromWasmModule(await WebAssembly.compile(decodePayload(envelope))));
    formatters.set(plugin, pending);
    void pending.catch(() => formatters.delete(plugin));
  }
  return pending;
}
async function formatterModule(route: FormatterRoute) {
  const item = packageFor(route);
  const { envelope } = await readPackage(item);
  let pending = modules.get(item.sha256);
  if (!pending) {
    const url = URL.createObjectURL(new Blob([decodePayload(envelope)], { type: "text/javascript" }));
    // A template URL keeps Vite from injecting its Window-only query helper into this worker.
    pending = import(/* @vite-ignore */ `${url}`).then(async module => {
      if(envelope.resources)await module.initialize(envelope.resources);
      if (route.engine === "fourmolu") {
        if (typeof envelope.wasm !== "string" || typeof module.initialize !== "function") throw new Error("The Fourmolu package is incomplete.");
        await module.initialize(decodePayload({ ...envelope, payload: envelope.wasm }));
      }
      return module;
    }).finally(() => URL.revokeObjectURL(url));
    modules.set(item.sha256, pending!);
    void pending!.catch(() => modules.delete(item.sha256));
  }
  return pending!;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function configuredDprint(request: FormatRequest, plugin: DprintPlugin, formatter: Formatter): void {
  const configuration = request.options?.dprint ?? {};
  const global: GlobalConfiguration = { indentWidth: request.indentSize, useTabs: request.indentWithTabs };
  for (const key of ["lineWidth", "indentWidth", "useTabs", "newLineKind"] as const) {
    if (Object.hasOwn(configuration, key)) Object.assign(global, { [key]: configuration[key] });
  }
  const settings = { ...object(configuration[formatter.getPluginInfo().configKey]) };
  // This command formats documents; Ruff's optional lint fixes are a separate operation.
  if (plugin === "ruff") delete settings.fixLintErrors;
  formatter.setConfig(global, plugin === "ruff" ? {
    indentStyle: global.useTabs ? "tab" : "space", ...settings,
  } : settings);
  const diagnostics = formatter.getConfigDiagnostics();
  if (diagnostics.length) throw new Error(`Invalid ${plugin} formatter options: ${diagnostics.map(item => `${item.propertyName}: ${item.message}`).join("; ")}`);
}

function formatterPath(request: FormatRequest, route: FormatterRoute): string {
  const detected = formatterFor(request.path);
  if (detected?.engine === route.engine && detected.plugin === route.plugin && detected.extension === route.extension) return request.path;
  return `${request.path || "document"}.${route.extension}`;
}

async function formatPrettier(request: FormatRequest, route: Extract<FormatterRoute, { engine: "prettier" }>): Promise<string> {
  const supplied = request.options?.prettier ?? {};
  if (supplied.svelte5CompilerPath !== undefined) throw new Error("External Svelte compilers cannot run in the browser formatter.");
  const supportedParsers = route.plugin === "html" ? ["html", "vue", "angular"]
    : route.plugin === "postcss" ? ["css", "scss", "less"] : [route.parser];
  const parser = supplied.parser === undefined ? route.parser : supplied.parser;
  if (typeof parser !== "string" || !supportedParsers.includes(parser)) {
    throw new Error(`Unsupported Prettier parser override for ${request.path}: ${route.plugin} supports ${supportedParsers.join(", ")}.`);
  }
  const { format, plugins } = await formatterModule(route);
  const options: Options = {
    tabWidth: request.indentSize, useTabs: request.indentWithTabs,
    ...supplied, filepath: formatterPath(request, route), parser, plugins,
    rangeStart: 0, rangeEnd: Number.POSITIVE_INFINITY,
  };
  return format(request.text, options);
}

function embeddedKey(request: DprintRequest): string {
  return JSON.stringify([request.filePath, request.fileText, request.overrideConfig]);
}

async function formatDprint(request: FormatRequest, route: Extract<FormatterRoute, { engine: "dprint" }>, depth: number): Promise<string> {
  const formatter = await dprintFormatter(route.plugin);
  const embedded = new Map<string, DprintRequest>();
  const completed = new Map<string, string | Error>();
  const host = (nested: DprintRequest): string => {
    if (!formatterFor(nested.filePath, undefined, request.formatters)) return nested.fileText;
    const key = embeddedKey(nested);
    const result = completed.get(key);
    if (result instanceof Error) throw result;
    if (result !== undefined) return result;
    embedded.set(key, nested);
    return nested.fileText;
  };
  // dprint's host callback is synchronous. A discovery pass finds embedded requests;
  // an asynchronous pass formats them, then dprint receives their results unchanged.
  // This permits nested notebook/Markdown content and local Prettier parsers in the same worker.
  for (let pass = 0; pass < 8; pass++) {
    configuredDprint(request, route.plugin, formatter);
    formatter.setHostFormatter(host);
    embedded.clear();
    let result: string;
    try { result = formatter.formatText({ filePath: formatterPath(request, route), fileText: request.text }); }
    finally { formatter.setHostFormatter(undefined); }
    if (!embedded.size) return result;
    for (const [key, nested] of embedded) {
      try {
        const override = nested.overrideConfig ?? {};
        const prettier = { ...request.options?.prettier };
        // Explicit embedded-code controls also apply when its host chooses Prettier.
        if (typeof override.lineWidth === "number") prettier.printWidth = override.lineWidth;
        if (typeof override.indentWidth === "number") prettier.tabWidth = override.indentWidth;
        if (typeof override.useTabs === "boolean") prettier.useTabs = override.useTabs;
        if (["lf", "crlf", "auto"].includes(String(override.newLineKind))) prettier.endOfLine = override.newLineKind;
        const options = { ...request.options, dprint: { ...request.options?.dprint, ...override }, prettier };
        completed.set(key, await formatInWorker({
          path: nested.filePath, text: nested.fileText, formatters: request.formatters ?? {},
          indentSize: request.indentSize, indentWithTabs: request.indentWithTabs, options,
        }, depth + 1));
      } catch (error) {
        // Let dprint apply its configured embedded-code syntax error policy on replay.
        completed.set(key, error instanceof Error && /^(Install |Update )/.test(error.message)
          ? nested.fileText : error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
  throw new Error("Embedded formatting exceeded the supported nesting limit.");
}

/** Only imported by the worker; this module does not write repository files. */
export async function formatInWorker(request: FormatRequest, depth = 0): Promise<string> {
  if (depth > 8) throw new Error("Embedded formatting exceeded the supported nesting limit.");
  const route = formatterFor(request.path, request.language, request.formatters);
  if (!route) throw new Error(`No browser formatter is available for ${request.path || "this language"}.`);
  if (!Number.isInteger(request.indentSize) || request.indentSize < 0 || request.indentSize > 16) throw new Error("Formatter indentation must be between 0 and 16.");
  if (route.engine === "dockerfile" || route.engine === "postgres" || route.engine === "wgsl") {
    const {format}=await formatterModule(route);
    return format(request.text,{tabWidth:request.indentSize,useTabs:request.indentWithTabs});
  }
  if (route.engine === "fourmolu") {
    const { format } = await formatterModule(route);
    return format(request.text,{printerOpts:{indentation:request.indentSize,...request.options?.fourmolu},formatBackpack:route.extension === "hsig"});
  }
  return route.engine === "dprint" ? formatDprint(request, route, depth) : formatPrettier(request, route);
}

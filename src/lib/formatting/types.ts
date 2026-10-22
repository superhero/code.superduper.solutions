// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

export type DprintPlugin = "typescript" | "json" | "markdown" | "toml" | "dockerfile" | "ruff" | "mago" | "roslyn" | "jupyter" | "pretty-yaml" | "malva" | "markup" | "pretty-graphql" | "gofumpt" | "typstyle" | "sh" | "nix" | "kdl" | "lax-sql" | "lax-markup" | "lax-css" | "typstyle-apcamargo" | "bibtex-tidy" | "clang-format" | "panache" | "badness" | "fatou" | "arity";
export type PrettierPlugin = "html" | "postcss" | "yaml" | "graphql" | "xml" | "svelte";
export type FormatterRoute = { [Engine in "dockerfile" | "postgres" | "wgsl"]: {
  engine: Engine;
  plugin: "service";
  label: string;
  extension: string;
}}["dockerfile" | "postgres" | "wgsl"] | {
  engine: "fourmolu";
  plugin: "fourmolu";
  label: string;
  extension: string;
} | {
  engine: "dprint";
  plugin: DprintPlugin;
  label: string;
  extension: string;
} | {
  engine: "prettier";
  plugin: PrettierPlugin;
  parser: string;
  label: string;
  extension: string;
};

export interface FormatRequest {
  path: string;
  text: string;
  /** An explicit editor language; omitted or "auto" uses the filename. */
  language?: string;
  indentSize: number;
  indentWithTabs: boolean;
  formatters?: Record<string, string>;
  options?: { dprint?: Record<string, unknown>; prettier?: Record<string, unknown>; fourmolu?: Record<string, unknown> };
}

export type FormatFailure = { name: string; message: string; stack?: string; cause?: FormatFailure };
export type WorkerRequest = { id: number; request: FormatRequest };
export type WorkerResponse = { id: number; value: string } | { id: number; error: FormatFailure };

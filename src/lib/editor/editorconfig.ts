// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { minimatch } from "minimatch";
import { DEFAULT_SETTINGS, type EditorSettings } from "./settings.ts";

/** Read indentation preferences only; never silently reformat imported bytes. */
export function parseEditorConfig(contents: string, relativePath: string) {
  if (contents.length > 65_536) throw new Error("The .editorconfig exceeds the supported size limit (65,536 characters).");
  let root = false;
  let section = false;
  let matches = false;
  const properties: Record<string, string> = Object.create(null);
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      section = true;
      const pattern = line.slice(1, -1).replace(/^\//, "");
      if (pattern.length > 1024) throw new Error("An .editorconfig section exceeds 1024 characters.");
      matches = minimatch(relativePath, pattern, { dot: true, matchBase: !pattern.includes("/"),
        nonegate: true, nocomment: true, noext: true, braceExpandMax: 128 });
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error("An .editorconfig line is not a section or key=value pair.");
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim().toLowerCase();
    if (!section && key === "root") root = value === "true";
    if (section && matches && ["indent_style", "indent_size", "tab_width"].includes(key)) properties[key] = value;
  }
  return { root, properties };
}

export async function resolveFileConfiguration(paths: string[], readFile: (path: string) => Promise<string>,
  selectedPath: string, inherited: Readonly<EditorSettings> = DEFAULT_SETTINGS): Promise<Partial<EditorSettings>> {
  const parts = selectedPath.split("/");
  parts.pop();
  const layers: ReturnType<typeof parseEditorConfig>[] = [];
  for (let depth = parts.length; depth >= 0; depth--) {
    const prefix = parts.slice(0, depth).join("/");
    const config = prefix ? `${prefix}/.editorconfig` : ".editorconfig";
    if (!paths.includes(config)) continue;
    const layer = parseEditorConfig(await readFile(config), prefix ? selectedPath.slice(prefix.length + 1) : selectedPath);
    layers.unshift(layer);
    if (layer.root) break;
  }
  const properties: Record<string, string> = Object.create(null);
  for (const layer of layers) for (const [key, value] of Object.entries(layer.properties)) {
    if (value === "unset") delete properties[key]; else properties[key] = value;
  }
  const result: Partial<EditorSettings> = {};
  const width = (value: string | undefined) => value && /^[1-8]$/.test(value) ? Number(value) : undefined;
  const tabSize = width(properties.tab_width);
  let indentSize = width(properties.indent_size);
  if (properties.indent_style === "tab" || properties.indent_style === "space") result.indentWithTabs = properties.indent_style === "tab";
  if (properties.indent_size === "tab" || (properties.indent_style === "tab" && !properties.indent_size)) indentSize = tabSize ?? inherited.tabSize;
  if (indentSize !== undefined) result.indentSize = indentSize;
  if (tabSize !== undefined) result.tabSize = tabSize;
  else if (indentSize !== undefined) result.tabSize = indentSize;
  return result;
}

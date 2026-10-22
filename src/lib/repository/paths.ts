// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export function filePath(value: string, importing = false): string {
  if (typeof value !== "string" || !value || value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value))
    throw new Error("Use a relative file path without control characters or backslashes.");
  const parts = value.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) throw new Error("File paths cannot contain empty, dot, or parent segments.");
  const gitIndex = parts.findIndex(part => part.toLowerCase() === ".git");
  if (gitIndex !== -1) {
    if (!importing) throw new Error("Git metadata cannot be edited, moved, or nested inside a repository.");
    if (parts[gitIndex] !== ".git") throw new Error(`Cannot import "${value}": Git metadata must use the exact name .git.`);
    if (gitIndex > 0) throw new Error(`Cannot import "${value}": it belongs to a nested Git repository. Select that repository's directory separately to preserve its history.`);
    if (parts.length === 1) throw new Error('Cannot import ".git" as a working file: it is a Git directory link. Use Import directory and select its Git metadata when prompted.');
    if (parts.slice(1).some(part => part.toLowerCase() === ".git")) throw new Error(`Cannot import "${value}": Git metadata cannot contain another .git path.`);
  }
  return value;
}

export function repositoryPaths(id: string, root = "") {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error("Invalid repository identifier.");
  const dir = `${root}/repositories/${id}`;
  return { dir, gitdir: `${dir}/.git`, historyGitdir: `${root}/history/${id}` };
}

export function decodeText(bytes: Uint8Array): string {
  if (bytes.includes(0)) throw new Error("This is a binary file. Its bytes are preserved, but it cannot be edited as text.");
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch (cause) { throw new Error("This file is not UTF-8 text. Its bytes are preserved, but it cannot be edited as text.", { cause }); }
}

export function encodeText(value: string): Uint8Array {
  if (typeof value !== "string" || value.includes("\0")) throw new Error("Text edits cannot contain binary NUL bytes.");
  return new TextEncoder().encode(value);
}

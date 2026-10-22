// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { decodeText, filePath } from "./paths.ts";
import type { ImportedFile } from "./types.ts";

const invalidLink = "The imported .git file must contain a UTF-8 Git directory link (gitdir: <path>). Select a complete repository with its Git metadata.";

/** The returned path is a display hint, never a path the browser can access. */
export function gitDirectoryLink(files: ImportedFile[]): string | null {
  const links = files.filter(file => file.path === ".git");
  if (!links.length) return null;
  if (links.length !== 1) throw new Error("The import contains duplicate .git files. Select one repository directory.");
  let text: string;
  try { text = decodeText(links[0]!.data).replace(/\r?\n$/, ""); }
  catch (cause) { throw new Error(invalidLink, { cause }); }
  const path = text.startsWith("gitdir: ") ? text.slice(8) : "";
  if (!path.trim() || /[\u0000-\u001f\u007f]/.test(path)) throw new Error(invalidLink);
  return path;
}

/** Materialize explicitly selected Git metadata into a standalone import. */
export function attachGitDirectory(files: ImportedFile[], metadata: ImportedFile[]): ImportedFile[] {
  if (gitDirectoryLink(files) === null) throw new Error("This import does not contain a .git directory link. Import the repository directory directly.");
  if (files.some(file => file.path.startsWith(".git/"))) throw new Error("The import contains both a .git link and Git metadata. Select one repository directory.");
  if (!metadata.some(file => file.path === "HEAD")) throw new Error("The selected Git metadata directory has no HEAD file. Select the directory named by the .git link.");
  const attached = metadata.map(file => ({ path: filePath(`.git/${file.path}`, true), data: file.data }));
  if (new Set(attached.map(file => file.path)).size !== attached.length) throw new Error("The selected directory contains duplicate Git metadata paths.");
  return [...files.filter(file => file.path !== ".git"), ...attached];
}

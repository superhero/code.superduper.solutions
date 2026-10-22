// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { filePath } from "../repository/paths.ts";
import type { ImportedFile } from "../repository/types.ts";

interface DroppedFile {
  name: string;
  webkitRelativePath?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface DroppedEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  file?(success: (file: DroppedFile) => void, failure: (cause: unknown) => void): void;
  createReader?(): { readEntries(success: (entries: DroppedEntry[]) => void, failure: (cause: unknown) => void): void };
}

interface DroppedItem {
  kind: string;
  getAsEntry?(): DroppedEntry | null;
  webkitGetAsEntry?(): DroppedEntry | null;
  getAsFile(): DroppedFile | null;
}

interface DroppedTransfer {
  items?: ArrayLike<DroppedItem>;
  files?: ArrayLike<DroppedFile>;
}

function droppedPath(path: string): string {
  if (path.split("/").some(part => part.toLowerCase() === ".git")) {
    throw new Error("Dropped Git metadata cannot be added to a repository. Use Import directory to import a whole Git repository with its history.");
  }
  return filePath(path);
}

/** Call in the drop event: the browser protects DataTransfer after that event returns. */
export async function readDroppedFiles(transfer: DroppedTransfer): Promise<ImportedFile[]> {
  const sources: ({ entry: DroppedEntry } | { file: DroppedFile })[] = [];
  // Capture every entry and fallback File before the first asynchronous read.
  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = item.getAsEntry?.() ?? item.webkitGetAsEntry?.();
    if (entry) sources.push({ entry });
    else {
      const file = item.getAsFile();
      if (!file) throw new Error("The browser could not read a dropped file or folder. Try dropping its files instead.");
      sources.push({ file });
    }
  }
  if (!sources.length) {
    for (const file of Array.from(transfer.files ?? [])) sources.push({ file });
  }

  const files: ImportedFile[] = [];
  async function append(file: DroppedFile, path: string) {
    const safePath = droppedPath(path);
    files.push({ path: safePath, data: new Uint8Array(await file.arrayBuffer()) });
  }
  async function visit(entry: DroppedEntry, parent: string) {
    if (entry.name.includes("/")) throw new Error("Dropped entry names cannot contain path separators.");
    const path = droppedPath(parent ? `${parent}/${entry.name}` : entry.name);
    if (entry.isFile && entry.file) {
      const file = await new Promise<DroppedFile>((resolve, reject) => entry.file!(resolve, reject));
      await append(file, path);
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      // Chromium pages directory results; a short batch is not an end marker.
      while (true) {
        const entries = await new Promise<DroppedEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!entries.length) break;
        for (const child of entries) await visit(child, path);
      }
    } else throw new Error(`The browser cannot read the dropped entry "${path}".`);
  }

  for (const source of sources) {
    if ("entry" in source) await visit(source.entry, "");
    else await append(source.file, source.file.webkitRelativePath || source.file.name);
  }
  if (!files.length) throw new Error("No files were dropped. Empty folders are not stored in Git history.");
  return files;
}

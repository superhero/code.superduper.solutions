// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { filePath } from "../repository/paths.ts";

export type FileTreeNode = {
  name: string;
  path: string;
  kind: "directory" | "file";
  children: FileTreeNode[];
  preview?: true;
};

const names = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function compareFileTreeNodes(left: FileTreeNode, right: FileTreeNode): number {
  if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
  return names.compare(left.name, right.name) || Number(left.name > right.name) - Number(left.name < right.name);
}

/** Build presentation nodes without changing repository paths or their order. */
export function buildFileTree(paths: readonly string[]): FileTreeNode[] {
  const roots: FileTreeNode[] = [];
  const nodes = new Map<string, FileTreeNode>();
  for (const path of paths) {
    const parts = filePath(path).split("/");
    let siblings = roots;
    for (let index = 0; index < parts.length; index++) {
      const name = parts[index]!;
      const fullPath = parts.slice(0, index + 1).join("/");
      const kind = index === parts.length - 1 ? "file" : "directory";
      let node = nodes.get(fullPath);
      if (node) {
        if (node.kind !== kind) throw new Error(`A file and directory share the path "${fullPath}".`);
      } else {
        node = { name, path: fullPath, kind, children: [] };
        nodes.set(fullPath, node);
        siblings.push(node);
      }
      siblings = node.children;
    }
  }
  const sort = (siblings: FileTreeNode[]): void => {
    siblings.sort(compareFileTreeNodes);
    for (const node of siblings) if (node.kind === "directory") sort(node.children);
  };
  sort(roots);
  return roots;
}

/** Add a presentation-only destination without moving or changing real nodes. */
export function previewFileTree(
  nodes: FileTreeNode[],
  preview: { path: string; kind: "file" | "directory" } | null,
): FileTreeNode[] {
  if (!preview) return nodes;
  const parts = filePath(preview.path).split("/");
  const insert = (siblings: FileTreeNode[], depth: number): FileTreeNode[] => {
    const name = parts[depth]!;
    if (depth === parts.length - 1) {
      if (siblings.some(node => node.name === name)) return siblings;
      const ghost: FileTreeNode = { name, path: preview.path, kind: preview.kind, children: [], preview: true };
      return [...siblings, ghost].sort(compareFileTreeNodes);
    }
    const parent = siblings.find(node => node.name === name && node.kind === "directory");
    if (!parent) return siblings;
    const children = insert(parent.children, depth + 1);
    if (children === parent.children) return siblings;
    return siblings.map(node => node === parent ? { ...node, children } : node);
  };
  return insert(nodes, 0);
}

/** Return the keyboard navigation order for the currently expanded folders. */
export function visibleFileTree(nodes: readonly FileTreeNode[], expanded: ReadonlySet<string>): FileTreeNode[] {
  const visible: FileTreeNode[] = [];
  const visit = (siblings: readonly FileTreeNode[]): void => {
    for (const node of siblings) {
      visible.push(node);
      if (node.kind === "directory" && expanded.has(node.path)) visit(node.children);
    }
  };
  visit(nodes);
  return visible;
}

/** The empty selection and a root file have no ancestor directories. */
export function ancestorDirectories(path: string): string[] {
  const parts = path ? filePath(path).split("/") : [];
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

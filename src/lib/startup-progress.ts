// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { writable } from "svelte/store";

const definitions = [
  { id: "storage", title: "Opening local storage", kind: "storage", items: [
    ["storage.worker", "Files and Git worker"], ["storage.metadata", "Browser database"], ["storage.filesystem", "Local filesystem"]] },
  { id: "recovery", title: "Recovering unfinished work", kind: "brackets", items: [
    ["recovery.workspace", "Pending history and workspace updates"], ["recovery.repository", "Interrupted file operations"]] },
  { id: "repository", title: "Opening repository", kind: "folder", items: [
    ["repository.list", "Available repositories"], ["repository.selected", "Previously selected repository"]] },
  { id: "files", title: "Reading files and folders", kind: "typesetter", items: [
    ["files.scan", "Repository files"], ["files.tree", "Directory structure"]] },
  { id: "git", title: "Reading Git history", kind: "commits", items: [
    ["git.branches", "Current and local branches"], ["git.commits", "Source commits"], ["git.edits", "Private edit history"]] },
  { id: "history", title: "Restoring history state", kind: "stack", items: [
    ["history.position", "Application history position"], ["history.actions", "Undo and redo actions"]] },
  { id: "preferences", title: "Applying preferences", kind: "pipeline", items: [
    ["preferences.saved", "Saved editor settings"], ["preferences.rules", ".editorconfig rules"], ["preferences.appearance", "Theme and fonts"]] },
  { id: "editor", title: "Preparing the editor", kind: "editor", items: [
    ["editor.document", "Active file contents"], ["editor.language", "Syntax highlighting"], ["editor.layout", "Editing features and layout"]] },
  { id: "workspace", title: "Restoring viewport", kind: "fold", items: [
    ["workspace.tabs", "Open tabs and selected view"], ["workspace.folders", "Expanded folders"], ["workspace.position", "Cursor, focus and scroll position"]] },
] as const;

export type StartupItem = typeof definitions[number]["items"][number][0];
export type StartupStatus = "pending" | "running" | "complete" | "skipped" | "error";
export type StartupEvent = { item: StartupItem; status: StartupStatus };
export type StartupStage = {
  id: string; title: string; kind: typeof definitions[number]["kind"];
  items: { id: StartupItem; label: string; status: StartupStatus }[]; status: StartupStatus;
};
function initial(): { active: boolean; stages: StartupStage[] } {
  return { active: true, stages: definitions.map(stage => ({ ...stage, status: "pending",
    items: stage.items.map(([id, label]) => ({ id, label, status: "pending" })) })) };
}
const progress = writable(initial());
export const startupProgress = { subscribe: progress.subscribe };

function stageStatus(items: StartupStage["items"]): StartupStatus {
  if (items.some(item => item.status === "error")) return "error";
  if (items.every(item => item.status === "skipped")) return "skipped";
  if (items.every(item => item.status === "complete" || item.status === "skipped")) return "complete";
  if (items.some(item => item.status !== "pending")) return "running";
  return "pending";
}
export function resetStartupProgress(): void { progress.set(initial()); }
/** Called at actual operation boundaries, never advanced by an animation timer. */
export function updateStartupItem(item: StartupItem, status: StartupStatus): void {
  progress.update(state => {
    if (!state.active) return state;
    return { ...state, stages: state.stages.map(stage => {
      if (!stage.items.some(entry => entry.id === item && entry.status !== status)) return stage;
      const items = stage.items.map(entry => entry.id === item ? { ...entry, status } : entry);
      return { ...stage, items, status: stageStatus(items) };
    }) };
  });
}
export function skipStartupItems(...items: StartupItem[]): void {
  for (const item of items) updateStartupItem(item, "skipped");
}
/** Unreached work is skipped on failure; it must never be presented as completed. */
export function endStartupProgress(failed = false): void {
  progress.update(state => ({ active: false, stages: state.stages.map(stage => {
    const items = stage.items.map(item => ({ ...item, status: item.status === "pending" ? "skipped" as const
      : item.status === "running" ? failed ? "error" as const : "skipped" as const : item.status }));
    return { ...stage, items, status: stageStatus(items) };
  }) }));
}

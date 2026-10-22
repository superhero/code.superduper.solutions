// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import RepositoryWorker from "./worker.ts?worker&inline";
import type { RepositoryClient } from "./types.ts";
import type { StartupEvent, StartupItem } from "../startup-progress.ts";
import type { RemoteProgress } from "../remotes/types.ts";
export type { ImportedFile, RepositorySummary, RepositorySnapshot, Version, Author, ActivityState, ActivitySnapshot, ActivityCommand, ActivityRequest, ActivityResult, LegacyActivity } from "./types.ts";

type Failure = { name: string; message: string; stack?: string; cause?: Failure };
function deserialize(value: Failure): Error {
  const error = new Error(value.message, value.cause ? { cause: deserialize(value.cause) } : undefined);
  error.name = value.name;
  if (value.stack) error.stack = value.stack;
  return error;
}
let worker: Worker | undefined;
let nextId = 0;
let disposed = false;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const progressListeners = new Set<(event: StartupEvent) => void>();
const infrastructure = new Map<StartupItem, StartupEvent>();
const remoteListeners = new Set<(value: RemoteProgress) => void>();
export function subscribeRemoteProgress(listener: (value: RemoteProgress) => void): () => void { remoteListeners.add(listener); return () => { remoteListeners.delete(listener); }; }
function progress(event: StartupEvent): void {
  if (event.item.startsWith("storage.")) infrastructure.set(event.item, event);
  for (const listener of progressListeners) {
    try { listener(event); } catch { /* A loading display must not interrupt repository responses. */ }
  }
}
export function subscribeRepositoryProgress(listener: (event: StartupEvent) => void): () => void {
  const first = !progressListeners.size;
  progressListeners.add(listener);
  for (const event of infrastructure.values()) {
    try { listener(event); } catch { /* Observers cannot affect repository availability. */ }
  }
  if (first) worker?.postMessage({ observeProgress: true });
  return () => {
    if (progressListeners.delete(listener) && !progressListeners.size) worker?.postMessage({ observeProgress: false });
  };
}
function fail(error: Error) {
  progress({ item: "storage.worker", status: "error" });
  worker?.terminate(); worker = undefined;
  infrastructure.delete("storage.metadata"); infrastructure.delete("storage.filesystem");
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}
function start(): Worker {
  if (disposed) throw new Error("The repository worker is closing. Reload the page before continuing.");
  if (worker) return worker;
  progress({ item: "storage.worker", status: "running" });
  try { worker = new RepositoryWorker({ name: "code-repositories" }); }
  catch (error) { progress({ item: "storage.worker", status: "error" }); throw error; }
  worker.addEventListener("message", event => {
    if ("remoteProgress" in event.data) { for (const listener of remoteListeners) { try { listener(event.data.remoteProgress); } catch { /* Observers cannot interrupt transfers. */ } } return; }
    if ("progress" in event.data) { progress(event.data.progress as StartupEvent); return; }
    const { id, value, error } = event.data as { id: number; value?: unknown; error?: Failure };
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    if (error) request.reject(deserialize(error)); else request.resolve(value);
    if (disposed && !pending.size) { worker?.terminate(); worker = undefined; }
  });
  worker.addEventListener("error", event => fail(new Error(event.message || "The repository worker stopped unexpectedly. Reopen the repository to recover pending writes.", { cause: event.error })));
  worker.addEventListener("messageerror", () => fail(new Error("The repository worker response could not be read.")));
  worker.postMessage({ observeProgress: progressListeners.size > 0 });
  return worker;
}
function call<T>(method: keyof RepositoryClient, args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    try { const active = start(); pending.set(id, { resolve: value => resolve(value as T), reject }); active.postMessage({ id, method, args }); }
    catch (error) { pending.delete(id); reject(error); }
  });
}
export const repositoryClient: RepositoryClient = {
  cloneRemote: request => call("cloneRemote", [request]),
  remoteStatus: id => call("remoteStatus", [id]),
  remoteAction: (id, request, expected) => call("remoteAction", [id, request, expected]),
  remoteRefs: (url, access, operationId) => call("remoteRefs", [url, access, operationId]),
  cancelRemote: id => call("cancelRemote", [id]),
  gitCommit: (id, oid) => call("gitCommit", [id, oid]),
  gitStatus: id => call("gitStatus", [id]),
  gitDiff: (id, request) => call("gitDiff", [id, request]),
  gitAction: (id, request, expected) => call("gitAction", [id, request, expected]),
  list: () => call("list", []), create: (name, files) => call("create", [name, files]), open: id => call("open", [id]),
  write: (id, path, content, expected, group, action) => call("write", [id, path, content, expected, ...(action ? [group, action] : group ? [group] : [])]),
  createFile: (id, path, content, expected) => call("createFile", [id, path, content, expected]),
  addFiles: (id, files, expected) => call("addFiles", [id, files, expected]),
  rename: (id, from, to, expected) => call("rename", [id, from, to, expected]),
  remove: (id, path, expected) => call("remove", [id, path, expected]),
  undo: (id, expected) => call("undo", [id, expected]), redo: (id, expected) => call("redo", [id, expected]),
  selectHistory: (id, oid, expected) => call("selectHistory", [id, oid, expected]),
  commit: (id, message, author, expected) => call("commit", [id, message, author, expected]),
  createBranch: (id, name, expected) => call("createBranch", [id, name, expected]),
  switchBranch: (id, name, expected) => call("switchBranch", [id, name, expected]),
  checkoutCommit: (id, oid, expected) => call("checkoutCommit", [id, oid, expected]),
  readCommitted: (id, path, oid) => call("readCommitted", [id, path, oid]),
  read: (id, path) => call("read", [id, path]), loadPreferences: () => call("loadPreferences", []),
  savePreferences: value => call("savePreferences", [value]),
  loadActivity: () => call("loadActivity", []),
  recordActivity: request => call("recordActivity", [request]),
  undoActivity: (expected, legacy) => call("undoActivity", [expected, legacy]),
  redoActivity: (expected, legacy) => call("redoActivity", [expected, legacy]),
};
import.meta.hot?.dispose(() => { disposed = true; if (!pending.size) { worker?.terminate(); worker = undefined; } });

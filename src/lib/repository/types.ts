// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { GitAction, GitStatus, GitDiffRequest, GitDiff, GitCommitDetails } from "./local-git-types.ts";
import type { SettingsStore } from "../editor/settings.ts";
import type { WorkspaceState } from "../editor/workspace.ts";
import type { LineRange } from "./line-changes.ts";
import type { CloneRequest, RemoteAccess, RemoteCommand, RemoteStatus } from "../remotes/types.ts";
export type { LineRange } from "./line-changes.ts";
export type ImportedFile = { path: string; data: Uint8Array };
export type RepositorySummary = { id: string; name: string };
export type FileChange = { path: string; before: LineRange[]; after: LineRange[]; binary: boolean };
export type Version = { oid: string; parents: string[]; graphParents?: string[]; message: string; timestamp: number; changes?: FileChange[] };
export type EditGroup = { id: string; line: number };
export type RepositoryEditGroup = EditGroup & { path: string; before: string };
export type RepositorySnapshot = RepositorySummary & {
  editGroup?: RepositoryEditGroup;
  revision: string;
  historyHead: string;
  files: string[];
  canUndo: boolean;
  canRedo: boolean;
  history: Version[];
  commits: Version[];
  head: string | null;
  branch: string | null;
  branches: string[];
};
export type Author = { name: string; email: string };
export interface RepositoryOperations {
  cloneRemote(request: CloneRequest): Promise<RepositorySnapshot>;
  remoteStatus(id: string): Promise<RemoteStatus>;
  remoteAction(id: string, request: RemoteCommand, expectedRevision: string): Promise<RepositorySnapshot>;
  remoteRefs(url: string, access: RemoteAccess | undefined, operationId: string): Promise<{ ref: string; oid: string }[]>;
  cancelRemote(operationId: string): Promise<void>;
  gitCommit(id: string, oid: string): Promise<GitCommitDetails>;
  gitStatus(id: string): Promise<GitStatus>;
  gitDiff(id: string, request: GitDiffRequest): Promise<GitDiff>;
  gitAction(id: string, request: GitAction, expectedRevision: string): Promise<RepositorySnapshot>;
  list(): Promise<RepositorySummary[]>;
  create(name: string, files?: ImportedFile[]): Promise<RepositorySnapshot>;
  renameRepository(id: string, name: string, expectedRevision: string): Promise<RepositorySnapshot>;
  open(id: string): Promise<RepositorySnapshot>;
  write(id: string, path: string, content: string, expectedRevision: string, group?: EditGroup, action?: "format"): Promise<RepositorySnapshot>;
  createFile(id: string, path: string, content: string, expectedRevision: string): Promise<RepositorySnapshot>;
  addFiles(id: string, files: ImportedFile[], expectedRevision: string): Promise<RepositorySnapshot>;
  rename(id: string, from: string, to: string, expectedRevision: string): Promise<RepositorySnapshot>;
  remove(id: string, path: string, expectedRevision: string): Promise<RepositorySnapshot>;
  undo(id: string, expectedRevision: string): Promise<RepositorySnapshot>;
  redo(id: string, expectedRevision: string): Promise<RepositorySnapshot>;
  selectHistory(id: string, oid: string, expectedRevision: string): Promise<RepositorySnapshot>;
  commit(id: string, message: string, author: Author, expectedRevision: string): Promise<RepositorySnapshot>;
  createBranch(id: string, name: string, expectedRevision: string): Promise<RepositorySnapshot>;
  switchBranch(id: string, name: string, expectedRevision: string): Promise<RepositorySnapshot>;
  checkoutCommit(id: string, oid: string, expectedRevision: string): Promise<RepositorySnapshot>;
  read(id: string, path: string): Promise<string>;
  readCommitted(id: string, path: string, oid: string | null): Promise<string | null>;
  loadPreferences(): Promise<unknown>;
  savePreferences(value: unknown): Promise<void>;
}
export type ActivityState = { workspace: WorkspaceState; settings: SettingsStore };
export type ActivityScope = {kind:"repository";repositoryId:string} |
  {kind:"settings";scope:"global"|"repository";repositoryId?:string};
export type ActivitySnapshot = {
  scopedLegacyRedoAllowed?:boolean;
  histories?:Record<string,{canUndo:boolean;canRedo:boolean;legacyRedoAllowed:boolean}>;
  revision: string; canUndo: boolean; canRedo: boolean; legacyRedoAllowed: boolean; undoLabel?: string; redoLabel?: string;
  state: ActivityState | null;
};
type ActivityMethod = "gitAction" | "write" | "createFile" | "addFiles" | "rename" | "remove" | "switchBranch" | "selectHistory" | "checkoutCommit";
export type ActivityCommand = { [Method in ActivityMethod]: {
  method: Method; args: Parameters<RepositoryOperations[Method]>;
} }[ActivityMethod];
export type ActivityRequest = { expected: string; label: string; before: ActivityState; after: ActivityState; command?: ActivityCommand; editGroup?: EditGroup };
export type ActivityResult = { activity: ActivitySnapshot; repository?: RepositorySnapshot };
export type LegacyActivity = { repositoryId: string; state: ActivityState;scope?:ActivityScope };
export interface RepositoryClient extends RepositoryOperations {
  deleteRepository(id: string, expectedRevision: string, expectedActivity: string, state: ActivityState): Promise<ActivitySnapshot>;
  loadActivity(): Promise<ActivitySnapshot>;
  recordActivity(request: ActivityRequest): Promise<ActivityResult>;
  undoActivity(expected: string, legacy?: LegacyActivity): Promise<ActivityResult>;
  redoActivity(expected: string, legacy?: LegacyActivity): Promise<ActivityResult>;
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Author } from "./types.ts";

export type GitAction = {
  kind: "stage" | "unstage" | "discard" | "commit" | "amend" | "merge" | "rebase" | "squash" |
    "cherry-pick" | "revert" | "continue" | "skip" | "abort" | "resolve" | "stash-push" |
    "stash-apply" | "stash-pop" | "stash-drop" | "reset" | "tag" | "delete-tag" |
    "delete-branch" | "rename-branch" | "recover" | "track-branch";
  paths?: string[]; path?: string; content?: string; resolution?: "ours" | "theirs" | "delete";
  target?: string; name?: string; message?: string; author?: Author; mainline?: number;
  mode?: "soft" | "mixed" | "hard" | "merge" | "ff-only" | "squash";
  includeUntracked?: boolean; force?: boolean;
};
export type GitControl = { path: string; data: Uint8Array };
export type GitOperation = {
  kind: "merge" | "rebase" | "cherry-pick" | "revert" | "stash";
  label: string; beforeControl: GitControl[]; beforeFiles: string;
  conflicts: string[]; author: Author; message: string; parents: string[];
  original?: string; remaining?: string[]; stash?: string; pop?: boolean;
  conflictVersions?: Record<string, { ours: Uint8Array | null; theirs: Uint8Array | null; oursMode: string | null; theirsMode: string | null }>;
};
export type GitStatus = {
  revision: string; files: { path: string; head: number; work: number; stage: number; conflicted: boolean }[];
  branches: { name: string; oid: string }[]; tags: { name: string; oid: string }[];
  stashes: { oid: string; message: string; index: number }[];
  recoveries: { ref: string; oid: string; label: string }[]; operation: GitOperation | null;
  author: Author;
};
export type GitDiffRequest = { path: string; kind: "working" | "staged" | "commit"; oid?: string; parent?: number };
export type GitDiff = { before: string; after: string; binary: boolean; path: string };
export type GitControlPatch = { path: string; before: Uint8Array | null; after: Uint8Array | null };

export type GitCommitDetails = { oid: string; message: string; author: Author; parents: string[]; files: string[] };

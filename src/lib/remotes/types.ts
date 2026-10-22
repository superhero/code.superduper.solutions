// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export type Provider = "github" | "gitlab" | "bitbucket";
export type Connection = { id: string; provider: Provider; label: string; host: string; relay: string; remembered: boolean };
export type Credentials = { token: string };
export type RemoteAccess = { provider: Provider; host: string; relay: string; token: string };
export type RemoteRepository = { path: string; name: string; description: string; url: string; cloneUrl: string; defaultBranch: string; private: boolean };
export type RemotePage<T> = { items: T[]; more: boolean };
export type RemoteBranch = { name: string; oid: string; protected: boolean };
export type Review = { id: number; title: string; body: string; state: string; author: string; source: string; target: string; oid: string; url: string; draft: boolean };
export type Issue = { id: number; title: string; body: string; state: string; author: string; url: string };
export type Check = { name: string; state: string; url: string };
export type ReviewInput = { title: string; body: string; source: string; target: string; draft: boolean };
export type ReviewAction = { kind: "comment" | "approve" | "close" | "merge"; id: number; body?: string; oid?: string; method?: "merge" | "squash" | "rebase" };
export interface ProviderApi {
  identity(): Promise<{ name: string; username: string }>;
  repositories(query: string, page: number): Promise<RemotePage<RemoteRepository>>;
  repository(path: string): Promise<RemoteRepository>;
  branches(path: string, page: number): Promise<RemotePage<RemoteBranch>>;
  reviews(path: string, state: "open" | "closed" | "merged", page: number): Promise<RemotePage<Review>>;
  review(path: string, id: number): Promise<Review>;
  createReview(path: string, input: ReviewInput): Promise<Review>;
  reviewAction(path: string, input: ReviewAction): Promise<void>;
  issues(path: string, state: "open" | "closed", page: number): Promise<RemotePage<Issue>>;
  createIssue(path: string, title: string, body: string): Promise<Issue>;
  issueAction(path: string, id: number, action: "comment" | "close", body: string): Promise<void>;
  checks(path: string, ref: string): Promise<Check[]>;
  createRepository(name: string, privateRepository: boolean, namespace: string): Promise<RemoteRepository>;
  fork(path: string, namespace: string): Promise<RemoteRepository>;
}
export type SdkOptions = { token: string; baseUrl: string; host: string; fetch: typeof globalThis.fetch };
export type SdkModule = { create(options: SdkOptions): ProviderApi };
export type RemoteProgress = { id: string; phase: string; loaded: number; total: number };
export type GitRemote = { name: string; url: string; needsUrl?: boolean; branches: { name: string; oid: string }[] };
export type RemoteStatus = { remotes: GitRemote[]; branch: string | null; head: string | null; upstream: { remote: string; branch: string; oid: string | null } | null; ahead: number; behind: number };
export type RemoteCommand = { kind: "configure" | "remove" | "upstream" | "fetch" | "push" | "push-tag" | "delete-branch" | "delete-tag"; remote: string; url?: string; branch?: string; localBranch?: string; prune?: boolean; lease?: boolean; setUpstream?: boolean; expectedOid?: string | null; expectedLocalOid?: string; access?: RemoteAccess; operationId?: string };
export type CloneRequest = { name: string; url: string; branch?: string; access?: RemoteAccess; operationId: string };

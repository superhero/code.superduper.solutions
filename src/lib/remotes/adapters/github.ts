// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Octokit } from "@octokit/rest";
import type { ProviderApi, SdkOptions, RemoteRepository, Review, Issue } from "../types.ts";
type Repository = { full_name: string; name: string; description?: string | null; html_url: string; clone_url?: string; default_branch?: string | null; private: boolean };
const repository = (item: Repository): RemoteRepository => ({ path: item.full_name, name: item.name, description: item.description ?? "", url: item.html_url, cloneUrl: item.clone_url ?? `${item.html_url}.git`, defaultBranch: item.default_branch ?? "main", private: item.private });
type Pull = { number: number; title: string; body?: string | null; state: string; html_url: string; user?: { login: string } | null; head: { ref: string; sha: string }; base: { ref: string }; draft?: boolean; merged_at?: string | null };
const review = (item: Pull): Review => ({ id: item.number, title: item.title, body: item.body ?? "", state: item.merged_at ? "merged" : item.state, author: item.user?.login ?? "", source: item.head.ref, target: item.base.ref, oid: item.head.sha, url: item.html_url, draft: !!item.draft });
type Ticket = { number: number; title: string; body?: string | null; state: string; html_url: string; user?: { login: string } | null };
const issue = (item: Ticket): Issue => ({ id: item.number, title: item.title, body: item.body ?? "", state: item.state, author: item.user?.login ?? "", url: item.html_url });
const target = (path: string) => { const [owner, repo, extra] = path.split("/"); if (!owner || !repo || extra) throw new Error("Use an owner/repository path."); return { owner, repo }; };
export function create(options: SdkOptions): ProviderApi {
  const api = new Octokit({ ...(options.token ? { auth: options.token } : {}), baseUrl: options.baseUrl, request: { fetch: options.fetch }, log: { debug() {}, info() {}, warn() {}, error() {} } });
  return {
    async identity() { const { data } = await api.users.getAuthenticated(); return { name: data.name ?? data.login, username: data.login }; },
    async repositories(query, page) {
      if (query.trim()) {
        const { data } = await api.search.repos({ q: `${query.trim()} in:name fork:true`, per_page: 30, page, sort: "updated" });
        return { items: data.items.map(repository), more: data.items.length === 30 };
      }
      if (!options.token) return { items: [], more: false };
      const { data } = await api.repos.listForAuthenticatedUser({ per_page: 30, page, sort: "updated", affiliation: "owner,collaborator,organization_member" });
      return { items: data.map(repository), more: data.length === 30 };
    },
    async repository(path) { return repository((await api.repos.get(target(path))).data); },
    async branches(path, page) { const { data } = await api.repos.listBranches({ ...target(path), per_page: 30, page }); return { items: data.map(item => ({ name: item.name, oid: item.commit.sha, protected: item.protected })), more: data.length === 30 }; },
    async reviews(path, state, page) { const { data } = await api.pulls.list({ ...target(path), state: state === "merged" ? "closed" : state, per_page: 30, page, sort: "updated", direction: "desc" }); return { items: data.filter(item => state !== "merged" || !!item.merged_at).map(review), more: data.length === 30 }; },
    async review(path, id) { return review((await api.pulls.get({ ...target(path), pull_number: id })).data); },
    async createReview(path, input) { return review((await api.pulls.create({ ...target(path), title: input.title, body: input.body, head: input.source, base: input.target, draft: input.draft })).data); },
    async reviewAction(path, input) {
      const repo = target(path), pull_number = input.id;
      if (input.kind === "comment") await api.issues.createComment({ ...repo, issue_number: pull_number, body: input.body ?? "" });
      else if (input.kind === "approve") await api.pulls.createReview({ ...repo, pull_number, event: "APPROVE", ...(input.oid ? { commit_id: input.oid } : {}) });
      else if (input.kind === "close") await api.pulls.update({ ...repo, pull_number, state: "closed" });
      else {
        if (!input.oid) throw new Error("Refresh this pull request before merging.");
        const { data } = await api.pulls.merge({ ...repo, pull_number, sha: input.oid, merge_method: input.method ?? "merge" });
        if (!data.merged) throw new Error("The pull request could not be merged. Check conflicts and required approvals or checks.");
      }
    },
    async issues(path, state, page) { const { data } = await api.issues.listForRepo({ ...target(path), state, per_page: 30, page, sort: "updated", direction: "desc" }); return { items: data.filter(item => !item.pull_request).map(issue), more: data.length === 30 }; },
    async createIssue(path, title, body) { return issue((await api.issues.create({ ...target(path), title, body })).data); },
    async issueAction(path, issue_number, action, body) { if (action === "close") await api.issues.update({ ...target(path), issue_number, state: "closed" }); else await api.issues.createComment({ ...target(path), issue_number, body }); },
    async checks(path, ref) {
      const results = await Promise.allSettled([api.checks.listForRef({ ...target(path), ref, per_page: 100 }), api.repos.getCombinedStatusForRef({ ...target(path), ref, per_page: 100 })]);
      const runs = results[0], statuses = results[1];
      if (runs.status === "rejected" && statuses.status === "rejected") throw runs.reason;
      return [...(runs.status === "fulfilled" ? runs.value.data.check_runs.map(item => ({ name: item.name, state: item.conclusion ?? item.status, url: item.html_url ?? "" })) : []),
        ...(statuses.status === "fulfilled" ? statuses.value.data.statuses.map(item => ({ name: item.context, state: item.state, url: item.target_url ?? "" })) : [])];
    },
    async createRepository(name, privateRepository, namespace) {
      return repository((namespace ? await api.repos.createInOrg({ org: namespace, name, private: privateRepository, auto_init: false }) : await api.repos.createForAuthenticatedUser({ name, private: privateRepository, auto_init: false })).data);
    },
    async fork(path, namespace) { return repository((await api.repos.createFork({ ...target(path), ...(namespace ? { organization: namespace } : {}) })).data); },
  };
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Gitlab } from "@gitbeaker/rest";
import { createRequesterFn } from "@gitbeaker/requester-utils";
import type { ProviderApi, SdkOptions, RemoteRepository, Review, Issue } from "../types.ts";
type Project = { path_with_namespace: string; name: string; description?: string | null; web_url: string; http_url_to_repo: string; default_branch?: string; visibility: string };
const repository = (item: Project): RemoteRepository => ({ path: item.path_with_namespace, name: item.name, description: item.description ?? "", url: item.web_url, cloneUrl: item.http_url_to_repo, defaultBranch: item.default_branch ?? "main", private: item.visibility !== "public" });
type Merge = { iid: number; title: string; description?: string | null; state: string; author: { username: string }; source_branch: string; target_branch: string; sha: string; web_url: string; draft?: boolean; work_in_progress?: boolean };
const review = (item: Merge): Review => ({ id: item.iid, title: item.title, body: item.description ?? "", state: item.state, author: item.author.username, source: item.source_branch, target: item.target_branch, oid: item.sha, url: item.web_url, draft: !!(item.draft || item.work_in_progress) });
type Ticket = { iid: number; title: string; description?: string | null; state: string; author: { username: string }; web_url: string };
const issue = (item: Ticket): Issue => ({ id: item.iid, title: item.title, body: item.description ?? "", state: item.state, author: item.author.username, url: item.web_url });
export function create(options: SdkOptions): ProviderApi {
  // GitBeaker's default retries can replay writes. Use its requester contract with one guarded request.
  const requesterFn = createRequesterFn((_service, request) => Promise.resolve(request), async (endpoint, request = {}) => {
    const url = new URL(endpoint, `${String(request.prefixUrl).replace(/\/$/, "")}/`); url.search = String(request.searchParams ?? "");
    const response = await options.fetch(url, { method: String(request.method ?? "GET"), headers: request.headers as HeadersInit, ...(request.body ? { body: request.body as BodyInit } : {}) });
    if (!response.ok) throw Object.assign(new Error(`GitLab returned HTTP ${response.status}.`), { status: response.status });
    return { body: response.status === 204 ? null : await response.json(), status: response.status, headers: Object.fromEntries(response.headers) };
  });
  const api = new Gitlab({ host: options.host, token: options.token, requesterFn });
  const paging = (page: number) => ({ page, perPage: 30, maxPages: 1 });
  return {
    async identity() { const user = await api.Users.showCurrentUser(); return { name: user.name, username: user.username }; },
    async repositories(query, page) { const data = await api.Projects.all({ ...paging(page), search: query, ...(options.token ? { membership: true } : {}), orderBy: "last_activity_at", sort: "desc" }); return { items: data.map(repository), more: data.length === 30 }; },
    async repository(path) { return repository(await api.Projects.show(path)); },
    async branches(path, page) { const data = await api.Branches.all(path, paging(page)); return { items: data.map(item => ({ name: item.name, oid: item.commit.id, protected: item.protected })), more: data.length === 30 }; },
    async reviews(path, state, page) { const data = await api.MergeRequests.all({ ...paging(page), projectId: path, state: state === "open" ? "opened" : state, orderBy: "updated_at", sort: "desc" }); return { items: data.map(review), more: data.length === 30 }; },
    async review(path, id) { return review(await api.MergeRequests.show(path, id)); },
    async createReview(path, input) { return review(await api.MergeRequests.create(path, input.source, input.target, input.draft ? `Draft: ${input.title}` : input.title, { description: input.body })); },
    async reviewAction(path, input) {
      if (input.kind === "comment") await api.MergeRequestNotes.create(path, input.id, input.body ?? "");
      else if (input.kind === "approve") await api.MergeRequestApprovals.approve(path, input.id, input.oid ? { sha: input.oid } : {});
      else if (input.kind === "close") await api.MergeRequests.edit(path, input.id, { stateEvent: "close" });
      else {
        if (!input.oid || input.method === "rebase") throw new Error("Refresh before merging. Use the project's merge policy or squash.");
        await api.MergeRequests.accept(path, input.id, { sha: input.oid, squash: input.method === "squash" });
      }
    },
    async issues(path, state, page) { const data = await api.Issues.all({ ...paging(page), projectId: path, state: state === "open" ? "opened" : "closed", orderBy: "updated_at", sort: "desc" }); return { items: data.map(issue), more: data.length === 30 }; },
    async createIssue(path, title, body) { return issue(await api.Issues.create(path, title, { description: body })); },
    async issueAction(path, id, action, body) { if (action === "close") await api.Issues.edit(path, id, { stateEvent: "close" }); else await api.IssueNotes.create(path, id, body); },
    async checks(path, ref) { const data = await api.Pipelines.all(path, { ref, perPage: 30, maxPages: 1 }); return data.map(item => ({ name: `Pipeline #${item.id}`, state: item.status, url: item.web_url })); },
    async createRepository(name, privateRepository, namespace) { if (namespace && !/^\d+$/.test(namespace)) throw new Error("Enter a numeric GitLab namespace ID."); return repository(await api.Projects.create({ name, visibility: privateRepository ? "private" : "public", ...(namespace ? { namespaceId: Number(namespace) } : {}), initializeWithReadme: false })); },
    async fork(path, namespace) { return repository(await api.Projects.fork(path, namespace ? /^\d+$/.test(namespace) ? { namespaceId: Number(namespace) } : { namespacePath: namespace } : {})); },
  };
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import * as BitbucketSDK from "bitbucket";
import type { ProviderApi, SdkOptions, RemoteRepository, Review, Issue } from "../types.ts";
type Link = { href?: string };
type Repository = { full_name: string; name: string; description?: string; links?: { html?: Link; clone?: (Link & { name?: string })[] }; mainbranch?: { name?: string }; is_private?: boolean };
const repository = (item: Repository): RemoteRepository => ({ path: item.full_name, name: item.name, description: item.description ?? "", url: item.links?.html?.href ?? `https://bitbucket.org/${item.full_name}`, cloneUrl: item.links?.clone?.find(link => link.name === "https")?.href?.replace(/^https:\/\/[^/@]+@/, "https://") ?? `https://bitbucket.org/${item.full_name}.git`, defaultBranch: item.mainbranch?.name ?? "main", private: !!item.is_private });
type Pull = { id: number; title: string; description?: string; state: string; author?: { display_name?: string }; source: { branch: { name: string }; commit: { hash: string } }; destination: { branch: { name: string } }; links?: { html?: Link }; draft?: boolean };
const review = (item: Pull): Review => ({ id: item.id, title: item.title, body: item.description ?? "", state: item.state, author: item.author?.display_name ?? "", source: item.source.branch.name, target: item.destination.branch.name, oid: item.source.commit.hash, url: item.links?.html?.href ?? "", draft: !!item.draft });
type Ticket = { id: number; title: string; content?: { raw?: string }; state: string; reporter?: { display_name?: string }; links?: { html?: Link } };
const issue = (item: Ticket): Issue => ({ id: item.id, title: item.title, body: item.content?.raw ?? "", state: item.state, author: item.reporter?.display_name ?? "", url: item.links?.html?.href ?? "" });
type Page<T> = { values?: T[]; next?: string };
const pathFor = (path: string) => { const parts = path.split("/"); if (parts.length !== 2 || parts.some(part => !part)) throw new Error("Use a workspace/repository path."); return `/repositories/${parts.map(encodeURIComponent).join("/")}`; };
export function create(options: SdkOptions): ProviderApi {
  const Bitbucket = BitbucketSDK.Bitbucket ?? (Reflect.get(BitbucketSDK, "default") as typeof BitbucketSDK).Bitbucket;
  const api = new Bitbucket({ baseUrl: options.baseUrl, auth: { token: options.token }, notice: false, request: { fetch: options.fetch } });
  const request = async <T>(method: "GET" | "POST" | "PUT" | "DELETE", url: string, query: Record<string, unknown> = {}, body?: unknown): Promise<T> => (await api.request({ method, url, ...query, ...(body ? { _body: body } : {}) })).data as T;
  const page = async <T, R>(url: string, number: number, map: (item: T) => R, query: Record<string, unknown> = {}) => { const data = await request<Page<T>>("GET", url, { ...query, page: number, pagelen: 30 }); return { items: (data.values ?? []).map(map), more: !!data.next }; };
  return {
    async identity() { const user = await request<{ display_name: string; nickname?: string; username?: string }>("GET", "/user"); return { name: user.display_name, username: user.nickname ?? user.username ?? user.display_name }; },
    async repositories(query, number) {
      if (!options.token) return { items: [], more: false };
      return page<{ repository: Repository }, RemoteRepository>("/user/permissions/repositories", number, item => repository(item.repository), { ...(query.trim() ? { q: `repository.name ~ ${JSON.stringify(query.trim())}` } : {}) });
    },
    async repository(path) { return repository(await request<Repository>("GET", pathFor(path))); },
    async branches(path, number) { return page<{ name: string; target: { hash: string } }, { name: string; oid: string; protected: boolean }>(`${pathFor(path)}/refs/branches`, number, item => ({ name: item.name, oid: item.target.hash, protected: false })); },
    async reviews(path, state, number) { return page<Pull, Review>(`${pathFor(path)}/pullrequests`, number, review, { state: state === "open" ? "OPEN" : state === "merged" ? "MERGED" : ["MERGED", "DECLINED", "SUPERSEDED"], sort: "-updated_on" }); },
    async review(path, id) { return review(await request<Pull>("GET", `${pathFor(path)}/pullrequests/${id}`)); },
    async createReview(path, input) { return review(await request<Pull>("POST", `${pathFor(path)}/pullrequests`, {}, { title: input.title, description: input.body, source: { branch: { name: input.source } }, destination: { branch: { name: input.target } }, draft: input.draft, close_source_branch: false })); },
    async reviewAction(path, input) {
      const endpoint = `${pathFor(path)}/pullrequests/${input.id}`;
      if (input.kind === "comment") await request("POST", `${endpoint}/comments`, {}, { content: { raw: input.body ?? "" } });
      else if (input.kind === "approve") await request("POST", `${endpoint}/approve`);
      else if (input.kind === "close") await request("POST", `${endpoint}/decline`);
      else {
        if (!input.oid || (await request<Pull>("GET", endpoint)).source.commit.hash !== input.oid) throw new Error("This pull request changed. Refresh and review the new tip before merging.");
        if (input.method === "rebase") throw new Error("Bitbucket Cloud supports merge or squash here.");
        await request("POST", `${endpoint}/merge`, {}, { merge_strategy: input.method === "squash" ? "squash" : "merge_commit", close_source_branch: false });
      }
    },
    async issues(path, state, number) { return page<Ticket, Issue>(`${pathFor(path)}/issues`, number, issue, { q: state === "open" ? 'state != "resolved" AND state != "closed"' : 'state = "resolved" OR state = "closed"', sort: "-updated_on" }); },
    async createIssue(path, title, body) { return issue(await request<Ticket>("POST", `${pathFor(path)}/issues`, {}, { title, content: { raw: body }, kind: "task", priority: "major" })); },
    async issueAction(path, id, action, body) { if (action === "close") await request("PUT", `${pathFor(path)}/issues/${id}`, {}, { state: "resolved" }); else await request("POST", `${pathFor(path)}/issues/${id}/comments`, {}, { content: { raw: body } }); },
    async checks(path, ref) { const data = await request<Page<{ name?: string; key: string; state: string; url?: string }>>("GET", `${pathFor(path)}/commit/${encodeURIComponent(ref)}/statuses`, { pagelen: 100 }); return (data.values ?? []).map(item => ({ name: item.name ?? item.key, state: item.state, url: item.url ?? "" })); },
    async createRepository(name, privateRepository, namespace) { if (!namespace.trim()) throw new Error("Enter a Bitbucket workspace."); return repository(await request<Repository>("POST", `/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`, {}, { scm: "git", name, is_private: privateRepository })); },
    async fork(path, namespace) { return repository(await request<Repository>("POST", `${pathFor(path)}/forks`, {}, namespace ? { workspace: { slug: namespace } } : {})); },
  };
}

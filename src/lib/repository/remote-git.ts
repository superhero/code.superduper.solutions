// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import * as git from "isomorphic-git";
import { gitControls, controlPatch, type LocalGitHost } from "./local-git.ts";
import { gitHttp } from "../remotes/git-http.ts";
import { remoteName, refName, repositoryUrl, displayRemoteUrl } from "../remotes/policy.ts";
import type { RemoteCommand, RemoteStatus, RemoteProgress } from "../remotes/types.ts";
const missing = (error: unknown) => (error as { code?: string })?.code === "ENOENT";
type Context = Pick<LocalGitHost, "fs" | "dir" | "gitdir">;
export async function removeRemoteTree(host: Pick<LocalGitHost, "fs">, path: string): Promise<void> {
  try {
    if ((await host.fs.promises.lstat(path)).isDirectory()) { for (const name of await host.fs.promises.readdir(path) as string[]) await removeRemoteTree(host, `${path}/${name}`); await host.fs.promises.rmdir(path); }
    else await host.fs.promises.unlink(path);
  } catch (error) { if (!missing(error)) throw error; }
}
async function put(context: Context, path: string, bytes: Uint8Array): Promise<void> {
  async function mkdir(path: string): Promise<void> { try { await context.fs.promises.mkdir(path); } catch (error) { if ((error as { code?: string })?.code === "EEXIST") return; if (!missing(error)) throw error; await mkdir(path.slice(0, path.lastIndexOf("/")) || "/"); await context.fs.promises.mkdir(path); } }
  await mkdir(path.slice(0, path.lastIndexOf("/"))); await context.fs.promises.writeFile(path, bytes);
}
async function oid(context: Context, ref: string): Promise<string | null> { try { return await git.resolveRef({ ...context, ref }); } catch (error) { if (error instanceof git.Errors.NotFoundError) return null; throw error; } }
export async function remoteStatus(context: Context): Promise<RemoteStatus> {
  const branch = await git.currentBranch(context) || null, head = await oid(context, "HEAD");
  const remotes = await Promise.all((await git.listRemotes(context)).map(async item => ({ name: item.remote, ...displayRemoteUrl(item.url),
    branches: await Promise.all((await git.listBranches({ ...context, remote: item.remote })).filter(name => name !== "HEAD").map(async name => ({ name, oid: (await oid(context, `refs/remotes/${item.remote}/${name}`))! }))) })));
  const remote = branch ? String(await git.getConfig({ ...context, path: `branch.${branch}.remote` }) ?? "") : "";
  const merge = branch ? String(await git.getConfig({ ...context, path: `branch.${branch}.merge` }) ?? "") : "";
  const upstream = remote && remote !== "." && merge.startsWith("refs/heads/") ? { remote, branch: merge.slice(11), oid: await oid(context, `refs/remotes/${remote}/${merge.slice(11)}`) } : null;
  let ahead = 0, behind = 0;
  if (head && upstream?.oid && head !== upstream.oid) {
    const local = new Set((await git.log({ ...context, ref: head })).map(entry => entry.oid)), tracking = new Set((await git.log({ ...context, ref: upstream.oid })).map(entry => entry.oid));
    ahead = [...local].filter(value => !tracking.has(value)).length; behind = [...tracking].filter(value => !local.has(value)).length;
  }
  return { remotes, branch, head, upstream, ahead, behind };
}
export async function planRemoteGit(host: LocalGitHost, request: RemoteCommand, signal: AbortSignal, onProgress?: (value: RemoteProgress) => void, transport?: typeof fetch) {
  if (!["configure", "remove", "upstream", "fetch", "push", "push-tag", "delete-branch", "delete-tag"].includes(request.kind)) throw new Error("Unknown remote Git operation.");
  const remote = remoteName(request.remote), before = await gitControls(host), scratch = `${host.scratch}/remote-${crypto.randomUUID()}`, gitdir = `${scratch}/git`;
  const mapPath = (path: unknown) => typeof path === "string" && (path === `${gitdir}/objects` || path.startsWith(`${gitdir}/objects/`)) ? host.gitdir + path.slice(gitdir.length) : path;
  const promises = new Proxy(host.fs.promises, { get(target, key) { const method = Reflect.get(target, key); return typeof method !== "function" ? method : (...args: unknown[]) => Reflect.apply(method, target, args.map((value, index) => index === 0 || index === 1 && ["rename", "link", "symlink"].includes(String(key)) ? mapPath(value) : value)); } });
  const context: Context = { fs: { promises } as LocalGitHost["fs"], dir: `${scratch}/work`, gitdir };
  try {
    for (const file of before) await put(context, `${gitdir}/${file.path}`, file.data);
    const branch = request.branch ? refName(request.branch) : "";
    if (request.kind === "configure") {
      const url = repositoryUrl(request.url ?? "", request.access);
      await git.addRemote({ ...context, remote, url, force: true });
      await git.setConfig({ ...context, path: `remote.${remote}.fetch`, value: `+refs/heads/*:refs/remotes/${remote}/*` });
    } else if (request.kind === "remove") await git.deleteRemote({ ...context, remote });
    else {
      const item = (await git.listRemotes(context)).find(item => item.remote === remote);
      if (!item) throw new Error("Choose an existing Git remote.");
      const url = repositoryUrl(item.url, request.access);
      if (request.kind === "upstream") {
        const local = refName(request.localBranch || await git.currentBranch(context) || "");
        if (!branch || !await oid(context, `refs/heads/${local}`)) throw new Error("Choose an existing local branch and an upstream branch.");
        await git.setConfig({ ...context, path: `branch.${local}.remote`, value: remote });
        await git.setConfig({ ...context, path: `branch.${local}.merge`, value: `refs/heads/${branch}` });
      } else if (request.kind === "fetch") {
        // Imported refspecs must not redirect a fetch into local branches or private refs.
        await git.setConfig({ ...context, path: `remote.${remote}.fetch`, value: `+refs/heads/*:refs/remotes/${remote}/*` });
        await git.fetch({ ...context, url, remote, http: gitHttp(url, request.access, signal, false, undefined, transport), corsProxy: "", singleBranch: false, tags: true, prune: !!request.prune,
          onProgress: progress => { onProgress?.({ id: request.operationId ?? "", phase: progress.phase, loaded: progress.loaded, total: progress.total }); } });
      } else {
        const tag = request.kind === "push-tag" || request.kind === "delete-tag", deleting = request.kind === "delete-branch" || request.kind === "delete-tag";
        if (!branch || request.expectedOid === undefined || request.expectedOid !== null && !/^[a-f0-9]{40}$/.test(request.expectedOid)) throw new Error("Review the remote reference before pushing.");
        const remoteRef = `${tag ? "refs/tags" : "refs/heads"}/${branch}`, local = refName(request.localBranch || branch), localRef = `${tag ? "refs/tags" : "refs/heads"}/${local}`;
        if (!deleting && !await oid(context, localRef)) throw new Error("Choose an existing local branch or tag.");
        if (!deleting && request.expectedLocalOid && await oid(context, localRef) !== request.expectedLocalOid) throw new Error("The local reference changed since review. Review the push again.");
        if (deleting && !request.expectedOid) throw new Error("The selected remote reference no longer exists.");
        const result = await git.push({ ...context, remote, url, ref: localRef, remoteRef, http: gitHttp(url, request.access, signal, true, { ref: remoteRef, oid: request.expectedOid }, transport), corsProxy: "", force: !!request.lease, delete: deleting, signal,
          onProgress: progress => { onProgress?.({ id: request.operationId ?? "", phase: progress.phase, loaded: progress.loaded, total: progress.total }); } });
        if (!result.ok || Object.values(result.refs).some(ref => !ref.ok)) throw new Error("The upstream rejected the push. Check branch protection, token permissions and required checks.");
        if (!tag) {
          const tracking = `refs/remotes/${remote}/${branch}`;
          if (deleting) { if (await oid(context, tracking)) await git.deleteRef({ ...context, ref: tracking }); }
          else {
            await git.writeRef({ ...context, ref: tracking, value: (await oid(context, localRef))!, force: true });
            if (request.setUpstream) {
              await git.setConfig({ ...context, path: `branch.${local}.remote`, value: remote });
              await git.setConfig({ ...context, path: `branch.${local}.merge`, value: `refs/heads/${branch}` });
            }
          }
        }
      }
    }
    return controlPatch(before, await gitControls(context));
  } finally { await removeRemoteTree(host, scratch); }
}

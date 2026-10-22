// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import * as git from "isomorphic-git";
import { planLocalGit, localGitStatus, localGitDiff, applyGitControls, indexFiles, type LocalGitHost } from "./local-git.ts";
import type { GitOperation, GitControlPatch } from "./local-git-types.ts";
import { decodeText, encodeText, filePath, repositoryPaths } from "./paths.ts";
import type { Author, EditGroup, FileChange, ImportedFile, RepositoryEditGroup, RepositoryOperations, RepositorySnapshot, Version } from "./types.ts";
import { singleEditedLine } from "../editor/edit-grouping.ts";
import { reportProgress, trackProgress, type RepositoryProgress } from "./progress.ts";
import { changedLineRanges } from "./line-changes.ts";
import { editMessage } from "./edit-message.ts";
import { planRemoteGit, remoteStatus, removeRemoteTree } from "./remote-git.ts";
import { gitHttp } from "../remotes/git-http.ts";
import { repositoryUrl, refName, remoteError } from "../remotes/policy.ts";
import type { RemoteProgress } from "../remotes/types.ts";

type FileEntry = { data: Uint8Array; mode: string };
type Files = Map<string, FileEntry>;
type ChangeGraphState = { baseline: string; revisions: string[] };
export type RepositoryRecord = { id: string; name: string; revision: string; current: string; undo: string[]; redo: string[]; futures: string[];
  gitOperation?: GitOperation;
  changeGraphs?: Record<string, ChangeGraphState>;
  historyOrder?: string[];
  autoStashes?: Record<string, { working: string; index: string }>;
  editGroup?: RepositoryEditGroup;
  lastAction?: { base: string; key: string } };
type SourceHead = { ref: string | null; oid: string | null };
type SourceBranch = { before: SourceHead; ref: string | null; oid: string; create: boolean; files: boolean; index?: string; preserveIndex?: boolean };
export type Pending = { before: string | null; after: RepositoryRecord; kind: "files" | "commit" | "branch" | "git"; gitControls?: GitControlPatch[]; filesBefore?: string;
  sourceCommit?: { oid: string; ref: string; before: string | null }; sourceBranch?: SourceBranch };
export type Checkpoint = "prepared" | "files-flushed" | "refs-flushed" | "finalized";
export interface Metadata {
  list(): Promise<RepositoryRecord[]>;
  get(id: string): Promise<RepositoryRecord | undefined>;
  pending(id: string): Promise<Pending | undefined>;
  prepare(id: string, pending: Pending): Promise<void>;
  finish(repository: RepositoryRecord): Promise<void>;
  loadPreferences(): Promise<unknown>;
  savePreferences(value: unknown): Promise<void>;
}
export type EngineOptions = {
  fs: git.PromiseFsClient & { promises: { chmod(path: string, mode: number): Promise<void> } };
  metadata: Metadata;
  flush(): Promise<void>;
  lock<T>(key: string, task: () => Promise<T>): Promise<T>;
  root?: string;
  checkpoint?: (stage: Checkpoint) => void | Promise<void>;
  onProgress?: RepositoryProgress;
  onRemoteProgress?: (value: RemoteProgress) => void;
  fetch?: typeof fetch;
};
const historyRef = "refs/heads/current";
const redoRef = "refs/editor/redo";
const internalAuthor = { name: "Local code editor", email: "editor@localhost" };
const missing = (error: unknown) => error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
function validation(message: string): Error {
  const error = new Error(message);
  error.name = "RepositoryValidationError";
  return error;
}
function inputPath(value: string): void {
  try { filePath(value); } catch (error) { throw validation((error as Error).message); }
}
function inputText(value: string): Uint8Array {
  if (typeof value !== "string" || value.includes("\0")) throw validation("Text edits cannot contain binary NUL bytes.");
  return encodeText(value);
}

export type RepositoryPosition = Pick<RepositorySnapshot, "id" | "revision" | "historyHead" | "editGroup">;
export function createRepositoryEngine(options: EngineOptions): RepositoryOperations & {
  prepareRetention(id: string): Promise<void>; position(id: string): Promise<RepositoryPosition>;
} {
  const { fs, metadata } = options;
  const root = options.root ?? "";
  let ready: Promise<void> | undefined;
  const remoteJobs = new Map<string, AbortController>();
  async function remoteJob<T>(id: string, token: string, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (!/^[\w-]{1,100}$/.test(id) || remoteJobs.has(id)) throw validation("Invalid or duplicate Git transfer identifier.");
    const controller = new AbortController(); remoteJobs.set(id, controller);
    try { return await task(controller.signal); }
    catch (error) { throw validation(remoteError(error, token)); }
    finally { remoteJobs.delete(id); }
  }
  const changeSummaries = new Map<string, Promise<FileChange[]>>();
  const historyParents = new Map<string, string[]>();
  const historyCommits = new Map<string, Promise<Awaited<ReturnType<typeof git.readCommit>>>>();
  const messageBases = new Map<string, Promise<string>>();
  async function messageBase(id: string, oid: string, path: string): Promise<string> {
    const key = JSON.stringify([id, oid, path]);
    let cached = messageBases.get(key);
    if (!cached) {
      cached = git.readBlob({ fs, gitdir: repositoryPaths(id, root).historyGitdir, oid, filepath: path })
        .then(({ blob }) => decodeText(blob)).catch(error => { messageBases.delete(key); throw error; });
      messageBases.set(key, cached);
      if (messageBases.size > 8) messageBases.delete(messageBases.keys().next().value!);
    }
    return cached;
  }
  const versionViews = new Map<string, { key: string; value: Promise<Version[]> }>();
  const paths = (id: string) => repositoryPaths(id, root);
  const source = (id: string) => ({ fs, dir: paths(id).dir, gitdir: paths(id).gitdir });
  const history = (id: string) => ({ fs, gitdir: paths(id).historyGitdir });
  function localHost(id: string): LocalGitHost {
    return { ...source(id), scratch: `${root}/git-operations/${id}`, working: () => working(id),
      tree: oid => treeFiles(source(id), oid), privateTree: oid => treeFiles(history(id), oid),
      privateSnapshot: files => createCommit(history(id), files, null, "Git operation checkpoint", internalAuthor) };
  }

  async function exists(path: string): Promise<boolean> {
    try { await fs.promises.lstat(path); return true; } catch (error) { if (missing(error)) return false; throw error; }
  }
  async function mkdir(path: string): Promise<void> {
    if (await exists(path)) {
      if (!(await fs.promises.lstat(path)).isDirectory()) throw new Error(`A file blocks the directory ${path}.`);
      return;
    }
    const parent = path.slice(0, path.lastIndexOf("/"));
    if (parent) await mkdir(parent);
    await fs.promises.mkdir(path);
  }
  async function initialize(): Promise<void> {
    ready ??= options.lock("initialize", async () => { await mkdir(`${root}/repositories`); await mkdir(`${root}/history`); })
      .catch(error => { ready = undefined; throw error; });
    await ready;
  }
  async function ref(context: { fs: git.PromiseFsClient; gitdir: string }, name: string): Promise<string | null> {
    try { return await git.resolveRef({ ...context, ref: name }); }
    catch (error) { if (error instanceof git.Errors.NotFoundError) return null; throw error; }
  }
  async function sourceHead(id: string): Promise<SourceHead> {
    return { ref: await git.currentBranch({ ...source(id), fullname: true }) || null, oid: await ref(source(id), "HEAD") };
  }
  function branchRef(name: string): string {
    if (typeof name !== "string" || !name || name === "HEAD" || name === "@" || name.startsWith("-") ||
        /[\u0000-\u0020\u007f~^:?*\[\\]/.test(name) || name.includes("..") || name.includes("@{") || name.endsWith(".") ||
        name.split("/").some(part => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock")))
      throw validation("Use a valid Git branch name without spaces, '..', or Git control characters.");
    return `refs/heads/${name}`;
  }
  async function branches(id: string): Promise<string[]> {
    const current = await git.currentBranch(source(id));
    return [...new Set([...(await git.listBranches(source(id))), ...(current ? [current] : [])])].sort();
  }
  async function sourceRoots(id: string, head: string | null, stashes: RepositoryRecord["autoStashes"] = {}): Promise<string[]> {
    return [...(head ? [head] : []), ...Object.keys(stashes).filter(oid => /^[0-9a-f]{40}$/.test(oid)),
      ...(await git.listRefs({ ...source(id), filepath: "refs" })).filter(name => !name.startsWith("editor/") && name !== "stash").map(name => `refs/${name}`)];
  }
  async function working(id: string, contents = true): Promise<Files> {
    const result: Files = new Map();
    const visit = async (relative: string) => {
      for (const name of (await fs.promises.readdir(`${paths(id).dir}${relative ? `/${relative}` : ""}`) as string[]).sort()) {
        if (!relative && name === ".git") continue;
        const path = filePath(relative ? `${relative}/${name}` : name);
        const absolute = `${paths(id).dir}/${path}`;
        const stat = await fs.promises.lstat(absolute);
        if (stat.isSymbolicLink()) throw new Error("Symbolic links are not supported by this editor; the stored link was left untouched.");
        if (stat.isDirectory()) await visit(path);
        else result.set(path, { data: contents ? new Uint8Array(await fs.promises.readFile(absolute)) : new Uint8Array(), mode: stat.mode & 0o111 ? "100755" : "100644" });
      }
    };
    await visit("");
    return result;
  }
  async function treeFiles(context: { fs: git.PromiseFsClient; gitdir: string }, oid: string): Promise<Files> {
    const result: Files = new Map();
    const visit = async (treeOid: string, prefix: string) => {
      for (const entry of (await git.readTree({ ...context, oid: treeOid })).tree) {
        const path = filePath(prefix + entry.path);
        if (entry.type === "tree") await visit(entry.oid, `${path}/`);
        else {
          if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) throw new Error("Symbolic links and Git submodules are not supported; the imported repository was left untouched.");
          result.set(path, { data: (await git.readBlob({ ...context, oid: entry.oid })).blob, mode: entry.mode });
        }
      }
    };
    const commit = await git.readCommit({ ...context, oid });
    await visit(commit.commit.tree, "");
    return result;
  }
  async function writeTree(context: { fs: git.PromiseFsClient; gitdir: string }, files: Files): Promise<string> {
    type Directory = Map<string, Directory | git.TreeEntry>;
    const directory: Directory = new Map();
    for (const [path, file] of files) {
      const parts = filePath(path).split("/");
      let parent = directory;
      for (const part of parts.slice(0, -1)) {
        if (!parent.has(part)) parent.set(part, new Map());
        const child = parent.get(part)!;
        if (!(child instanceof Map)) throw validation(`A file blocks the directory ${path}.`);
        parent = child;
      }
      const name = parts.at(-1)!;
      if (parent.has(name)) throw validation(`Duplicate file or directory: ${path}.`);
      parent.set(name, { path: name, mode: file.mode, type: "blob", oid: await git.writeBlob({ ...context, blob: file.data }) });
    }
    const write = async (entries: Directory): Promise<string> => {
      const tree: git.TreeEntry[] = [];
      for (const [path, value] of entries) tree.push(value instanceof Map ? { path, type: "tree", mode: "040000", oid: await write(value) } : value);
      return git.writeTree({ ...context, tree });
    };
    return write(directory);
  }
  async function createCommit(context: { fs: git.PromiseFsClient; gitdir: string }, files: Files, parent: string | null, message: string, author: Author): Promise<string> {
    const identity = { ...author, timestamp: Math.floor(Date.now() / 1000), timezoneOffset: 0 };
    return git.writeCommit({ ...context, commit: { tree: await writeTree(context, files), parent: parent ? [parent] : [], message, author: identity, committer: identity } });
  }
  async function restoreFiles(id: string, target: Files): Promise<void> {
    const current = await working(id);
    for (const path of current.keys()) if (!target.has(path)) await fs.promises.unlink(`${paths(id).dir}/${path}`);
    // Remove empty directories before replacing a former directory with a file.
    const prune = async (path: string): Promise<void> => {
      for (const child of await fs.promises.readdir(path) as string[]) {
        if (path === paths(id).dir && child === ".git") continue;
        const absolute = `${path}/${child}`;
        if ((await fs.promises.lstat(absolute)).isDirectory()) { await prune(absolute); if (!(await fs.promises.readdir(absolute)).length) await fs.promises.rmdir(absolute); }
      }
    };
    await prune(paths(id).dir);
    for (const [path, file] of target) {
      if (sameFile(current.get(path), file)) continue;
      await mkdir(`${paths(id).dir}/${path}`.slice(0, `${paths(id).dir}/${path}`.lastIndexOf("/")));
      await fs.promises.writeFile(`${paths(id).dir}/${path}`, file.data, { mode: file.mode === "100755" ? 0o755 : 0o644 });
      await fs.promises.chmod(`${paths(id).dir}/${path}`, file.mode === "100755" ? 0o755 : 0o644);
    }
  }
  async function restoreChanges(id: string, before: string, after: string): Promise<void> {
    const context = history(id);
    const changes = new Map<string, FileEntry | null>();
    const visit = async (path: string, previous?: git.TreeEntry, next?: git.TreeEntry): Promise<void> => {
      if (previous?.oid === next?.oid && previous?.mode === next?.mode) return;
      for (const entry of [previous, next]) if (entry && entry.type !== "tree" &&
        (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)))
        throw new Error("Unsupported entry in private editor history.");
      if (previous?.type === "blob") changes.set(path, null);
      if (next?.type === "blob") changes.set(path, { data: (await git.readBlob({ ...context, oid: next.oid })).blob, mode: next.mode });
      const [oldTree, newTree] = await Promise.all([
        previous?.type === "tree" ? git.readTree({ ...context, oid: previous.oid }).then(value => value.tree) : [],
        next?.type === "tree" ? git.readTree({ ...context, oid: next.oid }).then(value => value.tree) : [],
      ]);
      const oldEntries = new Map(oldTree.map(entry => [entry.path, entry]));
      const newEntries = new Map(newTree.map(entry => [entry.path, entry]));
      for (const name of new Set([...oldEntries.keys(), ...newEntries.keys()]))
        await visit(filePath(path ? `${path}/${name}` : name), oldEntries.get(name), newEntries.get(name));
    };
    const [oldCommit, newCommit] = await Promise.all([git.readCommit({ ...context, oid: before }), git.readCommit({ ...context, oid: after })]);
    await visit("", { path: "", type: "tree", mode: "040000", oid: oldCommit.commit.tree },
      { path: "", type: "tree", mode: "040000", oid: newCommit.commit.tree });
    // Read/validate every changed target blob before touching working files. The
    // two immutable endpoints make replay safe even after a partially written patch.
    const current = await working(id, false);
    const directories = new Set<string>();
    for (const [path, file] of changes) if (!file) {
      if (current.has(path)) await fs.promises.unlink(`${paths(id).dir}/${path}`);
      const parts = path.split("/");
      for (let count = 1; count < parts.length; count++) directories.add(parts.slice(0, count).join("/"));
    }
    for (const directory of [...directories].sort((a, b) => b.split("/").length - a.split("/").length)) {
      const absolute = `${paths(id).dir}/${directory}`;
      if (await exists(absolute) && (await fs.promises.lstat(absolute)).isDirectory() &&
        !(await fs.promises.readdir(absolute)).length) await fs.promises.rmdir(absolute);
    }
    for (const [path, file] of changes) if (file) {
      const absolute = `${paths(id).dir}/${path}`, mode = file.mode === "100755" ? 0o755 : 0o644;
      await mkdir(absolute.slice(0, absolute.lastIndexOf("/")));
      await fs.promises.writeFile(absolute, file.data, { mode });
      await fs.promises.chmod(absolute, mode);
    }
  }
  async function syncIndex(id: string, oid: string, privateIndex = false): Promise<void> {
    const files = await treeFiles(privateIndex ? history(id) : source(id), oid);
    for (const path of await git.listFiles(source(id))) if (!files.has(path)) await git.remove({ ...source(id), filepath: path });
    for (const [path, file] of files) await git.updateIndex({ ...source(id), filepath: path,
      oid: await git.writeBlob({ ...source(id), blob: file.data }), mode: Number.parseInt(file.mode, 8), add: true });
  }
  async function validateSourceBranch(id: string, branch: SourceBranch): Promise<void> {
    const head = await sourceHead(id);
    const before = head.ref === branch.before.ref && head.oid === branch.before.oid;
    const after = head.ref === branch.ref && head.oid === branch.oid;
    const oldRef = branch.before.ref ? await ref(source(id), branch.before.ref) : branch.before.oid;
    const target = branch.ref ? await ref(source(id), branch.ref) : branch.oid;
    if ((!before && !after) || oldRef !== branch.before.oid || (target !== branch.oid && !(branch.create && target === null && before)))
      throw new Error("The source repository changed while its branch operation was pending.");
    // Validate source objects before recovery can replace any working files.
    await treeFiles(source(id), branch.oid);
  }
  async function apply(pending: Pending, recovering = false): Promise<void> {
    const { after: project } = pending;
    const present = await metadata.get(project.id);
    if ((present?.revision ?? null) !== pending.before && present?.revision !== project.revision) throw new Error("The recovery journal conflicts with a newer repository revision.");
    if (pending.kind === "git") {
      await applyGitControls(source(project.id), pending.gitControls!, true, true);
      if (pending.filesBefore) await restoreChanges(project.id, pending.filesBefore, project.current);
    }
    else if (pending.kind === "files") {
      if (pending.filesBefore) await restoreChanges(project.id, pending.filesBefore, project.current);
      else await restoreFiles(project.id, await treeFiles(history(project.id), project.current));
    }
    else if (pending.kind === "branch") {
      const branch = pending.sourceBranch!;
      await validateSourceBranch(project.id, branch);
      // Validate a saved index before recovery can replace working files.
      if (branch.index) await treeFiles(history(project.id), branch.index);
      if (branch.files) await restoreFiles(project.id, await treeFiles(history(project.id), project.current));
      if (!branch.create && !branch.preserveIndex) await syncIndex(project.id, branch.index ?? branch.oid, !!branch.index);
    } else {
      const commit = pending.sourceCommit!;
      const head = await ref(source(project.id), "HEAD");
      if (head !== commit.before && head !== commit.oid) throw new Error("The source repository changed while its commit was pending.");
      await syncIndex(project.id, commit.oid);
    }
    await options.flush();
    if (!recovering) await options.checkpoint?.("files-flushed");
    for (const oid of project.futures) await git.writeRef({ ...history(project.id), ref: `refs/editor/futures/${oid}`, value: oid, force: true });
    await git.writeRef({ ...history(project.id), ref: historyRef, value: project.current, force: true });
    if (project.redo.length) await git.writeRef({ ...history(project.id), ref: redoRef, value: project.redo[0]!, force: true });
    else if (await ref(history(project.id), redoRef)) await git.deleteRef({ ...history(project.id), ref: redoRef });
    if (pending.kind === "git") await applyGitControls(source(project.id), pending.gitControls!, false);
    if (pending.sourceCommit) await git.writeRef({ ...source(project.id), ref: pending.sourceCommit.ref, value: pending.sourceCommit.oid, force: true });
    if (pending.sourceBranch) {
      const branch = pending.sourceBranch;
      await validateSourceBranch(project.id, branch);
      if (branch.create) await git.writeRef({ ...source(project.id), ref: branch.ref!, value: branch.oid, force: true });
      await git.writeRef({ ...source(project.id), ref: "HEAD", value: branch.ref ?? branch.oid, symbolic: branch.ref !== null, force: true });
    }
    await options.flush();
    if (!recovering) await options.checkpoint?.("refs-flushed");
    await metadata.finish(project);
    if (!recovering) await options.checkpoint?.("finalized");
  }
  async function recover(id: string): Promise<void> {
    reportProgress(options.onProgress, "recovery.repository", "running");
    try {
      const pending = await metadata.pending(id);
      if (pending) await apply(pending, true);
      reportProgress(options.onProgress, "recovery.repository", "complete");
    } catch (error) {
      reportProgress(options.onProgress, "recovery.repository", "error");
      throw error;
    }
  }
  async function persist(pending: Pending): Promise<void> {
    await options.flush(); // Snapshot objects must survive before a journal refers to them.
    await metadata.prepare(pending.after.id, pending);
    await options.checkpoint?.("prepared");
    await apply(pending);
  }
  async function project(id: string): Promise<RepositoryRecord> {
    paths(id);
    const stored = await metadata.get(id);
    if (!stored) throw new Error("This repository was not found in this browser.");
    return stored;
  }
  async function changedFiles(context: { fs: git.PromiseFsClient; gitdir: string }, oid: string, tree: string, parent?: string): Promise<FileChange[]> {
    if (!parent) return [];
    const key = `${context.gitdir}:${oid}`;
    let summary = changeSummaries.get(key);
    if (!summary) {
      summary = (async () => {
        const changes: FileChange[] = [];
        const visit = async (path: string, before?: git.TreeEntry, after?: git.TreeEntry): Promise<void> => {
          // Compare tree identities before reading them, pruning whole unchanged directories.
          if (before?.oid === after?.oid) return;
          if ([before?.type, after?.type].some(type => type && type !== "tree" && type !== "blob"))
            throw new Error("Unsupported entry in private editor history.");
          if (before?.type === "blob" || after?.type === "blob") {
            const [beforeBytes, afterBytes] = await Promise.all([
              before?.type === "blob" ? git.readBlob({ ...context, oid: before.oid }).then(result => result.blob) : new Uint8Array(),
              after?.type === "blob" ? git.readBlob({ ...context, oid: after.oid }).then(result => result.blob) : new Uint8Array(),
            ]);
            let text: { before: string; after: string } | undefined;
            // Storage/Git failures must propagate; only failed text decoding means binary.
            try { text = { before: decodeText(beforeBytes), after: decodeText(afterBytes) }; }
            catch { /* Preserve the file change without inventing text ranges. */ }
            changes.push(text ? { path, ...changedLineRanges(text.before, text.after), binary: false }
              : { path, before: [], after: [], binary: true });
          }
          const [beforeTree, afterTree] = await Promise.all([
            before?.type === "tree" ? git.readTree({ ...context, oid: before.oid }).then(result => result.tree) : [],
            after?.type === "tree" ? git.readTree({ ...context, oid: after.oid }).then(result => result.tree) : [],
          ]);
          const previous = new Map(beforeTree.map(entry => [entry.path, entry]));
          const next = new Map(afterTree.map(entry => [entry.path, entry]));
          for (const name of new Set([...previous.keys(), ...next.keys()]))
            await visit(path ? `${path}/${name}` : name, previous.get(name), next.get(name));
        };
        const beforeTree = (await git.readCommit({ ...context, oid: parent })).commit.tree;
        await visit("", { path: "", mode: "040000", type: "tree", oid: beforeTree }, { path: "", mode: "040000", type: "tree", oid: tree });
        return changes.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      })().catch(error => { changeSummaries.delete(key); throw error; });
      changeSummaries.set(key, summary);
    }
    // Public snapshots cannot mutate the cached summary of an immutable commit.
    return structuredClone(await summary);
  }
  const graphKey = (head: string | null) => head ?? "unborn";
  async function graphRecord(stored: RepositoryRecord, head: string | null): Promise<RepositoryRecord> {
    const key = graphKey(head);
    if (stored.changeGraphs?.[key]) return stored;
    const graph: ChangeGraphState = { baseline: stored.current, revisions: [] };
    if (!stored.changeGraphs) {
      // Older stores did not record source ownership. Retain their reachable edits
      // under the current source HEAD instead of guessing or discarding history.
      const seen = new Set<string>();
      for (const root of new Set([stored.current, ...stored.redo, ...stored.futures])) for (const entry of await git.log({ ...history(stored.id), ref: root })) {
        if (seen.has(entry.oid)) continue;
        seen.add(entry.oid);
        if (!entry.commit.parent.length) graph.baseline = entry.oid;
        else if (!/^(?:Switch to branch |Checkout commit )/.test(entry.commit.message)) graph.revisions.push(entry.oid);
      }
    }
    return { ...stored, changeGraphs: { ...stored.changeGraphs, [key]: graph } };
  }
  async function recordChange(stored: RepositoryRecord, oid: string): Promise<Record<string, ChangeGraphState>> {
    const key = graphKey(await ref(source(stored.id), "HEAD"));
    const graphs = stored.changeGraphs!;
    const graph = graphs[key]!;
    return { ...graphs, [key]: { ...graph, revisions: [...graph.revisions, oid] } };
  }
  async function versions(context: { fs: git.PromiseFsClient; gitdir: string }, roots: string[], internal = false, selected?: string[], baseline?: string): Promise<Version[]> {
    // Cache by immutable object identities, never by a movable ref or revision
    // token. Cursor movement does not change graph membership or source history.
    const resolved = selected ? roots : await Promise.all(roots.map(name => git.resolveRef({ ...context, ref: name })));
    const key = JSON.stringify([resolved, selected, baseline]);
    let cached = versionViews.get(context.gitdir);
    if (cached?.key !== key) {
      cached = { key, value: readVersions(context, resolved, internal, selected, baseline).catch(error => {
        if (versionViews.get(context.gitdir)?.key === key) versionViews.delete(context.gitdir);
        throw error;
      }) };
      versionViews.delete(context.gitdir);
      versionViews.set(context.gitdir, cached);
      if (versionViews.size > 32) versionViews.delete(versionViews.keys().next().value!);
    }
    return structuredClone(await cached.value);
  }
  async function readVersions(context: { fs: git.PromiseFsClient; gitdir: string }, roots: string[], internal = false, selected?: string[], baseline?: string): Promise<Version[]> {
    type CommitRecord = Awaited<ReturnType<typeof git.readCommit>>;
    const records = new Map<string, CommitRecord>();
    if (selected) {
      for (const oid of new Set(selected)) {
        const key = `${context.gitdir}:${oid}`;
        let commit = historyCommits.get(key);
        if (!commit) {
          commit = git.readCommit({ ...context, oid }).catch(error => { historyCommits.delete(key); throw error; });
          historyCommits.set(key, commit);
          if (historyCommits.size > 1024) historyCommits.delete(historyCommits.keys().next().value!);
        }
        records.set(oid, await commit);
      }
    } else for (const root of new Set(roots)) for (const item of await git.log({ ...context, ref: root })) records.set(item.oid, item);
    const graphParents = new Map<string, string[]>();
    if (internal && selected) {
      // Stop at each nearest visible ancestor. Keep the hidden baseline identity
      // so sibling paths can share a junction without inventing sibling ancestry.
      const nearest = new Map([...records.keys()].map(oid => [oid, [oid]]));
      // This scope was created at its baseline, before any of its visible edits.
      if (baseline && !nearest.has(baseline)) nearest.set(baseline, [baseline]);
      for (const record of records.values()) historyParents.set(`${context.gitdir}:${record.oid}`, record.commit.parent);
      for (const record of records.values()) {
        for (const parent of record.commit.parent) {
          const pending = [parent];
          while (pending.length) {
            const oid = pending.at(-1)!;
            if (nearest.has(oid)) { pending.pop(); continue; }
            const key = `${context.gitdir}:${oid}`;
            let parents = historyParents.get(key);
            if (!parents) {
              parents = (await git.readCommit({ ...context, oid })).commit.parent;
              historyParents.set(key, parents);
            }
            const unresolved = parents.find(ancestor => !nearest.has(ancestor));
            if (unresolved) { pending.push(unresolved); continue; }
            nearest.set(oid, [...new Set(parents.flatMap(ancestor => nearest.get(ancestor)!))]);
            pending.pop();
          }
        }
        graphParents.set(record.oid, [...new Set(record.commit.parent.flatMap(parent => nearest.get(parent)!))]);
      }
    }
    const parentsOf = (record: CommitRecord) => graphParents.get(record.oid) ?? record.commit.parent;
    const children = new Map([...records.keys()].map(oid => [oid, 0]));
    for (const record of records.values()) for (const parent of parentsOf(record)) if (children.has(parent)) children.set(parent, children.get(parent)! + 1);
    const ready = [...records.values()].filter(record => children.get(record.oid) === 0);
    const result: Version[] = [];
    while (ready.length) {
      ready.sort((a, b) => b.commit.author.timestamp - a.commit.author.timestamp || a.oid.localeCompare(b.oid));
      const item = ready.shift()!;
      const message = item.commit.message.trim();
      result.push({ oid: item.oid, parents: [...item.commit.parent], message: internal ? message.replace(/\n\nEditor-Change: [\w-]+$/, "") : message,
        ...(graphParents.has(item.oid) ? { graphParents: [...graphParents.get(item.oid)!] } : {}),
        timestamp: item.commit.author.timestamp * 1000, ...(internal ? { changes: await changedFiles(context, item.oid, item.commit.tree, item.commit.parent[0]) } : {}) });
      for (const parent of parentsOf(item)) if (children.has(parent)) { children.set(parent, children.get(parent)! - 1); if (!children.get(parent)) ready.push(records.get(parent)!); }
    }
    return result;
  }
  async function snapshot(stored: RepositoryRecord): Promise<RepositorySnapshot> {
    const sourceOid = await ref(source(stored.id), "HEAD");
    const scoped = await graphRecord(stored, sourceOid);
    // Scope migration is metadata-only and atomic; all callers have recovered
    // pending journals under the repository lock before taking a snapshot.
    if (scoped !== stored) await metadata.finish(scoped);
    const files = await trackProgress(options.onProgress, "files.scan", async () => [...(await working(stored.id, false)).keys()].sort());
    const graph = scoped.changeGraphs![graphKey(sourceOid)]!;
    const edits = await trackProgress(options.onProgress, "git.edits", () => versions(history(stored.id), [], true, graph.revisions, graph.baseline));
    const { head, commits } = await trackProgress(options.onProgress, "git.commits", async () => {
      const head = await ref(source(stored.id), "HEAD");
      return { head, commits: await versions(source(stored.id), await sourceRoots(stored.id, head, scoped.autoStashes)) };
    });
    const local = await trackProgress(options.onProgress, "git.branches", async () => ({
      branch: await git.currentBranch(source(stored.id)) || null, branches: await branches(stored.id),
    }));
    return { id: stored.id, name: stored.name, revision: stored.revision, historyHead: stored.current, files,
      ...(stored.editGroup ? { editGroup: structuredClone(stored.editGroup) } : {}),
      canUndo: stored.undo.length > 0, canRedo: stored.redo.length > 0,
      history: edits, commits, head, ...local };
  }
  async function locked<T>(id: string, action: () => Promise<T>): Promise<T> { paths(id); await initialize(); return options.lock(id, action); }
  async function action(id: string, expected: string, details: unknown[], mutate: (stored: RepositoryRecord) => Promise<Pending | null>): Promise<RepositorySnapshot> {
    return locked(id, async () => {
      // Enqueue before asynchronous hashing so later requests cannot overtake this action.
      const key = (await git.hashBlob({ object: JSON.stringify(details) })).oid;
      await recover(id);
      const original = await project(id);
      const stored = await graphRecord(original, await ref(source(id), "HEAD"));
      if (stored.revision !== expected) {
        if (stored.lastAction?.base === expected && stored.lastAction.key === key) return snapshot(original);
        throw new Error("This repository changed in another tab. Reopen it before saving; your current editor text has been kept.");
      }
      if (stored.gitOperation && !["gitAction", "write"].includes(String(details[0]))) throw validation("Continue or abort the Git operation in progress first.");
      const pending = await mutate(stored);
      if (!pending) return snapshot(original);
      if (details[0] !== "write") delete pending.after.editGroup;
      pending.after.revision = crypto.randomUUID();
      pending.after.lastAction = { base: expected, key };
      await persist(pending);
      return snapshot(pending.after);
    });
  }
  async function edit(id: string, expected: string, details: unknown[], message: string | ((parent: string) => Promise<string>), change: (files: Files) => void,
    grouping?: { path: string; group: EditGroup }): Promise<RepositorySnapshot> {
    return action(id, expected, details, async stored => {
      const files = await working(id);
      const previous = new Map(files);
      change(files);
      const before = await writeTree(history(id), previous);
      if (await writeTree(history(id), files) === before) return null;
      const line = grouping ? singleEditedLine(decodeText(previous.get(grouping.path)!.data), decodeText(files.get(grouping.path)!.data)) : undefined;
      const group = grouping && line === grouping.group.line ? grouping : undefined;
      const amend = group && !stored.redo.length && stored.editGroup?.id === group.group.id &&
        stored.editGroup.path === group.path && stored.editGroup.line === line;
      const parent = amend ? stored.editGroup!.before : stored.current;
      const subject = typeof message === "string" ? message : await message(parent);
      const current = await createCommit(history(id), files, parent, `${subject}\n\nEditor-Change: ${crypto.randomUUID()}`, internalAuthor);
      const graphs = await recordChange(stored, current);
      if (amend) for (const [key, graph] of Object.entries(graphs))
        if (graph.revisions.includes(stored.current)) graphs[key] = { ...graph, revisions: graph.revisions.filter(oid => oid !== stored.current) };
      const order = stored.historyOrder ?? Object.values(stored.changeGraphs ?? {}).flatMap(scope => scope.revisions);
      const after: RepositoryRecord = { ...stored, current, undo: amend ? stored.undo : [...stored.undo, stored.current], redo: [],
        futures: [...new Set([...stored.futures, ...stored.redo.slice(0, 1)])],
        historyOrder: [...(amend ? order.filter(oid => oid !== stored.current) : order), current],
        changeGraphs: graphs };
      if (group) after.editGroup = { ...group.group, path: group.path, before: parent };
      else delete after.editGroup;
      return { before: stored.revision, kind: "files", after };
    });
  }
  function sameFile(left: FileEntry | undefined, right: FileEntry): boolean {
    return !!left && left.mode === right.mode && left.data.length === right.data.length && left.data.every((byte, index) => byte === right.data[index]);
  }
  function sameFiles(left: Files, right: Files): boolean {
    return left.size === right.size && [...right].every(([path, file]) => sameFile(left.get(path), file));
  }
  async function checkout(stored: RepositoryRecord, before: SourceHead, oid: string, target: string | null, message: string): Promise<Pending> {
    const id = stored.id;
    if (before.oid === oid) return { before: stored.revision, after: { ...stored }, kind: "branch",
      sourceBranch: { before, ref: target, oid, create: false, files: false, preserveIndex: true } };
    const files = await working(id);
    const committed = before.oid ? await treeFiles(source(id), before.oid) : new Map<string, FileEntry>();
    const indexed = await indexFiles(source(id));
    const targetFiles = await treeFiles(source(id), oid);
    const incoming = stored.autoStashes?.[oid];
    const next = incoming ? await treeFiles(history(id), incoming.working) : new Map(targetFiles);
    const targetIndex = incoming ? await treeFiles(history(id), incoming.index) : targetFiles;
    const autoStashes = { ...stored.autoStashes };
    delete autoStashes[graphKey(before.oid)];
    if (!sameFiles(files, committed) || !sameFiles(indexed, committed)) autoStashes[graphKey(before.oid)] = {
      working: await createCommit(history(id), files, null, "Automatic checkout stash: working files", internalAuthor),
      index: await createCommit(history(id), indexed, null, "Automatic checkout stash: staging", internalAuthor)
    };
    delete autoStashes[oid];
    // Noncolliding untracked/ignored files remain available in every version.
    // Colliding files stay in the outgoing stash and return with their version.
    const occupied = new Set([...targetFiles.keys(), ...targetIndex.keys(), ...next.keys()]);
    const directories = new Set<string>();
    const parents = (path: string) => path.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"));
    for (const path of occupied) for (const parent of parents(path)) directories.add(parent);
    for (const [path, file] of files) if (!committed.has(path) && !indexed.has(path)) {
      if (!occupied.has(path) && !directories.has(path) && !parents(path).some(parent => occupied.has(parent))) next.set(path, file);
    }
    const changed = !sameFiles(files, next);
    const after = { ...stored, autoStashes };
    if (changed) {
      after.current = await createCommit(history(id), next, stored.current, `${message}\n\nEditor-Change: ${crypto.randomUUID()}`, internalAuthor);
      after.undo = [...stored.undo, stored.current];
      after.redo = [];
      after.futures = [...new Set([...stored.futures, ...stored.redo.slice(0, 1)])];
    }
    return { before: stored.revision, after: await graphRecord(after, oid), kind: "branch",
      sourceBranch: { before, ref: target, oid, create: false, files: changed, ...(incoming ? { index: incoming.index } : {}) } };
  }
  function existing(files: Files, path: string): FileEntry { const file = files.get(path); if (!file) throw validation(`File not found: ${path}`); return file; }
  function absent(files: Files, path: string): void { if (files.has(path)) throw validation(`A file already exists at ${path}.`); }
  function subtree(files: Files, path: string): [string, FileEntry][] {
    const entries = [...files].filter(([name]) => name === path || name.startsWith(`${path}/`));
    if (!entries.length) throw validation(`File or folder not found: ${path}`);
    return entries;
  }
  function renameDestination(files: Files, path: string): void {
    absent(files, path);
    if ([...files.keys()].some(name => name.startsWith(`${path}/`))) throw validation(`A folder already exists at ${path}.`);
    const parts = path.split("/");
    for (let length = 1; length < parts.length; length++) {
      const parent = parts.slice(0, length).join("/");
      if (files.has(parent)) throw validation(`A file blocks the directory ${parent}.`);
    }
  }
  function navigate(id: string, expected: string, direction: "undo" | "redo") {
    return action(id, expected, [direction], async stored => {
      const target = stored[direction].at(-1);
      if (!target) return null;
      return { before: stored.revision, kind: "files", filesBefore: stored.current, after: { ...stored, current: target,
        undo: direction === "undo" ? stored.undo.slice(0, -1) : [...stored.undo, stored.current],
        redo: direction === "redo" ? stored.redo.slice(0, -1) : [...stored.redo, stored.current] } };
    });
  }

  return {
    async cancelRemote(id) { remoteJobs.get(id)?.abort(); },
    remoteStatus: id => locked(id, async () => { await recover(id); await project(id); return remoteStatus(source(id)); }),
    remoteRefs: (url, access, operationId) => remoteJob(operationId, access?.token ?? "", async signal => {
      const canonical = repositoryUrl(url, access);
      const result = await git.getRemoteInfo2({ url: canonical, http: gitHttp(canonical, access, signal, false, undefined, options.fetch), protocolVersion: 1, corsProxy: "" });
      return (result.refs ?? []).filter(item => /^(refs\/heads\/|refs\/tags\/)/.test(item.ref)).map(({ ref, oid }) => ({ ref, oid }));
    }),
    remoteAction: (id, request, expected) => remoteJob(request.operationId ?? crypto.randomUUID(), request.access?.token ?? "", signal => {
      const { access: _access, ...identity } = request;
      return action(id, expected, ["remoteAction", identity], async stored => {
        const controls = await planRemoteGit(localHost(id), request, signal, options.onRemoteProgress, options.fetch);
        if (controls.some(file => file.path === "shallow" && file.after?.length)) throw validation("The server returned incomplete history. The fetch was not published.");
        return { before: stored.revision, after: { ...stored }, kind: "git", gitControls: controls };
      });
    }),
    cloneRemote: request => remoteJob(request.operationId, request.access?.token ?? "", async signal => {
      if (!request.name.trim() || request.name.length > 200 || /[\u0000-\u001f]/.test(request.name)) throw validation("Use a repository name of 1–200 characters.");
      const url = repositoryUrl(request.url, request.access), branch = request.branch ? refName(request.branch) : undefined, id = crypto.randomUUID();
      return locked(id, async () => {
        try {
          await mkdir(paths(id).dir);
          await git.clone({ ...source(id), url, http: gitHttp(url, request.access, signal, false, undefined, options.fetch), corsProxy: "", singleBranch: false, noTags: false, noCheckout: true, ...(branch ? { ref: branch } : {}),
            onProgress: value => { options.onRemoteProgress?.({ id: request.operationId, phase: value.phase, loaded: value.loaded, total: value.total }); } });
          signal.throwIfAborted();
          if (await exists(`${paths(id).gitdir}/shallow`)) throw validation("The server returned shallow history. Clone a complete repository instead.");
          const head = await ref(source(id), "HEAD"), checked = new Set<string>();
          for (const name of await sourceRoots(id, head)) {
            for (const entry of await git.log({ ...source(id), ref: name })) {
              signal.throwIfAborted(); if (checked.has(entry.oid)) continue;
              await treeFiles(source(id), entry.oid); checked.add(entry.oid);
              options.onRemoteProgress?.({ id: request.operationId, phase: "Verifying history", loaded: checked.size, total: 0 });
            }
          }
          if (head) { await restoreFiles(id, await treeFiles(source(id), head)); await syncIndex(id, head); }
          else await git.writeRef({ ...source(id), ref: "HEAD", value: `refs/heads/${branch ?? "main"}`, symbolic: true, force: true });
          await git.init({ ...history(id), bare: true, defaultBranch: "current" });
          const current = await createCommit(history(id), await working(id), null, `Clone ${request.name.trim()}\n\nEditor-Change: ${crypto.randomUUID()}`, internalAuthor);
          const stored: RepositoryRecord = { id, name: request.name.trim(), revision: crypto.randomUUID(), current, undo: [], redo: [], futures: [], changeGraphs: { [graphKey(head)]: { baseline: current, revisions: [] } } };
          signal.throwIfAborted(); await persist({ before: null, after: stored, kind: "files" }); return snapshot(stored);
        } catch (error) {
          // Published or journaled repositories must survive a failed final response.
          if (!await metadata.pending(id) && !await metadata.get(id)) { await removeRemoteTree({ fs }, paths(id).dir); await removeRemoteTree({ fs }, paths(id).historyGitdir); }
          throw error;
        }
      });
    }),
    position: id => locked(id, async () => {
      await recover(id);
      const stored = await project(id);
      return { id: stored.id, revision: stored.revision, historyHead: stored.current,
        ...(stored.editGroup ? { editGroup: structuredClone(stored.editGroup) } : {}) };
    }),
    prepareRetention: id => locked(id, async () => {
      await recover(id);
      const stored = await project(id);
      const scoped = await graphRecord(stored, await ref(source(id), "HEAD"));
      if (scoped !== stored) await metadata.finish(scoped);
    }),
    async list() { await initialize(); return (await metadata.list()).map(({ id, name }) => ({ id, name })); },
    async create(name, imported = []) {
      if (typeof name !== "string" || !name.trim() || name.length > 200 || /[\u0000-\u001f]/.test(name)) throw new Error("Use a repository name of 1–200 characters.");
      const files = imported.map(file => {
        if (!(file.data instanceof Uint8Array)) throw new Error("Imported file content must be a byte array.");
        return { path: filePath(file.path, true), data: new Uint8Array(file.data) };
      });
      if (new Set(files.map(file => file.path)).size !== files.length) throw new Error("The import contains duplicate file paths.");
      const id = crypto.randomUUID();
      return locked(id, async () => {
        await mkdir(paths(id).dir);
        for (const file of files) { const path = `${paths(id).dir}/${file.path}`; await mkdir(path.slice(0, path.lastIndexOf("/"))); await fs.promises.writeFile(path, file.data, { mode: 0o644 }); }
        if (files.some(file => file.path.startsWith(".git/"))) {
          if (!await exists(`${paths(id).gitdir}/HEAD`)) throw new Error("The imported .git directory is incomplete: HEAD is missing.");
          const reference = decodeText(new Uint8Array(await fs.promises.readFile(`${paths(id).gitdir}/HEAD`))).trim();
          if (!/^(?:ref: refs\/heads\/[^\s~^:?*\[\\]+|[0-9a-f]{40})$/.test(reference) || reference.includes("..") || reference.endsWith("/") || reference.endsWith(".lock"))
            throw new Error("The imported Git HEAD is invalid.");
          for (const path of ["commondir", "shallow", "objects/info/alternates"]) if (await exists(`${paths(id).gitdir}/${path}`)) throw new Error("Linked, shallow, and alternate-object Git repositories are not supported. Import a complete standalone repository.");
          const head = await ref(source(id), "HEAD");
          await git.listFiles(source(id)); // Validate the imported index without rebuilding or staging it.
          const checked = new Set<string>();
          for (const name of ["HEAD", ...(await git.listRefs({ ...source(id), filepath: "refs" })).filter(name => !name.startsWith("editor/") && name !== "stash").map(name => `refs/${name}`)]) {
            if (name === "HEAD" && !head) continue;
            for (const entry of await git.log({ ...source(id), ref: name })) {
              if (checked.has(entry.oid)) continue;
              await treeFiles(source(id), entry.oid); // A complete import retains readable trees/blobs throughout its history.
              checked.add(entry.oid);
            }
          }
          if (head) {
            const committed = await treeFiles(source(id), head);
            for (const [path, file] of committed) if (await exists(`${paths(id).dir}/${path}`)) {
              const data = await fs.promises.readFile(`${paths(id).dir}/${path}`);
              await fs.promises.writeFile(`${paths(id).dir}/${path}`, data, { mode: file.mode === "100755" ? 0o755 : 0o644 });
              await fs.promises.chmod(`${paths(id).dir}/${path}`, file.mode === "100755" ? 0o755 : 0o644);
            }
          }
        } else await git.init({ ...source(id), defaultBranch: "main" });
        await git.init({ ...history(id), bare: true, defaultBranch: "current" });
        const current = await createCommit(history(id), await working(id), null, `${files.length ? "Import" : "Create"} ${name.trim()}\n\nEditor-Change: ${crypto.randomUUID()}`, internalAuthor);
        const stored: RepositoryRecord = { id, name: name.trim(), revision: crypto.randomUUID(), current, undo: [], redo: [], futures: [],
          changeGraphs: { [graphKey(await ref(source(id), "HEAD"))]: { baseline: current, revisions: [] } } };
        await persist({ before: null, after: stored, kind: "files" });
        return snapshot(stored);
      });
    },
    open: id => locked(id, async () => { await recover(id); return snapshot(await project(id)); }),
    read: (id, path) => { filePath(path); return locked(id, async () => {
      await project(id);
      if (await metadata.pending(id)) throw new Error("A repository update is incomplete. Reopen the repository to recover it before reading files.");
      const parts = path.split("/");
      for (let count = 1; count <= parts.length; count++) {
        const absolute = `${paths(id).dir}/${parts.slice(0, count).join("/")}`;
        let stat;
        try { stat = await fs.promises.lstat(absolute); }
        catch (error) { if (missing(error)) throw validation(`File not found: ${path}`); throw error; }
        if (stat.isSymbolicLink()) throw new Error("Symbolic links are not supported by this editor; the stored link was left untouched.");
        if ((count === parts.length && stat.isDirectory()) || (count < parts.length && !stat.isDirectory())) throw validation(`File not found: ${path}`);
      }
      return decodeText(new Uint8Array(await fs.promises.readFile(`${paths(id).dir}/${path}`)));
    }); },
    readCommitted: (id, path, oid) => {
      inputPath(path);
      if(oid!==null&&!/^[a-f0-9]{40}$/.test(oid))throw validation("Invalid source commit.");
      return locked(id,async()=>{
        await project(id);if(!oid)return null;
        try{return decodeText((await git.readBlob({...source(id),oid,filepath:path})).blob);}
        catch(error){if(error instanceof git.Errors.NotFoundError)return null;throw error;}
      });
    },
    write: (id, path, content, expected, group, intent) => {
      inputPath(path); const data = inputText(content);
      if (intent !== undefined && intent !== "format") throw validation("Invalid document action.");
      if (group && (typeof group.id !== "string" || !/^[\w-]{1,128}$/.test(group.id) || !Number.isSafeInteger(group.line) || group.line < 1))
        throw validation("Invalid editor history group.");
      return edit(id, expected, ["write", path, content, ...(intent ? [group, intent] : group ? [group] : [])],
        async parent => intent === "format" ? "Format document" : editMessage(path, await messageBase(id, parent, path), content), files => {
        const old = existing(files, path); try { decodeText(old.data); } catch (error) { throw validation((error as Error).message); }
        files.set(path, { ...old, data });
      }, group && intent !== "format" ? { path, group } : undefined);
    },
    createFile: (id, path, content, expected) => { inputPath(path); const data = inputText(content); return edit(id, expected, ["create", path, content], `Create ${path}`, files => { absent(files, path); files.set(path, { data, mode: "100644" }); }); },
    addFiles: (id, imported, expected) => {
      if (!imported.length) throw validation("Choose at least one file to add.");
      const added = imported.map(file => {
        if (!(file.data instanceof Uint8Array)) throw validation("Imported file content must be a byte array.");
        inputPath(file.path);
        return { path: file.path, data: new Uint8Array(file.data) };
      });
      return edit(id, expected, ["addFiles", added], `Add ${added.length} ${added.length === 1 ? "file" : "files"}`, files => {
        for (const file of added) {
          renameDestination(files, file.path);
          files.set(file.path, { data: file.data, mode: "100644" });
        }
      });
    },
    rename: (id, from, to, expected) => { inputPath(from); inputPath(to); return edit(id, expected, ["rename", from, to], `Rename ${from} to ${to}`, files => {
      const entries = subtree(files, from);
      if (from === to) return;
      if (to.startsWith(`${from}/`)) throw validation("A folder cannot be moved inside itself.");
      renameDestination(files, to);
      for (const [path] of entries) files.delete(path);
      for (const [path, file] of entries) files.set(to + path.slice(from.length), file);
    }); },
    remove: (id, path, expected) => { inputPath(path); return edit(id, expected, ["remove", path], `Delete ${path}`, files => { for (const [name] of subtree(files, path)) files.delete(name); }); },
    undo: (id, expected) => navigate(id, expected, "undo"),
    redo: (id, expected) => navigate(id, expected, "redo"),
    selectHistory: (id, oid, expected) => action(id, expected, ["selectHistory", oid], async stored => {
      if (typeof oid !== "string" || !/^[0-9a-f]{40}$/.test(oid)) throw validation("Choose a revision from this repository's change history.");
      if (!stored.changeGraphs![graphKey(await ref(source(id), "HEAD"))]!.revisions.includes(oid))
        throw validation("This revision is not in this source version's change history.");
      if (oid === stored.current) return null;
      await treeFiles(history(id), oid); // Verify every target object and path before journaling a restore.
      return { before: stored.revision, kind: "files", after: { ...stored, current: oid,
        undo: [...stored.undo, stored.current], redo: [],
        futures: [...new Set([...stored.futures, stored.current, ...stored.redo])] } };
    }),
    createBranch: (id, name, expected) => {
      const target = branchRef(name);
      return action(id, expected, ["createBranch", name], async stored => {
        const before = await sourceHead(id);
        if (!before.oid) throw new Error("Create an ordinary Git commit before creating a branch.");
        const existing = await branches(id);
        if (existing.includes(name)) throw new Error(`A branch named ${name} already exists.`);
        if (existing.some(branch => name.startsWith(`${branch}/`) || branch.startsWith(`${name}/`)))
          throw new Error("That branch name conflicts with an existing branch path.");
        await treeFiles(source(id), before.oid);
        return { before: stored.revision, after: { ...stored }, kind: "branch",
          sourceBranch: { before, ref: target, oid: before.oid, create: true, files: false } };
      });
    },
    switchBranch: (id, name, expected) => {
      const target = branchRef(name);
      return action(id, expected, ["switchBranch", name], async stored => {
        const before = await sourceHead(id);
        if (before.ref === target) return null;
        const oid = await ref(source(id), target);
        if (!oid) throw validation(`Branch not found: ${name}.`);
        return checkout(stored, before, oid, target, `Switch to branch ${name}`);
      });
    },
    checkoutCommit: (id, oid, expected) => action(id, expected, ["checkoutCommit", oid], async stored => {
      if (typeof oid !== "string" || !/^[0-9a-f]{40}$/.test(oid)) throw validation("Choose a commit from this repository's version history.");
      const before = await sourceHead(id);
      if (before.oid === oid) return null;
      let reachable = false;
      for (const root of await sourceRoots(id, before.oid, stored.autoStashes)) {
        if ((await git.log({ ...source(id), ref: root })).some(entry => entry.oid === oid)) { reachable = true; break; }
      }
      if (!reachable) throw validation("This commit is not in this repository's version history.");
      return checkout(stored, before, oid, null, `Checkout commit ${oid.slice(0, 8)}`);
    }),
    commit: (id, message, author, expected) => {
      if (!message.trim() || !author.name.trim() || !author.email.trim() || /[\r\n<>]/.test(author.name + author.email)) throw new Error("A commit needs a message, author name, and email without newlines or angle brackets.");
      return action(id, expected, ["commit", message, author], async stored => {
        const head = await ref(source(id), "HEAD");
        const all = await working(id);
        const included = new Set((await git.statusMatrix(source(id))).map(row => row[0]));
        const files = new Map([...all].filter(([path]) => included.has(path)));
        const tree = await writeTree(source(id), files);
        if (head && (await git.readCommit({ ...source(id), oid: head })).commit.tree === tree) throw new Error("There are no changes to commit.");
        const oid = await createCommit(source(id), files, head, message, { name: author.name.trim(), email: author.email.trim() });
        const branch = await git.currentBranch({ ...source(id), fullname: true });
        return { before: stored.revision, after: await graphRecord(stored, oid), kind: "commit", sourceCommit: { oid, before: head, ref: branch || "HEAD" } };
      });
    },
    gitCommit: (id, oid) => locked(id, async () => {
      await recover(id);
      const parsed = await git.readCommit({ ...source(id), oid }), commit = parsed.commit;
      const before = commit.parent[0] ? await treeFiles(source(id), commit.parent[0]) : new Map<string, FileEntry>();
      const after = await treeFiles(source(id), oid);
      const files = [...new Set([...before.keys(), ...after.keys()])].filter(path => {
        const a = before.get(path), b = after.get(path); return !a || !b || !sameFile(a, b);
      }).sort();
      return { oid: parsed.oid, message: commit.message, author: { name: commit.author.name, email: commit.author.email }, parents: commit.parent, files };
    }),
    gitStatus: id => locked(id, async () => { await recover(id); const stored = await project(id); return localGitStatus(source(id), stored.revision, stored.gitOperation); }),
    gitDiff: (id, request) => locked(id, async () => { await recover(id); return localGitDiff(localHost(id), request, (await project(id)).gitOperation); }),
    gitAction: (id, request, expected) => action(id, expected, ["gitAction", request], async stored => {
      const plan = await planLocalGit(localHost(id), request, stored.gitOperation).catch(error => { throw validation(error instanceof Error ? error.message : String(error)); });
      const previous = await working(id);
      const changed = await writeTree(history(id), previous) !== await writeTree(history(id), plan.files);
      let after: RepositoryRecord = { ...stored };
      let filesBefore: string | undefined;
      if (changed) {
        filesBefore = await createCommit(history(id), previous, null, "Before Git operation", internalAuthor);
        const current = await createCommit(history(id), plan.files, stored.current, `Git: ${plan.label}`, internalAuthor);
        after = { ...after, current, undo: [...stored.undo, stored.current], redo: [],
          futures: [...new Set([...stored.futures, ...stored.redo.slice(0, 1)])],
          historyOrder: [...(stored.historyOrder ?? []), current], changeGraphs: await recordChange(stored, current) };
      }
      if (plan.operation) { after.gitOperation = plan.operation;
        after.futures = [...new Set([...after.futures, plan.operation.beforeFiles])];
      } else delete after.gitOperation;
      after = await graphRecord(after, plan.head);
      return { before: stored.revision, kind: "git", after, gitControls: plan.controls, ...(filesBefore ? { filesBefore } : {}) };
    }),
    loadPreferences: () => metadata.loadPreferences(),
    savePreferences: value => metadata.savePreferences(structuredClone(value)),
  };
}

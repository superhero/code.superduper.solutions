// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import * as git from "isomorphic-git";
import { mergeDriver } from "./merge-driver.ts";
import { decodeText, encodeText, filePath } from "./paths.ts";
import { refName } from "../remotes/policy.ts";
import type { Author } from "./types.ts";
import type { GitAction, GitControl, GitControlPatch, GitDiff, GitDiffRequest, GitOperation, GitStatus } from "./local-git-types.ts";

type File = { data: Uint8Array; mode: string };
type Files = Map<string, File>;
type Fs = git.PromiseFsClient & { promises: { chmod(path: string, mode: number): Promise<void> } };
type Context = { fs: Fs; dir: string; gitdir: string };
export type LocalGitHost = Context & {
  scratch: string;
  working(): Promise<Files>;
  tree(oid: string): Promise<Files>;
  privateTree(oid: string): Promise<Files>;
  privateSnapshot(files: Files): Promise<string>;
};
const absent = (error: unknown) => (error as { code?: string })?.code === "ENOENT";
export const equalBytes = (a: Uint8Array | null, b: Uint8Array | null): boolean =>
  a === b || !!a && !!b && a.length === b.length && a.every((byte, index) => byte === b[index]);
const sameFile = (a?: File, b?: File) => !a && !b || !!a && !!b && a.mode === b.mode && equalBytes(a.data, b.data);
async function mkdir(fs: Fs, path: string): Promise<void> {
  try { await fs.promises.mkdir(path); }
  catch (error) {
    if ((error as { code?: string }).code === "EEXIST") return;
    if (!absent(error)) throw error;
    await mkdir(fs, path.slice(0, path.lastIndexOf("/")) || "/"); await fs.promises.mkdir(path);
  }
}
async function put(fs: Fs, path: string, data: Uint8Array): Promise<void> {
  await mkdir(fs, path.slice(0, path.lastIndexOf("/"))); await fs.promises.writeFile(path, data);
}
async function read(fs: Fs, path: string): Promise<Uint8Array | null> {
  try { return new Uint8Array(await fs.promises.readFile(path)); } catch (error) { if (absent(error) || ["EISDIR", "ENOTDIR"].includes((error as { code?: string }).code ?? "")) return null; throw error; }
}
async function removeTree(fs: Fs, path: string): Promise<void> {
  try {
    const stat = await fs.promises.lstat(path);
    if (stat.isDirectory()) {
      for (const child of await fs.promises.readdir(path) as string[]) await removeTree(fs, `${path}/${child}`);
      await fs.promises.rmdir(path);
    } else await fs.promises.unlink(path);
  } catch (error) { if (!absent(error)) throw error; }
}
/** Snapshot control files, never the object database. Objects are immutable and shared. */
export async function gitControls(context: Context): Promise<GitControl[]> {
  const result: GitControl[] = [];
  async function visit(relative: string) {
    for (const name of await context.fs.promises.readdir(`${context.gitdir}${relative ? `/${relative}` : ""}`) as string[]) {
      if (!relative && name === "objects" || name.endsWith(".lock")) continue;
      const path = relative ? `${relative}/${name}` : name;
      const absolute = `${context.gitdir}/${path}`, stat = await context.fs.promises.lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error("Git control-file symlinks are not supported.");
      if (stat.isDirectory()) await visit(path);
      else result.push({ path, data: new Uint8Array(await context.fs.promises.readFile(absolute)) });
    }
  }
  await visit(""); return result;
}
export function controlPatch(before: GitControl[], after: GitControl[]): GitControlPatch[] {
  const a = new Map(before.map(file => [file.path, file.data])), b = new Map(after.map(file => [file.path, file.data]));
  return [...new Set([...a.keys(), ...b.keys()])].filter(path => !equalBytes(a.get(path) ?? null, b.get(path) ?? null))
    .map(path => ({ path, before: a.get(path) ?? null, after: b.get(path) ?? null }));
}
export async function applyGitControls(context: Context, patch: GitControlPatch[], validate = true, dryRun = false): Promise<void> {
  for (const file of patch) {
    if (!file.path || file.path.startsWith("/") || file.path.split("/").some(part => part === ".." || !part) || file.path.startsWith("objects/"))
      throw new Error("Invalid Git recovery path.");
    const current = await read(context.fs, `${context.gitdir}/${file.path}`);
    if (validate && !equalBytes(current, file.before) && !equalBytes(current, file.after))
      throw new Error(`Git recovery conflicts with a newer ${file.path}. The operation has been preserved.`);
  }
  if (dryRun) return;
  for (const file of patch) if (!file.after) {
    const path = `${context.gitdir}/${file.path}`;
    if (await read(context.fs, path)) await context.fs.promises.unlink(path);
    let parent = path.slice(0, path.lastIndexOf("/"));
    while (parent !== context.gitdir) {
      try { if ((await context.fs.promises.readdir(parent)).length) break; await context.fs.promises.rmdir(parent); }
      catch (error) { if (!absent(error)) throw error; }
      parent = parent.slice(0, parent.lastIndexOf("/"));
    }
  }
  for (const file of patch) if (file.after) await put(context.fs, `${context.gitdir}/${file.path}`, file.after);
}
export async function indexFiles(context: Context): Promise<Files> {
  const files: Files = new Map();
  await git.walk({ ...context, trees: [git.STAGE()], map: async (path, [entry]) => {
    if (path === "." || !entry || await entry.type() === "tree") return;
    if (await entry.type() !== "blob") throw new Error(`Unsupported staged entry: ${path}`);
    const mode = (await entry.mode()).toString(8);
    if (!["100644", "100755"].includes(mode)) throw new Error(`Unsupported staged file mode: ${path}`);
    const oid = await entry.oid();
    files.set(path, { data: (await git.readBlob({ ...context, oid })).blob, mode });
  } });
  return files;
}
async function ref(context: Context, name = "HEAD"): Promise<string | null> {
  try { return await git.resolveRef({ ...context, ref: name }); }
  catch (error) { if (error instanceof git.Errors.NotFoundError) return null; throw error; }
}
function identity(author?: Author): Author {
  if (!author?.name?.trim() || !author.email?.trim() || /[\u0000-\u001f<>]/.test(author.name + author.email))
    throw new Error("Enter an author name and email without newlines or angle brackets.");
  return { name: author.name.trim(), email: author.email.trim() };
}
function message(value?: string): string { if (!value?.trim()) throw new Error("Enter a commit message."); return value.trim(); }
const stamp = (author: Author) => ({ ...author, timestamp: Math.floor(Date.now() / 1000), timezoneOffset: new Date().getTimezoneOffset() });
async function stashEntries(context: Context): Promise<GitStatus["stashes"]> {
  const bytes = await read(context.fs, `${context.gitdir}/logs/refs/stash`);
  if (!bytes) { const oid = await ref(context, "refs/stash"); return oid ? [{ oid, message: "Saved changes", index: 0 }] : []; }
  return new TextDecoder().decode(bytes).split("\n").filter(Boolean).reverse().map((line, index) => ({
    oid: line.split(" ")[1]!, message: line.slice(line.indexOf("\t") + 1), index,
  })).filter(entry => /^[0-9a-f]{40}$/.test(entry.oid));
}
export async function localGitStatus(context: Context, revision: string, operation?: GitOperation): Promise<GitStatus> {
  let matrix: Awaited<ReturnType<typeof git.statusMatrix>>;
  // statusMatrix cannot describe an unmerged index; retain paths and mark conflicts explicitly.
  try { matrix = await git.statusMatrix(context); }
  catch (error) {
    if (!operation?.conflicts.length) throw error;
    matrix = (await git.listFiles(context)).map(path => [path, 1, 2, 1]);
  }
  const branches = await git.listBranches(context), tags = await git.listTags(context);
  const recoveryRefs = (await git.listRefs({ ...context, filepath: "refs/editor/recovery" })).map(name => `refs/editor/recovery/${name}`);
  return { revision, files: matrix.filter(([path, head, work, stage]) => head !== work || head !== stage || operation?.conflicts.includes(path))
    .map(([path, head, work, stage]) => ({ path, head, work, stage, conflicted: operation?.conflicts.includes(path) ?? false })),
    branches: await Promise.all(branches.map(async name => ({ name, oid: (await ref(context, `refs/heads/${name}`))! }))),
    tags: await Promise.all(tags.map(async name => ({ name, oid: (await ref(context, `refs/tags/${name}`))! }))),
    recoveries: await Promise.all(recoveryRefs.map(async name => {
      const short = name.split("/").at(-1)!, match = /^(\d+)-(.+)-[a-f0-9]{8}$/.exec(short);
      return { ref: name, oid: (await ref(context, name))!, label: match ? `${match[2]!.replace(/-/g, " ")} · ${new Date(Number(match[1])).toLocaleString()}` : "Previous branch tip" };
    })),
    stashes: await stashEntries(context), operation: operation ?? null,
    author: { name: String(await git.getConfig({ ...context, path: "user.name" }) ?? ""), email: String(await git.getConfig({ ...context, path: "user.email" }) ?? "") } };
}
export async function localGitDiff(host: LocalGitHost, request: GitDiffRequest, operation?: GitOperation): Promise<GitDiff> {
  filePath(request.path);
  const head = await ref(host);
  if (operation?.conflicts.includes(request.path)) {
    const working = await host.working();
    try { return { path: request.path, before: operation.conflictVersions?.[request.path]?.ours ? decodeText(operation.conflictVersions[request.path]!.ours!) : "", after: working.has(request.path) ? decodeText(working.get(request.path)!.data) : "", binary: false }; }
    catch { return { path: request.path, before: "", after: "", binary: true }; }
  }
  let before: Files, after: Files;
  if (request.kind === "commit") {
    if (!request.oid) throw new Error("Choose a commit.");
    const entry = await git.readCommit({ ...host, oid: request.oid });
    const parent = entry.commit.parent[request.parent ?? 0];
    before = parent ? await host.tree(parent) : new Map(); after = await host.tree(request.oid);
  } else if (request.kind === "staged") {
    before = head ? await host.tree(head) : new Map(); after = await indexFiles(host);
  } else { before = await indexFiles(host); after = await host.working(); }
  try { return { path: request.path, before: before.has(request.path) ? decodeText(before.get(request.path)!.data) : "",
    after: after.has(request.path) ? decodeText(after.get(request.path)!.data) : "", binary: false }; }
  catch { return { path: request.path, before: "", after: "", binary: true }; }
}

/** All mutable Git work happens in a scratch checkout; only a journal publishes it. */
export async function planLocalGit(host: LocalGitHost, request: GitAction, existing?: GitOperation): Promise<{
  files: Files; controls: GitControlPatch[]; operation?: GitOperation; label: string; head: string | null;
}> {
  const before = await gitControls(host), initialFiles = await host.working();
  if (!existing && before.some(file => ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"].includes(file.path) || /^(rebase-merge|rebase-apply|sequencer)\//.test(file.path)))
    throw new Error("This imported repository has an unfinished Git operation. Finish or abort it in the original checkout before importing it again.");
  const scratch = `${host.scratch}/${crypto.randomUUID()}`, gitdir = `${scratch}/git`, dir = `${scratch}/work`;
  const mapPath = (path: unknown) => typeof path === "string" && (path === `${gitdir}/objects` || path.startsWith(`${gitdir}/objects/`)) ? host.gitdir + path.slice(gitdir.length) : path;
  const promises = new Proxy(host.fs.promises, { get(target, key) {
    const method = Reflect.get(target, key);
    if (typeof method !== "function") return method;
    return (...args: unknown[]) => Reflect.apply(method, target, args.map((value, index) => index === 0 || (index === 1 && ["rename", "link", "symlink"].includes(String(key))) ? mapPath(value) : value));
  } });
  const context: Context = { fs: { promises } as Fs, gitdir, dir };
  let operation = existing ? structuredClone(existing) : undefined;
  let files = new Map(initialFiles), label: string = request.kind;
  async function writeFiles(target: Files) {
    const current = await readWorking();
    for (const path of current.keys()) if (!target.has(path)) await removeTree(host.fs, `${dir}/${path}`);
    async function prune(path: string): Promise<void> {
      for (const child of await host.fs.promises.readdir(path) as string[]) {
        const absolute = `${path}/${child}`;
        if ((await host.fs.promises.lstat(absolute)).isDirectory()) { await prune(absolute); if (!(await host.fs.promises.readdir(absolute)).length) await host.fs.promises.rmdir(absolute); }
      }
    }
    await prune(dir);
    for (const [path, file] of target) {
      await put(host.fs, `${dir}/${path}`, file.data); await host.fs.promises.chmod(`${dir}/${path}`, parseInt(file.mode, 8) & 0o777);
    }
  }
  async function readWorking(): Promise<Files> {
    const result: Files = new Map();
    async function visit(prefix: string) {
      for (const name of await host.fs.promises.readdir(`${dir}${prefix ? `/${prefix}` : ""}`) as string[]) {
        const path = prefix ? `${prefix}/${name}` : name, absolute = `${dir}/${path}`, stat = await host.fs.promises.lstat(absolute);
        if (stat.isDirectory()) await visit(path);
        else result.set(filePath(path), { data: new Uint8Array(await host.fs.promises.readFile(absolute)), mode: stat.mode & 0o111 ? "100755" : "100644" });
      }
    }
    await visit(""); return result;
  }
  async function tree(oid: string | null): Promise<Files> { return oid ? host.tree(oid) : new Map(); }
  async function target(): Promise<string> {
    let oid = await ref(context, request.target);
    if (!oid) throw new Error("Choose an existing commit or branch.");
    for (let depth = 0; depth < 16; depth++) {
      const object = await git.readObject({ ...context, oid, format: "content" });
      if (object.type === "commit") return oid;
      if (object.type !== "tag") throw new Error("The target must identify a commit.");
      oid = (await git.readTag({ ...context, oid })).tag.object;
    }
    throw new Error("The annotated tag chain is too deep.");
  }
  async function setHead(oid: string) {
    const branch = await git.currentBranch({ ...context, fullname: true });
    await git.writeRef({ ...context, ref: branch || "HEAD", value: oid, force: true });
  }
  async function clean() {
    const dirty = (await git.statusMatrix(context)).some(([, head, work, stage]) => head !== 0 && (head !== work || head !== stage) || head === 0 && stage !== 0);
    if (dirty) throw new Error("Commit or stash staged and tracked changes before this operation.");
  }
  async function checkout(oid: string) { await git.checkout({ ...context, ref: oid, noUpdateHead: true }); await setHead(oid); }
  async function stage(paths: string[]) {
    for (const path of paths) {
      filePath(path);
      if (await read(host.fs, `${dir}/${path}`)) await git.add({ ...context, filepath: path });
      else await git.remove({ ...context, filepath: path });
    }
  }
  async function commitFiles(targetFiles: Files, parents: string[], text: string, author: Author, originalAuthor?: git.CommitObject["author"]): Promise<string> {
    const snapshot = await host.privateSnapshot(targetFiles);
    const privateFiles = await host.privateTree(snapshot);
    // Trees must be written in the ordinary object database, not copied by object ID from private history.
    const entries = new Map<string, unknown>();
    for (const [path, file] of privateFiles) {
      const parts = path.split("/"); let node = entries;
      for (const part of parts.slice(0, -1)) { if (!node.has(part)) node.set(part, new Map()); node = node.get(part) as Map<string, unknown>; }
      node.set(parts.at(-1)!, { path: parts.at(-1)!, mode: file.mode, type: "blob", oid: await git.writeBlob({ ...context, blob: file.data }) });
    }
    async function write(node: Map<string, unknown>): Promise<string> {
      const entries: git.TreeEntry[] = [];
      for (const [path, value] of node) entries.push(value instanceof Map ? { path, mode: "040000", type: "tree", oid: await write(value) } : value as git.TreeEntry);
      return git.writeTree({ ...context, tree: entries });
    }
    return git.writeCommit({ ...context, commit: { tree: await write(entries), parent: parents, message: text,
      author: originalAuthor ?? stamp(author), committer: stamp(author) } });
  }
  async function checkpoint(value?: string) {
    const oid = value ?? await ref(context); if (!oid) return;
    await git.writeRef({ ...context, ref: `refs/editor/recovery/${Date.now()}-${request.kind}-${(request.name || await git.currentBranch(context) || "detached").replace(/[^a-zA-Z0-9_-]+/g,"-")}-${crypto.randomUUID().slice(0, 8)}`, value: oid });
  }
  async function begin(kind: GitOperation["kind"], text: string, parents: string[], author: Author) {
    operation = { kind, label: text.split("\n")[0]!, beforeControl: await gitControls(context),
      beforeFiles: await host.privateSnapshot(initialFiles), conflicts: [], author, message: text, parents };
  }
  async function clearMerge() {
    for (const name of ["MERGE_HEAD", "MERGE_MSG", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
      const path = `${gitdir}/${name}`; if (await read(host.fs, path)) await host.fs.promises.unlink(path);
    }
  }
  /** Merge explicit trees using the library's diff3 and conflict index in isolation. */
  async function combine(base: Files, ours: Files, theirs: Files, author: Author): Promise<boolean> {
    const headFiles = await tree(await ref(context));
    const untracked = new Map([...await readWorking()].filter(([path]) => !headFiles.has(path)));
    for (const [path] of untracked) if (theirs.has(path) && !sameFile(ours.get(path), theirs.get(path)))
      throw new Error(`Untracked file ${path} would be overwritten. Stash it first.`);
    const baseOid = await commitFiles(base, [], "Merge base", author);
    const oursOid = await commitFiles(ours, [baseOid], "Current changes", author);
    const theirsOid = await commitFiles(theirs, [baseOid], "Incoming changes", author);
    try {
      const result = await git.merge({ ...context, ours: oursOid, theirs: theirsOid, noUpdateBranch: true,
        abortOnConflict: false, fastForward: false, author, mergeDriver });
      const merged = await tree(result.oid!);
      for (const [path, file] of untracked) if (!merged.has(path)) merged.set(path, file);
      await writeFiles(merged);
      // Stage only the merged tracked result; preserve unrelated untracked paths.
      for (const path of await git.listFiles(context)) if (!merged.has(path)) await git.remove({ ...context, filepath: path });
      await stage([...merged.keys()].filter(path => !untracked.has(path) || theirs.has(path)));
      return true;
    } catch (error) {
      if (!(error instanceof git.Errors.MergeConflictError)) throw error;
      const data = error.data as unknown as { filepaths?: string[] };
      const conflicts = Array.isArray(error.data) ? error.data as unknown as string[] : data.filepaths ?? [];
      if (!conflicts.length) throw error;
      operation!.conflicts = conflicts;
      for (const path of conflicts) {
        const file = ours.get(path);
        if (file) try { decodeText(file.data); } catch { await put(host.fs, `${dir}/${path}`, file.data); }
      }
      operation!.conflictVersions = Object.fromEntries(conflicts.map(path => [path, { ours: ours.has(path) ? ours.get(path)!.data : null,
        theirs: theirs.has(path) ? theirs.get(path)!.data : null, oursMode: ours.get(path)?.mode ?? null, theirsMode: theirs.get(path)?.mode ?? null }]));
      return false;
    }
  }
  async function commitIndex(text: string, author: Author, parents?: string[], originalAuthor?: git.CommitObject["author"]) {
    const oid = await git.commit({ ...context, message: text, author: originalAuthor ?? author, committer: author,
      ...(parents ? { parent: parents } : {}), disallowEmpty: false });
    await clearMerge(); return oid;
  }
  async function replay() {
    while (operation?.remaining?.length) {
      const oid = operation.remaining.shift()!, original = (await git.readCommit({ ...context, oid })).commit;
      operation.original = oid; operation.message = original.message; operation.parents = [(await ref(context))!];
      if (!await combine(await tree(original.parent[0] ?? null), await tree(await ref(context)), await tree(oid), operation.author)) return;
      await commitIndex(original.message, operation.author, undefined, original.author);
    }
    await removeTree(host.fs, `${gitdir}/rebase-merge`);
    if (await read(host.fs, `${gitdir}/REBASE_HEAD`)) await host.fs.promises.unlink(`${gitdir}/REBASE_HEAD`);
    operation = undefined;
  }
  async function dropStash(oid: string) {
    const list = (await stashEntries(context)).filter(entry => entry.oid !== oid).reverse();
    const zero = "0".repeat(40), author = request.author ?? { name: "Local editor", email: "editor@localhost" };
    const lines = list.map((entry, index) => `${index ? list[index - 1]!.oid : zero} ${entry.oid} ${author.name} <${author.email}> ${Math.floor(Date.now() / 1000)} +0000\t${entry.message}`).join("\n");
    if (list.length) { await put(host.fs, `${gitdir}/logs/refs/stash`, encodeText(lines + "\n")); await git.writeRef({ ...context, ref: "refs/stash", value: list.at(-1)!.oid, force: true }); }
    else { await removeTree(host.fs, `${gitdir}/logs/refs/stash`); if (await ref(context, "refs/stash")) await git.deleteRef({ ...context, ref: "refs/stash" }); }
  }
  try {
    await mkdir(host.fs, gitdir); await mkdir(host.fs, dir);
    for (const file of before) await put(host.fs, `${gitdir}/${file.path}`, file.data);
    await writeFiles(initialFiles);
    if (operation && !["resolve", "stage", "unstage", "continue", "skip", "abort"].includes(request.kind))
      throw new Error("Continue or abort the operation in progress first.");
    const head = await ref(context);
    const statusPaths = async () => (await git.statusMatrix(context)).filter(([, h, w, s]) => h !== w || h !== s).map(([path]) => path);
    switch (request.kind) {
      case "track-branch": {
        await clean();
        const name = refName(request.name ?? ""), match = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(request.target ?? "");
        if (!match || match[2] === "HEAD" || !(await git.listRemotes(context)).some(item => item.remote === match[1])) throw new Error("Choose an existing remote branch.");
        if (await ref(context, `refs/heads/${name}`)) throw new Error("This local branch already exists. Choose another name.");
        const remoteHead = await target(); await tree(remoteHead);
        await git.branch({ ...context, ref: name, object: remoteHead });
        await git.checkout({ ...context, ref: name });
        await git.setConfig({ ...context, path: `branch.${name}.remote`, value: match[1]! });
        await git.setConfig({ ...context, path: `branch.${name}.merge`, value: `refs/heads/${match[2]}` });
        label = `Track ${match[1]}/${match[2]}`; break;
      }
      case "stage": {
        if (request.content !== undefined && request.path) {
          filePath(request.path); const old = await read(host.fs, `${dir}/${request.path}`);
          await put(host.fs, `${dir}/${request.path}`, encodeText(request.content)); await stage([request.path]);
          if (old) await put(host.fs, `${dir}/${request.path}`, old); else await host.fs.promises.unlink(`${dir}/${request.path}`);
        } else await stage(request.paths ?? await statusPaths());
        break;
      }
      case "unstage": for (const path of request.paths ?? await statusPaths()) {
        filePath(path); if (head) await git.resetIndex({ ...context, filepath: path }); else await git.remove({ ...context, filepath: path });
      } break;
      case "discard": {
        const indexed = await indexFiles(context), current = await readWorking();
        for (const path of request.paths ?? []) { filePath(path); if (indexed.has(path)) current.set(path, indexed.get(path)!); else current.delete(path); }
        await writeFiles(current); break;
      }
      case "commit": case "amend": {
        const author = identity(request.author), text = message(request.message);
        if (request.kind === "amend") { if (!head) throw new Error("Create a commit before amending."); await checkpoint(); }
        const staged = await indexFiles(context), previous = await tree(head);
        if (request.kind === "commit" && head && staged.size === previous.size && [...staged].every(([path, file]) => sameFile(file, previous.get(path)))) throw new Error("Stage changes before committing.");
        const parent = request.kind === "amend" ? (await git.readCommit({ ...context, oid: head! })).commit.parent : head ? [head] : [];
        await commitIndex(text, author, parent); label = request.kind === "amend" ? "Amend commit" : "Commit changes"; break;
      }
      case "merge": {
        if (!head) throw new Error("Create a commit before merging."); await clean();
        const theirs = await target();
        if (head === theirs || await git.isDescendent({ ...context, oid: head, ancestor: theirs })) break;
        const ff = await git.isDescendent({ ...context, oid: theirs, ancestor: head });
        if (request.mode === "ff-only" && !ff) throw new Error("These branches have diverged; choose a merge commit or rebase.");
        if (ff && request.mode !== "merge" && request.mode !== "squash") { await checkout(theirs); break; }
        const bases = await git.findMergeBase({ ...context, oids: [head, theirs] });
        if (bases.length !== 1) throw new Error("This merge needs exactly one common ancestor; unrelated or recursive merges are not supported.");
        const author = identity(request.author);
        const text = request.message?.trim() || `Merge ${request.target}`;
        await begin("merge", text, request.mode === "squash" ? [head] : [head, theirs], author);
        await put(host.fs, `${gitdir}/MERGE_MSG`, encodeText(text));
        if (request.mode !== "squash") await put(host.fs, `${gitdir}/MERGE_HEAD`, encodeText(theirs + "\n"));
        if (await combine(await tree(bases[0]!), await tree(head), await tree(theirs), author)) { await commitIndex(text, author, operation!.parents); operation = undefined; }
        break;
      }
      case "cherry-pick": case "revert": {
        if (!head) throw new Error("Create a commit first."); await clean();
        const oid = await target(), original = (await git.readCommit({ ...context, oid })).commit, author = identity(request.author);
        const parentIndex = (request.mainline ?? 1) - 1;
        if (!Number.isInteger(parentIndex) || parentIndex < 0 || original.parent.length > 0 && parentIndex >= original.parent.length) throw new Error("Choose a valid parent number.");
        const text = request.message?.trim() || (request.kind === "revert" ? `Revert "${original.message.split("\n")[0]}"\n\nReverts ${oid}.` : original.message);
        await begin(request.kind, text, [head], author); operation!.original = oid;
        const base = request.kind === "revert" ? oid : original.parent[parentIndex] ?? null;
        const incoming = request.kind === "revert" ? original.parent[parentIndex] ?? null : oid;
        if (await combine(await tree(base), await tree(head), await tree(incoming), author)) {
          await commitIndex(text, author, [head], request.kind === "cherry-pick" ? original.author : undefined); operation = undefined;
        }
        break;
      }
      case "rebase": {
        if (!head || !await git.currentBranch(context)) throw new Error("Rebase requires a checked-out branch."); await clean();
        const onto = await target(), bases = await git.findMergeBase({ ...context, oids: [head, onto] });
        if (bases.length !== 1) throw new Error("Choose branches with one common ancestor.");
        const remaining: string[] = []; let cursor = head;
        while (cursor !== bases[0]) {
          const commit = (await git.readCommit({ ...context, oid: cursor })).commit;
          if (commit.parent.length !== 1) throw new Error("Rebase currently supports linear commit sequences. Use merge to preserve merge commits.");
          remaining.unshift(cursor); cursor = commit.parent[0]!;
        }
        if (onto === bases[0] || !remaining.length && head === onto) break;
        await checkpoint(); await begin("rebase", `Rebase onto ${request.target}`, [onto], identity(request.author));
        operation!.remaining = remaining;
        await put(host.fs, `${gitdir}/rebase-merge/head-name`, encodeText((await git.currentBranch({ ...context, fullname: true })) + "\n"));
        await put(host.fs, `${gitdir}/rebase-merge/orig-head`, encodeText(head + "\n"));
        await put(host.fs, `${gitdir}/rebase-merge/onto`, encodeText(onto + "\n"));
        await checkout(onto); await replay(); break;
      }
      case "squash": {
        if (!head || !await git.currentBranch(context)) throw new Error("Squashing requires a checked-out branch."); await clean();
        const oldest = await target(), commit = (await git.readCommit({ ...context, oid: oldest })).commit;
        let cursor = head;
        while (cursor !== oldest) {
          const next = (await git.readCommit({ ...context, oid: cursor })).commit;
          if (next.parent.length !== 1) throw new Error("Select a contiguous linear range ending at the current branch tip.");
          cursor = next.parent[0]!;
        }
        if (commit.parent.length > 1) throw new Error("Squashing a merge commit would lose its topology.");
        await checkpoint(); await commitIndex(message(request.message), identity(request.author), commit.parent); break;
      }
      case "resolve": {
        if (!operation || !request.path || !operation.conflicts.includes(request.path)) throw new Error("Choose an unresolved file.");
        const path = filePath(request.path), versions = operation.conflictVersions?.[path];
        const content = request.resolution === "ours" ? versions?.ours : request.resolution === "theirs" ? versions?.theirs : request.content;
        if (request.resolution === "delete" || content === null) await removeTree(host.fs, `${dir}/${path}`);
        else { if (content === undefined) throw new Error("Enter the resolved contents."); await put(host.fs, `${dir}/${path}`, typeof content === "string" ? encodeText(content) : content);
          const mode = request.resolution === "theirs" ? versions?.theirsMode : versions?.oursMode;
          if (mode) await host.fs.promises.chmod(`${dir}/${path}`, parseInt(mode, 8) & 0o777);
        }
        await stage([path]); operation.conflicts = operation.conflicts.filter(file => file !== path); break;
      }
      case "continue": {
        if (!operation) throw new Error("No operation is in progress.");
        if (operation.conflicts.length) throw new Error("Resolve every conflicting file first.");
        if (operation.kind === "stash") { if (operation.pop && operation.stash) await dropStash(operation.stash); operation = undefined; break; }
        const original = operation.original ? (await git.readCommit({ ...context, oid: operation.original })).commit : undefined;
        await commitIndex(request.message?.trim() || operation.message, operation.author, operation.parents,
          operation.kind === "rebase" || operation.kind === "cherry-pick" ? original?.author : undefined);
        if (operation.kind === "rebase") await replay(); else operation = undefined;
        break;
      }
      case "skip": {
        if (operation?.kind !== "rebase") throw new Error("Skip is available during a rebase.");
        // Discard only the current replay result, preserving pre-existing untracked paths.
        const tracked = await tree(await ref(context)), current = await readWorking();
        for (const path of await git.listFiles(context)) current.delete(path);
        for (const [path, file] of tracked) current.set(path, file);
        await writeFiles(current); await clearMerge();
        await git.checkout({ ...context, ref: (await ref(context))!, noUpdateHead: true, force: true });
        await replay(); break;
      }
      case "abort": {
        if (!operation) throw new Error("No operation is in progress.");
        await writeFiles(await host.privateTree(operation.beforeFiles));
        await applyGitControls(context, controlPatch(await gitControls(context), operation.beforeControl), false);
        operation = undefined; break;
      }
      case "stash-push": {
        if (!head) throw new Error("Create a commit before stashing.");
        const author = identity(request.author), current = await readWorking(), indexed = await indexFiles(context), base = await tree(head);
        const tracked = new Set([...base.keys(), ...indexed.keys()]);
        const eligible = new Set((await git.statusMatrix(context)).map(([path]) => path));
        const changed = (await git.statusMatrix(context)).some(([, h, w, s]) => (h !== 0 || s !== 0 || request.includeUntracked) && (h !== w || h !== s));
        if (!changed) throw new Error("There are no changes to stash.");
        const indexOid = await commitFiles(indexed, [head], "Stashed index", author);
        const working = new Map([...current].filter(([path]) => tracked.has(path)));
        const parents = [head, indexOid];
        if (request.includeUntracked) parents.push(await commitFiles(new Map([...current].filter(([path]) => !tracked.has(path) && eligible.has(path))), [], "Stashed untracked files", author));
        const text = request.message?.trim() || "Saved working changes", oid = await commitFiles(working, parents, text, author);
        const old = await ref(context, "refs/stash"), log = await read(host.fs, `${gitdir}/logs/refs/stash`);
        await put(host.fs, `${gitdir}/logs/refs/stash`, encodeText((log ? new TextDecoder().decode(log) : "") + `${old ?? "0".repeat(40)} ${oid} ${author.name} <${author.email}> ${Math.floor(Date.now() / 1000)} +0000\t${text.split("\n")[0]}\n`));
        await git.writeRef({ ...context, ref: "refs/stash", value: oid, force: true });
        const restored = new Map(base);
        for (const [path, file] of current) if (!tracked.has(path) && (!request.includeUntracked || !eligible.has(path))) restored.set(path, file);
        await writeFiles(restored); await git.checkout({ ...context, ref: head, noUpdateHead: true, force: true }); break;
      }
      case "stash-apply": case "stash-pop": {
        if (!head) throw new Error("Create a commit first."); await clean();
        const list = await stashEntries(context), stash = list.find(entry => entry.oid === request.target);
        if (!stash) throw new Error("Choose an existing stash.");
        const commit = (await git.readCommit({ ...context, oid: stash.oid })).commit, author = identity(request.author);
        await begin("stash", `Apply ${stash.message}`, [head], author); operation!.stash = stash.oid; operation!.pop = request.kind === "stash-pop";
        if (commit.parent[2]) {
          const untracked = await tree(commit.parent[2]), current = await readWorking();
          for (const [path, file] of untracked) { if (current.has(path)) throw new Error(`The stash would overwrite ${path}.`); current.set(path, file); }
          await writeFiles(current);
        }
        if (await combine(await tree(commit.parent[0]!), await tree(head), await tree(stash.oid), author)) {
          // Restore the original staging split when applying at the original base.
          if (head === commit.parent[0] && commit.parent[1]) {
            const saved = await indexFiles(context), index = await tree(commit.parent[1]);
            for (const path of saved.keys()) if (!index.has(path)) await git.remove({ ...context, filepath: path });
            for (const [path, file] of index) await git.updateIndex({ ...context, filepath: path, oid: await git.writeBlob({ ...context, blob: file.data }), mode: parseInt(file.mode, 8), add: true });
          }
          if (head !== commit.parent[0]) {
            const indexed = await indexFiles(context), original = await tree(head);
            for (const path of indexed.keys()) if (!original.has(path)) await git.remove({ ...context, filepath: path });
            for (const [path, file] of original) await git.updateIndex({ ...context, filepath: path, oid: await git.writeBlob({ ...context, blob: file.data }), mode: parseInt(file.mode, 8), add: true });
          }
          if (request.kind === "stash-pop") await dropStash(stash.oid); operation = undefined;
        }
        break;
      }
      case "stash-drop": if (!request.force) throw new Error("Confirm dropping this stash."); else await dropStash((await target())); break;
      case "reset": case "recover": {
        const oid = await target();
        if (request.kind === "recover") await clean();
        if ((request.mode === "hard" || request.kind === "recover") && !request.force) throw new Error("Confirm replacing tracked working changes.");
        await checkpoint();
        if (request.mode === "hard" || request.kind === "recover") {
          const current = await readWorking(), oldTree = await tree(head), nextTree = await tree(oid);
          for (const [path] of current) if (!oldTree.has(path) && nextTree.has(path)) throw new Error(`Untracked file ${path} would be overwritten.`);
          await git.checkout({ ...context, ref: oid, noUpdateHead: true, force: true });
        } else if (request.mode !== "soft") {
          const next = await tree(oid);
          for (const path of await git.listFiles(context)) if (!next.has(path)) await git.remove({ ...context, filepath: path });
          for (const [path, file] of next) await git.updateIndex({ ...context, filepath: path, oid: await git.writeBlob({ ...context, blob: file.data }), mode: parseInt(file.mode, 8), add: true });
        }
        await setHead(oid); break;
      }
      case "tag": {
        if (!request.name?.trim()) throw new Error("Enter a tag name.");
        if (request.message?.trim()) await git.annotatedTag({ ...context, ref: request.name.trim(), object: await target(), message: request.message.trim(), tagger: identity(request.author) });
        else await git.tag({ ...context, ref: request.name.trim(), object: await target() }); break;
      }
      case "delete-tag": {
        if (!request.force) throw new Error("Confirm deleting this tag.");
        const oid = await ref(context, `refs/tags/${request.name}`); if (oid) await checkpoint(oid);
        await git.deleteTag({ ...context, ref: request.name! }); break;
      }
      case "delete-branch": {
        if (!request.name) throw new Error("Choose a branch.");
        if (await git.currentBranch(context) === request.name) throw new Error("Switch to another branch before deleting this one.");
        const oid = await ref(context, `refs/heads/${request.name}`);
        if (!oid || !head) throw new Error("Choose an existing branch.");
        if (!request.force && !await git.isDescendent({ ...context, oid: head, ancestor: oid })) throw new Error("This branch has unmerged commits. Confirm deletion to proceed.");
        await checkpoint(oid); await git.deleteBranch({ ...context, ref: request.name }); break;
      }
      case "rename-branch": {
        if (!request.target || !request.name) throw new Error("Choose a branch and enter its new name.");
        const old = request.target.replace(/^refs\/heads\//, ""), next = request.name.replace(/^refs\/heads\//, "");
        const oid = await ref(context, `refs/heads/${old}`);
        if (!oid) throw new Error("Choose an existing branch.");
        if (old === next) break;
        const selected = await git.currentBranch(context) === old;
        const configBefore = await read(host.fs, `${gitdir}/config`);
        const names = await git.listBranches(context);
        if (names.includes(next)) throw new Error("A branch with that name already exists.");
        await git.deleteBranch({ ...context, ref: old });
        let parent = `${gitdir}/refs/heads/${old}`;
        parent = parent.slice(0, parent.lastIndexOf("/"));
        while (parent.startsWith(`${gitdir}/refs/heads/`)) {
          try { if ((await host.fs.promises.readdir(parent)).length) break; await host.fs.promises.rmdir(parent); }
          catch (error) { if (!absent(error)) throw error; }
          parent = parent.slice(0, parent.lastIndexOf("/"));
        }
        await git.branch({ ...context, ref: next, object: oid, checkout: selected });
        if (configBefore) {
          const escaped = next.replace(/[\\"]/g, value => "\\" + value);
          let config = new TextDecoder().decode(configBefore);
          config = config.replace(/^(\s*\[\s*branch\s+)"((?:\\.|[^"\\])*)"(\s*\].*)$/gm,
            (line, prefix: string, value: string, suffix: string) => value.replace(/\\([\\"])/g, "$1") === old ? `${prefix}"${escaped}"${suffix}` : line);
          config = config.replace(/^(\s*\[\s*branch\.)([^\]]+)(\s*\].*)$/gm,
            (line, _prefix: string, value: string, suffix: string) => value === old ? `[branch "${escaped}"${suffix}` : line);
          await put(host.fs, `${gitdir}/config`, encodeText(config));
        }
        break;
      }
    }
    if (operation) {
      if (operation.kind === "merge" && operation.parents.length > 1) await put(host.fs, `${gitdir}/MERGE_HEAD`, encodeText(operation.parents[1]! + "\n"));
      if (operation.original && ["rebase", "cherry-pick", "revert"].includes(operation.kind)) {
        const marker = operation.kind === "rebase" ? "REBASE_HEAD" : operation.kind === "revert" ? "REVERT_HEAD" : "CHERRY_PICK_HEAD";
        await put(host.fs, `${gitdir}/${marker}`, encodeText(operation.original + "\n"));
      }
      if (operation.kind === "rebase") await put(host.fs, `${gitdir}/rebase-merge/git-rebase-todo`, encodeText((operation.remaining ?? []).map(oid => `pick ${oid}`).join("\n") + "\n"));
    }
    files = await readWorking();
    return { files, head: await ref(context), controls: controlPatch(before, await gitControls(context)), ...(operation ? { operation } : {}), label };
  } finally { await removeTree(host.fs, scratch); }
}

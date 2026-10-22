// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import * as git from "isomorphic-git";
import {activityDomains,activityScopeKey,restoreScopedState} from "./activity-scope.ts";
import { normalizeSettings } from "../editor/settings.ts";
import { emptyRepositoryWorkspace, normalizeWorkspace, reconcileRepositoryWorkspace } from "../editor/workspace.ts";
import type { EngineOptions, RepositoryPosition } from "./core.ts";
import type { ActivityCommand, ActivityRequest, ActivityResult, ActivitySnapshot, ActivityState, EditGroup, LegacyActivity, RepositoryClient, RepositoryOperations, RepositorySnapshot } from "./types.ts";
import { reportProgress, trackProgress } from "./progress.ts";

type Transition = { id: string; before: string; after: string };
export type Entry = { label: string; before: ActivityState; after: ActivityState; repository?: Transition;
  editGroup?: EditGroup & { repositoryGroup: string } };
export type ActivityRecord = {
  revision: string; current: string | null; undo: string[]; redo: string[]; futures: string[]; state: ActivityState | null;
  legacyRedoAllowed: boolean;
  scopedLegacyRedoAllowed?:boolean;
  scoped?:Record<string,{undo:string[];redo:string[];legacyRedoAllowed:boolean}>;
  lastAction?: { base: string; key: string };
};
type RepositoryNavigation = { direction: "undo" | "redo"; id: string; revision: string; from: string; to?: string };
export type ActivityPending = {
  base: string; key: string; revision: string; timestamp: number;
  record: ActivityRecord; entry?: Entry; command?: ActivityCommand;
  repositoryBefore?: Pick<RepositorySnapshot, "id" | "revision" | "historyHead">;
  editGroup?: EditGroup & { repositoryGroup: string;
    previous?: { oid: string; parent: string | null; before: ActivityState; repositoryBase: string } };
  replaces?: { oid: string; parent: string | null };
  navigation?: RepositoryNavigation; legacy?: "undo" | "redo"; retained?: string; ready?: boolean;
};
export type ActivityCheckpoint = "activity-prepared" | "activity-repository" | "activity-objects" | "activity-refs" | "activity-finalized";
export interface ActivityMetadata {
  get(): Promise<ActivityRecord | undefined>;
  pending(): Promise<ActivityPending | undefined>;
  prepare(pending: ActivityPending): Promise<void>;
  initialize(record: ActivityRecord): Promise<void>;
  finish(record: ActivityRecord): Promise<void>;
  discard(): Promise<void>;
}
export type ActivityOptions = Pick<EngineOptions, "fs" | "flush" | "lock" | "root" | "onProgress"> & {
  repository: RepositoryOperations & { position(id: string): Promise<RepositoryPosition> }; metadata: ActivityMetadata;
  checkpoint?: (stage: ActivityCheckpoint) => void | Promise<void>;
};
const currentRef = "refs/heads/current";
const redoRef = "refs/editor/redo";
const author = { name: "Local code editor", email: "editor@localhost", timezoneOffset: 0 };
const missing = (error: unknown) => error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
const normalizeState = (value: ActivityState): ActivityState => ({ workspace: normalizeWorkspace(value.workspace), settings: normalizeSettings(value.settings) });
const sameState = (before: ActivityState, after: ActivityState): boolean => JSON.stringify(before) === JSON.stringify(after);
function rejected(message: string, cause?: Error): Error {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = "ActivityRejectedError";
  return error;
}

/** A single private Git timeline orders UI actions and repository revisions. */
export function createApplicationHistory(options: ActivityOptions): Pick<RepositoryClient, "loadActivity" | "recordActivity" | "undoActivity" | "redoActivity"> {
  const { fs, metadata, repository } = options;
  const context = { fs, gitdir: `${options.root ?? ""}/history/application.git` };
  const entries = new Map<string, Promise<Entry>>();
  async function mkdir(path: string): Promise<void> {
    try { await fs.promises.lstat(path); return; } catch (error) { if (!missing(error)) throw error; }
    const parent = path.slice(0, path.lastIndexOf("/"));
    if (parent) await mkdir(parent);
    await fs.promises.mkdir(path);
  }
  async function ref(name: string): Promise<string | null> {
    try { return await git.resolveRef({ ...context, ref: name }); }
    catch (error) { if (error instanceof git.Errors.NotFoundError) return null; throw error; }
  }
  async function readEntry(oid: string): Promise<Entry> {
    let entry = entries.get(oid);
    if (!entry) {
      entry = git.readBlob({ ...context, oid, filepath: "activity.json" }).then(({ blob }) =>
        JSON.parse(new TextDecoder().decode(blob)) as Entry).catch(error => { entries.delete(oid); throw error; });
      entries.set(oid, entry);
      if (entries.size > 128) entries.delete(entries.keys().next().value!);
    }
    return structuredClone(await entry);
  }
  async function ensureScoped(record:ActivityRecord){
    record.scopedLegacyRedoAllowed??=record.legacyRedoAllowed;
    if(record.scoped)return record.scoped;
    const scoped:NonNullable<ActivityRecord['scoped']>={};
    for(const direction of ['undo','redo'] as const)for(const oid of record[direction]){
      for(const key of activityDomains(await readEntry(oid))){
        const history=scoped[key]??={undo:[],redo:[],legacyRedoAllowed:record.legacyRedoAllowed};
        history[direction].push(oid);
      }
    }
    record.scoped=scoped;return scoped;
  }
  async function initialize(): Promise<ActivityRecord> {
    const present = await metadata.get();
    if (present) return present;
    await mkdir(context.gitdir);
    await git.init({ ...context, bare: true, defaultBranch: "current" });
    await options.flush();
    const initial: ActivityRecord = { revision: crypto.randomUUID(), current: null, undo: [], redo: [], futures: [], state: null, legacyRedoAllowed: true };
    await metadata.initialize(initial);
    return initial;
  }
  async function snapshot(record: ActivityRecord): Promise<ActivitySnapshot> {
    return trackProgress(options.onProgress, "history.actions", async () => {
      const undo = record.current ? await readEntry(record.current) : undefined;
      const redo = record.redo.length ? await readEntry(record.redo.at(-1)!) : undefined;
      const scoped=await ensureScoped(record);
      const histories=Object.fromEntries(Object.entries(scoped).map(([key,history])=>[key,
        {canUndo:history.undo.length>0,canRedo:history.redo.length>0,legacyRedoAllowed:history.legacyRedoAllowed}]));
      return { histories,scopedLegacyRedoAllowed:record.scopedLegacyRedoAllowed??record.legacyRedoAllowed,revision: record.revision, canUndo: !!undo, canRedo: !!redo, legacyRedoAllowed: record.legacyRedoAllowed === true,
        state: record.state ? normalizeState(record.state) : null,
        ...(undo ? { undoLabel: undo.label } : {}), ...(redo ? { redoLabel: redo.label } : {}) };
    });
  }
  async function execute(command: ActivityCommand): Promise<RepositorySnapshot> {
    // Keeping the discriminant here retains each method's checked argument tuple.
    switch (command.method) {
      case "gitAction": return repository.gitAction(...command.args);
      case "write": return repository.write(...command.args);
      case "createFile": return repository.createFile(...command.args);
      case "addFiles": return repository.addFiles(...command.args);
      case "rename": return repository.rename(...command.args);
      case "remove": return repository.remove(...command.args);
      case "switchBranch": return repository.switchBranch(...command.args);
      case "selectHistory": return repository.selectHistory(...command.args);
      case "checkoutCommit": return repository.checkoutCommit(...command.args);
    }
  }
  async function writeEntry(pending: ActivityPending): Promise<string> {
    const blob = await git.writeBlob({ ...context, blob: new TextEncoder().encode(JSON.stringify(pending.entry)) });
    const tree = await git.writeTree({ ...context, tree: [{ path: "activity.json", type: "blob", mode: "100644", oid: blob }] });
    const identity = { ...author, timestamp: pending.timestamp };
    const parent = pending.replaces ? pending.replaces.parent : pending.record.current;
    return git.writeCommit({ ...context, commit: { tree, parent: parent ? [parent] : [],
      message: `${pending.entry!.label}\n\nEditor-Activity: ${pending.revision}`, author: identity, committer: identity } });
  }
  async function updateRef(name: string, oid: string | null): Promise<void> {
    if (oid) await git.writeRef({ ...context, ref: name, value: oid, force: true });
    else if (await ref(name)) await git.deleteRef({ ...context, ref: name });
  }
  async function apply(pending: ActivityPending, recovering = false): Promise<ActivityResult> {
    const present = await metadata.get();
    if (present?.revision !== pending.base && present?.revision !== pending.revision)
      throw new Error("Application history recovery conflicts with a newer workspace revision.");
    let changed: RepositorySnapshot | undefined;
    if (!pending.ready) {
      if (pending.command) {
        try { changed = await execute(pending.command); }
        catch (error) {
          // Validation failures leave no operation to recover. A durable repository
          // change (including one recovered by open) keeps the global journal.
          const current = await repository.open(pending.command.args[0]).catch(() => null);
          if (current?.revision === pending.repositoryBefore?.revision) {
            await metadata.discard();
            if (error instanceof Error && error.name === "RepositoryValidationError") throw rejected(error.message, error);
          }
          throw error;
        }
        const before = pending.repositoryBefore!;
        if (changed.historyHead === before.historyHead && sameState(pending.entry!.before, pending.entry!.after)) {
          await metadata.discard();
          return { activity: await snapshot(present!), repository: changed };
        }
        if (changed.historyHead !== before.historyHead) {
          if (pending.command.method === "write")
            pending.entry!.label = changed.history.find(entry => entry.oid === changed!.historyHead)!.message;
          const group = pending.editGroup, previous = group?.previous;
          // The repository validates the actual changed row. Only replace the
          // application entry after its durable result confirms the same group.
          const grouped = group && changed.editGroup?.id === group.repositoryGroup;
          if (grouped) pending.entry!.editGroup = { id: group.id, line: group.line, repositoryGroup: group.repositoryGroup };
          if (grouped && previous && changed.editGroup!.before === previous.repositoryBase) {
            pending.replaces = { oid: previous.oid, parent: previous.parent };
            pending.entry!.before = previous.before;
          }
          pending.entry!.repository = { id: changed.id,
            before: pending.replaces ? previous!.repositoryBase : before.historyHead, after: changed.historyHead };
        }
        const workspace = pending.entry!.after.workspace;
        workspace.repositories[changed.id] = reconcileRepositoryWorkspace(workspace.repositories[changed.id] ?? emptyRepositoryWorkspace(), changed.files);
      } else if (pending.navigation) {
        const command = pending.navigation;
        changed = await repository[command.direction](command.id, command.revision);
        if (command.to && changed.historyHead !== command.to) throw new Error("Repository history no longer matches this workspace action. Reload before continuing.");
        if (pending.legacy) {
          pending.entry!.repository = pending.legacy === "undo"
            ? { id: changed.id, before: changed.historyHead, after: command.from }
            : { id: changed.id, before: command.from, after: changed.historyHead };
          if (pending.legacy === "redo") {
            const head = changed.historyHead;
            pending.entry!.label = changed.history.find(item => item.oid === head)?.message ?? "Earlier edit";
          }
          const workspace = (pending.legacy === "undo" ? pending.entry!.before : pending.entry!.after).workspace;
          workspace.repositories[changed.id] = reconcileRepositoryWorkspace(workspace.repositories[changed.id] ?? emptyRepositoryWorkspace(), changed.files);
        }
      }
      if (!recovering) await options.checkpoint?.("activity-repository");
      if (pending.entry) {
        const oid = await writeEntry(pending);
        pending.retained = oid;
        const scoped=pending.record.scoped??={};
        for(const key of activityDomains(pending.entry!)){
          const history=scoped[key]??={undo:[],redo:[],legacyRedoAllowed:pending.record.legacyRedoAllowed};
          if(pending.legacy==='undo')history.redo.push(oid);
          else{
            pending.record.futures=[...new Set([...pending.record.futures,...history.redo])];
            if (pending.replaces && history.undo.at(-1) === pending.replaces.oid) history.undo.pop();
            history.undo.push(oid);history.redo=[];
            if(pending.entry!.repository&&!pending.legacy)history.legacyRedoAllowed=false;
          }
        }
        if (pending.legacy === "undo") {
          pending.record.redo.push(oid);
          pending.record.state = pending.entry.before;
        } else {
          pending.record.current = oid;
          if (pending.replaces && pending.record.undo.at(-1) === pending.replaces.oid) pending.record.undo.pop();
          pending.record.undo.push(oid);
          pending.record.state = pending.entry.after;
        }
      }
      await options.flush();
      pending.ready = true;
      await metadata.prepare(pending);
      if (!recovering) await options.checkpoint?.("activity-objects");
    } else if (pending.repositoryBefore || pending.navigation) {
      changed = await repository.open(pending.repositoryBefore?.id ?? pending.navigation!.id);
      const expected = pending.navigation?.to ?? (pending.legacy === "undo" ? pending.entry?.repository?.before : pending.entry?.repository?.after)
        ?? pending.repositoryBefore?.historyHead;
      if (expected && changed.historyHead !== expected)
        throw new Error("Repository history changed while its application action was pending. Reload before continuing.");
    }
    for (const oid of pending.record.futures)
      await git.writeRef({ ...context, ref: `refs/editor/futures/${oid}`, value: oid, force: true });
    // Backfilled legacy entries are immutable roots, so every stack entry keeps
    // an explicit ref as well as the ordinary parent graph.
    if (pending.retained)
      await git.writeRef({ ...context, ref: `refs/editor/activities/${pending.retained}`, value: pending.retained, force: true });
    if (pending.replaces) await updateRef(`refs/editor/activities/${pending.replaces.oid}`, null);
    await updateRef(currentRef, pending.record.current);
    await updateRef(redoRef, pending.record.redo[0] ?? null);
    await options.flush();
    if (!recovering) await options.checkpoint?.("activity-refs");
    await metadata.finish(pending.record);
    if (!recovering) await options.checkpoint?.("activity-finalized");
    return { activity: await snapshot(pending.record), ...(changed ? { repository: changed } : {}) };
  }
  async function recover(): Promise<ActivityRecord> {
    reportProgress(options.onProgress, "recovery.workspace", "running");
    try {
      let record = await initialize();
      const pending = await metadata.pending();
      if (pending) {
        try { await apply(pending, true); }
        catch (error) { if (!(error instanceof Error) || error.name !== "ActivityRejectedError") throw error; }
        record = (await metadata.get())!;
      }
      reportProgress(options.onProgress, "recovery.workspace", "complete");
      return record;
    } catch (error) {
      reportProgress(options.onProgress, "recovery.workspace", "error");
      throw error;
    }
  }
  async function key(details: unknown): Promise<string> { return (await git.hashBlob({ object: JSON.stringify(details) })).oid; }
  function check(record: ActivityRecord, expected: string, actionKey?: string): boolean {
    if (record.revision === expected) return true;
    if (actionKey && record.lastAction?.base === expected && record.lastAction.key === actionKey) return false;
    throw new Error("The application changed in another tab. Reload before continuing; your current editor text has been kept.");
  }
  async function persist(pending: ActivityPending): Promise<ActivityResult> {
    await metadata.prepare(pending);
    await options.checkpoint?.("activity-prepared");
    return apply(pending);
  }
  async function navigate(expected: string, direction: "undo" | "redo", legacy?: LegacyActivity): Promise<ActivityResult> {
    return options.lock("application", async () => {
      const record = await recover();
      const actionKey = await key([direction,legacy?.scope??null]);
      if (!check(record, expected, actionKey)) return { activity: await snapshot(record) };
      const scope=legacy?.scope;
      const scoped=await ensureScoped(record),scopeKey=scope?activityScopeKey(scope):undefined;
      const selected=scopeKey?(scoped[scopeKey]??={undo:[],redo:[],legacyRedoAllowed:record.scopedLegacyRedoAllowed??record.legacyRedoAllowed}):undefined;
      const oid = selected?selected[direction].at(-1):direction === "undo" ? record.undo.at(-1) : record.redo.at(-1);
      if (!oid) {
        if (!legacy || scope?.kind==='settings' || (direction === "redo" && !(selected?.legacyRedoAllowed??record.legacyRedoAllowed))) return { activity: await snapshot(record) };
        const current = await repository.open(scope?.kind==='repository'?scope.repositoryId:legacy.repositoryId);
        if (!(direction === "undo" ? current.canUndo : current.canRedo)) return { activity: await snapshot(record), repository: current };
        const revision = crypto.randomUUID();
        const state = normalizeState(legacy.state);
        const pending: ActivityPending = { base: expected, key: actionKey, revision, timestamp: Math.floor(Date.now() / 1000), legacy: direction,
          entry: { label: direction === "undo" ? current.history.find(item => item.oid === current.historyHead)?.message ?? "Earlier edit" : "Earlier edit", before: structuredClone(state), after: state },
          navigation: { direction, id: current.id, revision: current.revision, from: current.historyHead },
          record: { ...record, revision, lastAction: { base: expected, key: actionKey } } };
        return persist(pending);
      }
      const entry = await readEntry(oid);
      const undo=selected?record.undo:direction==='undo'?record.undo.slice(0,-1):[...record.undo,oid];
      const revision=crypto.randomUUID();
      const target=normalizeState(direction==='undo'?entry.before:entry.after);
      if(selected){
        selected[direction].pop();selected[direction==='undo'?'redo':'undo'].push(oid);
      }
      const pending:ActivityPending={base:expected,key:actionKey,revision,timestamp:Math.floor(Date.now()/1000),
        record:{...record,revision,current:selected?record.current:undo.at(-1)??null,undo,
          redo:selected?record.redo:direction==='undo'?[...record.redo,oid]:record.redo.slice(0,-1),
          state:scope&&legacy?restoreScopedState(normalizeState(legacy.state),target,scope):target,
          lastAction:{base:expected,key:actionKey}}};
      if (entry.repository && (!scope || scope.kind==='repository')) {
        const transition = entry.repository;
        const current = await repository.position(transition.id);
        const from = direction === "undo" ? transition.after : transition.before;
        if (current.historyHead !== from) throw new Error("This repository changed outside application history. Reload before continuing.");
        pending.navigation = { direction, id: current.id, revision: current.revision, from,
          to: direction === "undo" ? transition.before : transition.after };
      }
      return persist(pending);
    });
  }
  return {
    loadActivity: () => options.lock("application", async () => snapshot(await trackProgress(options.onProgress, "history.position", recover))),
    recordActivity: request => options.lock("application", async () => {
      const record = await recover();
      await ensureScoped(record);
      const before = normalizeState(request.before), after = normalizeState(request.after);
      const normalized: ActivityRequest = { ...request, before, after };
      const actionKey = await key(normalized);
      if (!check(record, request.expected, actionKey)) return { activity: await snapshot(record),
        ...(request.command ? { repository: await repository.open(request.command.args[0]) } : {}) };
      if (!request.label.trim()) throw rejected("An application action needs a description.");
      if (request.editGroup && (request.command?.method !== "write" || typeof request.editGroup.id !== "string" ||
        !/^[\w-]{1,128}$/.test(request.editGroup.id) || !Number.isSafeInteger(request.editGroup.line) || request.editGroup.line < 1))
        throw rejected("Invalid editor history group.");
      if (!request.command && sameState(before, after)) return { activity: await snapshot(record) };
      const revision = crypto.randomUUID();
      const pending: ActivityPending = { base: record.revision, key: actionKey, revision, timestamp: Math.floor(Date.now() / 1000),
        entry: { label: request.label.trim(), before, after },
        record: { ...record, revision, legacyRedoAllowed: false, redo: [], futures: [...new Set([...record.futures, ...record.redo.slice(0, 1)])],
          lastAction: { base: record.revision, key: actionKey } } };
      if (request.command) {
        const current = request.command.method === "selectHistory" || request.command.method === "checkoutCommit"
          ? await repository.open(request.command.args[0]) : await repository.position(request.command.args[0]);
        const expected = request.command.method === "write" ? request.command.args[3] : request.command.args.at(-1);
        if (current.revision !== expected) throw new Error("This repository changed in another tab. Reopen it before saving; your current editor text has been kept.");
        if (request.command.method === "selectHistory" && !(current as RepositorySnapshot).history.some(entry => entry.oid === request.command!.args[1]))
          throw rejected("This revision is not in this repository's change history.");
        if (request.command.method === "checkoutCommit" && !(current as RepositorySnapshot).commits.some(entry => entry.oid === request.command!.args[1]))
          throw rejected("This commit is not in this repository's version history.");
        pending.command = structuredClone(request.command);
        pending.repositoryBefore = { id: current.id, revision: current.revision, historyHead: current.historyHead };
        if (pending.command.method === "write") {
          // Application ordering owns group boundaries. Never let a reused UI
          // token amend across navigation, a different action, or scoped Undo.
          const intent = pending.command.args[5];
          pending.command.args.length = 4;
          if (intent !== undefined) pending.command.args[5] = intent;
          if (request.editGroup && intent !== "format") {
            const group: NonNullable<ActivityPending["editGroup"]> = { ...request.editGroup, repositoryGroup: crypto.randomUUID() };
            const oid = record.current;
            const scope = record.scoped![activityScopeKey({ kind: "repository", repositoryId: current.id })];
            if (oid && oid === record.undo.at(-1) && scope?.undo.at(-1) === oid && !scope.redo.length) {
              const previous = await readEntry(oid);
              if (previous.editGroup?.id === group.id && previous.editGroup.line === group.line &&
                previous.repository?.id === current.id && previous.repository.after === current.historyHead &&
                current.editGroup?.id === previous.editGroup.repositoryGroup && current.editGroup.line === group.line &&
                current.editGroup.path === pending.command.args[1] && current.editGroup.before === previous.repository.before) {
                const { commit } = await git.readCommit({ ...context, oid });
                if (commit.message.trimEnd().endsWith(`Editor-Activity: ${record.revision}`)) {
                  group.repositoryGroup = previous.editGroup.repositoryGroup;
                  group.previous = { oid, parent: commit.parent[0] ?? null, before: previous.before, repositoryBase: previous.repository.before };
                }
              }
            }
            pending.editGroup = group;
            pending.command.args[4] = { id: group.repositoryGroup, line: group.line };
          }
        }
      }
      return persist(pending);
    }),
    undoActivity: (expected, legacy) => navigate(expected, "undo", legacy),
    redoActivity: (expected, legacy) => navigate(expected, "redo", legacy),
  };
}

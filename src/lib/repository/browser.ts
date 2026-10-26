// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import LightningFS from "@isomorphic-git/lightning-fs";
import { Buffer } from "buffer";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { createRepositoryEngine, type Checkpoint, type Metadata, type Pending, type RepositoryRecord } from "./core.ts";
import { createApplicationHistory, type ActivityCheckpoint, type ActivityMetadata, type ActivityPending, type ActivityRecord } from "./application-history.ts";
import { planHistoryRetention, finishHistoryRetention, planRepositoryDeletion } from "./history-retention.ts";
import { repositoryPaths } from "./paths.ts";
import { removeRemoteTree } from "./remote-git.ts";
import type { ActivityState } from "./types.ts";
import { trackProgress, type RepositoryProgress } from "./progress.ts";
import type { RemoteProgress } from "../remotes/types.ts";
export { repositoryPaths } from "./paths.ts";

if (!("Buffer" in globalThis)) Object.defineProperty(globalThis, "Buffer", { value: Buffer, configurable: true, writable: true });
export const filesystemName = "v1/repositories";
export const databaseName = "v1/repositories/index";
interface RepositoryDatabase extends DBSchema {
  repositories: { key: string; value: RepositoryRecord };
  pending: { key: string; value: Pending };
  preferences: { key: string; value: unknown };
  application: { key: string; value: ActivityRecord | ActivityPending };
  deletions: { key: string; value: { id: string } };
}
export type BrowserRepositoryOptions = {
  filesystemName?: string;
  databaseName?: string;
  filesystem?: LightningFS;
  checkpoint?: (stage: Checkpoint) => void | Promise<void>;
  activityCheckpoint?: (stage: ActivityCheckpoint) => void | Promise<void>;
  onProgress?: RepositoryProgress;
  onRemoteProgress?: (value: RemoteProgress) => void;
};
const filesystems = new Map<string, LightningFS>();
const queues = new Map<string, Promise<unknown>>();

/** One filesystem instance per worker/namespace; LightningFS owns cache refresh and its database mutex. */
export function createRepositoryService(options: BrowserRepositoryOptions = {}) {
  const filesystemKey = options.filesystemName ?? filesystemName;
  const databaseKey = options.databaseName ?? databaseName;
  let fs = options.filesystem ?? filesystems.get(filesystemKey);
  if (!fs) { fs = new LightningFS(filesystemKey, { defer: true }); filesystems.set(filesystemKey, fs); }
  const filesystem = fs;
  let filesystemReady: Promise<unknown> | undefined;
  let connection: Promise<IDBPDatabase<RepositoryDatabase>> | undefined;
  function database(): Promise<IDBPDatabase<RepositoryDatabase>> {
    connection ??= trackProgress(options.onProgress, "storage.metadata", () => openDB<RepositoryDatabase>(databaseKey, 3, {
      upgrade(database) { for (const name of ["repositories", "pending", "preferences", "application", "deletions"] as const)
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name); },
      blocking() { void connection?.then(database => database.close()); connection = undefined; },
    })).catch(error => { connection = undefined; throw error; });
    return connection;
  }
  const metadata: Metadata = {
    async list() {
      const db = await database();
      const repositories = new Map((await db.getAll("repositories")).map(repository => [repository.id, repository]));
      for (const pending of await db.getAll("pending")) if (!repositories.has(pending.after.id)) repositories.set(pending.after.id, pending.after);
      return [...repositories.values()];
    },
    async get(id) { return (await database()).get("repositories", id); },
    async pending(id) { return (await database()).get("pending", id); },
    async prepare(id, pending) { await (await database()).put("pending", pending, id); },
    async finish(repository) {
      const transaction = (await database()).transaction(["repositories", "pending"], "readwrite");
      void transaction.done.catch(() => {});
      await transaction.objectStore("repositories").put(repository, repository.id);
      await transaction.objectStore("pending").delete(repository.id);
      await transaction.done;
    },
    async loadPreferences() { return (await database()).get("preferences", "editor"); },
    async savePreferences(value) { await (await database()).put("preferences", value, "editor"); },
  };
  async function lock<T>(key: string, task: () => Promise<T>): Promise<T> {
      if (!globalThis.navigator?.locks) throw new Error("This browser does not support Web Locks, which are required to save repositories safely.");
      const name = `code-repository:${filesystemKey}:${key}`;
      const previous = queues.get(name) ?? Promise.resolve();
      const pending = previous.catch(() => {}).then(() => navigator.locks.request(name, async () => {
        // LightningFS defers opening IndexedDB until its first filesystem call.
        filesystemReady ??= trackProgress(options.onProgress, "storage.filesystem", () => filesystem.promises.stat("/"))
          .catch(error => { filesystemReady = undefined; throw error; });
        await filesystemReady;
        return task();
      }));
      queues.set(name, pending);
      try { return await pending; } finally { if (queues.get(name) === pending) queues.delete(name); }
  }
  const activityMetadata: ActivityMetadata = {
    async get() { return (await (await database()).get("application", "current")) as ActivityRecord | undefined; },
    async pending() { return (await (await database()).get("application", "pending")) as ActivityPending | undefined; },
    async prepare(pending) { await (await database()).put("application", pending, "pending"); },
    async initialize(record) { await (await database()).put("application", record, "current"); },
    async finish(record) {
      const transaction = (await database()).transaction(["application", "preferences"], "readwrite");
      void transaction.done.catch(() => {});
      await transaction.objectStore("application").put(record, "current");
      if (record.state) await transaction.objectStore("preferences").put(record.state.settings, "editor");
      await transaction.objectStore("application").delete("pending");
      await transaction.done;
    },
    async discard() { await (await database()).delete("application", "pending"); },
  };
  const shared = { fs: filesystem, flush: () => filesystem.promises.flush(), lock,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}) };
  const repository = createRepositoryEngine({ ...shared, metadata,
    ...(options.onRemoteProgress ? { onRemoteProgress: options.onRemoteProgress } : {}),
    ...(options.checkpoint ? { checkpoint: options.checkpoint } : {}) });
  const application = createApplicationHistory({ ...shared, repository, metadata: activityMetadata,
    ...(options.activityCheckpoint ? { checkpoint: options.activityCheckpoint } : {}) });
  // Called under the application lock. Publication survives interruption; cleanup is idempotent.
  async function finishDeletions(): Promise<void> {
    const db = await database(), ids = await db.getAllKeys("deletions");
    if (!ids.length) return;
    const activity = (await activityMetadata.get())!;
    await finishHistoryRetention(shared, { repositories: [], activity, changed: true });
    for (const id of ids) await lock(id, async () => {
      const paths = repositoryPaths(id);
      await removeRemoteTree({ fs: filesystem }, paths.dir);
      await removeRemoteTree({ fs: filesystem }, paths.historyGitdir);
      await shared.flush();
      await db.delete("deletions", id);
    });
  }
  const recoverDeletions = () => lock("application", finishDeletions);
  async function renameRepository(id: string, name: string, expectedRevision: string) {
    await application.loadActivity();
    return lock("application", async () => {
      if (await activityMetadata.pending()) throw new Error("Recover the pending repository action before renaming it.");
      return repository.renameRepository(id, name, expectedRevision);
    });
  }
  async function deleteRepository(id: string, expectedRevision: string, expectedActivity: string, state: ActivityState) {
    repositoryPaths(id);
    await application.loadActivity();
    await lock("application", async () => {
      await finishDeletions();
      await repository.prepareRetention(id);
      await lock(id, async () => {
        const db = await database(), record = await metadata.get(id), activity = (await activityMetadata.get())!;
        if (record?.revision !== expectedRevision || activity.revision !== expectedActivity || await metadata.pending(id) || await activityMetadata.pending())
          throw new Error("This repository changed in another tab. Reload before deleting it.");
        const remaining = (await metadata.list()).filter(record => record.id !== id).map(record => record.id);
        const next = await planRepositoryDeletion(shared, activity, id, state, remaining);
        await shared.flush();
        const tx = db.transaction(["repositories", "pending", "application", "preferences", "deletions"], "readwrite");
        void tx.done.catch(() => {});
        if ((await tx.objectStore("repositories").get(id))?.revision !== expectedRevision ||
          (await tx.objectStore("application").get("current") as ActivityRecord).revision !== expectedActivity ||
          await tx.objectStore("pending").get(id) || await tx.objectStore("application").get("pending")) {
          tx.abort(); throw new Error("This repository changed before it could be deleted. Reload and try again.");
        }
        await tx.objectStore("application").put(next, "current");
        await tx.objectStore("preferences").put(next.state!.settings, "editor");
        await tx.objectStore("repositories").delete(id);
        await tx.objectStore("pending").delete(id);
        await tx.objectStore("deletions").put({ id }, id);
        await tx.done;
      });
      await finishDeletions();
    });
    return application.loadActivity();
  }
  let maintenance: Promise<void> | undefined;
  async function maintain(): Promise<void> {
    // Finish both existing journals before reading their immutable revision endpoints.
    await application.loadActivity();
    await lock("application", async () => {
      const db = await database();
      const ids = (await metadata.list()).map(record => record.id).sort();
      for (const id of ids) await repository.prepareRetention(id);
      const locked = async (index: number): Promise<void> => {
        if (index < ids.length) return lock(ids[index]!, () => locked(index + 1));
        const before = (await activityMetadata.get())!;
        if (await activityMetadata.pending()) throw new Error("Recover application history before retaining changes.");
        const records: RepositoryRecord[] = [];
        for (const id of ids) {
          if (await metadata.pending(id)) throw new Error("Recover repository history before retaining changes.");
          records.push((await metadata.get(id))!);
        }
        const plan = await planHistoryRetention(shared, records, before, await metadata.loadPreferences());
        await shared.flush();
        if (plan.changed) {
          // The single IndexedDB transaction is the publication point. No source files,
          // indexes or source refs are changed, and old objects still exist until afterward.
          const tx = db.transaction(["repositories", "application", "pending"], "readwrite");
          void tx.done.catch(() => {});
          const app = await tx.objectStore("application").get("current") as ActivityRecord;
          if (app.revision !== before.revision || await tx.objectStore("application").get("pending")) {
            tx.abort(); throw new Error("Application history changed during startup cleanup.");
          }
          for (let index = 0; index < records.length; index++) {
            const original = records[index]!;
            const present = await tx.objectStore("repositories").get(original.id);
            if (present?.revision !== original.revision || await tx.objectStore("pending").get(original.id)) {
              tx.abort(); throw new Error("Repository history changed during startup cleanup.");
            }
            await tx.objectStore("repositories").put(plan.repositories[index]!, original.id);
          }
          await tx.objectStore("application").put(plan.activity, "current");
          await tx.done;
        }
        // Also repairs refs/finishes collection if a previous startup stopped after publication.
        await finishHistoryRetention(shared, plan);
      };
      await locked(0);
    });
  }
  return { ...repository, ...application, renameRepository, deleteRepository,
    async list() { await recoverDeletions(); return repository.list(); },
    async loadActivity() {
    await recoverDeletions();
    maintenance ??= trackProgress(options.onProgress, "history.actions", maintain).catch(error => { maintenance = undefined; throw error; });
    await maintenance;
    return application.loadActivity();
  } };
}

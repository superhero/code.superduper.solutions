// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Read-only schema/count inspection adapted from Operations' storage-metrics.ts.
import { openDB, type IDBPDatabase } from "idb";
import { bounded, message } from "./browser.ts";

export type DatabaseMetrics = { name: string; version: number | null;
  stores: { name: string; records: number }[]; error: string | null };
export type DatabaseReport = { at: number; databases: DatabaseMetrics[]; error: string | null };
const DATABASE_LIMIT = 32, STORE_LIMIT = 64;

/** An absent/deleted database must never be created by a diagnostic open. */
async function inspectDatabase(name: string, version: number | null, signal: AbortSignal): Promise<DatabaseMetrics | null> {
  let database: IDBPDatabase | undefined, finished = false, absent = false;
  const result: DatabaseMetrics = { name, version, stores: [], error: null };
  try {
    signal.throwIfAborted();
    const opening = openDB(name, undefined, {
      upgrade(_database, oldVersion, _newVersion, transaction) {
        absent = oldVersion === 0;
        void transaction.done.catch(() => {});
        transaction.abort();
      },
      blocking() { database?.close(); },
    });
    // IDB open cannot be cancelled: release a connection that arrives after leaving or timeout.
    void opening.then(value => { if (finished) value.close(); }, () => {});
    database = await bounded(opening, signal, `Database ${name}`, 1500);
    result.version = database.version;
    const names = Array.from(database.objectStoreNames).sort();
    if (names.length > STORE_LIMIT) result.error = `Showing the first ${STORE_LIMIT} object stores.`;
    const selected = names.slice(0, STORE_LIMIT);
    if (selected.length) {
      const transaction = database.transaction(selected, "readonly");
      void transaction.done.catch(() => {});
      try {
        result.stores = await bounded(Promise.all(selected.map(async name => ({ name,
          records: await transaction.objectStore(name).count() }))), signal, `Record counts for ${name}`, 1500);
        await bounded(transaction.done, signal, `Record transaction for ${name}`, 1500);
      } catch (reason) {
        try { transaction.abort(); } catch { /* Completed transactions have already released their locks. */ }
        throw reason;
      }
    }
  } catch (reason) { if (absent) return null; result.error = message(reason); }
  finally { finished = true; database?.close(); }
  return result;
}

/** Bounded manual scan of existing databases. No record values, filesystem APIs, upgrades or writes. */
export async function inspectDatabases(signal: AbortSignal): Promise<DatabaseReport> {
  const report: DatabaseReport = { at: Date.now(), databases: [], error: null };
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Database inspection reached its five-second limit. Refresh to try again.")), 5000);
  try {
    signal.throwIfAborted();
    const factory = globalThis.indexedDB;
    if (!factory?.databases) throw new Error("This browser cannot enumerate existing databases. Record counts are unavailable.");
    const databases = await bounded(factory.databases(), controller.signal, "Database enumeration");
    const entries = databases.filter((entry): entry is IDBDatabaseInfo & { name: string } => Boolean(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (entries.length > DATABASE_LIMIT) report.error = `Showing the first ${DATABASE_LIMIT} databases.`;
    for (const entry of entries.slice(0, DATABASE_LIMIT)) {
      controller.signal.throwIfAborted();
      const result = await inspectDatabase(entry.name, entry.version ?? null, controller.signal);
      if (result) report.databases.push(result);
    }
  } catch (reason) { report.error = message(reason); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  signal.throwIfAborted();
  report.at = Date.now();
  return report;
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { openDB, type DBSchema } from "idb";
import type { Connection, Provider, RemoteAccess } from "./types.ts";
import { normalizeHost, normalizeRelay } from "./policy.ts";
type Stored = Connection & { secret?: { salt: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; cipher: ArrayBuffer } };
interface ConnectionsDB extends DBSchema { connections: { key: string; value: Stored } }
const sessions = new Map<string, string>(), listeners = new Set<() => void>();
const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("code-remote-connections") : undefined;
const database = () => openDB<ConnectionsDB>("code-remote-connections", 1, { upgrade(db) { db.createObjectStore("connections", { keyPath: "id" }); }, blocking(_a, _b, event) { (event.target as IDBDatabase).close(); } });
function publish(id: string) { for (const listener of listeners) listener(); channel?.postMessage(id); }
if (channel) channel.onmessage = event => { if (typeof event.data === "string") sessions.delete(event.data); for (const listener of listeners) listener(); };
export function subscribeConnections(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function connectionUnlocked(connection: Connection): boolean { return !connection.remembered || sessions.has(connection.id); }
export function connectionAccess(connection: Connection): RemoteAccess {
  if (!connectionUnlocked(connection)) throw new Error("Unlock this connection in Settings → Remote connections.");
  return { provider: connection.provider, host: connection.host, relay: connection.relay, token: sessions.get(connection.id) ?? "" };
}
const additionalData = (record: Connection) => new TextEncoder().encode(JSON.stringify([record.id, record.provider, record.host]));
async function key(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", iterations: 310_000, salt }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function listConnections(): Promise<Connection[]> {
  const db = await database();
  try { return (await db.getAll("connections")).map(({ secret: _secret, ...record }) => record).sort((a, b) => a.label.localeCompare(b.label)); }
  finally { db.close(); }
}
export async function saveConnection(input: { id?: string; provider: Provider; label: string; host: string; relay: string; remembered: boolean }, token: string, password = ""): Promise<Connection> {
  if (!input.label.trim() || input.label.length > 100 || /[\u0000-\u001f]/.test(input.label)) throw new Error("Enter a connection name of 1–100 characters.");
  if (typeof token !== "string" || token.length > 8192 || /[\u0000-\u0020\u007f]/.test(token)) throw new Error("Enter a token without whitespace.");
  const record: Stored = { id: input.id ?? crypto.randomUUID(), provider: input.provider, label: input.label.trim(), host: normalizeHost(input.provider, input.host), relay: normalizeRelay(input.relay), remembered: input.remembered };
  if (record.remembered) {
    if (password.length < 10) throw new Error("Use at least 10 characters for the token's encryption passphrase.");
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: additionalData(record) }, await key(password, salt), new TextEncoder().encode(token));
    record.secret = { salt, iv, cipher };
  }
  const db = await database();
  try { await db.put("connections", record); } finally { db.close(); }
  sessions.set(record.id, token); publish(record.id);
  const { secret: _secret, ...connection } = record; return connection;
}
export async function unlockConnection(id: string, password: string): Promise<void> {
  const db = await database(); let record: Stored | undefined;
  try { record = await db.get("connections", id); } finally { db.close(); }
  if (!record?.secret) throw new Error("This connection has no remembered token. Enter a token again.");
  try {
    const { salt, iv, cipher } = record.secret;
    const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: additionalData(record) }, await key(password, salt), cipher);
    sessions.set(id, new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { throw new Error("The token could not be unlocked. Check the passphrase."); }
  for (const listener of listeners) listener();
}
export function lockConnection(id: string): void { sessions.delete(id); publish(id); }
export async function removeConnection(id: string): Promise<void> {
  const db = await database(); try { await db.delete("connections", id); } finally { db.close(); }
  sessions.delete(id); publish(id);
}

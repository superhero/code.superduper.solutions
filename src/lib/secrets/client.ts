// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import VaultWorker from "./vault.worker.ts?worker&inline";
import { openDB } from "idb";
import { createVaultStorage } from "./storage";
import { publicVaultKeys } from "./key-index";
import { createVaultLifecycle } from "./lifecycle";
import { defaultVaultPreferences, VaultError, type VaultPreferences, type VaultStatus } from "./types";
import type { VaultArguments, VaultMethod, VaultReply, VaultResult } from "./protocol";
import type { OpenAIRequest } from "$lib/assistant/openai";
import type { ChatResult, OllamaModel } from "$lib/assistant/ollama";
let worker: Worker | undefined, generation = 0, sequence = 0, accessActive = false;
let queue: Promise<unknown> = Promise.resolve(), ceremony: AbortController | undefined;
let preferences: VaultPreferences = { ...defaultVaultPreferences };
let reportedDeadline: number | null | undefined;
const listeners = new Set<() => void>();
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void; delta?: (text: string) => void; generation: number }>();
const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("code-secret-vault") : undefined;
const lifecycle = createVaultLifecycle({ now: () => Date.now(), onLock: () => lockVaultLocally(), onDeadline: expires => {
  if (worker && reportedDeadline !== expires) { reportedDeadline = expires; worker.postMessage({ kind: "policy", expires }); }
} });
export function subscribeVaultLock(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function lockVaultLocally(): void {
  generation++; accessActive = false; ceremony?.abort(); ceremony = undefined;
  worker?.terminate(); worker = undefined; reportedDeadline = undefined; lifecycle.deactivate();
  for (const item of pending.values()) { item.cleanup(); item.reject(new VaultError("CANCELLED")); }
  pending.clear(); for (const listener of listeners) listener();
}
export async function lockVault(): Promise<void> {
  lockVaultLocally(); await createVaultStorage().lock(); channel?.postMessage({ kind: "lock" });
}
const validPreferences = (value: VaultPreferences): VaultPreferences => {
  if (!value || typeof value.idleLockEnabled !== "boolean" || !Number.isInteger(value.idleLockMinutes) || value.idleLockMinutes < 1 || value.idleLockMinutes > 10080) throw new VaultError("INVALID");
  return { idleLockEnabled: value.idleLockEnabled, idleLockMinutes: value.idleLockMinutes };
};
async function preferenceDB() { return openDB("code-vault-preferences", 1, { upgrade(db) { db.createObjectStore("values"); } }); }
export async function loadVaultPreferences(): Promise<VaultPreferences> {
  const db = await preferenceDB(); try { return validPreferences(await db.get("values", "idle") ?? { ...defaultVaultPreferences }); } finally { db.close(); }
}
export async function saveVaultPreferences(value: VaultPreferences): Promise<void> {
  const next = validPreferences(value), db = await preferenceDB(); try { await db.put("values", next, "idle"); } finally { db.close(); }
  preferences = next; lifecycle.configure(preferences); channel?.postMessage({ kind: "preferences" });
}
function ensureWorker(): Worker {
  if (worker) { if (accessActive && !lifecycle.check()) throw new VaultError("LOCKED"); return worker; }
  let target: Worker;
  try { target = new VaultWorker({ name: "code-secret-vault" }); } catch { throw new VaultError("UNAVAILABLE"); }
  worker = target;
  target.onmessage = ({ data }: MessageEvent<VaultReply>) => {
    if (target !== worker) return;
    if ("event" in data) { lockVaultLocally(); return; }
    const item = pending.get(data.id); if (!item) return;
    if (item.generation !== generation || accessActive && !lifecycle.check()) return;
    if ("delta" in data) { if (typeof data.delta === "string") item.delta?.(data.delta); return; }
    pending.delete(data.id); item.cleanup();
    if (data.ok) item.resolve(data.value); else item.reject(new VaultError(data.code));
  };
  target.onerror = event => { event.preventDefault(); lockVaultLocally(); };
  target.onmessageerror = () => lockVaultLocally(); return target;
}
function request(method: VaultMethod | "openai", args: unknown[], expected: number, signal?: AbortSignal, delta?: (text: string) => void): Promise<unknown> {
  if (signal?.aborted || expected !== generation) return Promise.reject(new VaultError("CANCELLED"));
  const target = ensureWorker(), id = ++sequence;
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    const abort = () => {
      if (method !== "openai") { lockVaultLocally(); return; }
      target.postMessage({ kind: "cancel", id }); pending.delete(id); cleanup(); reject(new VaultError("CANCELLED"));
    };
    const timer = setTimeout(abort, method === "openai" ? 305000 : 30000);
    pending.set(id, { resolve, reject, cleanup, generation: expected, ...(delta ? { delta } : {}) });
    signal?.addEventListener("abort", abort, { once: true });
    try { target.postMessage({ id, method, args }); } catch { pending.delete(id); cleanup(); reject(new VaultError("UNAVAILABLE")); lockVaultLocally(); }
  });
}
const mutations = new Set<VaultMethod>(["confirmCreate", "put", "remove", "restore", "addMethod", "removeMethod", "rotate"]);
export function vaultCall<M extends VaultMethod>(method: M, args: VaultArguments<M>, signal?: AbortSignal): Promise<VaultResult<M>> {
  const expected = generation;
  const run = async () => {
    preferences = await loadVaultPreferences(); lifecycle.configure(preferences);
    const value = await request(method, args, expected, signal);
    if (["unlock", "prepareCreate", "confirmCreate", "restore"].includes(method)) { accessActive = true; lifecycle.activate(); }
    if (mutations.has(method)) channel?.postMessage({ kind: "lock" });
    return value as VaultResult<M>;
  };
  const result = queue.then(run, run); queue = result.then(() => {}, () => {}); return result;
}
export const readVaultStatus = (): Promise<VaultStatus> => vaultCall("status", []);
export const readVaultKeys = async () => publicVaultKeys(await createVaultStorage().read());
export function openAIRequest(input: OpenAIRequest, signal: AbortSignal, delta?: (text: string) => void): Promise<OllamaModel[] | ChatResult> {
  return request("openai", [input], generation, signal, delta) as Promise<OllamaModel[] | ChatResult>;
}
export async function vaultCeremony<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  ceremony?.abort(); const controller = new AbortController(); ceremony = controller; const expected = generation;
  const timer = setTimeout(() => controller.abort(), 120000);
  try { const value = await run(controller.signal); if (controller.signal.aborted || expected !== generation) throw new VaultError("CANCELLED"); return value; }
  finally { clearTimeout(timer); if (ceremony === controller) ceremony = undefined; }
}
if (typeof document !== "undefined") {
  const visible = () => document.visibilityState === "visible";
  const visibility = () => { if (visible()) lifecycle.check(); };
  const activity = (event: Event) => { if (accessActive) lifecycle.activity(event.isTrusted, visible()); };
  document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", lockVaultLocally);
  for (const type of ["pointerdown", "keydown", "wheel", "input"]) document.addEventListener(type, activity, { passive: true });
  channel?.addEventListener("message", event => {
    if (event.data?.kind === "lock") lockVaultLocally();
    else if (event.data?.kind === "preferences") void loadVaultPreferences().then(value => { preferences = value; lifecycle.configure(value); }, () => lockVaultLocally());
  });
  import.meta.hot?.dispose(() => {
    lockVaultLocally(); channel?.close(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", lockVaultLocally);
    for (const type of ["pointerdown", "keydown", "wheel", "input"]) document.removeEventListener(type, activity);
  });
}

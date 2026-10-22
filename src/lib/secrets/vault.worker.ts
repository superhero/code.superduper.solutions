// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { VaultSession } from "./session";
import { createVaultStorage } from "./storage";
import { safeVaultError, VaultError } from "./types";
import { requestOpenAI, validateOpenAIRequest } from "$lib/assistant/openai";
import type { VaultMethod, VaultReply } from "./protocol";
const send = (reply: VaultReply) => self.postMessage(reply);
const methods = new Set<VaultMethod>(["status", "unlock", "prepareCreate", "confirmCreate", "keys", "list", "copyCredential", "put", "remove", "backup", "restore", "addMethod", "removeMethod", "rotate"]);
const mutations = new Set(["confirmCreate", "put", "remove", "restore", "addMethod", "removeMethod", "rotate"]);
const requests = new Map<number, AbortController>();
let management = false, invalidated = false, expires = Infinity, lastClock = Date.now();
let timer: ReturnType<typeof setTimeout> | undefined;
function lock() { invalidated = true; for (const controller of requests.values()) controller.abort(); session.lock(); clearTimeout(timer); send({ event: "locked" }); }
function assertActive() {
  const now = Date.now(); if (invalidated || now < lastClock || now >= expires) { lock(); throw new VaultError("LOCKED"); } lastClock = now;
}
const session = new VaultSession(createVaultStorage(), assertActive);
self.onmessage = async ({ data }) => {
  if (data?.kind === "cancel") { requests.get(data.id)?.abort(); return; }
  if (data?.kind === "policy") {
    try { assertActive(); if (!(data.expires === null || Number.isSafeInteger(data.expires))) throw new VaultError("INVALID");
      expires = data.expires === null ? Infinity : data.expires; clearTimeout(timer); assertActive();
      if (expires !== Infinity) timer = setTimeout(lock, Math.max(0, expires - Date.now()));
    } catch { lock(); } return;
  }
  if (!Number.isSafeInteger(data?.id) || data.id < 1 || requests.has(data.id)) return;
  const id: number = data.id, isAI = data.method === "openai";
  if (management || !isAI && !methods.has(data.method) || !Array.isArray(data.args) || requests.size >= 8) {
    send({ id, ok: false, code: management || requests.size >= 8 ? "CONFLICT" : "INVALID" }); return;
  }
  const controller = new AbortController(); requests.set(id, controller); if (!isAI) management = true;
  let pieces: string[] = [], flushTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => { clearTimeout(flushTimer); flushTimer = undefined; if (pieces.length) { send({ id, delta: pieces.join("") }); pieces = []; } };
  try {
    assertActive(); let value: unknown;
    if (isAI) {
      const input = validateOpenAIRequest(data.args[0]);
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(input.action === "models" ? 30000 : 300000)]);
      value = await session.withCredential(input.credentialId, (secret, check) => {
        let checked = 0;
        const current = async () => { assertActive(); if (Date.now() - checked >= 250) { await check(); checked = Date.now(); } };
        return requestOpenAI(input, secret, signal, text => {
        pieces.push(text); if (!flushTimer) flushTimer = setTimeout(flush, 16);
        }, current);
      });
    } else {
      const method = data.method as VaultMethod;
      if (mutations.has(method)) for (const [other, active] of requests) if (other !== id) active.abort();
      const call = session[method].bind(session) as (...args: unknown[]) => Promise<unknown>; value = await call(...data.args);
    }
    assertActive(); if (controller.signal.aborted) throw new VaultError("CANCELLED"); flush(); send({ id, ok: true, value });
  } catch (error) { pieces = []; clearTimeout(flushTimer); send({ id, ok: false, code: controller.signal.aborted ? "CANCELLED" : safeVaultError(error).code }); }
  finally {
    requests.delete(id); if (!isAI) management = false;
    const seen = new Set<object>();
    const wipe = (value: unknown): void => {
      if (value instanceof Uint8Array) value.fill(0);
      else if (value && typeof value === "object" && !seen.has(value)) { seen.add(value); Object.values(value).forEach(wipe); }
    };
    wipe(data.args); data.args = undefined;
  }
};

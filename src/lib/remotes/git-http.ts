// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { HttpClient } from "isomorphic-git";
import { repositoryUrl, normalizeRelay } from "./policy.ts";
import type { RemoteAccess } from "./types.ts";
export type Lease = { ref: string; oid: string | null };
export function advertisementRef(bytes: Uint8Array, ref: string): string | null {
  let offset = 0, found: string | null = null;
  while (offset < bytes.length) {
    const lengthText = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    if (!/^[\da-f]{4}$/i.test(lengthText)) throw new Error("The Git server returned an invalid reference advertisement.");
    const size = parseInt(lengthText, 16); offset += 4;
    if (size < 4) continue;
    if (offset + size - 4 > bytes.length) throw new Error("The Git reference advertisement is incomplete.");
    const line = new TextDecoder().decode(bytes.subarray(offset, offset + size - 4)); offset += size - 4;
    if (line.includes("object-format=sha256")) throw new Error("SHA-256 Git repositories are not supported by this Git engine.");
    const match = /^([a-f0-9]{40}) ([^\0\n]+)(?:\0|\n|$)/.exec(line);
    if (match?.[2] === ref) found = match[1]!;
  }
  return found;
}
async function* one(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> { yield bytes; }
export function gitHttp(url: string, access: RemoteAccess | undefined, signal: AbortSignal, write = false, lease?: Lease, transport = globalThis.fetch): HttpClient {
  const root = new URL(repositoryUrl(url, access)), relay = access ? normalizeRelay(access.relay) : "";
  let reviewed = false;
  return { async request(request) {
    signal.throwIfAborted();
    const target = new URL(request.url), rootPath = root.pathname.replace(/\/$/, ""), path = target.pathname.slice(rootPath.length), method = request.method ?? "GET";
    const discovery = path === "/info/refs" && method === "GET" && /^\?service=git-(?:upload|receive)-pack$/.test(target.search);
    const upload = path === "/git-upload-pack" && method === "POST" && !target.search;
    const receive = path === "/git-receive-pack" && method === "POST" && !target.search;
    if (target.origin !== root.origin || !target.pathname.startsWith(rootPath + "/") || target.username || target.password || target.hash || !(discovery || upload || receive) || receive && !write)
      throw new Error("A Git request escaped the selected repository or requested an unauthorized write.");
    if (receive && (!lease || !reviewed)) throw new Error("Review the current remote tip before pushing.");
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers ?? {})) if (["accept", "content-type", "git-protocol"].includes(name.toLowerCase())) headers.set(name, value);
    if (access?.token) {
      const username = access.provider === "github" ? "x-access-token" : access.provider === "gitlab" ? "oauth2" : "x-bitbucket-api-token-auth";
      const bytes = new TextEncoder().encode(`${username}:${access.token}`);
      headers.set("Authorization", `Basic ${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""))}`);
    }
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    if (request.body) for await (const chunk of request.body) { signal.throwIfAborted(); chunks.push(new Uint8Array(chunk)); }
    let response: Response;
    try {
      response = await transport(relay ? `${relay}/${target.href.replace(/^https:\/\//, "")}` : target.href, {
        method, headers, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
        signal: AbortSignal.any([signal, AbortSignal.timeout(600_000)]), ...(request.body ? { body: new Blob(chunks) } : {}),
      });
    } catch {
      if (signal.aborted) throw new Error(write ? "Push cancelled. Refresh remote refs before retrying; an accepted push cannot be undone by cancelling." : "Git transfer cancelled.");
      throw new Error(write ? "The push connection was interrupted. Refresh remote refs before retrying. Check the host and trusted CORS relay." : "Git transport could not connect. Check the host and trusted CORS relay in Settings → Remote connections.");
    }
    if (response.status === 401 || response.status === 403) throw new Error("Git access was rejected. Check token permissions, SSO approval and the selected connection.");
    if (!response.ok) throw new Error(`Git transport returned HTTP ${response.status}. Check the clone URL, repository access and relay configuration.`);
    const reader = response.body?.getReader();
    async function* stream(): AsyncIterableIterator<Uint8Array> {
      if (!reader) return;
      try { while (true) { signal.throwIfAborted(); const next = await reader.read(); if (next.done) return; yield next.value; } }
      finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
    let body = stream();
    if (lease && discovery && target.search.includes("receive-pack")) {
      const parts: Uint8Array[] = []; let size = 0;
      for await (const chunk of body) { size += chunk.length; if (size > 8_000_000) throw new Error("This server advertises too many refs to review safely."); parts.push(chunk); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      if (advertisementRef(bytes, lease.ref) !== lease.oid) throw new Error("The remote tip changed since review. Refresh and review the new tip before pushing.");
      reviewed = true; body = one(bytes);
    }
    return { url: target.href, method, statusCode: response.status, statusMessage: response.statusText, headers: Object.fromEntries(response.headers), body };
  } };
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
/** Pin credentials to one API origin and path. Never follow a credentialed redirect. */
export function apiFetch(baseUrl: string, token: string, signal?: AbortSignal, transport = globalThis.fetch): typeof fetch {
  const base = new URL(baseUrl), prefix = base.pathname.replace(/\/$/, "");
  return async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.protocol !== "https:" || url.origin !== base.origin || url.username || url.password || prefix && url.pathname !== prefix && !url.pathname.startsWith(prefix + "/"))
      throw new Error("The upstream requested an address outside this connection's API.");
    const headers = new Headers(request.headers);
    headers.delete("authorization"); headers.delete("private-token"); headers.delete("cookie"); headers.delete("user-agent");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    const timeout = AbortSignal.timeout(30_000), signals = [timeout, request.signal, ...(signal ? [signal] : [])];
    let response: Response;
    try { response = await transport(new Request(request, { headers, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: AbortSignal.any(signals) })); }
    catch (error) {
      if (signal?.aborted) throw new Error("The upstream request was cancelled.");
      if (timeout.aborted) throw new Error("The upstream request timed out. Check its result before repeating a write.");
      throw new Error("The upstream could not be reached. Check your connection, host and browser CORS permissions.");
    }
    if (!response.body) return response;
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8_000_000) { await reader.cancel(); throw new Error("The API response is too large. Narrow the query or open the upstream site."); }
      chunks.push(value);
    }
    const body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    const responseHeaders = new Headers(response.headers); responseHeaders.delete("content-encoding"); responseHeaders.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  };
}

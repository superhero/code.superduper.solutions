// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { decodePayload } from "../formatting/packages.ts";
import { remoteRegistry } from "./registry.ts";
import { connectionAccess } from "./connections.ts";
import { apiBase } from "./policy.ts";
import { apiFetch } from "./api-fetch.ts";
import type { Connection, ProviderApi, SdkModule } from "./types.ts";
const factories = new Map<string, Promise<SdkModule>>();
export async function providerApi(connection: Connection, signal?: AbortSignal): Promise<ProviderApi> {
  const item = remoteRegistry.catalog.find(item => item.id === connection.provider);
  if (!item) throw new Error("Unknown upstream integration.");
  const { envelope } = await remoteRegistry.readPackage(item);
  let factory = factories.get(item.sha256);
  if (!factory) {
    factory = (async () => {
      let url = "";
      try { return await import(/* @vite-ignore */ (url = URL.createObjectURL(new Blob([decodePayload(envelope)], { type: "text/javascript" })))) as SdkModule; }
      finally { URL.revokeObjectURL(url); }
    })();
    factories.set(item.sha256, factory); void factory.catch(() => factories.delete(item.sha256));
  }
  const { token } = connectionAccess(connection), baseUrl = apiBase(connection.provider, connection.host);
  const guarded = apiFetch(baseUrl, token, signal);
  const fetch: typeof globalThis.fetch = (input, init) => {
    if (connectionAccess(connection).token !== token) throw new Error("This connection was locked or changed. Reconnect before continuing.");
    return guarded(input, init);
  };
  return (await factory).create({ token, baseUrl, host: connection.host, fetch });
}

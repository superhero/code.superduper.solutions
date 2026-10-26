// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { openDB, type DBSchema } from "idb";
import { ollamaAddress } from "./ollama.ts";
export type AIProvider = "ollama" | "openai" | "browser";
export type AIConnection = { id: string; label: string; provider: AIProvider; address: string; credentialId: string };
export const OPENAI_ADDRESS = "https://api.openai.com";
export const BROWSER_CONNECTION: AIConnection = { id: "browser-models", label: "WebML", provider: "browser", address: "browser:", credentialId: "" };
export const WLLAMA_CONNECTION: AIConnection = { id: "browser-wllama", label: "Wllama", provider: "browser", address: "browser:", credentialId: "" };
export const LITERT_CONNECTION: AIConnection = { id: "browser-litert", label: "LiteRT-LM", provider: "browser", address: "browser:", credentialId: "" };
export const BROWSER_CONNECTIONS = [BROWSER_CONNECTION, WLLAMA_CONNECTION, LITERT_CONNECTION] as const;
export const browserConnectionEngine = (id: string): "webml" | "wllama" | "litert-lm" => id === WLLAMA_CONNECTION.id ? "wllama" : id === LITERT_CONNECTION.id ? "litert-lm" : "webml";
export const isBrowserConnection = (id: string): boolean => BROWSER_CONNECTIONS.some(connection => connection.id === id);
interface ConnectionsDB extends DBSchema { connections: { key: string; value: AIConnection } }
const database = () => openDB<ConnectionsDB>("code-ai-connections", 1, { upgrade(db) { db.createObjectStore("connections", { keyPath: "id" }); } });
export function validateConnection(input: AIConnection): AIConnection {
  if (!input || typeof input !== "object" || typeof input.id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(input.id)
    || typeof input.label !== "string" || !input.label.trim() || input.label.length > 100 || /[\u0000-\u001f]/.test(input.label)
    || !["ollama", "openai", "browser"].includes(input.provider) || typeof input.credentialId !== "string") throw new Error("Enter a valid connection name and provider.");
  if (input.provider === "openai" && !/^[a-f0-9-]{36}$/i.test(input.credentialId)) throw new Error("Choose a saved vault key for OpenAI.");
  if (input.provider === "openai" && input.address !== OPENAI_ADDRESS) throw new Error("OpenAI credentials can only be sent to api.openai.com.");
  return { id: input.id, label: input.label.trim(), provider: input.provider,
    address: input.provider === "openai" ? OPENAI_ADDRESS : input.provider === "browser" ? "browser:" : ollamaAddress(input.address), credentialId: input.provider === "openai" ? input.credentialId : "" };
}
export async function listAIConnections(): Promise<AIConnection[]> {
  const db = await database();
  try {
    const saved = (await db.getAll("connections")).map(validateConnection);
    return [...BROWSER_CONNECTIONS,
      ...saved.filter(entry => !isBrowserConnection(entry.id)).sort((a, b) => a.label.localeCompare(b.label))];
  }
  finally { db.close(); }
}
export async function saveAIConnection(input: AIConnection): Promise<AIConnection> {
  const record = validateConnection(input);
  const db = await database(); try { await db.put("connections", record); } finally { db.close(); }
  return record;
}
export async function removeAIConnection(id: string): Promise<void> {
  if (isBrowserConnection(id)) throw new Error("Built-in browser engines cannot be removed.");
  const db = await database(); try { await db.delete("connections", id); } finally { db.close(); }
}

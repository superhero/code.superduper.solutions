// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { openDB, type DBSchema } from "idb";
import { OLLAMA_ADDRESS, ollamaAddress } from "./ollama.ts";
export type AIProvider = "ollama" | "openai" | "browser";
export type AIConnection = { id: string; label: string; provider: AIProvider; address: string; credentialId: string };
export const OPENAI_ADDRESS = "https://api.openai.com";
export const LOCAL_CONNECTION: AIConnection = { id: "local-ollama", label: "Local Ollama", provider: "ollama", address: OLLAMA_ADDRESS, credentialId: "" };
export const BROWSER_CONNECTION: AIConnection = { id: "browser-models", label: "Browser models", provider: "browser", address: "browser:", credentialId: "" };
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
    return [saved.find(entry => entry.id === LOCAL_CONNECTION.id) ?? LOCAL_CONNECTION, BROWSER_CONNECTION,
      ...saved.filter(entry => entry.id !== LOCAL_CONNECTION.id && entry.id !== BROWSER_CONNECTION.id).sort((a, b) => a.label.localeCompare(b.label))];
  }
  finally { db.close(); }
}
export async function saveAIConnection(input: AIConnection): Promise<AIConnection> {
  const record = validateConnection(input);
  const db = await database(); try { await db.put("connections", record); } finally { db.close(); }
  return record;
}
export async function removeAIConnection(id: string): Promise<void> {
  if (id === LOCAL_CONNECTION.id || id === BROWSER_CONNECTION.id) throw new Error("The local default cannot be removed.");
  const db = await database(); try { await db.delete("connections", id); } finally { db.close(); }
}

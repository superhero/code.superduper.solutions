// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

export const OLLAMA_ADDRESS = "http://localhost:11434";
export const OLLAMA_MODEL = "ornith:9b-q8_0";
export interface OllamaModel { id: string; label: string; contextWindow?: number }
export interface ChatImage { type: 'image'; data: string; mimeType: string; width?: number; height?: number }
export interface ChatMessage { role: "user" | "assistant"; content: string; images?: ChatImage[] }
export interface NativeToolCall { function: { name: string; arguments: Record<string, unknown> } }
export interface ChatResult { reason: string; tokens: number; inputTokens?: number; toolCalls?: NativeToolCall[] }

const requestOptions = { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" } as const;

// Adapted from the verified Ollama browser reference's connection/discovery contract.
export function ollamaAddress(address: string): string {
  let url: URL;
  try { url = new URL(address); } catch { throw new Error("Enter a valid Ollama runtime URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("Enter the Ollama root URL without credentials, query parameters or an API path.");
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Use HTTPS for an Ollama runtime outside this computer.");
  return url.origin;
}

export async function discoverOllama(address: string, signal: AbortSignal): Promise<OllamaModel[]> {
  const response = await fetch(ollamaAddress(address) + "/api/tags", { ...requestOptions, signal });
  if (!response.ok) throw new Error(`Ollama connection failed (HTTP ${response.status}).`);
  const data = await response.json() as { models?: unknown };
  if (!Array.isArray(data.models)) throw new Error("Ollama returned an invalid model list.");
  const models: OllamaModel[] = [];
  for (const entry of data.models) {
    if (!entry || typeof entry.name !== "string") throw new Error("Ollama returned an invalid model entry.");
    // This first slice explicitly stays local, even when the runtime also serves cloud models.
    if (entry.remote_model || entry.remote_host || entry.name.endsWith(":cloud")) continue;
    if (Array.isArray(entry.capabilities) && !entry.capabilities.includes("completion")) continue;
    if (!models.some(model => model.id === entry.name)) models.push({ id: entry.name, label: entry.name });
    if (models.length === 256) break;
  }
  if (!models.length) throw new Error("No local chat models found. Add a local model in Ollama, then connect again.");
  return models;
}

/** Read architecture metadata, not a Modelfile's configured num_ctx default. */
export async function ollamaContextWindow(address: string, model: string, signal: AbortSignal): Promise<number | undefined> {
  const response = await fetch(ollamaAddress(address) + "/api/show", { ...requestOptions, method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ model, verbose: false }) });
  if (!response.ok) throw new Error(`Model information unavailable (HTTP ${response.status}).`);
  const data = await response.json() as { model_info?: Record<string, unknown> };
  const info = data?.model_info, architecture = info?.["general.architecture"];
  if (!info || typeof architecture !== "string") return undefined;
  const limit = info[`${architecture}.context_length`];
  return typeof limit === "number" && Number.isSafeInteger(limit) && limit > 0 ? limit : undefined;
}

/** Decode NDJSON once, preserving split UTF-8 characters and incomplete network lines. */
export async function readOllamaReply(response: Response, delta: (text: string) => void, signal: AbortSignal, allowTools = false): Promise<ChatResult> {
  if (!response.ok) throw new Error(`Ollama generation failed (HTTP ${response.status}).`);
  if (!response.body) throw new Error("Ollama did not return a response stream.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const toolCalls: NativeToolCall[] = [];
  let pending = "", outputSize = 0, result: ChatResult | undefined;
  const line = (text: string) => {
    signal.throwIfAborted();
    if (!text.trim()) return;
    if (text.length > 65536) throw new Error("Ollama returned an oversized stream event.");
    const event = JSON.parse(text) as { error?: string; done?: boolean; done_reason?: string; eval_count?: number; prompt_eval_count?: number;
      message?: { content?: string; tool_calls?: unknown[] } };
    if (!event || typeof event !== "object") throw new Error("Ollama returned an invalid stream event.");
    if (event.error) throw new Error(event.error.slice(0, 500));
    if (event.message?.tool_calls?.length) {
      if (!allowTools) throw new Error("This chat does not execute model tools.");
      for (const call of event.message.tool_calls) {
        const candidate = call as NativeToolCall;
        if (!candidate?.function || typeof candidate.function.name !== 'string' || !candidate.function.arguments || typeof candidate.function.arguments !== 'object' || Array.isArray(candidate.function.arguments)) throw new Error('Invalid tool call from Ollama.');
        if (toolCalls.length >= 16) throw new Error('Too many tool calls in one reply.');
        toolCalls.push(candidate);
      }
    }
    const textDelta = event.message?.content;
    if (textDelta !== undefined && typeof textDelta !== "string") throw new Error("Ollama returned an invalid text event.");
    if (textDelta) {
      outputSize += textDelta.length;
      if (outputSize > 131072) throw new Error("The reply reached this chat's size limit.");
      delta(textDelta);
    }
    if (event.done === true) result = { reason: event.done_reason ?? "stop", tokens: event.eval_count ?? 0,
      ...(Number.isFinite(event.prompt_eval_count) ? { inputTokens: event.prompt_eval_count! } : {}),
      ...(toolCalls.length ? { toolCalls } : {}) };
  };
  try {
    while (!result) {
      signal.throwIfAborted();
      const part = await reader.read();
      pending += part.done ? decoder.decode() : decoder.decode(part.value, { stream: true });
      let start = 0, end: number;
      while ((end = pending.indexOf("\n", start)) !== -1) {
        line(pending.slice(start, end)); start = end + 1;
        if (result) break;
      }
      pending = pending.slice(start);
      if (pending.length > 65536) throw new Error("Ollama returned an oversized stream event.");
      if (part.done) { if (!result && pending.trim()) line(pending); break; }
    }
    if (!result) throw new Error("Ollama disconnected before completing its reply.");
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function chatWithOllama(address: string, model: string, messages: readonly ChatMessage[],
  signal: AbortSignal, delta: (text: string) => void): Promise<ChatResult> {
  if (!model || model.endsWith(":cloud")) throw new Error("Choose a local Ollama model.");
  if (messages.length > 32 || messages.reduce((sum, message) => sum + message.content.length, 0) > 10000)
    throw new Error("This conversation is full. Start a new chat to continue.");
  const response = await fetch(ollamaAddress(address) + "/api/chat", {
    ...requestOptions, method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ model, stream: true, think: false, options: { num_ctx: 4096, num_predict: 1024 },
      messages: [{ role: "system", content: "You are an assistant in a browser code editor. Be concise. You only see this chat; do not claim to read or change repository files or run tools." }, ...messages] }),
  });
  return readOllamaReply(response, delta, signal);
}

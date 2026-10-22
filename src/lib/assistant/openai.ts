// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Runs only inside the secret worker. Adapted from the verified OpenAI browser
// reference's Responses transport, without its agent tools or UI.
import { DEFAULT_CONTEXT, MIN_CONTEXT, MAX_CONTEXT, estimateContext } from "./configuration.ts";
import { VaultError } from "../secrets/types.ts";
import type { ChatMessage, ChatResult, OllamaModel } from "./ollama.ts";
const origin = "https://api.openai.com/v1";
const options = { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" } as const;
const modelId = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
export type OpenAIRequest = { action: "models"; credentialId: string } | { action: "chat"; credentialId: string; model: string; messages: ChatMessage[]; instructions?: string; contextWindow?: number };
export function validateOpenAIRequest(input: unknown): OpenAIRequest {
  if (!input || typeof input !== "object") throw new VaultError("INVALID");
  const value = input as OpenAIRequest;
  if (typeof value.credentialId !== "string" || !/^[a-f0-9-]{36}$/i.test(value.credentialId)) throw new VaultError("INVALID");
  if (value.action === "models" && Object.keys(value).every(key => ["action", "credentialId"].includes(key))) return value;
  if (value.action !== "chat" || Object.keys(value).some(key => !["action", "credentialId", "model", "messages", "instructions", "contextWindow"].includes(key))
    || value.contextWindow !== undefined && (!Number.isInteger(value.contextWindow) || value.contextWindow < MIN_CONTEXT || value.contextWindow > MAX_CONTEXT)
    || value.instructions !== undefined && (typeof value.instructions !== "string" || value.instructions.length > 16000)
    || typeof value.model !== "string" || !modelId.test(value.model) || !Array.isArray(value.messages) || !value.messages.length
    || value.messages.length > 32 || value.messages.some(message => !message || Object.keys(message).some(key => !["role", "content"].includes(key)) || !["user", "assistant"].includes(message.role) || typeof message.content !== "string")
    || value.messages.reduce((sum, message) => sum + message.content.length, 0) > 10000) throw new VaultError("INVALID");
  return value;
}
/** Hold potential credential suffixes across text deltas; never emit a known echo. */
export function guardSecretText(secret: string) {
  const variants = [...new Set([secret, encodeURIComponent(secret), new URLSearchParams({ v: secret }).toString().slice(2)])];
  const overlap = Math.max(...variants.map(value => value.length)) - 1;
  let pending = "";
  return (text: string, final = false): string => {
    pending += text;
    if (variants.some(value => pending.includes(value))) { pending = ""; throw new VaultError("REDACTED"); }
    let length = final ? pending.length : Math.max(0, pending.length - overlap);
    if (length && /[\uD800-\uDBFF]/.test(pending[length - 1]!) && !final) length--;
    const safe = pending.slice(0, length); pending = pending.slice(length); return safe;
  };
}
async function boundedText(response: Response, limit: number, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new VaultError("NETWORK");
  const reader = response.body.getReader(), decoder = new TextDecoder(); let bytes = 0, text = "";
  try { for (;;) {
    signal.throwIfAborted(); const part = await reader.read(); if (part.done) break;
    bytes += part.value.byteLength; if (bytes > limit) throw new VaultError("LIMIT"); text += decoder.decode(part.value, { stream: true });
  } return text + decoder.decode(); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function readOpenAIReply(response: Response, delta: (text: string) => void, signal: AbortSignal, check: () => Promise<void>): Promise<ChatResult> {
  if (!response.ok || !response.body) throw new VaultError("NETWORK");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = "", data: string[] = [], output = 0, completed: ChatResult | undefined;
  const dispatch = async () => {
    if (!data.length) return; const raw = data.join("\n"); data = [];
    if (raw === "[DONE]") return;
    let event: { type?: string; delta?: string; response?: { status?: string; usage?: { output_tokens?: number; input_tokens?: number }; output?: { type?: string }[] } };
    try { event = JSON.parse(raw); } catch { throw new VaultError("INVALID"); }
    if (!event || typeof event !== "object") throw new VaultError("INVALID");
    if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") {
      if (typeof event.delta !== "string") throw new VaultError("INVALID");
      output += event.delta.length; if (output > 131072) throw new VaultError("LIMIT");
      await check(); signal.throwIfAborted(); delta(event.delta);
    } else if (event.type === "response.completed" || event.type === "response.incomplete") {
      if (event.response?.output?.some(item => item.type !== "message" && item.type !== "reasoning")) throw new VaultError("PERMISSION");
      completed = { reason: event.type === "response.incomplete" ? "length" : "stop", tokens: event.response?.usage?.output_tokens ?? 0, ...(event.response?.usage?.input_tokens !== undefined ? { inputTokens: event.response.usage.input_tokens } : {}) };
    } else if (["error", "response.failed"].includes(event.type ?? "")) throw new VaultError("NETWORK");
  };
  const line = async (value: string) => {
    if (value.endsWith("\r")) value = value.slice(0, -1);
    if (!value) await dispatch(); else if (value.startsWith("data:")) data.push(value.slice(5).trimStart());
    if (data.reduce((sum, item) => sum + item.length, 0) > 65536) throw new VaultError("LIMIT");
  };
  try {
    while (!completed) {
      signal.throwIfAborted(); const part = await reader.read();
      pending += part.done ? decoder.decode() : decoder.decode(part.value, { stream: true });
      let end: number;
      while ((end = pending.indexOf("\n")) !== -1 && !completed) { await line(pending.slice(0, end)); pending = pending.slice(end + 1); }
      if (pending.length > 65536) throw new VaultError("LIMIT");
      if (part.done) { if (!completed) { if (pending) await line(pending); await dispatch(); } break; }
    }
    if (!completed) throw new VaultError("NETWORK"); await check(); return completed;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
/** The origin, paths, auth placement and request fields are owned code, never caller input. */
export async function requestOpenAI(input: OpenAIRequest, secret: string, signal: AbortSignal,
  delta: (text: string) => void, check: () => Promise<void>): Promise<OllamaModel[] | ChatResult> {
  input = validateOpenAIRequest(input);
  if (!secret || secret.length > 512 || /[^\x21-\x7e]/.test(secret)) throw new VaultError("INVALID");
  if (input.action === 'chat' && estimateContext({ messages: input.messages, instructions: input.instructions ?? '' }) + 1024 > (input.contextWindow ?? DEFAULT_CONTEXT)) throw new VaultError('LIMIT');
  const safe = guardSecretText(secret);
  const headers = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
  await check(); signal.throwIfAborted();
  let response: Response;
  try { response = await fetch(origin + (input.action === "models" ? "/models" : "/responses"), {
    ...options, signal, headers, ...(input.action === "chat" ? { method: "POST", body: JSON.stringify({
      model: input.model, input: input.messages, stream: true, store: false, max_output_tokens: 1024,
      instructions: input.instructions ?? "You are an assistant in a browser code editor. Be concise. You only see this chat; do not claim to read or change repository files or run tools.",
    }) } : {}),
  }); } catch { throw new VaultError(signal.aborted ? "CANCELLED" : "NETWORK"); }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new VaultError(response.status === 401 || response.status === 403 ? "API_AUTH" : "API_REQUEST"); }
  if (input.action === "models") {
    const text = await boundedText(response, 1024 * 1024, signal); safe(text, true);
    let result: { data?: { id?: unknown }[] }; try { result = JSON.parse(text); } catch { throw new VaultError("INVALID"); }
    if (!result || !Array.isArray(result.data)) throw new VaultError("INVALID");
    const models = result.data.filter(entry => typeof entry?.id === "string" && modelId.test(entry.id)
      && !/embedding|whisper|tts|dall-e|image|audio|realtime|transcrib|moderation|sora/i.test(entry.id)).slice(0, 256)
      .map(entry => ({ id: entry.id as string, label: entry.id as string }));
    if (!models.length) throw new VaultError("INVALID"); await check(); return models;
  }
  const result = await readOpenAIReply(response, text => { const clean = safe(text); if (clean) delta(clean); }, signal, check);
  const tail = safe("", true); if (tail) delta(tail); return result;
}

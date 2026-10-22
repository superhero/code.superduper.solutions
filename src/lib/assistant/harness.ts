// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from the verified browser Ollama Pi harness; interface and tools are owned here.
import { Agent, type AgentMessage, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessage, Model, Message, JsonObject } from '@earendil-works/pi-ai';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { getCurrentSystemPrompt, getCurrentTools } from '@earendil-works/pi-ai/utils/transcript';
import { ollamaAddress, readOllamaReply, type ChatMessage, type ChatResult } from './ollama.ts';
import { skillCatalog, type AISkills } from "./skills.ts";
import { DEFAULT_CONTEXT, estimateContext, runtimeContextSize } from './configuration.ts';
import { toolResultText, type ToolActivity } from './tools.ts';

export interface ContextUsage { used: number; measured: boolean }
/** Connection adapters supply Pi's stream/model contract; tools attach through AgentTool. */
export interface BrowserConnectionPlugin { model(id: string, contextWindow: number): Model<Api>; stream: StreamFn }
export interface HarnessSettings {
  instructions: string; skills?: AISkills; contextWindow: number; tools: AgentTool[];
  onTool(activity: ToolActivity): void;
  onUsage(usage: ContextUsage): void;
  maxModelTurns?: number; maxToolCalls?: number;
}
const textOf = (message: { content: unknown }) => typeof message.content === 'string' ? message.content :
  Array.isArray(message.content) ? message.content.filter(part => part.type === 'text').map(part => part.text).join('') : '';
export function ollamaMessages(messages: readonly Message[]): unknown[] {
  const system = getCurrentSystemPrompt(messages);
  return [ ...(system ? [{ role: 'system', content: system }] : []), ...messages.filter(message => message.role !== 'system').map(message => {
    if (message.role === 'toolResult') return { role: 'tool', tool_name: message.toolName, content: textOf(message) };
    if (message.role === 'assistant') {
      const calls = message.content.filter(part => part.type === 'toolCall');
      return { role: 'assistant', content: textOf(message), ...(calls.length ? { tool_calls: calls.map(call => ({ function: { name: call.name, arguments: call.arguments } })) } : {}) };
    }
    return { role: message.role, content: textOf(message) };
  }) ];
}
export function ollamaPlugin(address: string, onUsage: (usage: ContextUsage) => void): BrowserConnectionPlugin {
  const origin = ollamaAddress(address);
  return {
    model: (id, contextWindow) => ({ id, name: id, provider: 'ollama', api: 'openai-completions', baseUrl: origin,
      input: ['text'], reasoning: false, contextWindow, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }),
    stream: (model, context, options) => {
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(), content: [], stopReason: 'stop',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      void (async () => {
        try {
          if (!model.id || model.id.endsWith(":cloud")) throw new Error("Choose a local Ollama model.");
          const signal = options?.signal ?? new AbortController().signal;
          signal.throwIfAborted();
          const messages = ollamaMessages(context.messages), declarations = getCurrentTools(context.messages);
          const tools = declarations.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
          const estimated = estimateContext({ messages, tools });
          if (estimated + 1024 > model.contextWindow) throw new Error('Context limit reached. Increase this model’s context limit or start a new session. No messages were removed.');
          onUsage({ used: estimated, measured: false });
          const response = await fetch(origin + '/api/chat', { method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.id, stream: true, think: false,
              options: { num_ctx: runtimeContextSize({ messages, tools }, model.contextWindow), num_predict: 1024 }, messages, ...(tools.length ? { tools } : {}) }) });
          message.content = [{ type: 'text', text: '' }]; stream.push({ type: 'start', partial: message });
          const result = await readOllamaReply(response, delta => {
            const part = message.content[0]!;
            if (part.type === 'text') part.text += delta;
            stream.push({ type: 'text_delta', contentIndex: 0, delta, partial: message });
          }, signal, true);
          message.usage.input = result.inputTokens ?? estimated; message.usage.output = result.tokens;
          message.usage.totalTokens = message.usage.input + message.usage.output;
          onUsage({ used: message.usage.totalTokens, measured: result.inputTokens !== undefined });
          for (const call of result.toolCalls ?? []) message.content.push({ type: 'toolCall', id: `ollama-${crypto.randomUUID()}`, name: call.function.name, arguments: call.function.arguments as JsonObject });
          message.stopReason = result.reason === 'length' ? 'length' : result.toolCalls?.length ? 'toolUse' : 'stop';
          stream.push({ type: 'done', reason: message.stopReason, message }); stream.end();
        } catch (error) {
          message.stopReason = options?.signal?.aborted ? 'aborted' : 'error';
          message.errorMessage = error instanceof Error ? error.message : 'Ollama request failed.';
          stream.push({ type: 'error', reason: message.stopReason, error: message }); stream.end();
        }
      })();
      return stream;
    },
  };
}

/** One harness per conversation. Pi owns transcript replay, tool validation and the loop. */
export class BrowserAgentHarness {
  private history: AgentMessage[] = [];
  async run(plugin: BrowserConnectionPlugin, modelId: string, messages: readonly ChatMessage[], signal: AbortSignal,
    delta: (text: string) => void, settings: HarnessSettings): Promise<ChatResult> {
    signal.throwIfAborted();
    const previous = this.history.length ? this.history.filter(message => message.role !== 'system') : messages.slice(0, -1).map(message =>
      message.role === 'user' ? { role: "user" as const, content: message.images?.length ? [{ type: 'text' as const, text: message.content }, ...message.images] : message.content, timestamp: Date.now() } : {
        role: 'assistant' as const, content: [{ type: 'text' as const, text: message.content }], api: 'openai-completions' as const, provider: 'ollama', model: modelId, timestamp: Date.now(), stopReason: 'stop' as const,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      });
    const agent = new Agent({ streamFn: plugin.stream, initialState: { model: plugin.model(modelId, settings.contextWindow || DEFAULT_CONTEXT),
      systemPrompt: settings.instructions + (settings.skills ? skillCatalog(settings.skills) : ""), thinkingLevel: 'off', tools: settings.tools, messages: previous } });
    let rounds = 0, calls = 0, failure = '', final: AssistantMessage | undefined;
    const activities = new Map<string, ToolActivity>();
    let sawText = false, messageHasText = false;
    const maxCalls = settings.maxToolCalls ?? 24, maxRounds = settings.maxModelTurns ?? 6;
    agent.beforeToolCall = async ({ toolCall }) => {
      if (++calls > maxCalls) return { block: true, terminate: true, reason: `Tool call limit reached (${maxCalls}).` };
      const errors = (toolCall as { nativeErrors?: unknown[] }).nativeErrors;
      if (errors?.length) return { block: true, reason: `Native tool parser: ${errors.join('; ')}` };
      return undefined;
    };
    agent.finishTurn = ({ message }) => {
      if (++rounds >= maxRounds && message.stopReason === 'toolUse') { failure = `Tool round limit reached (${maxRounds}).`; return { action: 'end' }; }
      return undefined;
    };
    const unsubscribe = agent.subscribe(event => {
      if (event.type === 'message_start' && event.message.role === 'assistant') messageHasText = false;
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        if (!messageHasText && sawText) delta('\n\n');
        delta(event.assistantMessageEvent.delta); messageHasText = true; sawText = true;
      }
      if (event.type === 'message_end' && event.message.role === 'assistant') final = event.message;
      if (event.type === 'tool_execution_start') {
        const activity: ToolActivity = { id: event.toolCallId, name: event.toolName, arguments: toolResultText(JSON.stringify(event.args)), status: 'running', result: '' };
        activities.set(activity.id, activity); settings.onTool(activity);
      }
      if (event.type === 'tool_execution_end') {
        const previous = activities.get(event.toolCallId);
        if (previous) settings.onTool({ ...previous, status: event.isError ? 'failed' : 'completed', result: toolResultText(textOf(event.result)) });
      }
    });
    const abort = () => agent.abort(); signal.addEventListener('abort', abort, { once: true });
    try {
      await agent.prompt(messages.at(-1)!.content, messages.at(-1)!.images);
      this.history = agent.state.messages;
      signal.throwIfAborted();
      if (calls > maxCalls) throw new Error(`Tool call limit reached (${maxCalls}).`);
      if (failure) throw new Error(failure);
      if (!final || final.stopReason === 'error' || final.stopReason === 'aborted') throw new Error(final?.errorMessage ?? 'Generation ended without a reply.');
      return { reason: final.stopReason, tokens: final.usage.output, inputTokens: final.usage.input };
    } finally { signal.removeEventListener('abort', abort); unsubscribe(); }
  }
}

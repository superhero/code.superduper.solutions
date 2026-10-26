<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { Popover } from 'bits-ui';
  import SpeechInput from './SpeechInput.svelte';
  import * as Sheet from "$lib/components/ui/sheet";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import HintButton from "$lib/components/HintButton.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import WidthDivider from "$lib/components/editor/WidthDivider.svelte";
  import SessionTab from "./SessionTab.svelte";
  import MarkdownMessage from "./MarkdownMessage.svelte";
  import MarkdownComposer from "./MarkdownComposer.svelte";
  import ModelProgress from './ModelProgress.svelte';
  import { createMessageHeightTracker, type MessageHeight } from "./message-height";
  import { formatGenerationDuration } from "$lib/assistant/presentation";
  import type { MarkdownRepository } from "$lib/assistant/markdown/imports";
  import { BROWSER_CONNECTION, BROWSER_CONNECTIONS, browserConnectionEngine, OPENAI_ADDRESS, listAIConnections, type AIConnection, type AIProvider } from "$lib/assistant/connections";
  import { openAIRequest, readVaultKeys, subscribeVaultLock } from "$lib/secrets/client";
  import type { VaultKey } from "$lib/secrets/types";
  import type { BrowserAgentHarness, ContextUsage } from "$lib/assistant/harness";
  import type { AISkills } from "$lib/assistant/skills";
  import type { GitToolContext } from "$lib/assistant/git-tools";
  import type { SettingsToolContext } from "$lib/assistant/settings-tool";
  import type { ToolActivity } from "$lib/assistant/tools";
  import { DEFAULT_INSTRUCTIONS, DEFAULT_TOOLS, DEFAULT_CONTEXT, MIN_CONTEXT, MAX_CONTEXT, contextKey, estimateContext, modelContextLimit, type ToolChoices } from "$lib/assistant/configuration";
  import { OLLAMA_MODEL, ollamaAddress, discoverOllama, ollamaContextWindow,
    type OllamaModel, type ChatMessage, type ChatResult, type ChatImage } from "$lib/assistant/ollama";
  import { BROWSER_PROFILES, profileById, downloadBytes } from '$lib/assistant/browser/catalog';
  import type { Progress } from '$lib/assistant/browser/types';

  const browserChoices = (): OllamaModel[] => BROWSER_PROFILES.map(profile => ({ id: profile.id, label: profile.title, contextWindow: Number(profile.settings.context_tokens) }));

  let { open = $bindable(false), maximumWidth = 640, vaultRevision = 0, savedWidth = 380, onresizestart, onresizepreview, onresizeend, onsettings, showSendButton = false, showConnectionsButton = false, enterAction = 'send', markdownRepository, instructions = DEFAULT_INSTRUCTIONS, tools = DEFAULT_TOOLS, modelContexts = {}, oncontextchange, editorSettings, gitRepository, skills = {} }: { open?: boolean; maximumWidth?: number; savedWidth?: number; onresizestart(): void; onresizepreview(width: number): void; onresizeend(width: number | undefined): void; onsettings(section: "connections" | "speech", connection?: AIConnection): void; vaultRevision?: number; showSendButton?: boolean; showConnectionsButton?: boolean; enterAction?: 'send' | 'newline'; markdownRepository?: MarkdownRepository | undefined; skills?: AISkills; instructions?: string; editorSettings?: SettingsToolContext; gitRepository?: GitToolContext | undefined; tools?: ToolChoices; modelContexts?: Record<string, number>; oncontextchange?: (key: string, limit: number) => void } = $props();
  type ConversationMessage = { id: number; content: string; images?: ChatImage[]; repository?: MarkdownRepository | undefined } & (
    { role: 'user'; sentAt: string; localTime: string } | { role: 'assistant' }
  );
  type QueuedTurn = { id: string; model: string; input: string; images: ChatImage[]; controller: AbortController };
  class Conversation {
    id: number;
    label = $state("");
    connectionId = $state(BROWSER_CONNECTION.id);
    provider = $state<AIProvider>(BROWSER_CONNECTION.provider);
    credentialId = $state("");
    address = $state(BROWSER_CONNECTION.address);
    connectedAddress = $state("browser:");
    model = $state("");
    models = $state.raw<OllamaModel[]>(browserChoices());
    harness: BrowserAgentHarness | undefined;
    usage = $state.raw<ContextUsage>();
    toolActivities = $state.raw<(ToolActivity & { messageId: number })[]>([]);
    messages = $state.raw<ConversationMessage[]>([]);
    modelLoading = $state(false);
    modelRequest: AbortController | undefined;
    modelProgress = $state<Progress>();
    modelFailure = $state('');
    connecting = $state(false);
    busy = $state(false);
    queued = $state.raw<QueuedTurn[]>([]);
    prompt = $state("");
    dictating = $state(false);
    attachment = $state<ChatImage>();
    failure = $state("");
    status = $state("");
    liveText = $state("");
    startedAt: number | undefined;
    firstResponse = '';
    timing = $state.raw<{ firstResponse: string; duration: string }>();
    replyRepository = $state.raw<MarkdownRepository>();
    connectRequest: AbortController | undefined;
    turn: AbortController | undefined;
    epoch = 0;
    nextMessage = 0;
    frame = 0;
    chunks: string[] = [];
    heights = new Map<number, MessageHeight>();
    follow = true;
    scrollTop = 0;
    alive = true;
    constructor(id: number) { this.id = id; this.label = `Session ${id}`; }
  }
  let nextThread = 1, disposed = false;
  function speechCommit(thread: Conversation) { return (text: string) => { if (thread.alive) thread.prompt += `${thread.prompt && !/\s$/.test(thread.prompt) ? ' ' : ''}${text}`; }; }
  function speechActivity(thread: Conversation) { return (active: boolean) => { thread.dictating = active; }; }
  const heightTracker = createMessageHeightTracker(() => scroll(current)), retainMessageHeight = heightTracker.retain;
  function messageHeight(thread: Conversation, id: number): MessageHeight {
    let size = thread.heights.get(id);
    if (!size) { size = { width: 0, height: 0 }; thread.heights.set(id, size); }
    return size;
  }
  let threads = $state.raw([new Conversation(nextThread)]), selected = $state(1);
  let connections = $state.raw<AIConnection[]>([...BROWSER_CONNECTIONS]), keys = $state.raw<VaultKey[]>([]);
  let loaded = false;
  let installedBrowserModels = $state<string[]>(), loadedBrowserModel = $state<string>();
  let browserSelection = Promise.resolve(), browserSelectionRequest: AbortController | undefined;
  const current = $derived(threads.find(thread => thread.id === selected)!);
  const missingBrowserModels = $derived(current.provider === "browser" && !!current.model && installedBrowserModels !== undefined && !installedBrowserModels.includes(current.model));
  const interruption = $derived(current.failure || (current.status === "Output limit reached"
    ? "The model reached its output limit. The reply may be incomplete."
    : current.status === "Stopped" ? "Generation was stopped before the reply finished." : ""));
  const timingLabel = $derived(current.timing ? `${current.timing.firstResponse || '—'} / ${current.timing.duration}` : undefined);
  const visibleMessages = $derived(current.busy ? [...current.messages,
    { role: 'assistant' as const, content: current.liveText || '…', id: current.nextMessage + 1, repository: current.replyRepository }] : current.messages);
  let output = $state<HTMLDivElement>(), attachmentInput = $state<HTMLInputElement>(), tabList = $state<HTMLDivElement>();
  $effect(() => {
    const element = tabList;
    if (!element) return;
    let previousWidth = -1;
    const observer = new ResizeObserver(() => {
      if (!element.isConnected || element.clientWidth === previousWidth) return;
      previousWidth = element.clientWidth;
      element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    observer.observe(element);
    return () => observer.disconnect();
  });
  const paneWidth = $derived(Math.min(savedWidth, maximumWidth));
  const modelMaximum = $derived(current.models.find(model => model.id === current.model)?.contextWindow);
  const contextCeiling = $derived(Math.min(modelMaximum ?? MAX_CONTEXT, MAX_CONTEXT));
  const tokenFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const contextLimit = $derived(modelContextLimit(modelContexts[contextKey(current.provider, current.model)], modelMaximum));
  let contextOpen = $state(false), contextPreview = $state(DEFAULT_CONTEXT);
  const contextMinimum = $derived(Math.min(MIN_CONTEXT, contextCeiling));
  const contextMaximum = $derived(contextMinimum + Math.floor((contextCeiling - contextMinimum) / 1024) * 1024);
  function snapContext(value: number) { return Math.max(contextMinimum, Math.min(contextMaximum, contextMinimum + Math.round((value - contextMinimum) / 1024) * 1024)); }
  function changeContext(value: number) {
    if (!current.model || !Number.isFinite(value)) return;
    contextPreview = snapContext(value);
    oncontextchange?.(contextKey(current.provider, current.model), contextPreview);
  }
  $effect(() => { current.id; current.model; current.provider; open; current.busy; current.connecting; current.modelLoading; contextOpen = false; });
  const contextLimitHint = $derived(!current.model ? 'Choose an LLM to set its context limit.'
    : modelMaximum === undefined ? `Context budget: ${contextLimit.toLocaleString()} tokens. The model’s maximum is unavailable.`
    : current.provider === 'browser' ? `Configured model context: ${modelMaximum.toLocaleString()} tokens. Adjust it in Settings → AI.`
    : `Model maximum: ${modelMaximum.toLocaleString()} tokens.`);
  const contextUsed = $derived(current.usage?.used ?? estimateContext({ instructions, messages: current.messages.map(({ role, content }) => ({ role, content })) }));
  const modelItems = $derived(current.models.map(entry => ({ value: entry.id, label: entry.label, icon: "network_intelligence" })));
  const connectionItems = $derived(connections.map(entry => ({ value: entry.id, label: entry.label, icon: "network_intel_node" })));
  async function refreshKeys() { try { const found = await readVaultKeys(); if (!disposed) keys = found.entries; } catch { /* The vault view reports storage errors on explicit actions. */ } }
  $effect(() => { vaultRevision; if (loaded) void refreshKeys(); });
  export async function refreshConnections(connection?: AIConnection, removed?: string) {
    const found = await listAIConnections(); if (disposed) return; connections = found;
    if (connection) {
      for (const thread of threads) if (thread !== current && thread.connectionId === connection.id) configureThread(thread, connection);
      configureThread(current, connection);
    } else if (removed) {
      for (const thread of threads) if (thread.connectionId === removed) configureThread(thread, found[0]!);
    } else {
      for (const thread of threads) if (thread.connectionId === BROWSER_CONNECTION.id && !thread.connectedAddress && !thread.connecting) configureThread(thread, found[0]!);
    }
  }
  function openConnections() {
    onsettings("connections", connections.find(connection => connection.id === current.connectionId));
  }
  export function useConnection(connection: AIConnection) { configureThread(current, connection); }
  function configureThread(thread: Conversation, connection: AIConnection) {
    cancelQueued(thread);
    thread.modelRequest?.abort(); thread.modelLoading = false;
    thread.turn?.abort(); thread.connectRequest?.abort(); thread.epoch++; flush(thread);
    finishReply(thread);
    thread.liveText = ""; thread.busy = false; thread.connecting = false; thread.turn = undefined; thread.connectRequest = undefined;
    thread.connectionId = connection.id; thread.provider = connection.provider; thread.credentialId = connection.credentialId;
    thread.harness = undefined; thread.usage = undefined; thread.attachment = undefined;
    thread.address = connection.address; thread.connectedAddress = connection.provider === 'browser' ? 'browser:' : ''; thread.models = connection.provider === 'browser' ? browserChoices() : []; thread.model = ""; thread.failure = ""; thread.status = ""; thread.timing = undefined;
    thread.modelProgress = undefined; thread.modelFailure = '';
  }
  const unsubscribeLock = subscribeVaultLock(() => {
    for (const thread of threads) if (thread.provider === "openai") {
      thread.turn?.abort(); thread.connectRequest?.abort(); thread.connectedAddress = "";
      thread.failure = "Unlock the vault, then connect again.";
      if (!thread.busy) thread.timing = undefined;
    }
    void refreshKeys();
  });
  function scroll(thread: Conversation) {
    if (!disposed && open && selected === thread.id && thread.follow && output) {
      output.scrollTop = output.scrollHeight;
      thread.scrollTop = output.scrollTop;
    }
  }
  function scrolled() {
    if (!output) return;
    const top = output.scrollTop;
    if (output.scrollHeight - output.clientHeight - top < 60) current.follow = true;
    else if (top < current.scrollTop - 1) current.follow = false;
    current.scrollTop = top;
  }
  function restore(thread: Conversation, focus = false) {
    void tick().then(() => {
      if (disposed || !open || selected !== thread.id) return;
      if (output) {
        output.scrollTop = thread.follow ? output.scrollHeight : thread.scrollTop;
        thread.scrollTop = output.scrollTop;
      }
      const tab = document.getElementById(`ollama-tab-${thread.id}`);
      if (focus) tab?.focus({ preventScroll: true });
      tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  function flush(thread: Conversation) {
    if (thread.frame) cancelAnimationFrame(thread.frame); thread.frame = 0;
    if (!thread.chunks.length) return;
    thread.liveText += thread.chunks.join(""); thread.chunks = [];
    void tick().then(() => scroll(thread));
  }
  function finishReply(thread: Conversation) {
    if (thread.startedAt !== undefined) thread.timing = {
      duration: formatGenerationDuration(performance.now() - thread.startedAt), firstResponse: thread.firstResponse,
    };
    if (thread.liveText) {
      thread.messages = [...thread.messages, { role: 'assistant', content: thread.liveText, id: ++thread.nextMessage, repository: thread.replyRepository }];
      void tick().then(() => scroll(thread));
    }
    thread.startedAt = undefined;
    thread.firstResponse = '';
  }
  function append(thread: Conversation, text: string) {
    if (text && !thread.firstResponse && thread.startedAt !== undefined)
      thread.firstResponse = formatGenerationDuration(performance.now() - thread.startedAt);
    thread.chunks.push(text);
    // Hidden threads retain deltas without scheduling DOM updates.
    if (selected === thread.id && !thread.frame) thread.frame = requestAnimationFrame(() => flush(thread));
  }
  function selectThread(thread: Conversation, focus = false) {
    if (output) current.scrollTop = output.scrollTop;
    if (current.frame) cancelAnimationFrame(current.frame); current.frame = 0;
    selected = thread.id; flush(thread); restore(thread, focus);
  }
  function addThread() {
    const thread = new Conversation(++nextThread);
    // Suggest the current configuration, but let each new session connect independently.
    thread.address = current.address;
    thread.connectionId = current.connectionId; thread.provider = current.provider; thread.credentialId = current.credentialId;
    thread.connectedAddress = current.provider === 'browser' ? 'browser:' : '';
    thread.models = current.provider === 'browser' ? current.models : [];
    thread.model = current.provider === 'browser' ? current.model : '';
    threads = [...threads, thread]; selectThread(thread, true);
  }
  function disposeThread(thread: Conversation) {
    cancelQueued(thread);
    thread.alive = false; thread.modelRequest?.abort(); thread.turn?.abort(); thread.connectRequest?.abort();
    if (thread.frame) cancelAnimationFrame(thread.frame); thread.chunks = [];
  }
  function closeThread(thread: Conversation) {
    const index = threads.indexOf(thread), remaining = threads.filter(entry => entry !== thread);
    disposeThread(thread);
    if (!remaining.length) remaining.push(new Conversation(++nextThread));
    if (selected === thread.id) selected = remaining[Math.min(index, remaining.length - 1)]!.id;
    threads = remaining; restore(current, true);
  }
  function tabKey(event: KeyboardEvent, thread: Conversation) {
    const index = threads.indexOf(thread);
    const next = event.key === "ArrowRight" ? (index + 1) % threads.length
      : event.key === "ArrowLeft" ? (index - 1 + threads.length) % threads.length
      : event.key === "Home" ? 0 : event.key === "End" ? threads.length - 1 : -1;
    if (next !== -1) { event.preventDefault(); selectThread(threads[next]!, true); }
    else if (event.key === "Delete") { event.preventDefault(); closeThread(thread); }
  }
  function scrollTabs(event: WheelEvent) {
    const tabs = event.currentTarget as HTMLDivElement;
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || tabs.scrollWidth <= tabs.clientWidth) return;
    const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(tabs).fontSize) * 1.5 : event.deltaMode === 2 ? tabs.clientWidth : 1;
    tabs.scrollLeft += event.deltaY * unit; event.preventDefault();
  }
  function explain(error: unknown, thread: Conversation): string {
    return error instanceof TypeError
      ? thread.provider === 'browser' ? 'Browser inference failed. Check the model installation and browser compatibility in Settings → AI.' : thread.provider === "ollama" ? `Could not reach Ollama. Check the runtime URL, browser local-network permission and OLLAMA_ORIGINS for ${location.origin}.` : "Could not reach OpenAI. Check browser access and the saved API key."
      : error instanceof Error ? error.message : "AI request failed.";
  }
  async function selectModel(thread: Conversation, model: string, load = true) {
    thread.modelRequest?.abort(); thread.model = model; thread.usage = undefined;
    if (thread.provider === 'browser') {
      thread.modelFailure = ''; thread.modelProgress = undefined;
      if (!load) return;
      const controller = new AbortController(); thread.modelRequest = controller; thread.modelLoading = true;
      browserSelectionRequest?.abort(); browserSelectionRequest = controller;
      const task = browserSelection.then(async () => {
        controller.signal.throwIfAborted();
        const [{ prepareBrowserModel }, { configuredBrowserProfile }] = await Promise.all([import('$lib/assistant/browser/selection'), import('$lib/assistant/browser/runtime')]);
        controller.signal.throwIfAborted();
        const profile = await configuredBrowserProfile(model);
        controller.signal.throwIfAborted();
        thread.models = thread.models.map(entry => entry.id === model ? { ...entry, contextWindow: Number(profile.settings.context_tokens) } : entry);
        thread.connectionId = BROWSER_CONNECTIONS.find(connection => browserConnectionEngine(connection.id) === profile.engine)!.id;
        const context = modelContextLimit(modelContexts[contextKey('browser', model)], Number(profile.settings.context_tokens));
        await prepareBrowserModel(model, progress => { if (thread.alive && !controller.signal.aborted) thread.modelProgress = progress; }, controller.signal, context);
      });
      browserSelection = task.catch(() => {});
      try { await task; }
      catch (error) { if (!disposed && thread.alive && !controller.signal.aborted) thread.modelFailure = explain(error, thread); }
      finally {
        if (browserSelectionRequest === controller) browserSelectionRequest = undefined;
        if (thread.modelRequest === controller) { thread.modelRequest = undefined; thread.modelLoading = false; thread.modelProgress = undefined; }
      }
      return;
    }
    if (thread.provider !== "ollama" || thread.models.find(entry => entry.id === model)?.contextWindow) { thread.modelLoading = false; return; }
    const controller = new AbortController(); thread.modelRequest = controller; thread.modelLoading = true;
    try {
      const maximum = await ollamaContextWindow(thread.connectedAddress, model, AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]));
      if (!disposed && thread.alive && !controller.signal.aborted && thread.model === model && maximum !== undefined)
        thread.models = thread.models.map(entry => entry.id === model ? { ...entry, contextWindow: maximum } : entry);
    } catch { /* Metadata is optional; an unknown maximum must not be invented. */ }
    finally { if (thread.modelRequest === controller) { thread.modelRequest = undefined; thread.modelLoading = false; } }
  }
  async function attachImage(thread: Conversation, file?: File) {
    if (!file || thread.provider !== 'browser') return;
    const epoch = thread.epoch;
    try {
      const { prepareImage } = await import('$lib/assistant/browser/images');
      const { readModelSettings } = await import('$lib/assistant/browser/storage');
      const { profileById } = await import('$lib/assistant/browser/catalog');
      const { defaultSettings } = await import('$lib/assistant/browser/settings.js');
      const saved = await readModelSettings(thread.model), generation = defaultSettings(profileById(thread.model), saved.generation as Record<string, unknown> | undefined);
      const image = await prepareImage(file, Number(generation.image_max_pixels ?? 262144));
      if (thread.alive && thread.epoch === epoch && thread.provider === 'browser') thread.attachment = image;
    } catch (error) { if (thread.alive && thread.epoch === epoch) thread.failure = explain(error, thread); }
  }
  async function connect(thread: Conversation) {
    if (thread.busy || thread.connecting) return;
    const previousModel = thread.model, controller = new AbortController(); thread.connectRequest = controller;
    thread.connecting = true; thread.failure = ""; thread.connectedAddress = ""; thread.models = []; thread.model = ""; thread.status = ""; thread.timing = undefined;
    try {
      const origin = thread.provider === "browser" ? "browser:" : thread.provider === "ollama" ? ollamaAddress(thread.address) : OPENAI_ADDRESS;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(thread.provider === "ollama" ? 10000 : 30000)]);
      const browser = thread.provider === "browser" ? await import('$lib/assistant/browser/discovery') : undefined;
      const found = browser ? await browser.browserModelCatalog() : thread.provider === "ollama" ? await discoverOllama(origin, signal)
        : await openAIRequest({ action: "models", credentialId: thread.credentialId }, signal) as OllamaModel[];
      if (disposed || !thread.alive || controller.signal.aborted) return;
      if (!found.length) {
        if (thread.provider === "browser") return;
        throw new Error('No models are available from this connection.');
      }
      thread.models = found; thread.connectedAddress = origin;
      thread.model = found.find(entry => entry.id === previousModel)?.id ?? found.find(entry => entry.id === (thread.provider === "ollama" ? OLLAMA_MODEL : "gpt-5.4-mini"))?.id
        ?? found.find(entry => thread.provider === "ollama" ? /^ornith:9b/i.test(entry.id) : /^gpt-/i.test(entry.id))?.id ?? found[0]!.id;
      await selectModel(thread, thread.model, thread.provider !== 'browser');
    } catch (error) { if (!disposed && thread.alive && !controller.signal.aborted) thread.failure = explain(error, thread); }
    finally { if (thread.connectRequest === controller) { thread.connecting = false; thread.connectRequest = undefined; } }
  }
  function cancelQueued(thread: Conversation) {
    if (!thread.queued.length) return;
    for (const pending of thread.queued) pending.controller.abort();
    thread.queued = [];
  }
  async function send(thread: Conversation) {
    const browser = thread.provider === 'browser';
    if (thread.dictating || thread.connecting || (!browser && (thread.busy || thread.modelLoading)) || (!thread.prompt.trim() && !thread.attachment) || !thread.models.some(entry => entry.id === thread.model) || !thread.connectedAddress) return;
    const input = thread.prompt.trim() || "Describe this image.", images = browser && thread.attachment ? [thread.attachment] : [];
    const controller = new AbortController(), request = thread.epoch;
    // The next model choice belongs to the next request, never the running one.
    const requestModel = thread.model, requestProvider = thread.provider, requestAddress = thread.connectedAddress, requestCredential = thread.credentialId;
    const requestInstructions = instructions, requestToolChoices = { ...tools }, requestRepository = markdownRepository, requestGit = gitRepository;
    const requestSkills = $state.snapshot(skills), requestSettings = editorSettings ? $state.snapshot(editorSettings) : undefined;
    const requestContext = modelContextLimit(modelContexts[contextKey(requestProvider, requestModel)], thread.models.find(entry => entry.id === requestModel)?.contextWindow);
    const sentAt = new Date();
    const pending: QueuedTurn = { id: crypto.randomUUID(), model: requestModel, input, images, controller };
    if (browser) thread.queued = [...thread.queued, pending];
    thread.prompt = ""; thread.attachment = undefined; thread.follow = true;
    void tick().then(() => scroll(thread));
    let started = false;
    const execute = async (loadModel?: typeof import('$lib/assistant/browser/runtime').loadBrowserModel) => {
      controller.signal.throwIfAborted();
      if (disposed || !thread.alive || thread.epoch !== request) return;
      started = true;
      thread.queued = thread.queued.filter(item => item !== pending);
      // Include replies completed while this prompt waited in the runtime queue.
      const conversation: ChatMessage[] = [...thread.messages.map(({ role, content, images }) => ({ role, content, ...(browser && images?.length ? { images } : {}) })), { role: "user", content: input, ...(images.length ? { images } : {}) }];
      thread.replyRepository = requestRepository;
      thread.messages = [...thread.messages, { role: "user", content: input, id: ++thread.nextMessage,
        ...(images.length ? { images } : {}), sentAt: sentAt.toISOString(), localTime: sentAt.toLocaleString(), repository: requestRepository }];
      thread.liveText = ""; thread.chunks = []; thread.busy = true; thread.failure = "";
      thread.status = "Generating…"; thread.turn = controller;
      thread.startedAt = performance.now(); thread.firstResponse = ''; thread.timing = undefined;
      void tick().then(() => scroll(thread));
      let vision: Awaited<ReturnType<typeof import('$lib/assistant/browser/runtime').browserVisionTool>>;
      try {
        if (conversation.length > (requestProvider !== "openai" ? 256 : 32) || conversation.reduce((sum, message) => sum + message.content.length, 0) > (requestProvider !== "openai" ? 1048576 : 10000))
          throw new Error("This conversation is full. Start a new chat to continue.");
        const local = browser ? await import('$lib/assistant/browser/runtime') : undefined;
        const localProfile = local ? await local.configuredBrowserProfile(requestModel) : undefined;
        let signal = controller.signal;
        const delta = (text: string) => {
          if (!disposed && thread.alive && thread.epoch === request && !controller.signal.aborted) append(thread, text);
        };
        const { BrowserAgentHarness, ollamaPlugin } = await import("$lib/assistant/harness");
        const { repositoryTools } = await import("$lib/assistant/tools");
        signal.throwIfAborted();
        const { settingsTools } = await import("$lib/assistant/settings-tool");
        const { skillTools } = await import("$lib/assistant/skill-tools");
        const { gitTools } = await import("$lib/assistant/git-tools");
        const requestTools = [...skillTools(requestSkills), ...gitTools(requestGit, requestToolChoices), ...repositoryTools(requestRepository, requestToolChoices), ...settingsTools(requestSettings, requestToolChoices.read_settings)];
        thread.harness ??= new BrowserAgentHarness();
        const usageChanged = (usage: ContextUsage) => { if (thread.alive && thread.epoch === request && !signal.aborted && thread.model === requestModel) thread.usage = usage; };
        if (loadModel) {
          const { ensureBrowserModelInstalled } = await import('$lib/assistant/browser/selection');
          const progress = (value: Progress) => { if (thread.alive && thread.epoch === request) thread.status = value.message; };
          await ensureBrowserModelInstalled(requestModel, progress, signal);
          await loadModel(requestModel, progress, signal, requestContext);
          vision = await local?.browserVisionTool(requestModel, conversation, progress);
          if (vision) requestTools.push(vision.tool);
          thread.status = "Generating…";
        }
        signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Number(localProfile?.settings.chat_timeout_ms ?? 300000))]);
        const result = requestProvider !== "openai" ? await thread.harness.run(
          local ? local.browserPlugin(requestModel, usageChanged, vision?.reference) : ollamaPlugin(requestAddress, usageChanged),
          requestModel, conversation, signal, delta, { instructions: requestInstructions, skills: requestSkills, contextWindow: requestContext, tools: requestTools,
            onUsage: usageChanged,
            ...(localProfile ? { maxModelTurns: Number(localProfile.settings.max_model_turns), maxToolCalls: Number(localProfile.settings.max_tool_calls) } : {}),
            onTool: activity => {
              if (!thread.alive || thread.epoch !== request || signal.aborted) return;
              const previous = thread.toolActivities.findIndex(item => item.id === activity.id);
              thread.toolActivities = previous === -1 ? [...thread.toolActivities.slice(-191), { ...activity, messageId: thread.nextMessage }]
                : thread.toolActivities.map((item, index) => index === previous ? { ...activity, messageId: item.messageId } : item);
              void tick().then(() => scroll(thread));
            },
          }) : await openAIRequest({ action: "chat", credentialId: requestCredential, model: requestModel, messages: conversation, instructions: requestInstructions, contextWindow: requestContext }, signal, delta) as ChatResult;
        if (thread.alive && thread.epoch === request && requestProvider === "openai" && result.inputTokens !== undefined) thread.usage = { used: result.inputTokens + result.tokens, measured: true };
        if (thread.alive && thread.epoch === request && !disposed) thread.status = result.reason === "length" ? "Output limit reached" : "Completed";
      } catch (error) {
        if (thread.alive && thread.epoch === request && !disposed) {
          if (controller.signal.aborted) thread.status = "Stopped";
          else { thread.failure = explain(error, thread); thread.status = ""; }
        }
      } finally {
        await vision?.dispose();
        // Finish presentation before the queue gives the runtime to the next turn.
        if (thread.alive && thread.epoch === request && !disposed) {
          flush(thread); finishReply(thread);
          thread.toolActivities = thread.toolActivities.map(activity => activity.status === 'running' ? { ...activity, status: 'failed', result: 'Tool interrupted.' } : activity);
          thread.liveText = ""; thread.busy = false; thread.turn = undefined;
        }
      }
    };
    try {
      if (browser) {
        const { runBrowserTurn } = await import('$lib/assistant/browser/runtime');
        await runBrowserTurn(execute, controller.signal);
      } else await execute();
    } catch (error) {
      if (!started && thread.alive && thread.epoch === request && !controller.signal.aborted) thread.failure = explain(error, thread);
    } finally {
      thread.queued = thread.queued.filter(item => item !== pending);
    }
  }
  $effect(() => {
    if (!open) for (const thread of threads) { cancelQueued(thread); thread.turn?.abort(); thread.connectRequest?.abort(); thread.modelRequest?.abort(); }
    else {
      if (!loaded) { loaded = true; void refreshConnections().then(refreshKeys).catch(() => { loaded = false; }); }
      if (output) restore(current);
    }
  });
  $effect(() => {
    if (!open || current.provider !== "browser") return;
    const thread = current;
    let cancelled = false, revision = 0, unsubscribe: (() => void) | undefined, unsubscribeRuntime: (() => void) | undefined;
    void Promise.all([import('$lib/assistant/browser/storage'), import('$lib/assistant/browser/discovery'), import('$lib/assistant/browser/runtime')]).then(([storage, discovery, runtime]) => {
      if (cancelled) return;
      async function refresh() {
        const request = ++revision;
        try {
          const [installed, models] = await Promise.all([storage.installedModels(), discovery.browserModelCatalog()]);
          if (!cancelled && request === revision) { installedBrowserModels = installed; thread.models = models; }
        } catch {
          // Unknown storage state is not evidence of a missing model; selection reports storage failures.
          if (!cancelled && request === revision) installedBrowserModels = undefined;
        }
      }
      unsubscribe = storage.subscribeModels(() => void refresh());
      const updateRuntime = () => { if (!cancelled) {
        loadedBrowserModel = runtime.loadedModel();
        if (!thread.model && BROWSER_PROFILES.some(profile => profile.id === loadedBrowserModel)) thread.model = loadedBrowserModel!;
      } };
      unsubscribeRuntime = runtime.subscribeRuntime(updateRuntime); updateRuntime();
      void refresh();
    }).catch(() => { /* Explicit model selection reports module loading failures. */ });
    return () => { cancelled = true; unsubscribe?.(); unsubscribeRuntime?.(); };
  });
  onDestroy(() => { disposed = true; unsubscribeLock(); heightTracker.destroy(); for (const thread of threads) disposeThread(thread); });
</script>

<Sheet.Pane bind:open docked width={paneWidth} label="AI">
  {#snippet divider(moving: boolean)}<WidthDivider edge="left" label="Resize AI pane" minimum={Math.min(320, maximumWidth)} maximum={maximumWidth} disabled={moving}
    onstart={onresizestart} onpreview={onresizepreview} onend={onresizeend} />{/snippet}
  <div class="ollama-panel" data-ollama-panel data-layout="docked">
    <header class="pane-header">
      <div class="pane-title"><MaterialIcon name="robot" size={16} /><h2 tabindex="-1" data-pane-heading>AI</h2></div>
    </header>
    <div class="pane-toolbar">
      <div class="pane-tools">{#if showConnectionsButton}<Button variant="ghost" size="icon-sm" aria-label="AI connections" tooltip="Connection settings" tooltipSide="top" onclick={openConnections}><MaterialIcon name="hub" size={18} /></Button>{/if}</div>
      <Button variant="ghost" size="icon-sm" aria-label="Close AI" tooltip="Close AI" tooltipSide="top" onclick={() => open = false}><MaterialIcon name="close" size={18} /></Button>
    </div>
    <div class="conversation-tabs">
      <div class="tab-list tab-scroll" bind:this={tabList} role="tablist" aria-label="AI conversations" onwheel={scrollTabs}>
        {#each threads as thread (thread.id)}
          <SessionTab id={thread.id} label={thread.label} selected={selected === thread.id} busy={thread.busy || thread.queued.length > 0}
            onselect={() => selectThread(thread)} onclose={() => closeThread(thread)} onrename={label => thread.label = label}
            onkeydown={event => tabKey(event, thread)} />
        {/each}
      </div>
      <Button variant="ghost" size="icon-sm" class="tab-add" aria-label="New chat" tooltip="New conversation" tooltipSide="left" onclick={addThread}><MaterialIcon name="add" size={18} /></Button>
    </div>
    {#key current.id}
    {#snippet connectionControls()}
    <div class="connection">
      <form class="connection-choice" onsubmit={event => { event.preventDefault(); void connect(current); }}><NavigationDropdown label="AI connection" value={current.connectionId} placeholder="Choose a connection" placeholderIcon="network_intel_node" items={connectionItems} disabled={current.busy || current.connecting}
        onchange={() => {}} onchoose={value => { const connection = connections.find(entry => entry.id === value); if (connection) { configureThread(current, connection); void connect(current); } }} />
        <Button type="submit" variant="ghost" size="icon-sm" aria-label={current.connecting ? "Connecting…" : current.connectedAddress ? "Reconnect" : "Connect"}
          tooltip={current.connecting ? "Connecting…" : current.connectedAddress ? "Reconnect" : "Connect"} disabled={current.busy || current.connecting}><MaterialIcon name="power" size={16} /></Button>
      </form>
      {#if current.provider === "openai"}<div class="connection-row"><span class="provider-detail">OpenAI<small>{keys.find(key => key.id === current.credentialId)?.label ?? "Saved vault key"}</small></span></div>{/if}
    </div>
    {/snippet}
    {#snippet generationTiming()}<kbd>{current.timing?.firstResponse || "—"} / {current.timing?.duration}</kbd>{/snippet}
    <div class="conversation-panel" role="tabpanel" tabindex="-1" id={`ollama-thread-${current.id}`} aria-labelledby={`ollama-tab-${current.id}`}>
    <div class="messages" bind:this={output} onscroll={scrolled} aria-label="AI conversation" role="region" tabindex="-1">
      {#each visibleMessages as message (message.id)}
        {@const streaming = current.busy && message.id === current.nextMessage + 1}
        <article class="message" class:question={message.role === "user"} aria-label={streaming ? 'AI reply' : undefined}>
          {#if message.role === 'user'}<time class="speaker" datetime={message.sentAt}>{message.localTime}</time>{/if}
          {#if message.role === 'user' && message.images?.length}{#each message.images as image}<img class="attached-image" alt="Attached input" src={`data:${image.mimeType};base64,${image.data}`} />{/each}{/if}
          <div class="message-text" data-streaming-reply={streaming || undefined} use:retainMessageHeight={message.role === 'assistant' ? messageHeight(current, message.id) : undefined}><div class="message-content"><MarkdownMessage content={message.content} messageId={`session-${current.id}-message-${message.id}`} hideGeneratedFooter={message.role === 'assistant'} repository={message.repository} {streaming} /></div></div>
        </article>
        {#if message.role === 'user'}{#each current.toolActivities.filter(activity => activity.messageId === message.id) as activity (activity.id)}
          <details class="tool-activity"><summary><MaterialIcon name="build" size={14} />{activity.name}<span>{activity.status}</span></summary><pre>{activity.arguments}</pre>{#if activity.result}<pre>{activity.result}</pre>{/if}</details>
        {/each}{/if}
      {/each}
      {#each current.queued as pending (pending.id)}
        <article class="message question queued-prompt" aria-label="Queued prompt">
          <div class="queued-heading"><span>{profileById(pending.model).title} · Queued</span><Button variant="ghost" size="icon-sm" aria-label="Cancel queued prompt" tooltip="Cancel queued prompt" onclick={() => pending.controller.abort()}><MaterialIcon name="close" size={16} /></Button></div>
          {#each pending.images as image}<img class="attached-image" alt="Queued input" src={`data:${image.mimeType};base64,${image.data}`} />{/each}
          <MarkdownMessage content={pending.input} messageId={`queued-${pending.id}`} />
        </article>
      {/each}
      <div class="conversation-actions"><span role="status" aria-label="AI status" class="sr-only">{current.status}</span>
        {#if current.failure}<span role="alert" class="sr-only">{current.failure}</span>{/if}
        {#if current.busy}<Button type="button" variant="ghost" size="icon-sm" class="generation-stop" aria-label="Stop generating" tooltip="Stop generating" tooltipSide="top" onclick={() => current.turn?.abort()}><span class="generation-symbol"><span class="generation-orbit"><svg class="generation-ring" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="47 10" /><circle cx="12" cy="12" r="5.5" fill="currentColor" /></svg></span><span class="generation-stop-symbol"><span class="generation-stop-mark" aria-hidden="true"></span></span></span></Button>
        {:else if interruption}<HintButton passive plain class="result-indicator interruption-indicator" role="img" aria-label="AI interruption" label={interruption} rightLabel={timingLabel} rightLabelContent={generationTiming}><MaterialIcon name="skull" size={20} /></HintButton>
        {:else if current.status === "Completed"}<HintButton passive plain class="result-indicator completion-indicator" role="img" aria-label="AI completion" label="Generation completed" rightLabel={timingLabel} rightLabelContent={generationTiming}><MaterialIcon name="verified" size={20} /></HintButton>{/if}
        {#if (!current.busy || current.provider === 'browser') && showSendButton && current.connectedAddress}<Button type="button" size="sm" class="conversation-send" disabled={!current.model || !current.connectedAddress || (!current.prompt.trim() && !current.attachment) || current.connecting} onclick={() => void send(current)}><MaterialIcon name="send" size={16} />Send</Button>{/if}
      </div>
    </div>
    {#if missingBrowserModels}
      <div class="connection-notice" role="status" aria-label="Browser model installation">
        <MaterialIcon name="install_desktop" size={20} />
        <p>Select this model in the menu to download and load it.</p>
      </div>
    {/if}
    {#if current.provider === 'browser' || current.connectedAddress}
    <form class="composer" class:browser-composer={current.provider === 'browser'} onsubmit={event => { event.preventDefault(); void send(current); }}>
      <div class="model-choice"><NavigationDropdown label="AI model" side="top" value={current.model} placeholder="Choose LLM" placeholderIcon="network_intelligence" items={modelItems} disabled={current.connecting || current.provider !== 'browser' && (current.busy || current.modelLoading)}
        onchange={value => { if (current.provider !== 'browser') void selectModel(current, value); }} onchoose={value => { if (current.provider === 'browser') void selectModel(current, value); }}>
        {#snippet itemLabel(item)}<span>{item.label}</span>{#if current.provider === 'browser'}<small class="model-availability">{loadedBrowserModel === item.value ? 'Loaded' : installedBrowserModels?.includes(item.value) ? 'Installed' : `Install · ${(downloadBytes(profileById(item.value)) / 1e9).toFixed(2)} GB`}</small>{/if}{/snippet}
      </NavigationDropdown>
        <Popover.Root bind:open={contextOpen} onOpenChange={value => { if (value) contextPreview = snapContext(contextLimit); }}>
          <Popover.Trigger disabled={current.busy || current.connecting || current.modelLoading}>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="sm" class="context-meter" aria-label="Model context limit" tooltip={contextLimitHint}>
                <span>{current.usage?.measured ? '' : '≈'}{contextUsed.toLocaleString()} /</span><span>{tokenFormat.format(contextLimit).toLowerCase()}</span>
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="top" align="end" sideOffset={8} collisionPadding={8} role="dialog" aria-label="Context budget">
              <HintButton label={`Context tokens. ${current.model ? '1,024-token steps; changes save automatically.' : 'Choose an LLM to adjust its limit.'}`} labelAsName={false} tooltipSide="left">
                {#snippet child({ props })}
                  {@const { type: _type, disabled: _disabled, ...hintProps } = props}
                  <div {...hintProps} class="context-slider-panel" tabindex="-1">
                    <output aria-live="polite">{contextPreview.toLocaleString()}</output>
                    <span class="context-endpoint">{contextMaximum.toLocaleString()}</span>
                    <input class="context-slider" type="range" aria-label="Model context limit" aria-orientation="vertical" min={contextMinimum} max={contextMaximum} step="1024" value={contextPreview} disabled={!current.model || contextMaximum === contextMinimum} oninput={event => changeContext(event.currentTarget.valueAsNumber)} />
                    <span class="context-endpoint">{contextMinimum.toLocaleString()}</span>
                  </div>
                {/snippet}
              </HintButton>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root></div>
      {#if current.provider === 'browser' && current.modelLoading}<div class="model-loading" role="status"><span>{current.modelProgress?.message ?? 'Loading model…'}</span><ModelProgress progress={current.modelProgress} label="Model loading" /></div>{/if}
      {#if current.modelFailure}<p class="model-failure" role="alert">{current.modelFailure}</p>{/if}
      <MarkdownComposer value={current.prompt} {enterAction} disabled={!current.connectedAddress || current.connecting || current.provider !== 'browser' && (current.busy || current.modelLoading)}
        onchange={value => current.prompt = value} onsend={() => void send(current)} />
      {#if current.provider === 'browser'}
      {#if current.attachment}<div class="image-preview"><img class="attached-image" alt="Ready to send" src={`data:${current.attachment.mimeType};base64,${current.attachment.data}`} /><Button variant="secondary" size="sm" onclick={() => current.attachment = undefined}>Remove image</Button></div>{/if}
      {/if}
      <div class="composer-controls">
      {#if current.provider === 'browser'}
        <input bind:this={attachmentInput} hidden type="file" aria-label="Attach image" accept="image/png,image/jpeg,image/webp" disabled={!current.model || current.connecting} onchange={event => { void attachImage(current, event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
        <Button variant="ghost" size="sm" class="attach-image" disabled={!current.model || current.connecting} onclick={() => attachmentInput?.click()}><MaterialIcon name="attach_file" size={16} />Attach image</Button>
      {/if}
      <SpeechInput owner={`ai-${current.id}`} disabled={!open || current.connecting} ontext={speechCommit(current)} onactive={speechActivity(current)} />
      </div>
    </form>
    {:else}
    <div class="connection-setup">
      {@render connectionControls()}
    </div>
    {/if}
    </div>
    {/key}
  </div>
</Sheet.Pane>

<style>
  .model-availability { display:block; font-size:.625rem; opacity:.7; }
  .queued-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:.625rem; }
  .model-loading { display:grid; gap:4px; padding:8px 12px 16px; border-inline:2px solid var(--color-surface); background:var(--color-background); font-size:.6875rem; }
  .model-failure { margin:0; padding:8px 12px; border-inline:2px solid var(--color-surface); background:var(--color-error-background); color:var(--color-error-foreground); font-size:.6875rem; }
  .attached-image { max-width:100%; max-height:200px; object-fit:contain; display:block; }
  .composer-controls { display:flex; flex-wrap:wrap; align-items:center; min-width:0; min-height:32px; padding-inline:10px; border:2px solid var(--color-surface); border-top:0; border-radius:0 0 4px 4px; }
  .composer-controls :global(.attach-image) { justify-content:flex-start; padding:6px 0; gap:7px; height:32px; font-size:.6875rem; font-weight:400; margin-right:auto; }
  .composer-controls :global(.attach-image:disabled .button-content) { opacity:.5; }
  .image-preview { display:flex; gap:8px; align-items:center; padding:8px; background:var(--color-surface); }
  .ollama-panel { --ollama-divider: color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; background: var(--color-background); color: var(--color-foreground); font-size: .75rem; }
  .ollama-panel[data-layout="docked"] { border-left: 2px solid var(--ollama-divider); }
  .pane-header { height: var(--workbench-header-height, 48px); flex: 0 0 var(--workbench-header-height, 48px); display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; }
  .pane-title { display: flex; align-items: center; gap: 9px; }h2 { margin: 0; font-size: .6875rem; font-weight: 700; }
  .pane-toolbar { height: 40px; flex: 0 0 40px; padding: 4px calc(12px - .5rem) 4px calc(var(--tab-icon-center, calc(14px + .46875rem)) - 1rem); display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--color-toolbar-background); color: var(--color-toolbar-foreground); }
  .pane-tools { display: flex; flex-shrink: 0; gap: 2px; }.connection-choice { display: flex; align-items: center; gap: 8px; min-width: 0; }.provider-detail { flex: 1; min-width: 0; }small { display: block; opacity: .6; font-size: .625rem; margin-top: 5px; overflow-wrap: anywhere; }
  .conversation-tabs { display: flex; min-width: 0; height: var(--workbench-tabs-height, 40px); flex: 0 0 var(--workbench-tabs-height, 40px); border-top: 2px solid var(--ollama-divider); background: linear-gradient(to top, var(--ollama-divider) 2px, var(--color-surface) 2px); }
  .tab-list { display: flex; flex: 1; min-width: 0; align-items: flex-start; overscroll-behavior-x: contain; }
  /* Match the header icon's inset while extending the button to the pane edge. */
  .conversation-tabs :global(.tab-add) { height: var(--workbench-tabs-content-height, 32px); width: auto; flex: 0 0 auto; margin: 0; padding-inline: calc(12px - .0625rem); border-radius: 0; }
  .conversation-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; flex: 1; }
  .connection { margin: var(--pane-gap) var(--pane-gap) 0; padding: var(--pane-padding); background: var(--color-surface); border-radius: 4px; display: grid; gap: 12px; }
  .connection-choice :global(.navigation-trigger) { padding-inline-start:var(--pane-gap); }
  .connection-row { display: flex; gap: 8px; align-items: center; }
  .messages { min-width: 0; min-height: 0; flex: 1; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; padding: var(--pane-gap); display: flex; flex-direction: column; gap: var(--pane-gap); }
  .messages::-webkit-scrollbar { display: none; }
  .connection-notice { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 0 var(--pane-gap) var(--pane-gap); }
  .connection-notice p { margin: 0; min-width: 0; line-height: 1.6; overflow-wrap: anywhere; }
  .messages:has(:global(.result-indicator)) { padding-bottom: 8px; }
  .message { min-width: 0; flex: 0 0 auto; box-sizing: border-box; width: 100%; padding: var(--pane-padding); border-radius: 4px; background: var(--color-surface); }.question { text-align: right; background: color-mix(in srgb, var(--color-surface) 45%, var(--color-background)); }
  .speaker { display: block; margin-bottom: 7px; opacity: .65; font-size: .625rem; }.message-text { min-width: 0; overflow: clip; overflow-wrap: anywhere; line-height: 1.65; transition: block-size 150ms ease-out; }
  .message-text:global([data-height-reflow]) { transition: none; }
  .message-content { display: flow-root; min-width: 0; }
  .composer, .connection-setup { padding: 0 var(--pane-gap) var(--pane-gap); display: grid; gap: 10px; }
  .composer { position: relative; z-index: 1; gap: 0; padding-top: 4px; background: var(--color-background); }
  .composer :global(.markdown-composer) { background: var(--color-surface); border-radius: 0 0 4px 4px; }
  .composer :global(.markdown-composer), .composer :global(.markdown-composer .cm-editor) { border-radius: 0; }
  .connection-setup .connection { margin: 0; }
  .model-choice { position: relative; display: flex; align-items: center; min-width: 0; height: 32px; padding-inline: 10px; border: 2px solid var(--color-surface); border-bottom: 0; border-radius: 4px 4px 0 0; }
  .model-choice :global(.navigation-trigger) { font-weight: 400; flex: 1; }
  .model-choice :global(.context-meter) { display:flex; align-items:center; flex-shrink:0; gap:4px; height:auto; margin-left:8px; padding:2px; font-size:.625rem; font-weight:400; font-variant-numeric:tabular-nums; }
  .context-slider-panel { display:grid; justify-items:center; gap:8px; width:max-content; padding:10px 8px; border-radius:4px; background:var(--color-surface); color:var(--color-foreground); font-size:.6875rem; }
  .context-slider-panel output { font-variant-numeric:tabular-nums; }
  .context-endpoint { font-size:.625rem; opacity:.6; font-variant-numeric:tabular-nums; }
  .context-slider { writing-mode:vertical-lr; direction:rtl; appearance:none; width:24px; height:180px; margin:0; padding:0; border:0; border-radius:4px; background:transparent; cursor:ns-resize; }
  .context-slider:focus-visible { outline:none; background:var(--color-hover-background); }
  .context-slider:disabled { cursor:default; opacity:.5; }
  .context-slider::-webkit-slider-runnable-track { width:4px; height:100%; border-radius:4px; background:var(--color-background); }
  .context-slider::-moz-range-track { width:4px; height:100%; border-radius:4px; background:var(--color-background); }
  .context-slider::-webkit-slider-thumb { appearance:none; width:14px; height:14px; margin-left:-5px; border:0; border-radius:50%; background:var(--color-foreground); }
  .context-slider::-moz-range-thumb { width:14px; height:14px; border:0; border-radius:50%; background:var(--color-foreground); }
  @media (prefers-reduced-motion:no-preference) { .context-slider-panel { animation:context-budget-up 140ms ease-out; } }
  @keyframes context-budget-up { from { opacity:0; translate:0 8px; } to { opacity:1; translate:0 0; } }
  .tool-activity { flex: 0 0 auto; min-width: 0; padding: var(--pane-gap); border-radius: 4px; background: var(--color-surface); font-size: .6875rem; }
  .tool-activity summary { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .tool-activity summary span { margin-left: auto; opacity: .6; }
  .tool-activity pre { margin-top: 8px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .625rem; max-height: 200px; overflow: auto; }
  .conversation-actions:not(:has(button, :global(.result-indicator))) { display: none; }
  .conversation-actions { display: grid; grid-template-columns: minmax(0, 1fr) 32px minmax(0, 1fr); flex: 0 0 32px; align-items: center; height: 32px; }
  .conversation-actions :global(.generation-stop), .conversation-actions :global(.result-indicator) { grid-column: 2; grid-row: 1; }
  .conversation-actions :global(.result-indicator) { display: grid; place-items: center; width: 32px; height: 32px; cursor: default; }
  .conversation-actions :global(.conversation-send) { grid-column: 3; grid-row: 1; justify-self: end; }
  .generation-symbol { position: relative; display: grid; place-items: center; width: 24px; height: 24px; transition: transform 150ms ease; }
  .generation-orbit, .generation-stop-symbol { position: absolute; inset: 0; display: grid; place-items: center; }
  .generation-ring { position: absolute; left: 50%; top: 50%; width: 20px; height: 20px; line-height: 20px; text-align: center; transform-origin: center; animation: generation-orbit 2s linear infinite; }
  .generation-stop-symbol { z-index: 1; color: var(--color-background); opacity: 0; transition: opacity 150ms ease; }
  .generation-stop-mark { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 6px; height: 6px; border-radius: 1px; background: currentColor; }
  :global(.generation-stop:is(:hover, :focus-visible)) .generation-symbol { transform: scale(1.25); }
  :global(.generation-stop:is(:hover, :focus-visible)) .generation-stop-symbol { opacity: 1; }
  @keyframes generation-orbit { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .generation-ring { animation: none; transform: translate(-50%, -50%); }.generation-symbol, .generation-stop-symbol, .message-text { transition: none; } }
</style>

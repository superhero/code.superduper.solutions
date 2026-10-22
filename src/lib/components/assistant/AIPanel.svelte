<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import * as Sheet from "$lib/components/ui/sheet";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import HintButton from "$lib/components/HintButton.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import WidthDivider from "$lib/components/editor/WidthDivider.svelte";
  import ConnectionsView from "./ConnectionsView.svelte";
  import SessionTab from "./SessionTab.svelte";
  import MarkdownMessage from "./MarkdownMessage.svelte";
  import MarkdownComposer from "./MarkdownComposer.svelte";
  import { createMessageHeightTracker, type MessageHeight } from "./message-height";
  import { formatGenerationDuration } from "$lib/assistant/presentation";
  import type { MarkdownRepository } from "$lib/assistant/markdown/imports";
  import { LOCAL_CONNECTION, OPENAI_ADDRESS, listAIConnections, type AIConnection, type AIProvider } from "$lib/assistant/connections";
  import { openAIRequest, readVaultKeys, subscribeVaultLock } from "$lib/secrets/client";
  import type { VaultKey } from "$lib/secrets/types";
  import type { BrowserAgentHarness, ContextUsage } from "$lib/assistant/harness";
  import type { AISkills } from "$lib/assistant/skills";
  import type { GitToolContext } from "$lib/assistant/git-tools";
  import type { SettingsToolContext } from "$lib/assistant/settings-tool";
  import type { ToolActivity } from "$lib/assistant/tools";
  import { DEFAULT_INSTRUCTIONS, DEFAULT_TOOLS, DEFAULT_CONTEXT, MIN_CONTEXT, MAX_CONTEXT, contextKey, estimateContext, modelContextLimit, type ToolChoices } from "$lib/assistant/configuration";
  import { OLLAMA_ADDRESS, OLLAMA_MODEL, ollamaAddress, discoverOllama, ollamaContextWindow,
    type OllamaModel, type ChatMessage, type ChatResult, type ChatImage } from "$lib/assistant/ollama";

  let { open = $bindable(false), availableWidth = 1000, stacked = false, reservedWidth = 560, vaultRevision = 0, savedWidth = 380, onwidthchange, showSendButton = false, enterAction = 'send', markdownRepository, instructions = DEFAULT_INSTRUCTIONS, tools = DEFAULT_TOOLS, modelContexts = {}, oncontextchange, editorSettings, gitRepository, skills = {} }: { open?: boolean; availableWidth?: number; stacked?: boolean; reservedWidth?: number; savedWidth?: number; onwidthchange?: (width: number) => void; vaultRevision?: number; showSendButton?: boolean; enterAction?: 'send' | 'newline'; markdownRepository?: MarkdownRepository | undefined; skills?: AISkills; instructions?: string; editorSettings?: SettingsToolContext; gitRepository?: GitToolContext | undefined; tools?: ToolChoices; modelContexts?: Record<string, number>; oncontextchange?: (key: string, limit: number) => void } = $props();
  type ConversationMessage = { id: number; content: string; images?: ChatImage[]; repository?: MarkdownRepository | undefined } & (
    { role: 'user'; sentAt: string; localTime: string } | { role: 'assistant' }
  );
  class Conversation {
    id: number;
    label = $state("");
    connectionId = $state(LOCAL_CONNECTION.id);
    provider = $state<AIProvider>("ollama");
    credentialId = $state("");
    address = $state(OLLAMA_ADDRESS);
    connectedAddress = $state("");
    model = $state("");
    models = $state.raw<OllamaModel[]>([]);
    harness: BrowserAgentHarness | undefined;
    usage = $state.raw<ContextUsage>();
    toolActivities = $state.raw<(ToolActivity & { messageId: number })[]>([]);
    messages = $state.raw<ConversationMessage[]>([]);
    modelLoading = $state(false);
    modelRequest: AbortController | undefined;
    connecting = $state(false);
    busy = $state(false);
    prompt = $state("");
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
  const heightTracker = createMessageHeightTracker(() => scroll(current)), retainMessageHeight = heightTracker.retain;
  function messageHeight(thread: Conversation, id: number): MessageHeight {
    let size = thread.heights.get(id);
    if (!size) { size = { width: 0, height: 0 }; thread.heights.set(id, size); }
    return size;
  }
  let threads = $state.raw([new Conversation(nextThread)]), selected = $state(1);
  let view = $state<"chat" | "connections">("chat");
  let connections = $state.raw<AIConnection[]>([LOCAL_CONNECTION]), keys = $state.raw<VaultKey[]>([]);
  let connectionToEdit = $state.raw<AIConnection>();
  let loaded = false;
  let browserModelsInstalled = $state<boolean>();
  const current = $derived(threads.find(thread => thread.id === selected)!);
  const missingBrowserModels = $derived(current.provider === "browser" && browserModelsInstalled === false);
  const interruption = $derived(current.failure || (current.status === "Output limit reached"
    ? "The model reached its output limit. The reply may be incomplete."
    : current.status === "Stopped" ? "Generation was stopped before the reply finished." : ""));
  const timingLabel = $derived(current.timing ? `${current.timing.firstResponse || '—'} / ${current.timing.duration}` : undefined);
  const visibleMessages = $derived(current.busy ? [...current.messages,
    { role: 'assistant' as const, content: current.liveText || '…', id: current.nextMessage + 1, repository: current.replyRepository }] : current.messages);
  let output = $state<HTMLDivElement>(), width = $state<number>(), attachmentInput = $state<HTMLInputElement>();
  const maximumWidth = $derived(Math.max(320, Math.min(640, availableWidth - reservedWidth)));
  const paneWidth = $derived(Math.min(width ?? savedWidth, maximumWidth));
  const modelMaximum = $derived(current.models.find(model => model.id === current.model)?.contextWindow);
  const contextCeiling = $derived(Math.min(modelMaximum ?? MAX_CONTEXT, MAX_CONTEXT));
  const tokenFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const contextLimit = $derived(modelContextLimit(modelContexts[contextKey(current.provider, current.model)], modelMaximum));
  const contextUsed = $derived(current.usage?.used ?? estimateContext({ instructions, messages: current.messages.map(({ role, content }) => ({ role, content })) }));
  const modelItems = $derived(current.models.map(entry => ({ value: entry.id, label: entry.label, icon: "network_intelligence" })));
  const connectionItems = $derived(connections.map(entry => ({ value: entry.id, label: entry.label, icon: "network_intel_node" })));
  async function refreshKeys() { try { const found = await readVaultKeys(); if (!disposed) keys = found.entries; } catch { /* The vault view reports storage errors on explicit actions. */ } }
  $effect(() => { vaultRevision; if (loaded) void refreshKeys(); });
  async function refreshConnections(connection?: AIConnection, removed?: string) {
    const found = await listAIConnections(); if (disposed) return; connections = found;
    if (connection) {
      for (const thread of threads) if (thread !== current && thread.connectionId === connection.id) configureThread(thread, connection);
      configureThread(current, connection); view = "chat";
    } else if (removed) {
      for (const thread of threads) if (thread.connectionId === removed) configureThread(thread, found[0]!);
    } else {
      for (const thread of threads) if (thread.connectionId === LOCAL_CONNECTION.id && !thread.connectedAddress && !thread.connecting) configureThread(thread, found[0]!);
    }
  }
  function openConnections() {
    connectionToEdit = connections.find(connection => connection.id === current.connectionId);
    view = "connections";
  }
  function configureThread(thread: Conversation, connection: AIConnection) {
    thread.modelRequest?.abort(); thread.modelLoading = false;
    thread.turn?.abort(); thread.connectRequest?.abort(); thread.epoch++; flush(thread);
    finishReply(thread);
    thread.liveText = ""; thread.busy = false; thread.connecting = false; thread.turn = undefined; thread.connectRequest = undefined;
    thread.connectionId = connection.id; thread.provider = connection.provider; thread.credentialId = connection.credentialId;
    thread.harness = undefined; thread.usage = undefined; thread.attachment = undefined;
    thread.address = connection.address; thread.connectedAddress = ""; thread.models = []; thread.model = ""; thread.failure = ""; thread.status = ""; thread.timing = undefined;
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
    selected = thread.id; view = "chat"; flush(thread); restore(thread, focus);
  }
  function addThread() {
    const thread = new Conversation(++nextThread);
    // Suggest the current configuration, but let each new session connect independently.
    thread.address = current.address;
    thread.connectionId = current.connectionId; thread.provider = current.provider; thread.credentialId = current.credentialId;
    threads = [...threads, thread]; selectThread(thread, true);
  }
  function disposeThread(thread: Conversation) {
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
      ? thread.provider === 'browser' ? 'Browser inference failed. Check the model installation and browser compatibility in Connections.' : thread.provider === "ollama" ? `Could not reach Ollama. Check the runtime URL, browser local-network permission and OLLAMA_ORIGINS for ${location.origin}.` : "Could not reach OpenAI. Check browser access and the saved API key."
      : error instanceof Error ? error.message : "AI request failed.";
  }
  async function selectModel(thread: Conversation, model: string) {
    thread.modelRequest?.abort(); thread.model = model; thread.usage = undefined;
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
    if (!file || thread.busy || thread.provider !== 'browser') return;
    const epoch = thread.epoch;
    try {
      const { prepareImage } = await import('$lib/assistant/browser/images');
      const { readModelSettings } = await import('$lib/assistant/browser/storage');
      const { profileById } = await import('$lib/assistant/browser/catalog');
      const { defaultSettings } = await import('$lib/assistant/browser/reference/settings.js');
      const saved = await readModelSettings(thread.model), generation = defaultSettings(profileById(thread.model), saved.generation as Record<string, unknown> | undefined);
      const image = await prepareImage(file, Number(generation.image_max_pixels));
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
      const found = browser ? await browser.discoverBrowserModels() : thread.provider === "ollama" ? await discoverOllama(origin, signal)
        : await openAIRequest({ action: "models", credentialId: thread.credentialId }, signal) as OllamaModel[];
      if (disposed || !thread.alive || controller.signal.aborted) return;
      if (!found.length) {
        if (thread.provider === "browser") return;
        throw new Error('No models are available from this connection.');
      }
      thread.models = found; thread.connectedAddress = origin;
      thread.model = found.find(entry => entry.id === previousModel)?.id ?? found.find(entry => entry.id === (thread.provider === "ollama" ? OLLAMA_MODEL : "gpt-5.4-mini"))?.id
        ?? found.find(entry => thread.provider === "ollama" ? /^ornith:9b/i.test(entry.id) : /^gpt-/i.test(entry.id))?.id ?? found[0]!.id;
      await selectModel(thread, thread.model);
    } catch (error) { if (!disposed && thread.alive && !controller.signal.aborted) thread.failure = explain(error, thread); }
    finally { if (thread.connectRequest === controller) { thread.connecting = false; thread.connectRequest = undefined; } }
  }
  async function send(thread: Conversation) {
    if (thread.busy || thread.connecting || thread.modelLoading || (!thread.prompt.trim() && !thread.attachment) || !thread.models.some(entry => entry.id === thread.model) || !thread.connectedAddress) return;
    const input = thread.prompt.trim() || "Describe this image.", images = thread.provider === "browser" && thread.attachment ? [thread.attachment] : [], controller = new AbortController(), request = ++thread.epoch;
    const conversation: ChatMessage[] = [...thread.messages.map(({ role, content, images }) => ({ role, content, ...(thread.provider === "browser" && images?.length ? { images } : {}) })), { role: "user", content: input, ...(images.length ? { images } : {}) }];
    if (conversation.length > (thread.provider !== "openai" ? 256 : 32) || conversation.reduce((sum, message) => sum + message.content.length, 0) > (thread.provider !== "openai" ? 1048576 : 10000)) {
      thread.failure = "This conversation is full. Start a new chat to continue."; thread.timing = undefined; return;
    }
    const sentAt = new Date();
    thread.replyRepository = markdownRepository;
    const requestInstructions = instructions, requestToolChoices = { ...tools }, requestRepository = markdownRepository;
    const requestGit = gitRepository;
    const requestSkills = $state.snapshot(skills);
    const requestSettings = editorSettings ? $state.snapshot(editorSettings) : undefined;
    const requestContext = modelContextLimit(modelContexts[contextKey(thread.provider, thread.model)], thread.models.find(entry => entry.id === thread.model)?.contextWindow);
    thread.messages = [...thread.messages, { role: "user", content: input, id: ++thread.nextMessage,
      ...(images.length ? { images } : {}), sentAt: sentAt.toISOString(), localTime: sentAt.toLocaleString(), repository: markdownRepository }];
    thread.prompt = ""; thread.attachment = undefined; thread.liveText = ""; thread.chunks = []; thread.busy = true; thread.failure = "";
    thread.status = "Generating…"; thread.follow = true; thread.turn = controller;
    thread.startedAt = performance.now();
    thread.firstResponse = ''; thread.timing = undefined;
    void tick().then(() => scroll(thread));
    try {
      const local = thread.provider === 'browser' ? await import('$lib/assistant/browser/runtime') : undefined;
      const localProfile = local ? await local.configuredBrowserProfile(thread.model) : undefined;
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
      const usageChanged = (usage: ContextUsage) => { if (thread.alive && thread.epoch === request && !signal.aborted) thread.usage = usage; };
      if (local) await local.loadBrowserModel(thread.model, progress => { if (thread.alive && thread.epoch === request) thread.status = progress.message; }, signal, requestContext);
      signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Number(localProfile?.settings.chat_timeout_ms ?? 300000))]);
      const runAgent = () => thread.harness!.run(
        local ? local.browserPlugin(thread.model, usageChanged) : ollamaPlugin(thread.connectedAddress, usageChanged),
        thread.model, conversation, signal, delta, { instructions: requestInstructions, skills: requestSkills, contextWindow: requestContext, tools: requestTools,
          onUsage: usageChanged,
          ...(localProfile ? { maxModelTurns: Number(localProfile.settings.max_model_turns), maxToolCalls: Number(localProfile.settings.max_tool_calls) } : {}),
          onTool: activity => {
            if (!thread.alive || thread.epoch !== request || signal.aborted) return;
            const previous = thread.toolActivities.findIndex(item => item.id === activity.id);
            thread.toolActivities = previous === -1 ? [...thread.toolActivities.slice(-191), { ...activity, messageId: thread.nextMessage }]
              : thread.toolActivities.map((item, index) => index === previous ? { ...activity, messageId: item.messageId } : item);
            void tick().then(() => scroll(thread));
          },
        });
      const result = thread.provider !== "openai" ? local ? await local.runBrowserTurn(runAgent) : await runAgent() : await openAIRequest({ action: "chat", credentialId: thread.credentialId, model: thread.model, messages: conversation, instructions: requestInstructions, contextWindow: requestContext }, signal, delta) as ChatResult;
      if (thread.alive && thread.epoch === request && thread.provider === "openai" && result.inputTokens !== undefined) thread.usage = { used: result.inputTokens + result.tokens, measured: true };
      if (thread.alive && thread.epoch === request && !disposed) thread.status = result.reason === "length" ? "Output limit reached" : "Completed";
    } catch (error) {
      if (thread.alive && thread.epoch === request && !disposed) {
        if (controller.signal.aborted) thread.status = "Stopped";
        else { thread.failure = explain(error, thread); thread.status = ""; }
      }
    } finally {
      if (thread.alive && thread.epoch === request && !disposed) {
        flush(thread);
        finishReply(thread);
        thread.toolActivities = thread.toolActivities.map(activity => activity.status === 'running' ? { ...activity, status: 'failed', result: 'Tool interrupted.' } : activity);
        thread.liveText = ""; thread.busy = false; thread.turn = undefined;
      }
    }
  }
  $effect(() => {
    if (!open) for (const thread of threads) { thread.turn?.abort(); thread.connectRequest?.abort(); thread.modelRequest?.abort(); }
    else {
      if (!loaded) { loaded = true; void refreshConnections().then(refreshKeys).catch(() => { loaded = false; }); }
      if (output) restore(current);
    }
  });
  $effect(() => {
    if (!open || current.provider !== "browser") return;
    let cancelled = false, revision = 0, unsubscribe: (() => void) | undefined;
    browserModelsInstalled = undefined;
    void import('$lib/assistant/browser/storage').then(storage => {
      if (cancelled) return;
      async function refresh() {
        const request = ++revision;
        try {
          const installed = await storage.installedModels();
          if (!cancelled && request === revision) browserModelsInstalled = installed.length > 0;
        } catch {
          // Unknown storage state is not evidence of a missing model; Connect reports storage failures.
          if (!cancelled && request === revision) browserModelsInstalled = undefined;
        }
      }
      unsubscribe = storage.subscribeModels(() => void refresh());
      void refresh();
    }).catch(() => { /* Connect reports module loading failures. */ });
    return () => { cancelled = true; unsubscribe?.(); };
  });
  onDestroy(() => { disposed = true; unsubscribeLock(); heightTracker.destroy(); for (const thread of threads) disposeThread(thread); });
</script>

<Sheet.Pane bind:open docked={stacked || availableWidth >= 1000} width={paneWidth} label="AI">
  {#snippet divider(moving: boolean)}<WidthDivider edge="left" label="Resize AI pane" minimum={320} maximum={maximumWidth} disabled={moving || stacked}
    onstart={() => {}} onpreview={value => width = value} onend={value => { width = undefined; if (value !== undefined) onwidthchange?.(value); }} />{/snippet}
  <div class="ollama-panel" data-ollama-panel data-layout={stacked || availableWidth >= 1000 ? "docked" : "overlay"}>
    <header class="pane-header">
      <div class="pane-title"><MaterialIcon name="robot" size={16} /><h2 tabindex="-1" data-pane-heading>AI</h2></div>
    </header>
    <div class="pane-toolbar">
      <div class="pane-tools"><Button variant="ghost" size="icon-sm" aria-label="AI connections" aria-pressed={view === "connections"} tooltip="Connections" tooltipSide="right" onclick={() => { if (view === "connections") view = "chat"; else openConnections(); }}><MaterialIcon name="hub" size={18} /></Button></div>
      <Button variant="ghost" size="icon-sm" aria-label="Close AI" tooltip="Close AI" tooltipSide="left" onclick={() => open = false}><MaterialIcon name="close" size={18} /></Button>
    </div>
    <div class="conversation-tabs">
      <div class="tab-list" role="tablist" aria-label="AI conversations" onwheel={scrollTabs}>
        {#each threads as thread (thread.id)}
          <SessionTab id={thread.id} label={thread.label} selected={selected === thread.id} busy={thread.busy}
            onselect={() => selectThread(thread)} onclose={() => closeThread(thread)} onrename={label => thread.label = label}
            onkeydown={event => tabKey(event, thread)} />
        {/each}
      </div>
      <Button variant="ghost" size="icon-sm" class="tab-add" aria-label="New chat" tooltip="New conversation" tooltipSide="left" onclick={addThread}><MaterialIcon name="add" size={18} /></Button>
    </div>
    {#if view === "connections"}<ConnectionsView {connections} {keys} initialConnection={connectionToEdit} onchange={refreshConnections} onselect={connection => { configureThread(current, connection); view = "chat"; }} />
    {:else}
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
      <div class="conversation-actions"><span role="status" aria-label="AI status" class="sr-only">{current.status}</span>
        {#if current.failure}<span role="alert" class="sr-only">{current.failure}</span>{/if}
        {#if current.busy}<Button type="button" variant="ghost" size="icon-sm" class="generation-stop" aria-label="Stop generating" onclick={() => current.turn?.abort()}><span class="generation-symbol"><span class="generation-orbit"><svg class="generation-ring" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="47 10" /><circle cx="12" cy="12" r="5.5" fill="currentColor" /></svg></span><span class="generation-stop-symbol"><span class="generation-stop-mark" aria-hidden="true"></span></span></span></Button>
        {:else if interruption}<HintButton passive plain class="result-indicator interruption-indicator" role="img" aria-label="AI interruption" label={interruption} rightLabel={timingLabel} rightLabelContent={generationTiming}><MaterialIcon name="skull" size={20} /></HintButton>
        {:else if current.status === "Completed"}<HintButton passive plain class="result-indicator completion-indicator" role="img" aria-label="AI completion" label="Generation completed" rightLabel={timingLabel} rightLabelContent={generationTiming}><MaterialIcon name="verified" size={20} /></HintButton>{/if}
        {#if !current.busy && showSendButton && current.connectedAddress}<Button type="button" size="sm" class="conversation-send" disabled={!current.connectedAddress || (!current.prompt.trim() && !current.attachment) || current.connecting} onclick={() => void send(current)}><MaterialIcon name="send" size={16} />Send</Button>{/if}
      </div>
    </div>
    {#if missingBrowserModels}
      <div class="connection-notice" role="status" aria-label="Browser model installation">
        <MaterialIcon name="skull" size={20} />
        <p>Install a model in Connections → Browser models, then connect again.</p>
      </div>
    {/if}
    {#if current.connectedAddress}
    <form class="composer" class:browser-composer={current.provider === 'browser'} onsubmit={event => { event.preventDefault(); void send(current); }}>
      <div class="model-choice"><NavigationDropdown label="AI model" side="top" value={current.model} placeholder="Choose a model" placeholderIcon="network_intelligence" items={modelItems} disabled={current.busy || current.connecting}
        onchange={value => { void selectModel(current, value); }} />
        <div class="context-meter"><span title={current.usage?.measured ? "Runtime tokens in the last request and reply. New messages and tools add to the next request." : "Estimated tokens; exact counts become available after the runtime responds."}>{current.usage?.measured ? '' : '≈'}{contextUsed.toLocaleString()} /</span><span class="context-limit"><span class="context-limit-display" aria-hidden="true">{tokenFormat.format(contextLimit).toLowerCase()}</span><input aria-label="Model context limit" title={current.provider === "browser" ? `Configured runtime context: ${modelMaximum?.toLocaleString()} tokens. Change it in Browser model settings.` : modelMaximum ? `Model maximum: ${modelMaximum.toLocaleString()} tokens` : "Model maximum unavailable; configured context budget"} type="number" min={Math.min(MIN_CONTEXT, contextCeiling)} max={contextCeiling} step="1024" value={contextLimit} disabled={current.busy || current.connecting || current.modelLoading} onchange={event => { const limit = event.currentTarget.valueAsNumber; if (Number.isFinite(limit)) oncontextchange?.(contextKey(current.provider, current.model), Math.max(Math.min(MIN_CONTEXT, contextCeiling), Math.min(contextCeiling, Math.round(limit)))); }} /></span></div></div>
      <MarkdownComposer value={current.prompt} {enterAction} disabled={!current.connectedAddress || current.busy || current.connecting || current.modelLoading}
        onchange={value => current.prompt = value} onsend={() => void send(current)} />
      {#if current.provider === 'browser'}
      {#if current.attachment}<div class="image-preview"><img class="attached-image" alt="Ready to send" src={`data:${current.attachment.mimeType};base64,${current.attachment.data}`} /><Button variant="secondary" size="sm" disabled={current.busy} onclick={() => current.attachment = undefined}>Remove image</Button></div>{/if}
      <div class="browser-model-controls">
        <input bind:this={attachmentInput} hidden type="file" aria-label="Attach image" accept="image/png,image/jpeg,image/webp" disabled={current.busy || current.connecting} onchange={event => { void attachImage(current, event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
        <Button variant="ghost" size="sm" class="attach-image" disabled={current.busy || current.connecting} onclick={() => attachmentInput?.click()}><MaterialIcon name="attach_file" size={16} />Attach image</Button>
      </div>
      {/if}
    </form>
    {:else}
    <div class="connection-setup">
      {@render connectionControls()}
    </div>
    {/if}
    </div>
    {/key}
    {/if}
  </div>
</Sheet.Pane>

<style>
  .attached-image { max-width:100%; max-height:200px; object-fit:contain; display:block; }
  .browser-model-controls { display:flex; align-items:center; min-width:0; height:32px; padding-inline:10px; border:2px solid var(--color-surface); border-top:0; border-radius:0 0 4px 4px; }
  .browser-model-controls :global(.attach-image) { justify-content:flex-start; padding:6px 0; gap:7px; height:100%; font-size:.6875rem; font-weight:400; }
  .image-preview { display:flex; gap:8px; align-items:center; padding:8px; background:var(--color-surface); }
  .ollama-panel { --ollama-divider: color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; background: var(--color-background); color: var(--color-foreground); font-size: .75rem; }
  .ollama-panel[data-layout="docked"] { border-left: 2px solid var(--ollama-divider); }
  .pane-header { height: var(--workbench-header-height, 48px); flex: 0 0 var(--workbench-header-height, 48px); display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; }
  .pane-title { display: flex; align-items: center; gap: 9px; }h2 { margin: 0; font-size: .6875rem; font-weight: 700; }
  .pane-toolbar { height: 40px; flex: 0 0 40px; padding: 4px 12px 4px calc(20px - 1rem); display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--color-toolbar-background); color: var(--color-toolbar-foreground); }
  .pane-tools { display: flex; flex-shrink: 0; gap: 2px; }.connection-choice { display: flex; align-items: center; gap: 8px; min-width: 0; }.provider-detail { flex: 1; min-width: 0; }small { display: block; opacity: .6; font-size: .625rem; margin-top: 5px; overflow-wrap: anywhere; }
  .conversation-tabs { display: flex; min-width: 0; height: var(--workbench-tabs-height, 40px); flex: 0 0 var(--workbench-tabs-height, 40px); border-block: 2px solid var(--ollama-divider); background: var(--color-surface); }
  .tab-list { display: flex; flex: 1; min-width: 0; align-items: flex-start; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
  .conversation-tabs :global(.tab-add) { height: var(--workbench-tabs-content-height, 36px); width: 32px; flex: 0 0 32px; margin-right: 12px; border-radius: 0; }
  .conversation-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; flex: 1; }
  .connection { margin: 16px 16px 0; padding: 14px; background: var(--color-surface); border-radius: 4px; display: grid; gap: 12px; }
  .connection-row { display: flex; gap: 8px; align-items: center; }
  .messages { min-width: 0; min-height: 0; flex: 1; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .messages::-webkit-scrollbar { display: none; }
  .connection-notice { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 0 16px 12px; }
  .connection-notice p { margin: 0; min-width: 0; line-height: 1.6; overflow-wrap: anywhere; }
  .messages:has(:global(.result-indicator)) { padding-bottom: 8px; }
  .message { min-width: 0; flex: 0 0 auto; box-sizing: border-box; width: 100%; padding: 12px; border-radius: 4px; background: var(--color-surface); }.question { text-align: right; background: color-mix(in srgb, var(--color-surface) 45%, var(--color-background)); }
  .speaker { display: block; margin-bottom: 7px; opacity: .65; font-size: .625rem; }.message-text { min-width: 0; overflow: clip; overflow-wrap: anywhere; line-height: 1.65; transition: block-size 150ms ease-out; }
  .message-text:global([data-height-reflow]) { transition: none; }
  .message-content { display: flow-root; min-width: 0; }
  .composer, .connection-setup { padding: 0 16px 16px; display: grid; gap: 10px; }
  .composer { position: relative; z-index: 1; gap: 0; padding-top: 4px; background: var(--color-background); }
  .composer :global(.markdown-composer) { background: var(--color-surface); border-radius: 0 0 4px 4px; }
  .browser-composer :global(.markdown-composer), .browser-composer :global(.markdown-composer .cm-editor) { border-radius: 0; }
  .connection-setup .connection { margin: 0; }
  .model-choice { position: relative; display: flex; align-items: center; min-width: 0; height: 32px; padding-inline: 10px; border: 2px solid var(--color-surface); border-bottom: 0; border-radius: 4px 4px 0 0; }
  .model-choice :global(.navigation-trigger) { font-weight: 400; flex: 1; }
  .context-meter { display: flex; align-items: center; flex-shrink: 0; gap: 4px; margin-left: 8px; font-size: .625rem; font-variant-numeric: tabular-nums; }
  .context-limit { display: grid; align-items: center; }
  .context-limit-display, .context-limit input { grid-area: 1 / 1; }
  .context-limit-display { pointer-events: none; padding: 2px; }
  .context-limit:not(:focus-within) input { color: transparent; }
  .context-limit:focus-within .context-limit-display { visibility: hidden; }
  .context-meter input { width: 6ch; padding: 2px; border: 0; border-radius: 2px; background: transparent; color: inherit; font: inherit; appearance: textfield; }
  .context-meter input::-webkit-inner-spin-button { appearance: none; }
  .context-meter input:focus-visible { outline: none; background: var(--color-surface); }
  .tool-activity { flex: 0 0 auto; min-width: 0; padding: 8px 12px; border-radius: 4px; background: var(--color-surface); font-size: .6875rem; }
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

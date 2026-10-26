<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import BrowserModels from "./BrowserModels.svelte";
  import { BROWSER_PROFILES, VISION_PROFILES, DECISION_PROFILES } from "$lib/assistant/browser/catalog";
  import SpeechSettings from './SpeechSettings.svelte';
  import { BROWSER_CONNECTIONS, isBrowserConnection, OPENAI_ADDRESS, listAIConnections, saveAIConnection, removeAIConnection, type AIConnection, type AIProvider } from "$lib/assistant/connections";
  import { OLLAMA_ADDRESS } from "$lib/assistant/ollama";
  import { readVaultKeys } from "$lib/secrets/client";
  import type { VaultKey } from "$lib/secrets/types";
  let { vaultRevision = 0, initialConnection, onchange, onselect }: { vaultRevision?: number; initialConnection?: AIConnection | undefined;
    onchange(connection?: AIConnection, removed?: string): Promise<void>; onselect(connection: AIConnection): void } = $props();
  let connections = $state.raw<AIConnection[]>([...BROWSER_CONNECTIONS]), keys = $state.raw<VaultKey[]>([]);
  let disposed = false;
  let view = $state<HTMLDivElement>();
  let editing = $state(""), label = $state(""), provider = $state<AIProvider>("ollama"), address = $state(OLLAMA_ADDRESS), credentialId = $state("");
  let busy = $state(false), failure = $state("");
  let formOpen = $state(false), formTrigger: HTMLElement | undefined;
  const providers = [{ value: "ollama", label: "Ollama", icon: "memory" }, { value: "openai", label: "OpenAI", icon: "cloud" }];
  const keyItems = $derived(keys.map(key => ({ value: key.id, label: key.label, icon: "key" })));
  function reset() { editing = ""; label = ""; provider = "ollama"; address = OLLAMA_ADDRESS; credentialId = ""; failure = ""; }
  function populate(connection: AIConnection) { editing = connection.id; label = connection.label; provider = connection.provider; address = connection.address; credentialId = connection.credentialId; failure = ""; }
  function create(event: MouseEvent) { reset(); formTrigger = event.currentTarget as HTMLElement; formOpen = true; }
  function edit(connection: AIConnection, event: MouseEvent) { populate(connection); formTrigger = event.currentTarget as HTMLElement; formOpen = true; }
  function close() { if (!busy) { formOpen = false; failure = ""; } }
  function openSpeechSettings() {
    const target = view?.querySelector<HTMLElement>('[aria-label="Speech input settings"]');
    target?.scrollIntoView({ block: "start" });
    target?.querySelector<HTMLElement>("h4")?.focus({ preventScroll: true });
  }
  $effect(() => { if (initialConnection && initialConnection.provider !== "browser") populate(initialConnection); else reset(); });
  async function refresh() { const found = await listAIConnections(); if (!disposed) connections = found; }
  onMount(() => { void refresh().catch(() => failure = "Could not load saved connections."); return () => { disposed = true; }; });
  $effect(() => {
    vaultRevision;
    let cancelled = false;
    void readVaultKeys().then(found => { if (!cancelled) keys = found.entries; }).catch(() => { if (!cancelled) keys = []; });
    return () => { cancelled = true; };
  });
  async function save() {
    if (busy) return; busy = true; failure = "";
    try { const connection = await saveAIConnection({ id: editing || crypto.randomUUID(), label, provider, address: provider === "openai" ? OPENAI_ADDRESS : address, credentialId }); await refresh(); await onchange(connection); formOpen = false; failure = ""; }
    catch (error) { failure = error instanceof Error ? error.message : "Could not save the connection."; } finally { busy = false; }
  }
  async function remove(id: string) {
    if (busy) return; busy = true; failure = "";
    try { await removeAIConnection(id); await refresh(); await onchange(undefined, id); if (editing === id) reset(); }
    catch { failure = "Could not remove the connection."; } finally { busy = false; }
  }
</script>
<div class="connections-view" role="region" aria-label="AI connections" bind:this={view}>
  {#if failure && !formOpen}<p role="alert" class="failure">{failure}</p>{/if}
  <section class="card"><div class="card-heading"><h4 tabindex="-1"><MaterialIcon name="hub" size={20} />Inference engines</h4><Button variant="ghost" size="icon" tooltip="New connection" aria-label="New connection" disabled={busy} onclick={create}><MaterialIcon name="add_link" size={18} /></Button></div>
    {#each connections as connection (connection.id)}<div class="connection-entry">
      <Button variant="ghost" class="connection-name" aria-label={`Use ${connection.label}`} tooltip={connection.label} onclick={() => onselect(connection)}><MaterialIcon name={connection.provider === "openai" ? "cloud" : "memory"} size={16} /><span class="connection-label"><span class="connection-title">{connection.label}</span><small>{connection.provider === "openai" ? "OpenAI" : connection.provider === "browser" ? "Browser" : "Ollama"}</small></span></Button>
      {#if !isBrowserConnection(connection.id)}
      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${connection.label}`} tooltip="Edit connection" disabled={busy} onclick={event => edit(connection, event)}><MaterialIcon name="edit" size={16} /></Button>
      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${connection.label}`} tooltip="Remove connection" disabled={busy} onclick={() => void remove(connection.id)}><MaterialIcon name="delete" size={16} /></Button>{/if}
    </div>{/each}
    <div class="connection-entry">
      <Button variant="ghost" class="connection-name" aria-label="Configure ONNX Runtime Web speech inference" tooltip="ONNX Runtime Web" onclick={openSpeechSettings}><MaterialIcon name="memory" size={16}/><span class="connection-label"><span class="connection-title">ONNX Runtime Web</span><small>Browser · Speech</small></span></Button>
    </div>
  </section>
  <section class="card" aria-label="LLM">
    <div class="card-heading"><h4><MaterialIcon name="network_intelligence" size={20}/>LLM</h4></div>
    {#each BROWSER_PROFILES as profile (profile.id)}<BrowserModels modelId={profile.id} />{/each}
  </section>
  <section class="card" aria-label="Vision">
    <div class="card-heading"><h4><MaterialIcon name="image" size={20}/>Vision</h4></div>
    {#each VISION_PROFILES as profile (profile.id)}<BrowserModels modelId={profile.id} />{/each}
  </section>
  <section class="card" aria-label="Decision models">
    <div class="card-heading"><h4><MaterialIcon name="account_tree" size={20}/>Decision models</h4></div>
    {#each DECISION_PROFILES as profile (profile.id)}<BrowserModels modelId={profile.id} />{/each}
  </section>
  <SpeechSettings />
</div>
<Dialog.Root bind:open={() => formOpen, next => { if (next) formOpen = true; else close(); }}>
  <Dialog.Content onCloseAutoFocus={event => { event.preventDefault(); if (formTrigger?.isConnected) formTrigger.focus({ preventScroll: true }); }}>
    <Dialog.Header><Dialog.Title>Remote inference connection</Dialog.Title></Dialog.Header>
    {#if failure}<p role="alert" class="failure">{failure}</p>{/if}
  <form class="connection-form" onsubmit={event => { event.preventDefault(); void save(); }}>
    <div><label for="ai-provider">Provider</label><NavigationDropdown id="ai-provider" label="Connection provider" value={provider} placeholder="Choose provider" items={providers} disabled={busy} onchange={value => { provider = value as AIProvider; address = value === "openai" ? OPENAI_ADDRESS : OLLAMA_ADDRESS; }} /></div>
    <label>Name<input aria-label="Connection name" bind:value={label} required maxlength="100" autocomplete="off" disabled={busy} /></label>
    {#if provider === "ollama"}<label>Runtime URL<input aria-label="Connection runtime URL" bind:value={address} type="url" required spellcheck="false" autocomplete="off" disabled={busy} /></label>
    {:else}<p class="hint">OpenAI API · api.openai.com</p>
      <div><label for="connection-vault-key">API key</label><NavigationDropdown id="connection-vault-key" label="Saved vault key" value={credentialId} placeholder="Choose a guarded value" items={keyItems} disabled={busy} onchange={value => credentialId = value} /></div>
      <p class="hint">Manage guarded values in Vault from the page menu.</p>
    {/if}
    <div class="actions"><Button variant="ghost" disabled={busy} onclick={close}>Cancel</Button><Button type="submit" variant="ghost" disabled={busy || provider === "openai" && !credentialId}>Save connection<MaterialIcon name="save" size={16} /></Button></div>
  </form>
  </Dialog.Content>
</Dialog.Root>
<style>
  .connections-view { display: grid; gap: var(--pane-gap); min-width: 0; }h4 { margin: 0; font-size: .75rem; display: flex; align-items: center; gap: 8px; }
  .card { display: grid; gap: 12px; padding: var(--pane-padding); border-radius: 4px; background: var(--color-surface); }label { display: block; font-size: .6875rem; margin-bottom: 6px; }input { display: block; width: 100%; min-width: 0; padding: 9px 11px; background: var(--color-background); color: inherit; border: 0; border-radius: 4px; font: inherit; margin-top: 6px; }
  h4 { font-weight: 700; }
  .connection-form { display:grid; gap:12px; min-width:0; }
  .connection-form input { height:36px; }
  .connection-form :global(.navigation-trigger) { min-height:36px; background:var(--color-background); padding:8px 10px; }
  .connection-form :global(.navigation-trigger > .material-symbols-rounded:last-child) { margin-left:auto; }
  .connection-form .actions :global(button) { --control-hover-foreground:var(--color-hover-foreground); background:var(--color-background); color:var(--color-foreground); font-size:.6875rem; font-weight:700; }
  .connection-form .actions :global(button[type="submit"]) { margin-inline-start:auto; }
  .card-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .card :global(.navigation-trigger) { background: var(--color-background); padding: 8px 10px; }.connection-entry { display: flex; align-items: center; gap: 4px; min-width: 0; }.connection-entry :global(.connection-name) { flex: 1; min-width: 0; justify-content: flex-start; padding: 8px; height: 36px; text-align: left; font-size: .75rem; }
  .connection-label { display:flex; align-items:center; gap:8px; min-width:0; }
  .connection-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  small { flex-shrink:0; white-space:nowrap; opacity:.6; font-size:.625rem; }
  .hint { margin: 0; opacity: .65; line-height: 1.6; font-size: .6875rem; }.actions { display: flex; gap: 8px; flex-wrap: wrap; }.failure { padding: 12px; margin: 0; background: var(--color-error-background); color: var(--color-error-foreground); border-radius: 4px; }
</style>

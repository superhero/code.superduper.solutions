<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import BrowserModels from "./BrowserModels.svelte";
  import { LOCAL_CONNECTION, BROWSER_CONNECTION, OPENAI_ADDRESS, saveAIConnection, removeAIConnection, type AIConnection, type AIProvider } from "$lib/assistant/connections";
  import type { VaultKey } from "$lib/secrets/types";
  let { connections, keys, initialConnection, onchange, onselect }: { connections: AIConnection[]; keys: VaultKey[]; initialConnection?: AIConnection | undefined;
    onchange(connection?: AIConnection, removed?: string): Promise<void>; onselect(connection: AIConnection): void } = $props();
  let editing = $state(""), label = $state(""), provider = $state<AIProvider>("ollama"), address = $state(LOCAL_CONNECTION.address), credentialId = $state("");
  let busy = $state(false), failure = $state("");
  const providers = [{ value: "ollama", label: "Ollama", icon: "memory" }, { value: "openai", label: "OpenAI", icon: "cloud" }];
  const keyItems = $derived(keys.map(key => ({ value: key.id, label: key.label, icon: "key" })));
  function reset() { editing = ""; label = ""; provider = "ollama"; address = LOCAL_CONNECTION.address; credentialId = ""; failure = ""; }
  function edit(connection: AIConnection) { editing = connection.id; label = connection.label; provider = connection.provider; address = connection.address; credentialId = connection.credentialId; failure = ""; }
  $effect(() => { if (initialConnection && initialConnection.provider !== "browser") edit(initialConnection); });
  async function save() {
    if (busy) return; busy = true; failure = "";
    try { const connection = await saveAIConnection({ id: editing || crypto.randomUUID(), label, provider, address: provider === "openai" ? OPENAI_ADDRESS : address, credentialId }); await onchange(connection); reset(); }
    catch (error) { failure = error instanceof Error ? error.message : "Could not save the connection."; } finally { busy = false; }
  }
  async function remove(id: string) {
    if (busy) return; busy = true; failure = "";
    try { await removeAIConnection(id); await onchange(undefined, id); if (editing === id) reset(); }
    catch { failure = "Could not remove the connection."; } finally { busy = false; }
  }
</script>
<div class="connections-view" role="region" aria-label="AI connections">
  <h3><MaterialIcon name="hub" size={18} />Connections</h3>
  {#if failure}<p role="alert" class="failure">{failure}</p>{/if}
  <section class="card"><div class="card-heading"><h4>Saved connections</h4><Button variant="ghost" size="sm" disabled={busy} onclick={reset}><MaterialIcon name="add" size={16} />New connection</Button></div>
    {#each connections as connection (connection.id)}<div class="connection-entry">
      <Button variant="ghost" class="connection-name" aria-label={`Use ${connection.label}`} onclick={() => onselect(connection)}><MaterialIcon name={connection.provider === "openai" ? "cloud" : "memory"} size={16} /><span>{connection.label}<small>{connection.provider === "openai" ? "OpenAI" : connection.provider === "browser" ? "On this device" : "Ollama"}</small></span></Button>
      {#if connection.id !== BROWSER_CONNECTION.id}
      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${connection.label}`} tooltip="Edit connection" disabled={busy} onclick={() => edit(connection)}><MaterialIcon name="edit" size={16} /></Button>
      {#if connection.id !== LOCAL_CONNECTION.id}
      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${connection.label}`} tooltip="Remove connection" disabled={busy} onclick={() => void remove(connection.id)}><MaterialIcon name="delete" size={16} /></Button>{/if}
      {/if}
    </div>{/each}
  </section>
  <BrowserModels />
  <form class="card" onsubmit={event => { event.preventDefault(); void save(); }}><h4>{editing ? "Edit connection" : "New connection"}</h4>
    <label>Name<input aria-label="Connection name" bind:value={label} required maxlength="100" autocomplete="off" disabled={busy} /></label>
    <div><label for="ai-provider">Provider</label><NavigationDropdown id="ai-provider" label="Connection provider" value={provider} placeholder="Choose provider" items={providers} disabled={busy} onchange={value => { provider = value as AIProvider; address = value === "openai" ? OPENAI_ADDRESS : LOCAL_CONNECTION.address; }} /></div>
    {#if provider === "ollama"}<label>Runtime URL<input aria-label="Connection runtime URL" bind:value={address} type="url" required spellcheck="false" autocomplete="off" disabled={busy} /></label>
    {:else}<p class="hint">OpenAI API · api.openai.com</p>
      <div><label for="connection-vault-key">API key</label><NavigationDropdown id="connection-vault-key" label="Saved vault key" value={credentialId} placeholder="Choose a guarded value" items={keyItems} disabled={busy} onchange={value => credentialId = value} /></div>
      <p class="hint">Manage guarded values in Vault from the page menu.</p>
    {/if}
    <div class="actions"><Button type="submit" disabled={busy || provider === "openai" && !credentialId}>Save connection<MaterialIcon name="save" size={16} /></Button>{#if editing}<Button variant="ghost" onclick={reset}>Cancel</Button>{/if}</div>
  </form>
</div>
<style>
  .connections-view { flex: 1; display: flex; flex-direction: column; gap: 16px; padding: 16px; min-height: 0; overflow: auto; overscroll-behavior: contain; }.card { flex-shrink: 0; }h3 { margin: 0; font-size: .875rem; display: flex; align-items: center; gap: 8px; }h4 { margin: 0; font-size: .75rem; }
  .card { display: grid; gap: 12px; padding: 16px; border-radius: 4px; background: var(--color-surface); }label { display: block; font-size: .6875rem; margin-bottom: 6px; }input { display: block; width: 100%; min-width: 0; padding: 9px 11px; background: var(--color-background); color: inherit; border: 0; border-radius: 4px; font: inherit; margin-top: 6px; }
  h3, h4 { font-weight: 700; }
  .card-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .card :global(.navigation-trigger) { background: var(--color-background); padding: 8px 10px; }.connection-entry { display: flex; align-items: center; gap: 4px; min-width: 0; }.connection-entry :global(.connection-name) { flex: 1; min-width: 0; justify-content: flex-start; padding: 8px; height: auto; text-align: left; font-size: .75rem; }:global(.connection-name) span { overflow-wrap: anywhere; white-space: normal; }small { display: block; opacity: .6; font-size: .625rem; margin-top: 3px; }.hint { margin: 0; opacity: .65; line-height: 1.6; font-size: .6875rem; }.actions { display: flex; gap: 8px; flex-wrap: wrap; }.failure { padding: 12px; margin: 0; background: var(--color-error-background); color: var(--color-error-foreground); border-radius: 4px; }
</style>

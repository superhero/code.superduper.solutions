<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import ProviderIcon from "$lib/components/ProviderIcon.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import { remoteRegistry } from "$lib/remotes/registry";
  import { packageSize } from "$lib/formatting/packages";
  import { providers, remoteError } from "$lib/remotes/policy";
  import { providerApi } from "$lib/remotes/loader";
  import { listConnections, subscribeConnections, saveConnection, removeConnection, lockConnection, unlockConnection, connectionAccess, connectionUnlocked } from "$lib/remotes/connections";
  import type { Connection, Provider } from "$lib/remotes/types";
  let { disabled = false }: { disabled?: boolean } = $props();
  let installed = $state<{ id: string; sha256: string }[]>([]), connections = $state<Connection[]>([]);
  let pending = $state(""), received = $state(0), error = $state(""), notice = $state("");
  let editing = $state(false), id = $state(""), provider = $state<Provider>("github"), label = $state("GitHub"), host = $state("https://github.com"), relay = $state("");
  let token = $state(""), remembered = $state(false), password = $state(""), unlockId = $state(""), unlockPassword = $state("");
  let controller: AbortController | undefined, fileInput: HTMLInputElement, disposed = false;
  const selected = $derived(providers.find(item => item.id === provider)!);
  const ready = (provider: string) => installed.some(record => record.id === provider && remoteRegistry.catalog.some(item => item.id === record.id && item.sha256 === record.sha256));
  async function refresh() {
    try { const [packages, profiles] = await Promise.all([remoteRegistry.installedPackages(), listConnections()]); if (!disposed) { installed = packages; connections = profiles; } }
    catch (failure) { if (!disposed) error = remoteError(failure); }
  }
  onMount(() => { void refresh(); const unsubscribe = remoteRegistry.subscribe(() => void refresh()), disconnect = subscribeConnections(() => void refresh()); return () => { disposed = true; controller?.abort(); token = ""; password = ""; unlockPassword = ""; unsubscribe(); disconnect(); }; });
  async function run(key: string, action: () => Promise<void>) {
    if (pending || disabled) return; pending = key; error = ""; notice = ""; controller = new AbortController();
    try { await action(); }
    catch (failure) { if (!disposed && !controller.signal.aborted) error = remoteError(failure, token); }
    finally { if (!disposed) { pending = ""; await refresh(); } controller = undefined; }
  }
  function chooseProvider(value: string) { provider = value as Provider; const item = providers.find(item => item.id === provider)!; host = item.host; label = item.name; token = ""; }
  function edit(connection?: Connection) {
    id = connection?.id ?? ""; provider = connection?.provider ?? "github"; label = connection?.label ?? "GitHub";
    host = connection?.host ?? "https://github.com"; relay = connection?.relay ?? ""; remembered = connection?.remembered ?? false;
    token = connection && connectionUnlocked(connection) ? connectionAccess(connection).token : ""; password = ""; editing = true; unlockId = ""; error = ""; notice = "";
  }
  function cancel() { editing = false; token = ""; password = ""; }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    await run("connection", async () => { await saveConnection({ ...(id ? { id } : {}), provider, label, host, relay, remembered }, token, password); cancel(); notice = "Connection saved."; });
  }
  async function verify(connection: Connection) {
    await run(connection.id, async () => { const identity = await (await providerApi(connection, controller?.signal)).identity(); if (!disposed) notice = `Connected as ${identity.name} · ${identity.username}`; });
  }
  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0]; input.value = ""; if (!file) return;
    await run("import", async () => { if (file.size > Math.max(...remoteRegistry.catalog.map(item => item.bytes))) throw new Error("This integration file is too large."); await remoteRegistry.importPackage(await file.arrayBuffer()); notice = "Integration installed."; });
  }
  async function exportPackage(id: string) {
    await run(`export-${id}`, async () => {
      const item = remoteRegistry.catalog.find(item => item.id === id)!;
      const { bytes } = await remoteRegistry.readPackage(item), url = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `${id}-${item.version}.remote.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
</script>

<section class="upstreams" aria-label="Upstream connections">
  <div class="heading"><MaterialIcon name="cloud" /><h2 tabindex="-1">Upstream connections</h2><Button variant="ghost" disabled={disabled || !!pending} onclick={() => fileInput.click()} tooltip="Import an integration package"><MaterialIcon name="upload" size={18} />Import</Button></div>
  <input class="file-input" type="file" accept=".json" bind:this={fileInput} aria-label="Import upstream integration" onchange={importFile} />
  <div class="integrations">{#each providers as item}
    {@const catalog = remoteRegistry.catalog.find(record => record.id === item.id)!}
    {@const current = installed.find(record => record.id === item.id)}
    <section class="integration" aria-label={`${item.name} integration`}>
      <div class="integration-title"><ProviderIcon provider={item.id} /><h3>{item.name}</h3>{#if ready(item.id)}<MaterialIcon name="check_circle" size={18} />{/if}</div>
      <p>{item.library} <span>· {catalog.version}</span></p><p class="size">{packageSize(catalog.payloadBytes)}</p>
      <div class="actions">
        {#if !ready(item.id)}<Button class="install" disabled={disabled || !!pending} onclick={() => run(item.id, async () => { received = 0; await remoteRegistry.installPackage(catalog, value => received = value, controller?.signal); notice = `${item.name} integration installed.`; })}>{pending === item.id ? "Installing…" : current ? "Update" : "Install"}</Button>
        {:else}<Button class="install" variant="ghost" disabled={disabled || !!pending} onclick={() => { edit(); chooseProvider(item.id); }}>Add connection</Button>{/if}
        {#if current}<Button size="icon" variant="ghost" aria-label={`Export ${item.name} integration`} tooltip="Export package" disabled={disabled || !!pending} onclick={() => exportPackage(item.id)}><MaterialIcon name="download" size={18} /></Button><Button size="icon" variant="ghost" aria-label={`Uninstall ${item.name} integration`} tooltip="Uninstall integration" disabled={disabled || !!pending} onclick={() => run(`remove-${item.id}`, () => remoteRegistry.removePackage(item.id))}><MaterialIcon name="delete" size={18} /></Button>{/if}
      </div>
      {#if pending === item.id}<progress max={catalog.bytes} value={received} aria-label={`${item.name} download`}></progress><Button variant="ghost" onclick={() => controller?.abort()}>Cancel download</Button>{/if}
    </section>
  {/each}</div>
  <div class="connection-heading"><h3>Personal connections</h3><Button variant="ghost" disabled={disabled || !!pending} onclick={() => edit()}><MaterialIcon name="add" size={18} />New connection</Button></div>
  {#if !connections.length && !editing}<p class="empty">Install an integration, then connect an account or use public access.</p>{/if}
  <div class="connections">{#each connections as connection (connection.id)}
    <div class="connection"><MaterialIcon name={connectionUnlocked(connection) ? "cloud_done" : "lock"} size={20} /><div class="connection-name"><strong>{connection.label}</strong><span>{connection.host} · {connection.remembered ? connectionUnlocked(connection) ? "Unlocked" : "Locked" : connectionAccess(connection).token ? "Session token" : "Public access"}</span></div>
      <div class="actions">
        {#if !connectionUnlocked(connection)}<Button variant="ghost" disabled={disabled || !!pending} onclick={() => { unlockId = connection.id; unlockPassword = ""; }}>Unlock</Button>
        {:else}<Button variant="ghost" disabled={disabled || !!pending || !ready(connection.provider)} onclick={() => verify(connection)}>{pending === connection.id ? "Checking…" : "Verify"}</Button>{#if connection.remembered}<Button variant="ghost" size="icon" tooltip="Lock connection" aria-label={`Lock ${connection.label}`} disabled={disabled || !!pending} onclick={() => lockConnection(connection.id)}><MaterialIcon name="lock" size={18} /></Button>{/if}{/if}
        <Button variant="ghost" size="icon" tooltip="Edit connection" aria-label={`Edit ${connection.label}`} disabled={disabled || !!pending || !connectionUnlocked(connection)} onclick={() => edit(connection)}><MaterialIcon name="edit" size={18} /></Button>
        <Button variant="ghost" size="icon" tooltip="Remove local connection" aria-label={`Remove ${connection.label}`} disabled={disabled || !!pending} onclick={() => run(`remove-${connection.id}`, () => removeConnection(connection.id))}><MaterialIcon name="delete" size={18} /></Button>
      </div>
    </div>
    {#if unlockId === connection.id}<form class="unlock" onsubmit={event => { event.preventDefault(); void run(`unlock-${connection.id}`, async () => { await unlockConnection(connection.id, unlockPassword); unlockPassword = ""; unlockId = ""; notice = "Connection unlocked."; }); }}><input type="password" autocomplete="off" aria-label={`Passphrase for ${connection.label}`} placeholder="Encryption passphrase" bind:value={unlockPassword} disabled={!!pending} required /><Button type="submit" disabled={!!pending}>Unlock</Button></form>{/if}
  {/each}</div>
  {#if editing}<form class="connection-form" onsubmit={save}>
    <div class="pair"><label>Name<input bind:value={label} required maxlength="100" disabled={disabled || !!pending} /></label><div class="field"><label for="upstream-provider">Provider</label><NavigationDropdown id="upstream-provider" label="Upstream provider" placeholder="Choose provider" value={provider} items={providers.map(item => ({ value: item.id, label: item.name, icon: "cloud" }))} disabled={disabled || !!pending || !!id} onchange={chooseProvider} matchTriggerWidth /></div></div>
    <label>Host<input type="url" bind:value={host} required disabled={disabled || !!pending} spellcheck="false" /></label>
    <label>Access token<input type="password" bind:value={token} autocomplete="off" spellcheck="false" placeholder="Leave empty for public access" disabled={disabled || !!pending} /></label>
    <p class="hint">{selected.scopes} <a href={selected.tokenUrl} target="_blank" rel="noopener noreferrer">Create a token<MaterialIcon name="open_in_new" size={12} /></a></p>
    <label class="toggle"><input type="checkbox" role="switch" bind:checked={remembered} disabled={disabled || !!pending} /><span>Remember encrypted token</span></label>
    {#if remembered}<label>Encryption passphrase<input type="password" bind:value={password} autocomplete="new-password" minlength="10" required disabled={disabled || !!pending} /><span class="hint">Unlock with this passphrase after reloading. It is never saved.</span></label>{:else}<p class="hint">The token stays in this tab's memory and is cleared when the page reloads.</p>{/if}
    <details><summary>Git transport<MaterialIcon name="expand_more" size={16} /></summary><label>Trusted CORS relay<input type="url" bind:value={relay} placeholder="https://your-git-relay.example" disabled={disabled || !!pending} spellcheck="false" /></label><p class="hint">Leave empty for hosts that allow direct browser Git requests. GitHub and other hosts without Git CORS need an isomorphic-git compatible relay. It carries your Git credentials; use a relay you control or trust.</p></details>
    <div class="actions form-actions"><Button variant="ghost" disabled={!!pending} onclick={cancel}>Cancel</Button><Button type="submit" disabled={disabled || !!pending}>{pending === "connection" ? "Saving…" : "Save connection"}</Button></div>
  </form>{/if}
  {#if error}<p role="alert" class="message">{error}</p>{/if}{#if notice}<p role="status" class="message">{notice}</p>{/if}
</section>
<style>
  .upstreams{margin-top:20px;padding:24px;background:var(--color-surface);border-radius:4px;min-width:0}
  .heading,.integration-title,.connection-heading,.connection,.actions{display:flex;align-items:center;gap:10px}.heading{margin-bottom:22px;gap:12px}.heading h2{flex:1}.heading> :global(button){margin-left:auto}
  h2{margin:0;font-size:.9375rem;font-weight:650}h3{font-size:.75rem;font-weight:650;margin:0}.integration-title h3{flex:1}
  .integrations{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.integration{padding:18px;background:var(--color-background);border-radius:4px;min-width:0}.integration p{font-size:.6875rem;margin:12px 0 0}.integration p span,.size{opacity:.65}.integration .actions{margin-top:18px;gap:6px}.integration :global(.install){flex:1}
  p{font-size:.6875rem;line-height:1.7;margin:0}.file-input{display:none}.connection-heading{margin-top:24px;margin-bottom:12px;justify-content:space-between}.connections{display:grid;gap:8px}.connection{min-width:0;padding:12px;background:var(--color-background);border-radius:4px}.connection-name{flex:1;min-width:0;display:grid;gap:5px;font-size:.6875rem}.connection-name span{font-size:.625rem;opacity:.65;overflow-wrap:anywhere}.connection .actions{gap:6px;flex-wrap:wrap}
  .connection-form{display:grid;gap:16px;margin-top:20px;padding:18px;background:var(--color-background);border-radius:4px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}label,.field{display:grid;gap:7px;min-width:0;font-size:.6875rem;font-weight:600}
  input:not([type="checkbox"]){width:100%;border:0;outline:0;border-radius:4px;padding:9px 11px;background:var(--color-surface);color:var(--color-foreground);font:inherit;font-weight:400;box-sizing:border-box}.connection-form :global(.navigation-trigger){background:var(--color-surface)}
  input:focus-visible{background:var(--color-focus-background);color:var(--color-focus-foreground)}.hint{opacity:.7;font-size:.625rem;font-weight:400}.hint a{display:inline-flex;gap:4px;align-items:center;color:inherit;text-decoration:underline;text-underline-offset:3px}.toggle{display:flex;align-items:center;gap:10px}.toggle input{accent-color:var(--color-foreground);width:16px;height:16px;margin:0}
  details{padding-top:16px;background:repeating-linear-gradient(to right,var(--color-surface) 0 6px,transparent 6px 14px) top/100% 1px no-repeat}summary{display:flex;justify-content:space-between;align-items:center;cursor:pointer;list-style:none;font-size:.6875rem;font-weight:600}summary::-webkit-details-marker{display:none}details label{margin-top:16px}details p{margin-top:8px}.form-actions{justify-content:flex-end}.message{margin-top:18px;overflow-wrap:anywhere}.empty{opacity:.7}.unlock{display:flex;gap:8px}.unlock input{background:var(--color-background)}progress{width:100%;height:4px;margin-top:12px;accent-color:var(--color-foreground)}
  @media(max-width:750px){.integrations{grid-template-columns:minmax(0,1fr)}.pair{grid-template-columns:minmax(0,1fr)}.connection,.heading,.connection-heading,.integration .actions{flex-wrap:wrap}.connection-name{min-width:120px}.upstreams{padding:18px}.connection .actions{margin-left:auto}}
</style>

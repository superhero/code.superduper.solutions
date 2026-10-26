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
  import { providers, remoteError } from "$lib/remotes/policy";
  import { providerApi } from "$lib/remotes/loader";
  import { listConnections, subscribeConnections, saveConnection, removeConnection, lockConnection, unlockConnection, connectionAccess, connectionUnlocked } from "$lib/remotes/connections";
  import type { Connection, Provider } from "$lib/remotes/types";
  let { disabled = false }: { disabled?: boolean } = $props();
  let installed = $state<{ id: string; sha256: string }[]>([]), connections = $state<Connection[]>([]);
  let pending = $state(""), received = $state(0), error = $state(""), notice = $state("");
  let editing = $state(false), id = $state(""), provider = $state<Provider>("github"), label = $state("GitHub"), host = $state("https://github.com"), relay = $state("");
  let token = $state(""), remembered = $state(false), password = $state(""), unlockId = $state(""), unlockPassword = $state("");
  let controller: AbortController | undefined, disposed = false;
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
  function addConnection(provider: Provider) {
    if (disabled || pending || !ready(provider)) return;
    edit(); chooseProvider(provider);
  }
  function cancel() { editing = false; token = ""; password = ""; }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!id && !ready(provider)) { error = `Install or update the ${selected.name} integration before adding a connection.`; return; }
    await run("connection", async () => { await saveConnection({ ...(id ? { id } : {}), provider, label, host, relay, remembered }, token, password); cancel(); notice = "Connection saved."; });
  }
  async function verify(connection: Connection) {
    await run(connection.id, async () => { const identity = await (await providerApi(connection, controller?.signal)).identity(); if (!disposed) notice = `Connected as ${identity.name} · ${identity.username}`; });
  }
  async function exportPackage(id: string) {
    await run(`export-${id}`, async () => {
      const item = remoteRegistry.catalog.find(item => item.id === id)!;
      const { bytes } = await remoteRegistry.readPackage(item), url = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `${id}-${item.version}.remote.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
</script>

<section class="upstreams" aria-label="Remote connections">
  <div class="heading"><MaterialIcon name="cloud" /><h2 tabindex="-1">Remote connections</h2></div>
  <div class="integrations">{#each providers as item}
    {@const catalog = remoteRegistry.catalog.find(record => record.id === item.id)!}
    {@const current = installed.find(record => record.id === item.id)}
    <section class="integration" aria-label={`${item.name} integration`}>
      <div class="integration-title"><ProviderIcon provider={item.id} /><h3>{item.name}</h3>{#if ready(item.id)}<MaterialIcon name="check_circle" size={18} />{/if}</div>
      <p title={`${item.library} · ${catalog.version}`}>{item.library} <span>· {catalog.version}</span></p>
      <div class="actions">
        {#if pending === item.id}<Button size="icon" variant="ghost" aria-label="Cancel download" tooltip="Cancel download" onclick={() => controller?.abort()}><MaterialIcon name="close" size={18}/></Button>
        {:else if !ready(item.id)}<Button size="icon" tooltip={current ? "Update" : "Install"} aria-label={current ? "Update" : "Install"} disabled={disabled || !!pending} onclick={() => run(item.id, async () => { received = 0; await remoteRegistry.installPackage(catalog, value => received = value, controller?.signal); notice = `${item.name} integration installed.`; })}><MaterialIcon name={current ? "downloading" : "install_desktop"} size={18}/></Button>{/if}
        <Button size="icon" variant="ghost" aria-label="Add connection" tooltip={!ready(item.id) ? `${current ? "Update" : "Install"} the ${item.name} integration before adding a connection.` : "Add connection"} disabled={disabled || !!pending || !ready(item.id)} onclick={() => addConnection(item.id)}><MaterialIcon name="add_link" size={18}/></Button>
        {#if current}<Button size="icon" variant="ghost" aria-label={`Export ${item.name} integration`} tooltip="Export package" disabled={disabled || !!pending} onclick={() => exportPackage(item.id)}><MaterialIcon name="download" size={18} /></Button><Button size="icon" variant="ghost" aria-label={`Uninstall ${item.name} integration`} tooltip="Uninstall integration" disabled={disabled || !!pending} onclick={() => run(`remove-${item.id}`, () => remoteRegistry.removePackage(item.id))}><MaterialIcon name="delete" size={18} /></Button>{/if}
      </div>
      {#if pending === item.id}<progress max={catalog.bytes} value={received} aria-label={`${item.name} download`}></progress>{/if}
    </section>
  {/each}</div>
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
    <div class="pair"><label>Name<input bind:value={label} required maxlength="100" disabled={disabled || !!pending} /></label><div class="field"><label for="upstream-provider">Provider</label><NavigationDropdown id="upstream-provider" label="Upstream provider" placeholder="Choose provider" value={provider} items={providers.filter(item => ready(item.id) || (!!id && item.id === provider)).map(item => ({ value: item.id, label: item.name, icon: "cloud" }))} disabled={disabled || !!pending || !!id} onchange={chooseProvider} matchTriggerWidth /></div></div>
    <label>Host<input type="url" bind:value={host} required disabled={disabled || !!pending} spellcheck="false" /></label>
    <label>Access token<input type="password" bind:value={token} autocomplete="off" spellcheck="false" placeholder="Leave empty for public access" disabled={disabled || !!pending} /></label>
    <p class="hint">{selected.scopes} <a href={selected.tokenUrl} target="_blank" rel="noopener noreferrer">Create a token<MaterialIcon name="open_in_new" size={12} /></a></p>
    <label class="toggle"><input type="checkbox" data-slot="checkbox" role="switch" bind:checked={remembered} disabled={disabled || !!pending} /><span>Remember encrypted token</span></label>
    {#if remembered}<label>Encryption passphrase<input type="password" bind:value={password} autocomplete="new-password" minlength="10" required disabled={disabled || !!pending} /><span class="hint">Unlock with this passphrase after reloading. It is never saved.</span></label>{:else}<p class="hint">The token stays in this tab's memory and is cleared when the page reloads.</p>{/if}
    <details><summary>Git transport<MaterialIcon name="expand_more" size={16} /></summary><label>Trusted CORS relay<input type="url" bind:value={relay} placeholder="https://your-git-relay.example" disabled={disabled || !!pending} spellcheck="false" /></label><p class="hint">Leave empty for hosts that allow direct browser Git requests. GitHub and other hosts without Git CORS need an isomorphic-git compatible relay. It carries your Git credentials; use a relay you control or trust.</p></details>
    <div class="actions form-actions"><Button variant="ghost" disabled={!!pending} onclick={cancel}>Cancel</Button><Button type="submit" tooltip={!id && !ready(provider) ? `Install or update the ${selected.name} integration before adding a connection.` : ""} disabled={disabled || !!pending || (!id && !ready(provider))}>{pending === "connection" ? "Saving…" : "Save connection"}</Button></div>
  </form>{/if}
  {#if error}<p role="alert" class="message">{error}</p>{/if}{#if notice}<p role="status" class="message">{notice}</p>{/if}
</section>
<style>
  .upstreams{margin-top:var(--pane-gap);padding:var(--pane-padding);background:var(--color-surface);border-radius:4px;min-width:0}
  .heading,.integration-title,.connection,.actions{display:flex;align-items:center;gap:10px}.heading{margin-bottom:var(--pane-padding);gap:12px}.heading h2{flex:1}
  h2{margin:0;font-size:.9375rem;font-weight:650}h3{font-size:.75rem;font-weight:650;margin:0}.integration-title h3{flex:1}
  .integrations{display:grid;grid-template-columns:minmax(0,1fr);gap:6px}.integration{display:flex;align-items:center;position:relative;background:var(--color-background);border-radius:4px;min-width:0;overflow:hidden}
  .integration-title{flex:0 1 140px;min-width:0;height:36px;box-sizing:border-box;padding:0 8px;gap:8px;background:var(--palette-8);color:var(--color-background)}.integration-title h3{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .integration p{flex:1;min-width:0;font-size:.6875rem;margin:0;padding:0 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.integration p span{opacity:.65}.integration .actions{flex:0 0 auto;margin:0;gap:0;flex-wrap:nowrap}
  .integration :global(button[data-slot="button"]){border-radius:0;border-inline-start:1px solid var(--color-background)}
  p{font-size:.6875rem;line-height:1.7;margin:0}.connections{display:grid;gap:var(--pane-gap)}.connections:has(> .connection){margin-top:var(--pane-gap)}.connection{min-width:0;padding:var(--pane-padding);background:var(--color-background);border-radius:4px}.connection-name{flex:1;min-width:0;display:grid;gap:5px;font-size:.6875rem}.connection-name span{font-size:.625rem;opacity:.65;overflow-wrap:anywhere}.connection .actions{gap:6px;flex-wrap:wrap}
  .connection-form{display:grid;gap:var(--pane-gap);margin-top:var(--pane-gap);padding:var(--pane-padding);background:var(--color-background);border-radius:4px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:var(--pane-gap)}label,.field{display:grid;gap:7px;min-width:0;font-size:.6875rem;font-weight:600}
  input:not([type="checkbox"]){width:100%;border:0;outline:0;border-radius:4px;padding:9px 11px;background:var(--color-surface);color:var(--color-foreground);font:inherit;font-weight:400;box-sizing:border-box}.connection-form :global(.navigation-trigger){background:var(--color-surface)}
  input:focus-visible{background:var(--color-focus-background);color:var(--color-focus-foreground)}.hint{opacity:.7;font-size:.625rem;font-weight:400}.hint a{display:inline-flex;gap:4px;align-items:center;color:inherit;text-decoration:underline;text-underline-offset:3px}.toggle{display:flex;align-items:center;gap:10px}.toggle input{accent-color:var(--color-foreground);width:16px;height:16px;margin:0}
  details{padding-top:16px;background:repeating-linear-gradient(to right,var(--color-surface) 0 6px,transparent 6px 14px) top/100% 1px no-repeat}summary{display:flex;justify-content:space-between;align-items:center;cursor:pointer;list-style:none;font-size:.6875rem;font-weight:600}summary::-webkit-details-marker{display:none}details label{margin-top:16px}details p{margin-top:8px}.form-actions{justify-content:flex-end}.message{margin-top:18px;overflow-wrap:anywhere}.unlock{display:flex;gap:8px}.unlock input{background:var(--color-background)}progress{position:absolute;bottom:0;left:0;width:100%;height:3px;margin:0;accent-color:var(--color-foreground)}
  @container settings-pane (max-width:750px){.pair{grid-template-columns:minmax(0,1fr)}.connection,.heading{flex-wrap:wrap}.connection-name{min-width:120px}.connection .actions{margin-left:auto}}
</style>

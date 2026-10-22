<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import * as Sheet from "$lib/components/ui/sheet";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import { repositoryClient, subscribeRemoteProgress } from "$lib/repository/client";
  import { listConnections, subscribeConnections, connectionAccess, connectionUnlocked } from "$lib/remotes/connections";
  import { repositoryUrl, repositoryPath, remoteError } from "$lib/remotes/policy";
  import { providerApi } from "$lib/remotes/loader";
  import type { CloneRequest, Connection, ProviderApi, RemoteRepository, RemoteProgress } from "$lib/remotes/types";
  import "./remote-ui.css";
  let { open = $bindable(false), onclone, onsettings }: { open?: boolean; onclone(request: CloneRequest): Promise<void>; onsettings(): void } = $props();
  let connections = $state<Connection[]>([]), connectionId = $state(""), view = $state("Repositories"), query = $state(""), repositories = $state<RemoteRepository[]>([]), selected = $state<RemoteRepository>();
  let url = $state(""), name = $state(""), branch = $state(""), page = $state(1), more = $state(false), searched = $state(false);
  let pending = $state(""), error = $state(""), notice = $state(""), progress = $state<RemoteProgress>();
  let newName = $state(""), namespace = $state(""), privateRepository = $state(true), forking = $state(false), forkNamespace = $state("");
  let controller: AbortController | undefined, operationId = "", disposed = false, initialized = false;
  const connection = $derived(connections.find(item => item.id === connectionId));
  const authenticated = $derived(!!connection && connectionUnlocked(connection) && !!connectionAccess(connection).token);
  async function refresh() { try { const result = await listConnections(); if (!disposed) { connections = result; if (!initialized) { connectionId = result[0]?.id ?? ""; initialized = true; } else if (connectionId && !result.some(item => item.id === connectionId)) connectionId = ""; } } catch (failure) { if (!disposed) error = remoteError(failure); } }
  $effect(() => { if (open) untrack(() => { void refresh(); error = ""; notice = ""; }); });
  onMount(() => { const stop = subscribeConnections(() => void refresh()), progressStop = subscribeRemoteProgress(value => { if (value.id === operationId && !disposed) progress = value; }); return () => { disposed = true; controller?.abort(); stop(); progressStop(); }; });
  async function run(label: string, task: () => Promise<void>) {
    if (pending) return; pending = label; error = ""; notice = ""; progress = undefined; controller = new AbortController(); operationId = crypto.randomUUID();
    try { await task(); }
    catch (failure) { if (!disposed) error = remoteError(failure, connection && connectionUnlocked(connection) ? connectionAccess(connection).token : ""); }
    finally { if (!disposed) { pending = ""; progress = undefined; } controller = undefined; }
  }
  async function api(): Promise<ProviderApi> { if (!connection) throw new Error("Add an upstream connection in Settings to browse repositories."); return providerApi(connection, controller?.signal); }
  function select(item: RemoteRepository) { selected = item; url = item.cloneUrl; name = item.name; branch = ""; forking = false; }
  function chooseConnection(value: string) { connectionId = value; repositories = []; selected = undefined; searched = false; page = 1; more = false; error = ""; }
  async function search(append = false) {
    const client = await api(), nextPage = append ? page + 1 : 1;
    let path = query.trim();
    if (path.startsWith("https://") && connection) path = repositoryPath(path, connection);
    if (!append && path.includes("/")) { repositories = [await client.repository(path)]; more = false; }
    else { const result = await client.repositories(query.trim(), nextPage); repositories = append ? [...repositories, ...result.items] : result.items; more = result.more; }
    page = nextPage; searched = true;
  }
  async function clone(event: SubmitEvent) {
    event.preventDefault();
    await run("Cloning repository", async () => {
      const access = connection ? connectionAccess(connection) : undefined;
      await onclone({ name, url: repositoryUrl(url, access), operationId, ...(access ? { access } : {}), ...(branch.trim() ? { branch: branch.trim() } : {}) });
      open = false;
    });
  }
  function fillName() { if (!name.trim()) { try { name = new URL(url).pathname.split("/").filter(Boolean).at(-1)?.replace(/\.git$/, "") ?? ""; } catch { /* Validate on submit. */ } } }
</script>

<Sheet.Root bind:open={() => open, value => { if (!pending) open = value; }}>
  <Sheet.Content class="clone-repository-panel">
    <Sheet.Header><Sheet.Title><span class="clone-title"><MaterialIcon name="cloud_download" size={22} />Clone repository</span></Sheet.Title><Sheet.Description>Full history, branches and tags, stored in this browser.</Sheet.Description></Sheet.Header>
    <div class="remote-ui clone-body">
      <section class="remote-card">
        <div class="remote-heading"><MaterialIcon name="cloud" size={20} /><h3>Connection</h3><Button variant="ghost" size="icon-sm" aria-label="Set up upstream connections" tooltip="Upstream settings" disabled={!!pending} onclick={() => { open = false; onsettings(); }}><MaterialIcon name="settings" size={18} /></Button></div>
        <NavigationDropdown label="Clone connection" placeholder="Public access · direct" value={connectionId} items={[{ value: "", label: "Public access · direct", icon: "public" }, ...connections.map(item => ({ value: item.id, label: `${item.label}${connectionUnlocked(item) ? "" : " · Locked"}`, icon: "cloud" }))]} onchange={chooseConnection} disabled={!!pending} matchTriggerWidth />
        {#if !connection}<p class="hint">Public Git URLs can use direct transport. Add a connection for account browsing, tokens or a trusted CORS relay.</p>{/if}
      </section>
      <nav class="remote-sections" aria-label="Clone source">{#each ["Repositories", "URL"] as item}<Button variant="ghost" aria-pressed={view === item} disabled={!!pending} onclick={() => view = item}>{item}</Button>{/each}</nav>
      {#if view === "Repositories"}<section class="remote-card">
        <form class="search" onsubmit={event => { event.preventDefault(); void run("Finding repositories", () => search()); }}><input aria-label="Find upstream repositories" placeholder="Search or enter owner/repository" bind:value={query} disabled={!!pending || !connection} /><Button type="submit" variant="secondary" disabled={!!pending || !connection}><MaterialIcon name="search" size={18} />Browse</Button></form>
        <div class="remote-list">{#each repositories as item (item.path)}<button class="remote-entry" aria-pressed={selected?.path === item.path} disabled={!!pending} onclick={() => select(item)}><MaterialIcon name={item.private ? "lock" : "folder_data"} size={20} /><span><strong>{item.path}</strong><small>{item.description || item.defaultBranch}</small></span><MaterialIcon name="chevron_right" size={18} /></button>{:else}{#if searched}<p class="hint">No matching repositories.</p>{:else}<p class="hint">Browse your repositories or look up a repository by its full path.</p>{/if}{/each}</div>
        {#if more}<Button variant="secondary" disabled={!!pending} onclick={() => run("Loading repositories", () => search(true))}>Load more</Button>{/if}
        {#if selected && authenticated}<div class="remote-actions"><Button variant="secondary" size="sm" disabled={!!pending} onclick={() => { forking = !forking; forkNamespace = ""; }}>Fork repository…</Button></div>{#if forking}<div class="remote-ui"><label>{connection?.provider === "bitbucket" ? "Destination workspace" : "Destination namespace (optional)"}<input bind:value={forkNamespace} disabled={!!pending} /></label><Button disabled={!!pending} onclick={() => run("Creating fork", async () => { select(await (await api()).fork(selected!.path, forkNamespace)); notice = "Fork requested. Large repositories can take a moment before cloning is available."; })}>Create fork upstream</Button></div>{/if}{/if}
        {#if authenticated}<details><summary>Create a repository upstream<MaterialIcon name="expand_more" size={16} /></summary><form class="remote-ui" onsubmit={event => { event.preventDefault(); void run("Creating upstream repository", async () => { select(await (await api()).createRepository(newName.trim(), privateRepository, namespace.trim())); notice = "Upstream repository created. Clone it below to start editing."; }); }}><label>New repository name<input bind:value={newName} required maxlength="100" disabled={!!pending} /></label><label>{connection?.provider === "gitlab" ? "Namespace ID (optional)" : connection?.provider === "bitbucket" ? "Workspace" : "Organization (optional)"}<input bind:value={namespace} required={connection?.provider === "bitbucket"} disabled={!!pending} /></label><label class="remote-toggle"><input type="checkbox" bind:checked={privateRepository} disabled={!!pending} />Private repository</label><Button type="submit" disabled={!!pending || !newName.trim()}>Create upstream repository</Button></form></details>{/if}
      </section>{/if}
      <form class="remote-ui" onsubmit={clone}>
        <section class="remote-card"><div class="remote-heading"><MaterialIcon name="folder_data" size={20} /><h3>Browser repository</h3></div>
          <label>HTTPS clone URL<input type="url" bind:value={url} onblur={fillName} placeholder="https://github.com/owner/repository.git" required spellcheck="false" disabled={!!pending} /></label>
          <label>Repository name<input bind:value={name} required maxlength="200" disabled={!!pending} /></label>
          <label>Branch (optional)<input bind:value={branch} placeholder="Remote default branch" spellcheck="false" disabled={!!pending} /></label>
          <p class="hint">Choosing a branch changes the initial checkout. All branches, tags and reachable history are still fetched.</p>
          <Button type="submit" class="remote-primary" disabled={!!pending || !name.trim() || !url.trim()}><MaterialIcon name="cloud_download" size={18} />{pending === "Cloning repository" ? "Cloning…" : "Clone repository"}</Button>
        </section>
      </form>
      {#if pending}<div class="remote-message remote-progress" role="status"><span>{progress?.phase ?? pending}{progress?.total ? ` · ${Math.round(progress.loaded / progress.total * 100)}%` : "…"}</span>{#if progress?.total}<progress aria-label="Clone progress" max={progress.total} value={progress.loaded}></progress>{/if}<Button variant="ghost" size="sm" onclick={() => { controller?.abort(); void repositoryClient.cancelRemote(operationId); }}>Cancel</Button></div>{/if}
      {#if error}<p role="alert" class="remote-message">{error}</p>{/if}{#if notice}<p role="status" class="remote-message">{notice}</p>{/if}
    </div>
  </Sheet.Content>
</Sheet.Root>
<style>
  .clone-title{display:flex;align-items:center;gap:10px;font-size:.9375rem}.clone-body{padding:20px;overflow:auto;min-height:0}.search{display:flex;gap:8px;min-width:0}.search input{flex:1}.search :global(button){font-size:.6875rem}
  :global(.clone-repository-panel){display:flex;flex-direction:column;width:min(560px,100vw);max-width:none;padding:0;gap:0;background:var(--color-background);color:var(--color-foreground)}
  :global(.clone-repository-panel [data-slot="sheet-header"]){padding:24px 52px 20px 24px}
</style>

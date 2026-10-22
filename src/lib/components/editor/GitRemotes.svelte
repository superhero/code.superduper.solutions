<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import HostedRepository from "./HostedRepository.svelte";
  import { repositoryClient, subscribeRemoteProgress, type RepositorySnapshot } from "$lib/repository/client";
  import { connectionAccess, connectionUnlocked, listConnections, subscribeConnections } from "$lib/remotes/connections";
  import { repositoryUrl, repositoryPath, remoteError } from "$lib/remotes/policy";
  import type { Connection, RemoteCommand, RemoteProgress, RemoteStatus } from "$lib/remotes/types";
  import type { GitAction, GitStatus } from "$lib/repository/local-git-types";
  import type { Author } from "$lib/repository/types";
  import "./remote-ui.css";
  let { repository, status, author, disabled = false, onaction, onremote, onbranch, onsettings, onbusy }:
    { repository: RepositorySnapshot; status: GitStatus; author: Author; disabled?: boolean; onaction(request: GitAction): Promise<void>; onremote(request: RemoteCommand): Promise<void>; onbranch(name: string): Promise<void>; onsettings(): void; onbusy(value: boolean): void } = $props();
  let remoteState = $state<RemoteStatus>(), connections = $state<Connection[]>([]), connectionId = $state(""), remote = $state("");
  let view = $state("Sync"), pending = $state(""), hostedBusy = $state(false), error = $state(""), notice = $state(""), progress = $state<RemoteProgress>();
  let selectedBranch = $state(""), pullMode = $state<"ff-only" | "merge" | "rebase">("ff-only"), prune = $state(false);
  let adding = $state(false), remoteLabel = $state("origin"), remoteUrl = $state(""), removeConfirmed = $state(false);
  let pushKind = $state<"push" | "push-tag" | "delete-branch" | "delete-tag">("push"), localName = $state(""), targetName = $state(""), lease = $state(false), confirmation = $state("");
  let reviewed = $state<{ key: string; oid: string | null; localOid?: string }>();
  let setUpstream = $state(false);
  let controller: AbortController | undefined, operationId = "", disposed = false, epoch = 0, initialized = false, previousBranch: string | null | undefined;
  const selectedRemote = $derived(remoteState?.remotes.find(item => item.name === remote));
  const connection = $derived(connections.find(item => item.id === connectionId));
  const blocked = $derived(disabled || !!pending || hostedBusy), deleting = $derived(pushKind.startsWith("delete")), tag = $derived(pushKind.endsWith("tag"));
  const localRefs = $derived(tag ? status.tags : status.branches);
  const reviewKey = $derived(JSON.stringify([remote, selectedRemote?.url, connectionId, pushKind, localName, targetName, lease, repository.revision]));
  const validReview = $derived(reviewed?.key === reviewKey);
  const hostedPath = $derived.by(() => { try { return connection && selectedRemote ? repositoryPath(selectedRemote.url, connection) : ""; } catch { return ""; } });
  async function refreshConnections() { try { const next = await listConnections(); if (!disposed) connections = next; } catch (failure) { if (!disposed) error = remoteError(failure); } }
  async function reload() {
    const sequence = ++epoch, next = await repositoryClient.remoteStatus(repository.id);
    if (disposed || sequence !== epoch) return;
    remoteState = next;
    if (previousBranch !== next.branch) {
      if (next.upstream && next.remotes.some(item => item.name === next.upstream?.remote)) remote = next.upstream.remote;
      localName = next.branch ?? ""; targetName = next.upstream?.branch ?? localName; setUpstream = !next.upstream; reviewed = undefined; previousBranch = next.branch;
    }
    if (!next.remotes.some(item => item.name === remote)) remote = next.upstream?.remote ?? next.remotes[0]?.name ?? "";
    const item = next.remotes.find(item => item.name === remote);
    if (!item?.branches.some(item => item.name === selectedBranch)) selectedBranch = next.upstream && next.upstream.remote === remote ? next.upstream.branch : item?.branches.find(item => item.name === repository.branch)?.name ?? item?.branches[0]?.name ?? "";
    if (!initialized) {
      await refreshConnections();
      connectionId = connections.find(profile => { try { if (!item) return false; repositoryUrl(item.url, profile); return true; } catch { return false; } })?.id ?? "";
      localName = repository.branch ?? ""; targetName = selectedBranch || localName; initialized = !!item;
    }
  }
  $effect(() => { const identity = [repository.id, repository.head, repository.branch]; untrack(() => { void reload().catch(failure => { if (!disposed) error = remoteError(failure); }); }); void identity; });
  onMount(() => {
    const unsubscribe = subscribeConnections(() => void refreshConnections()), stop = subscribeRemoteProgress(value => { if (value.id === operationId && !disposed) progress = value; });
    return () => { disposed = true; epoch++; unsubscribe(); stop(); };
  });
  const access = () => connection ? connectionAccess(connection) : undefined;
  async function run(label: string, task: () => Promise<void>) {
    if (blocked) return; pending = label; error = ""; notice = ""; progress = undefined; controller = new AbortController(); operationId = crypto.randomUUID(); onbusy(true);
    try { await task(); }
    catch (failure) { if (!disposed) error = remoteError(failure, connection && connectionUnlocked(connection) ? connectionAccess(connection).token : ""); }
    finally { onbusy(false); if (!disposed) { pending = ""; progress = undefined; } controller = undefined; }
  }
  async function command(request: RemoteCommand) { const credentials = access(); await onremote({ ...request, ...(credentials ? { access: credentials } : {}), operationId }); await reload(); }
  async function fetchRemote() { await command({ kind: "fetch", remote, prune }); notice = "Remote branches and tags refreshed."; }
  async function pull() {
    const incoming = selectedBranch;
    await command({ kind: "fetch", remote, prune });
    if (!remoteState?.remotes.find(item => item.name === remote)?.branches.some(item => item.name === incoming)) throw new Error("That upstream branch no longer exists.");
    if (pullMode !== "ff-only" && (!author.name || !author.email)) throw new Error("Enter an author name and email in the Changes tab before merging or rebasing.");
    await onaction({ kind: pullMode === "rebase" ? "rebase" : "merge", target: `refs/remotes/${remote}/${incoming}`, author, mode: pullMode === "merge" ? "merge" : "ff-only" });
    await reload(); notice = "Incoming changes applied. Resolve any paused conflicts above.";
  }
  async function reviewPush() {
    if (!selectedRemote || !targetName.trim()) throw new Error("Choose a remote and target reference.");
    const refs = await repositoryClient.remoteRefs(selectedRemote.url, access(), operationId);
    const localOid = localRefs.find(item => item.name === localName)?.oid;
    reviewed = { key: reviewKey, oid: refs.find(item => item.ref === `refs/${tag ? "tags" : "heads"}/${targetName}`)?.oid ?? null, ...(localOid ? { localOid } : {}) }; confirmation = "";
  }
  async function push() {
    if (!reviewed || !validReview) throw new Error("Review this push again before continuing.");
    const expectedOid = reviewed.oid;
    const expectedLocalOid = reviewed.localOid;
    try { await command({ kind: pushKind, remote, branch: targetName, localBranch: localName, expectedOid, ...(expectedLocalOid ? { expectedLocalOid } : {}), lease, setUpstream }); notice = deleting ? "Remote reference deleted." : "Push completed."; }
    finally { reviewed = undefined; }
  }
  function chooseKind(value: string) { pushKind = value as typeof pushKind; localName = value.endsWith("tag") ? status.tags[0]?.name ?? "" : repository.branch ?? ""; targetName = localName; lease = false; }
</script>

<section class="remote-ui" aria-label="Remote Git">
  <section class="remote-card">
    <div class="remote-heading"><MaterialIcon name="cloud" size={20} /><h3>Upstream</h3><Button variant="ghost" size="icon-sm" aria-label="Configure upstream connections" tooltip="Upstream settings" disabled={blocked} onclick={onsettings}><MaterialIcon name="settings" size={18} /></Button></div>
    <div class="remote-field"><label for="git-connection">Connection</label><NavigationDropdown id="git-connection" label="Git connection" placeholder="Public access · direct" value={connectionId} items={[{ value: "", label: "Public access · direct", icon: "public" }, ...connections.map(item => ({ value: item.id, label: `${item.label}${connectionUnlocked(item) ? "" : " · Locked"}`, icon: connectionUnlocked(item) ? "cloud" : "lock" }))]} disabled={blocked} onchange={value => { connectionId = value; initialized = true; }} matchTriggerWidth /></div>
    {#if connection && !connectionUnlocked(connection)}<p class="hint">Unlock this connection in Settings before using its token.</p>{/if}
    <div class="remote-field"><label for="git-remote">Remote</label><NavigationDropdown id="git-remote" label="Git remote" placeholder="Choose remote" value={remote} items={(remoteState?.remotes ?? []).map(item => ({ value: item.name, label: item.name, icon: "cloud" }))} disabled={blocked} onchange={value => { remote = value; selectedBranch = remoteState?.remotes.find(item => item.name === value)?.branches[0]?.name ?? ""; removeConfirmed = false; }} matchTriggerWidth /></div>
    {#if selectedRemote}<p class="hint">{selectedRemote.url}</p>{/if}
    {#if selectedRemote?.needsUrl}<p class="hint">Replace this remote with a credential-free HTTPS clone URL before transferring Git data. Keep its token in the connection.</p>{/if}
    <div class="remote-actions"><Button variant="secondary" size="sm" disabled={blocked} onclick={() => { adding = !adding; remoteLabel = remoteState?.remotes.length ? "upstream" : "origin"; remoteUrl = ""; }}><MaterialIcon name="add" size={16} />Add remote</Button>{#if selectedRemote}<Button variant="ghost" size="sm" disabled={blocked} onclick={() => { if (!removeConfirmed) removeConfirmed = true; else void run("Remove remote", async () => { await command({ kind: "remove", remote }); removeConfirmed = false; notice = "Local remote configuration removed."; }); }}>{removeConfirmed ? "Confirm remove local remote" : "Remove…"}</Button>{/if}</div>
    {#if adding}<form class="remote-ui" onsubmit={event => { event.preventDefault(); void run("Add remote", async () => { await command({ kind: "configure", remote: remoteLabel, url: remoteUrl }); remote = remoteLabel; adding = false; await reload(); notice = "Remote configured."; }); }}><label>Remote name<input bind:value={remoteLabel} required disabled={blocked} /></label><label>HTTPS clone URL<input type="url" bind:value={remoteUrl} required placeholder="https://github.com/owner/repository.git" spellcheck="false" disabled={blocked} /></label><Button type="submit" class="remote-primary" variant="secondary" disabled={blocked}>Save remote</Button></form>{/if}
  </section>
  {#if selectedRemote}
    <nav class="remote-sections" aria-label="Remote sections">{#each ["Sync", "Requests", "Issues", "Checks"] as section}<Button variant="ghost" aria-pressed={view === section} disabled={blocked} onclick={() => view = section}>{section}</Button>{/each}</nav>
    {#if view === "Sync"}
      <section class="remote-card">
        <div class="remote-heading"><MaterialIcon name="sync" size={20} /><h3>Synchronize</h3></div>
        <div class="remote-summary"><div><span>{remoteState?.branch ?? "Detached HEAD"}</span><code>{remoteState?.head?.slice(0, 8) ?? "No commits"}</code></div><div><span>{remoteState?.upstream ? `${remoteState.upstream.remote}/${remoteState.upstream.branch}` : "No tracking branch"}</span><span>{remoteState?.ahead ?? 0} ahead · {remoteState?.behind ?? 0} behind</span></div></div>
        <label class="remote-toggle"><input type="checkbox" bind:checked={prune} disabled={blocked} />Prune deleted tracking branches when fetching</label>
        <Button variant="secondary" class="remote-primary" disabled={blocked} onclick={() => run("Fetch", fetchRemote)}><MaterialIcon name="cloud_download" size={18} />Fetch branches and tags</Button>
        <div class="remote-field"><label for="git-upstream-branch">Upstream branch</label><NavigationDropdown id="git-upstream-branch" label="Upstream branch" placeholder="Fetch to discover branches" value={selectedBranch} items={selectedRemote.branches.map(item => ({ value: item.name, label: item.name, icon: "account_tree" }))} disabled={blocked} onchange={value => selectedBranch = value} matchTriggerWidth /></div>
        <div class="remote-actions"><Button variant="secondary" size="sm" disabled={blocked || !selectedBranch || !repository.branch} onclick={() => run("Set upstream", async () => { await command({ kind: "upstream", remote, branch: selectedBranch }); notice = "Tracking branch updated."; })}>Set tracking branch</Button><Button variant="secondary" size="sm" disabled={blocked || !selectedBranch || repository.branch === selectedBranch} onclick={() => run("Check out branch", async () => { if (repository.branches.includes(selectedBranch)) await onbranch(selectedBranch); else await onaction({ kind: "track-branch", target: `refs/remotes/${remote}/${selectedBranch}`, name: selectedBranch }); await reload(); notice = "Branch checked out."; })}>Check out branch</Button></div>
        <div class="remote-field"><label for="git-pull-mode">Pull method</label><NavigationDropdown id="git-pull-mode" label="Pull method" placeholder="Fast-forward only" value={pullMode} items={[{ value: "ff-only", label: "Fast-forward only", icon: "keyboard_double_arrow_right" }, { value: "merge", label: "Merge", icon: "merge" }, { value: "rebase", label: "Rebase", icon: "rebase" }]} onchange={value => pullMode = value as typeof pullMode} disabled={blocked} matchTriggerWidth /></div>
        <Button variant="secondary" class="remote-primary" disabled={blocked || !selectedBranch || !repository.branch || !!status.operation} onclick={() => run("Pull", pull)}><MaterialIcon name="download" size={18} />Pull into {repository.branch ?? "current branch"}</Button>
      </section>
      <section class="remote-card">
        <div class="remote-heading"><MaterialIcon name="cloud_upload" size={20} /><h3>Publish</h3></div>
        <div class="remote-field"><label for="git-push-kind">Operation</label><NavigationDropdown id="git-push-kind" label="Remote write operation" placeholder="Push branch" value={pushKind} items={[{ value: "push", label: "Push branch", icon: "cloud_upload" }, { value: "push-tag", label: "Push tag", icon: "label" }, { value: "delete-branch", label: "Delete remote branch", icon: "delete" }, { value: "delete-tag", label: "Delete remote tag", icon: "delete" }]} disabled={blocked} onchange={chooseKind} matchTriggerWidth /></div>
        {#if !deleting}<div class="remote-field"><label for="git-push-local">Local {tag ? "tag" : "branch"}</label><NavigationDropdown id="git-push-local" label="Local reference to push" placeholder="Choose local reference" value={localName} items={localRefs.map(item => ({ value: item.name, label: item.name, icon: tag ? "label" : "account_tree" }))} disabled={blocked} onchange={value => { localName = value; targetName = value; }} matchTriggerWidth /></div>{/if}
        <label>Remote {tag ? "tag" : "branch"}<input aria-label="Remote reference name" bind:value={targetName} disabled={blocked} required spellcheck="false" /></label>
        {#if pushKind === "push"}<label class="remote-toggle"><input type="checkbox" bind:checked={setUpstream} disabled={blocked} />Set tracking branch after push</label><label class="remote-toggle"><input type="checkbox" bind:checked={lease} disabled={blocked} />Replace remote tip with lease</label>{#if lease}<p class="hint">Rewrites only if the reviewed remote tip is still current.</p>{/if}{/if}
        {#if !repository.head && !deleting}<p class="hint">Create a local commit in Changes before publishing.</p>{/if}
        <Button variant="secondary" class="remote-primary" disabled={blocked || !targetName || !deleting && !localRefs.some(item => item.name === localName)} onclick={() => run("Review push", reviewPush)}>Review {deleting ? "deletion" : "push"}</Button>
        {#if validReview && reviewed}<div class="remote-summary"><div><span>{remote}/{targetName}</span><code>{reviewed.oid?.slice(0, 8) ?? "New reference"}</code></div>{#if !deleting}<div><span>Publish {localName}</span><code>{localRefs.find(item => item.name === localName)?.oid.slice(0, 8)}</code></div>{/if}</div>
          {#if deleting || lease}<label>Type the remote reference name to confirm<input aria-label="Confirm remote reference name" bind:value={confirmation} autocomplete="off" disabled={blocked} /></label>{/if}
          <Button class="remote-primary" disabled={blocked || (deleting || lease) && confirmation !== targetName} onclick={() => run(deleting ? "Delete remote reference" : "Push", push)}>{deleting ? "Delete remote reference" : lease ? "Push with lease" : "Push now"}</Button>
        {/if}
      </section>
    {:else if connection && hostedPath}<HostedRepository {connection} path={hostedPath} section={view} branch={repository.branch ?? ""} head={repository.head ?? ""} {disabled} onbusy={value => { hostedBusy = value; onbusy(value); }} />
    {:else}<section class="remote-card"><p>Choose a matching account connection to use hosted requests, issues and checks.</p><Button variant="secondary" onclick={onsettings}>Configure upstream connections</Button></section>{/if}
  {/if}
  {#if pending}<div class="remote-message remote-progress" role="status"><span>{progress?.phase ?? pending}{progress?.total ? ` · ${Math.round(progress.loaded / progress.total * 100)}%` : "…"}</span>{#if progress?.total}<progress max={progress.total} value={progress.loaded} aria-label="Git transfer progress"></progress>{/if}<Button variant="ghost" size="sm" onclick={() => { controller?.abort(); void repositoryClient.cancelRemote(operationId); }}>Cancel transfer</Button></div>{/if}
  {#if error}<p class="remote-message" role="alert">{error}</p>{/if}{#if notice}<p class="remote-message" role="status">{notice}</p>{/if}
</section>

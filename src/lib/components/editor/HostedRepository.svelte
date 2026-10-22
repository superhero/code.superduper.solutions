<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import { providerApi } from "$lib/remotes/loader";
  import { connectionAccess, connectionUnlocked } from "$lib/remotes/connections";
  import { remoteError } from "$lib/remotes/policy";
  import type { Check, Connection, Issue, ProviderApi, Review } from "$lib/remotes/types";
  let { connection, path, section, branch, head, disabled = false, onbusy }:
    { connection: Connection; path: string; section: string; branch: string; head: string; disabled?: boolean; onbusy(value: boolean): void } = $props();
  let reviews = $state<Review[]>([]), issues = $state<Issue[]>([]), checks = $state<Check[]>([]), selected = $state<Review>(), ticket = $state<Issue>();
  let pending = $state(""), error = $state(""), notice = $state(""), reviewFilter = $state<"open" | "closed" | "merged">("open"), issueFilter = $state<"open" | "closed">("open"), page = $state(1), more = $state(false);
  let creating = $state(false), title = $state(""), body = $state(""), source = $state(""), target = $state("main"), draft = $state(false), comment = $state("");
  let mergeMethod = $state<"merge" | "squash" | "rebase">("merge"), merging = $state(false), confirmClose = $state(false), ref = $state("");
  let controller: AbortController | undefined, disposed = false;
  const blocked = $derived(disabled || !!pending), requests = $derived(section === "Requests");
  const requestLabel = $derived(connection.provider === "gitlab" ? "Merge requests" : "Pull requests");
  const itemState = $derived(requests ? reviewFilter : issueFilter);
  const authenticated = $derived(connectionUnlocked(connection) && !!connectionAccess(connection).token);
  const open = (value: string) => ["open", "opened", "new"].includes(value.toLowerCase());
  const link = (value: string) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } };
  onMount(() => () => { disposed = true; });
  async function run(label: string, task: (api: ProviderApi) => Promise<void>) {
    if (blocked) return; pending = label; error = ""; notice = ""; controller = new AbortController(); onbusy(true);
    try { await task(await providerApi(connection, controller.signal)); }
    catch (failure) { if (!disposed) error = remoteError(failure, connectionUnlocked(connection) ? connectionAccess(connection).token : ""); }
    finally { if (!disposed) pending = ""; onbusy(false); controller = undefined; }
  }
  async function load(api: ProviderApi, append = false) {
    const nextPage = append ? page + 1 : 1;
    if (section === "Checks") { checks = await api.checks(path, ref || head || branch); return; }
    if (requests) { const result = await api.reviews(path, itemState, nextPage); reviews = append ? [...reviews, ...result.items] : result.items; more = result.more; }
    else { const result = await api.issues(path, issueFilter, nextPage); issues = append ? [...issues, ...result.items] : result.items; more = result.more; }
    page = nextPage;
  }
  $effect(() => {
    const key = [connection.id, path, section, itemState];
    untrack(() => { selected = undefined; ticket = undefined; creating = false; merging = false; comment = ""; source = branch; ref = head || branch; void run("Loading", api => load(api)); }); void key;
  });
  async function create(api: ProviderApi) {
    if (!title.trim()) throw new Error("Enter a title.");
    if (requests) { selected = await api.createReview(path, { title: title.trim(), body, source, target, draft }); notice = "Request created."; }
    else { ticket = await api.createIssue(path, title.trim(), body); notice = "Issue created."; }
    title = ""; body = ""; creating = false; await load(api);
  }
  async function reviewAction(api: ProviderApi, kind: "comment" | "approve" | "close" | "merge") {
    if (!selected) return; const id = selected.id;
    if (kind === "comment" && !comment.trim()) throw new Error("Write a comment first.");
    await api.reviewAction(path, { kind, id, body: comment, oid: selected.oid, method: mergeMethod });
    notice = kind === "merge" ? "Merged upstream. Fetch to update local tracking branches." : kind === "approve" ? "Approval submitted." : kind === "comment" ? "Comment posted." : "Request closed.";
    comment = ""; merging = false; confirmClose = false; selected = await api.review(path, id); await load(api);
  }
  async function issueAction(api: ProviderApi, action: "comment" | "close") {
    if (!ticket) return;
    if (action === "comment" && !comment.trim()) throw new Error("Write a comment first.");
    await api.issueAction(path, ticket.id, action, comment); comment = "";
    notice = action === "close" ? "Issue closed." : "Comment posted.";
    if (action === "close") ticket = { ...ticket, state: "closed" };
    await load(api); confirmClose = false;
  }
  function newItem() { creating = !creating; title = ""; body = ""; selected = undefined; ticket = undefined; if (requests && creating) void run("Reading default branch", async api => { target = (await api.repository(path)).defaultBranch; }); }
</script>

<section class="remote-ui" aria-label={section === "Checks" ? "Upstream checks" : requests ? requestLabel : "Upstream issues"}>
  <section class="remote-card">
    <div class="remote-heading"><MaterialIcon name={section === "Checks" ? "fact_check" : requests ? "merge" : "task_alt"} size={20} /><h3>{section === "Checks" ? "Checks" : requests ? requestLabel : "Issues"}</h3><Button variant="ghost" size="icon-sm" aria-label={`Refresh ${section.toLowerCase()}`} tooltip="Refresh" disabled={blocked} onclick={() => run("Refreshing", api => load(api))}><MaterialIcon name="refresh" size={18} /></Button></div>
    {#if section !== "Checks"}
      <div class="remote-pair"><NavigationDropdown label="Upstream item state" placeholder="Open" value={itemState} items={[{ value: "open", label: "Open", icon: "radio_button_unchecked" }, { value: "closed", label: "Closed", icon: "check_circle" }, ...(requests ? [{ value: "merged", label: "Merged", icon: "merge" }] : [])]} disabled={blocked} onchange={value => { if (requests) reviewFilter = value as typeof reviewFilter; else issueFilter = value as typeof issueFilter; }} matchTriggerWidth /><Button variant="secondary" disabled={blocked || !authenticated} onclick={newItem}>{creating ? "Cancel" : requests ? "New request" : "New issue"}</Button></div>
      {#if !authenticated}<p class="hint">Add or unlock an account token in Settings to post changes.</p>{/if}
      {#if creating}<form class="remote-ui" onsubmit={event => { event.preventDefault(); void run("Creating", create); }}>
        <label>Title<input bind:value={title} required maxlength="250" disabled={blocked} /></label>
        {#if requests}<div class="remote-pair"><label>Source branch<input bind:value={source} required disabled={blocked} spellcheck="false" /></label><label>Target branch<input bind:value={target} required disabled={blocked} spellcheck="false" /></label></div><label class="remote-toggle"><input type="checkbox" bind:checked={draft} disabled={blocked} />Draft request</label>{/if}
        <label>Description<textarea rows="4" bind:value={body} disabled={blocked}></textarea></label><Button type="submit" class="remote-primary" disabled={blocked || !title.trim() || requests && (!source || !target || source === target)}>Create {requests ? "request" : "issue"}</Button>
      </form>{/if}
      <div class="remote-list">{#if requests}{#each reviews as item (item.id)}<button class="remote-entry" aria-pressed={selected?.id === item.id} disabled={blocked} onclick={() => run("Reading request", async api => { selected = await api.review(path, item.id); ticket = undefined; comment = ""; merging = false; confirmClose = false; })}><MaterialIcon name="merge" size={18} /><span><strong>#{item.id} {item.title}</strong><small>{item.draft ? "Draft · " : ""}{item.source} → {item.target} · {item.author}</small></span></button>{:else}{#if !pending}<p class="hint">No {itemState} requests.</p>{/if}{/each}
        {:else}{#each issues as item (item.id)}<button class="remote-entry" aria-pressed={ticket?.id === item.id} disabled={blocked} onclick={() => { ticket = item; selected = undefined; comment = ""; confirmClose = false; }}><MaterialIcon name="task_alt" size={18} /><span><strong>#{item.id} {item.title}</strong><small>{item.state} · {item.author}</small></span></button>{:else}{#if !pending}<p class="hint">No {itemState} issues.</p>{/if}{/each}{/if}</div>
      {#if more}<Button variant="secondary" class="remote-primary" disabled={blocked} onclick={() => run("Loading more", api => load(api, true))}>Load more</Button>{/if}
    {:else}
      <form class="remote-ui" onsubmit={event => { event.preventDefault(); void run("Reading checks", api => load(api)); }}><label>Branch or commit<input bind:value={ref} disabled={blocked} required spellcheck="false" /></label><Button type="submit" variant="secondary" disabled={blocked || !ref}>Read checks</Button></form>
      <div class="remote-list">{#each checks as check}<div class="remote-entry"><MaterialIcon name={["success", "successful", "passed"].includes(check.state.toLowerCase()) ? "check_circle" : ["failed", "failure", "error"].includes(check.state.toLowerCase()) ? "error" : "pending"} size={18} /><span><strong>{check.name}</strong><small>{check.state}</small></span>{#if link(check.url)}<a class="remote-link" href={link(check.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${check.name}`}><MaterialIcon name="open_in_new" size={16} /></a>{/if}</div>{:else}{#if !pending}<p class="hint">No checks reported for this reference.</p>{/if}{/each}</div>
    {/if}
  </section>
  {#if selected}<section class="remote-card" aria-label="Selected upstream request">
    <div class="remote-heading"><MaterialIcon name="merge" size={20} /><h3>#{selected.id} {selected.title}</h3></div><p class="hint">{selected.source} → {selected.target} · {selected.state} · {selected.oid.slice(0, 8)}</p>
    <pre>{selected.body || "No description."}</pre>{#if link(selected.url)}<a class="remote-link" href={link(selected.url)} target="_blank" rel="noopener noreferrer">Review changes upstream<MaterialIcon name="open_in_new" size={14} /></a>{/if}
    <label>Comment<textarea bind:value={comment} rows="3" disabled={blocked || !authenticated}></textarea></label>
    <div class="remote-actions"><Button size="sm" variant="secondary" disabled={blocked || !authenticated || !comment.trim()} onclick={() => run("Posting comment", api => reviewAction(api, "comment"))}>Post comment</Button><Button size="sm" variant="secondary" disabled={blocked || !authenticated || !open(selected.state) || selected.draft} onclick={() => run("Approving request", api => reviewAction(api, "approve"))}>Approve</Button></div>
    {#if open(selected.state)}<div class="remote-actions"><Button size="sm" variant="secondary" disabled={blocked || !authenticated || selected.draft} onclick={() => { merging = !merging; confirmClose = false; }}>Merge…</Button><Button size="sm" variant="ghost" disabled={blocked || !authenticated} onclick={() => { if (!confirmClose) { confirmClose = true; merging = false; } else void run("Closing request", api => reviewAction(api, "close")); }}>{confirmClose ? "Confirm close request" : "Close request…"}</Button></div>{/if}
    {#if merging}<div class="remote-divider"></div><p>Merge <strong>{selected.source}</strong> into <strong>{selected.target}</strong> on {connection.label}.</p><NavigationDropdown label="Upstream merge method" placeholder="Merge" value={mergeMethod} items={[{ value: "merge", label: connection.provider === "gitlab" ? "Project merge policy" : "Merge commit", icon: "merge" }, { value: "squash", label: "Squash", icon: "compress" }, ...(connection.provider === "github" ? [{ value: "rebase", label: "Rebase", icon: "rebase" }] : [])]} disabled={blocked} onchange={value => mergeMethod = value as typeof mergeMethod} matchTriggerWidth /><Button class="remote-primary" disabled={blocked || !authenticated || !selected.oid} onclick={() => run("Merging upstream", api => reviewAction(api, "merge"))}>Merge request upstream</Button>{/if}
  </section>{/if}
  {#if ticket}<section class="remote-card" aria-label="Selected upstream issue"><div class="remote-heading"><MaterialIcon name="task_alt" size={20} /><h3>#{ticket.id} {ticket.title}</h3></div><p class="hint">{ticket.state} · {ticket.author}</p><pre>{ticket.body || "No description."}</pre>{#if link(ticket.url)}<a class="remote-link" href={link(ticket.url)} target="_blank" rel="noopener noreferrer">Open issue upstream<MaterialIcon name="open_in_new" size={14} /></a>{/if}<label>Comment<textarea bind:value={comment} rows="3" disabled={blocked || !authenticated}></textarea></label><div class="remote-actions"><Button variant="secondary" size="sm" disabled={blocked || !authenticated || !comment.trim()} onclick={() => run("Posting comment", api => issueAction(api, "comment"))}>Post comment</Button>{#if open(ticket.state)}<Button variant="ghost" size="sm" disabled={blocked || !authenticated} onclick={() => { if (!confirmClose) confirmClose = true; else void run("Closing issue", api => issueAction(api, "close")); }}>{confirmClose ? "Confirm close issue" : "Close issue…"}</Button>{/if}</div></section>{/if}
  {#if pending}<p role="status" class="remote-message">{pending}…</p>{/if}{#if error}<p role="alert" class="remote-message">{error}</p>{/if}{#if notice}<p role="status" class="remote-message">{notice}</p>{/if}
</section>

<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import * as Sheet from "$lib/components/ui/sheet";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import FileIcon from "$lib/components/FileIcon.svelte";
  import WidthDivider from "./WidthDivider.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import GitDiffView from "./GitDiff.svelte";
  import GitRemotes from "./GitRemotes.svelte";
  import type { RemoteCommand } from "$lib/remotes/types";
  import { repositoryClient, type RepositorySnapshot } from "$lib/repository/client";
  import type { EditorSettings } from "$lib/editor/settings";
  import type { GitAction, GitStatus, GitDiff, GitCommitDetails } from "$lib/repository/local-git-types";

  let { open = $bindable(false), tab = $bindable("Changes"), docked = false, request = 0, width, maximumWidth, resizeDisabled = false, actionsDisabled = false,
    onresizestart, onresizepreview, onresizeend, repository, settings, initialCommit = "", initialTab = "Changes", onaction, oncheckout, onremote, onbranch, onsettings, onopendiff, onopenfile, onopencommitdiff }:
    { open?: boolean; tab?: string; docked?: boolean; request?: number; width: number; maximumWidth: number; resizeDisabled?: boolean; actionsDisabled?: boolean;
      onresizestart(): void; onresizepreview(width: number): void; onresizeend(width: number | undefined): void;
      repository: RepositorySnapshot; settings: EditorSettings; initialCommit?: string; initialTab?: string;
      onaction(request: GitAction): Promise<void>; oncheckout(oid: string): Promise<boolean>; onremote(request: RemoteCommand): Promise<void>; onbranch(name: string): Promise<void>; onsettings(): void; onopendiff(path:string): void; onopenfile(path:string): void; onopencommitdiff(path:string,oid:string): void } = $props();
  const tabs = [{ value: "Changes", label: "Staging", icon: "difference" }, { value: "Commits", label: "Commits", icon: "history" },
    { value: "Actions", label: "Actions", icon: "account_tree" }, { value: "Remotes", label: "Remotes", icon: "cloud" }, { value: "Stashes", label: "Stashes", icon: "inventory_2" }];
  let status = $state.raw<GitStatus>(), failure = $state(""), busy = $state(false);
  let diff = $state.raw<GitDiff>(), diffKind = $state<"working" | "staged" | "commit">("working"), draft = $state("");
  let selected = $state.raw<GitCommitDetails>(), commitOid = $state("");
  let recoveryTarget = $state("");
  let subject = $state(""), body = $state(""), name = $state(""), email = $state("");
  let command = $state<GitAction["kind"]>("merge"), target = $state(""), newName = $state(""), mainline = $state(1);
  let mergeMode = $state<"merge" | "ff-only" | "squash">("merge"), resetMode = $state<"soft" | "mixed" | "hard">("mixed");
  let confirmed = $state(false), includeUntracked = $state(true), amend = $state(false), partial = $state(false);
  let diffEpoch = 0, loadEpoch = 0, authorLoaded = false;
  let observedStatusRevision:string|undefined;
  let committing=$state(false);
  let stagingChoiceHead = $state<string>();
  const stagingChosen = $derived(stagingChoiceHead !== undefined && stagingChoiceHead === (repository.head ?? ""));
  let defaultStageAttempt = $state<string>();
  const author = $derived({ name, email });
  const stagedCount = $derived(status?.files.filter(file => file.head !== file.stage).length ?? 0);
  const motionDuration = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 120;
  const message = $derived(subject.trim() + (body.trim() ? `\n\n${body.trim()}` : ""));
  const canCommit = $derived(!!name.trim() && !!email.trim() && !!subject.trim() && !status?.operation &&
    (amend || status?.files.some(file => file.head !== file.stage)));
  const commands: { value: GitAction["kind"]; label: string; icon: string }[] = [
    { value: "merge", label: "Merge branch", icon: "merge" },
    { value: "rebase", label: "Rebase branch", icon: "rebase" },
    { value: "cherry-pick", label: "Cherry-pick commit", icon: "commit" },
    { value: "revert", label: "Revert commit", icon: "undo" },
    { value: "squash", label: "Squash commits through branch tip", icon: "compress" },
    { value: "reset", label: "Reset branch", icon: "restart_alt" },
    { value: "recover", label: "Recovery", icon: "restore" },
    { value: "tag", label: "Create tag", icon: "label" },
    { value: "delete-tag", label: "Delete tag", icon: "label_off" },
    { value: "rename-branch", label: "Rename branch", icon: "edit" },
    { value: "delete-branch", label: "Delete branch", icon: "delete" },
  ];
  const actionTarget = $derived(command === "recover" ? recoveryTarget : target);
  const targetType = $derived(command === "recover" ? "recovery checkpoint"
    : ["merge", "rebase", "rename-branch", "delete-branch"].includes(command) ? "branch"
    : command === "delete-tag" ? "tag"
    : ["cherry-pick", "revert", "squash"].includes(command) ? "commit" : "branch, tag or commit");
  const targetItems = $derived.by(() => {
    if (command === "recover") return (status?.recoveries ?? []).map(point => ({
      value: point.ref, label: `${point.oid.slice(0, 8)} · ${point.label}`, icon: "restore"
    }));
    const branches = (status?.branches ?? []).map(branch => ({ value: `refs/heads/${branch.name}`, label: branch.name, icon: "account_tree" }));
    if (targetType === "branch") return branches.filter(branch => command === "rename-branch" || branch.value !== `refs/heads/${repository.branch}`);
    const tags = (status?.tags ?? []).map(tag => ({ value: `refs/tags/${tag.name}`, label: `Tag · ${tag.name}`, icon: "label" }));
    if (targetType === "tag") return tags;
    const commits = repository.commits.map(commit => ({ value: commit.oid, label: `${commit.oid.slice(0, 8)} · ${commit.message.split("\n")[0]}`, icon: "commit" }));
    return targetType === "commit" ? commits : [...branches, ...tags, ...commits];
  });
  $effect(() => {
    if (tab !== "Actions" || command === "recover" || !status || targetItems.some(item => item.value === target)) return;
    target = targetItems[0]?.value ?? "";
    confirmed = false;
  });
  $effect(() => {
    if (tab !== "Actions" || command !== "recover" || !status) return;
    void repository.head; void repository.branch;
    if (!status.recoveries.some(point => point.ref === recoveryTarget)) recoveryTarget = status.recoveries[0]?.ref ?? "";
    confirmed = false;
  });
  async function reload() {
    const epoch = ++loadEpoch;
    const result = await repositoryClient.gitStatus(repository.id);
    if (epoch !== loadEpoch) return;
    const previouslyStaged = new Set(status?.files.filter(file => file.head !== file.stage).map(file => file.path));
    if (result.files.some(file => previouslyStaged.has(file.path) && file.head === file.stage && file.work !== file.stage))
      rememberStagingChoice(true);
    status = result;
    observedStatusRevision=open?result.revision:undefined;
    if (!authorLoaded) { name = result.author.name || name; email = result.author.email || email; authorLoaded = true; }
  }
  $effect(() => {
    const shown = open, entry = request, inspect = initialCommit, view = initialTab;
    if (!shown) return;
    untrack(() => {
      defaultStageAttempt = undefined;
      selectTab(inspect ? "Commits" : view);
      if (inspect) void inspectCommit(inspect);
      void entry;
    });
  });
  $effect(() => {
    const id = repository.id, revision = repository.revision, shown = open;
    if (!shown) { observedStatusRevision=undefined;return; }
    if (busy || observedStatusRevision===revision) return;
    return untrack(() => {
      failure = "";
      void reload().catch(error => failure = String(error));
      void revision;
    });
  });
  $effect(() => {
    const id = repository.id;
    untrack(() => {
      // A draft belongs to this repository, not to source files or the Git config.
      try {
        stagingChoiceHead = sessionStorage.getItem(`code.git-staging-choice:${id}`) ?? undefined;
        const saved = JSON.parse(sessionStorage.getItem(`code.git-draft:${id}`) ?? "null");
        if (saved && !subject) { subject = saved.subject ?? ""; body = saved.body ?? ""; }
        const identity = JSON.parse(localStorage.getItem("code.git-author") ?? "null");
        if (identity) { name ||= identity.name ?? ""; email ||= identity.email ?? ""; }
      } catch { /* Optional drafts cannot prevent Git access. */ }
    });
  });
  function rememberStagingChoice(chosen: boolean) {
    stagingChoiceHead = chosen ? repository.head ?? "" : undefined;
    try {
      const key = `code.git-staging-choice:${repository.id}`;
      if (stagingChoiceHead !== undefined) sessionStorage.setItem(key, stagingChoiceHead); else sessionStorage.removeItem(key);
    } catch { /* Keep the current review usable if session storage is unavailable. */ }
  }
  $effect(() => {
    const snapshot = status;
    if (!open || tab !== "Changes" || busy || actionsDisabled || !snapshot || snapshot.revision !== repository.revision || snapshot.operation) return;
    if (!snapshot.files.length) {
      if (stagingChoiceHead !== undefined) untrack(() => rememberStagingChoice(false));
      return;
    }
    if (stagingChosen) return;
    if (snapshot.files.some(file => file.head !== file.stage)) {
      if (snapshot.files.some(file => file.work !== file.stage)) untrack(() => rememberStagingChoice(true));
      return;
    }
    if (defaultStageAttempt === snapshot.revision) return;
    untrack(() => {
      // Automatic preparation is not a manual exclusion. Bound a failed attempt
      // to this revision while allowing later reviews to get the default again.
      defaultStageAttempt = snapshot.revision;
      void run({ kind: "stage" }, true);
    });
  });
  function selectTab(next: string) {
    diffEpoch++; tab = next; diff = undefined; partial = false; confirmed = false;
    if (next === "Actions" && !commands.some(action => action.value === command)) { command = "merge"; target = ""; }
  }
  $effect(() => {
    const value = { subject, body }, id = repository.id;
    try { sessionStorage.setItem(`code.git-draft:${id}`, JSON.stringify(value)); } catch { /* Optional cache. */ }
  });
  async function run(request: GitAction, automatic = false) {
    if (busy) return;
    const keepChoice = stagingChosen;
    committing=request.kind==="commit"||request.kind==="amend";
    busy = true; failure = "";
    try {
      await onaction({ ...request, author });
      if (!automatic && (request.kind === "stage" || request.kind === "unstage")) rememberStagingChoice(true);
      try { localStorage.setItem("code.git-author", JSON.stringify(author)); } catch { /* Optional identity cache. */ }
      await reload();
      if (request.kind === "commit" || request.kind === "amend") {
        if (keepChoice) rememberStagingChoice(!!status?.files.length);
        subject = ""; body = ""; amend = false;
      }
      if (diff && request.kind !== "commit" && request.kind !== "amend") await showDiff(diff.path, diffKind);
      else if (request.kind === "commit" || request.kind === "amend") diff = undefined;
    } catch (error) { failure = error instanceof Error ? error.message : String(error); }
    finally { busy = false; committing = false; confirmed = false; }
  }
  async function showDiff(path: string, kind: typeof diffKind = "working", oid = commitOid) {
    const epoch = ++diffEpoch;
    try {
      const value = await repositoryClient.gitDiff(repository.id, { kind, path, ...(kind === "commit" ? { oid } : {}) });
      if (epoch !== diffEpoch) return;
      diff = value; diffKind = kind; draft = value.after; partial = false;
    } catch (error) { failure = error instanceof Error ? error.message : String(error); }
  }
  function openEditorFile(path:string){
    diffEpoch++;diff=undefined;partial=false;
    onopenfile(path);
  }
  function openEditorDiff(path:string){
    diffEpoch++;diff=undefined;
    onopendiff(path);
  }
  async function inspectCommit(oid: string) {
    commitOid = oid; selected = undefined; diff = undefined;
    try { const result = await repositoryClient.gitCommit(repository.id, oid); if (commitOid === oid) selected = result; }
    catch (error) { failure = String(error); }
  }
  function chooseAction(kind: GitAction["kind"], oid = commitOid) {
    command = kind; target = oid; confirmed = false; tab = "Actions"; diff = undefined;
  }
  function execute() {
    if (!targetItems.some(item => item.value === actionTarget) || command === "recover" && !confirmed) return;
    const request: GitAction = { kind: command, target: actionTarget, message, mainline,
      mode: command === "reset" ? resetMode : mergeMode, name: newName, force: confirmed };
    if (command === "delete-branch" || command === "delete-tag") request.name = target.replace(/^refs\/(heads|tags)\//, "");
    if (command === "rename-branch") request.target = target.replace(/^refs\/heads\//, "");
    void run(request);
  }
  function scrollTabs(event: WheelEvent & { currentTarget: HTMLElement }) {
    const tabs = event.currentTarget;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || tabs.scrollWidth <= tabs.clientWidth) return;
    const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(tabs).fontSize) * 1.5
      : event.deltaMode === 2 ? tabs.clientWidth : 1;
    tabs.scrollLeft += event.deltaY * unit;
    event.preventDefault();
  }
  function revealFocusedTab(event: FocusEvent & { currentTarget: HTMLElement }) {
    const tab = event.target instanceof Element ? event.target.closest(".git-tab") : null;
    if (!tab) return;
    const bounds = tab.getBoundingClientRect(), visible = event.currentTarget.getBoundingClientRect();
    if (bounds.left < visible.left) event.currentTarget.scrollLeft += bounds.left - visible.left;
    else if (bounds.right > visible.right) event.currentTarget.scrollLeft += bounds.right - visible.right;
  }
  function alignHeaderIcons(panel: HTMLDivElement) {
    const tab = panel.querySelector<HTMLElement>(".git-tab"), content = tab?.querySelector<HTMLElement>(".button-content");
    const icon = content?.querySelector<HTMLElement>(".material-symbols-rounded");
    if (!tab || !content || !icon) return;
    // Centered tabs gain space as the pane grows; share the first icon's actual column.
    const observer = new ResizeObserver(() => {
      const bounds = icon.getBoundingClientRect();
      if (bounds.width) panel.style.setProperty("--git-tab-icon-center", `${bounds.x + bounds.width / 2 - panel.getBoundingClientRect().x - panel.clientLeft + (tab.parentElement?.scrollLeft ?? 0)}px`);
      else panel.style.removeProperty("--git-tab-icon-center");
    });
    for (const element of [tab, content, icon]) observer.observe(element);
    return { destroy: () => observer.disconnect() };
  }
</script>

<Sheet.Pane bind:open {docked} {width} label={`Git · ${repository.name}`}>
  {#snippet divider(moving: boolean)}<WidthDivider edge="left" label="Resize Git pane" minimum={320} maximum={maximumWidth} disabled={resizeDisabled || busy || moving}
    onstart={onresizestart} onpreview={onresizepreview} onend={onresizeend}/>{/snippet}
  <div class="git-panel" data-git-panel data-hover="foreground" data-layout={docked ? "docked" : "overlay"} use:alignHeaderIcons>
    <header class="git-header">
      <div class="pane-title"><MaterialIcon name="account_tree" size={16} /><h2 tabindex="-1" data-pane-heading>Git</h2></div>
      <span class="git-status" role="status">{busy ? "Working…" : repository.head?.slice(0, 8) ?? "First commit"}</span>
    </header>
    <div class="git-context">
      <Button variant="ghost" size="icon-sm" aria-label="Close" tooltip="Close Git pane" onclick={() => open = false}><MaterialIcon name="close" size={18} /></Button>
    </div>
    <nav class="git-tabs" aria-label="Git views" onwheel={scrollTabs} onfocusin={revealFocusedTab}>
      {#each tabs as item}<Button class="git-tab" variant="ghost" aria-pressed={tab === item.value} disabled={busy} onclick={() => selectTab(item.value)}>
        <MaterialIcon name={item.icon} size={15} /><span>{item.label}</span>
      </Button>{/each}
    </nav>
    <div class="git-scroll">
      {#if failure}<div role="alert" class="git-error" in:fade={{ duration: motionDuration() }}><MaterialIcon name="error" size={18} /><p>{failure}</p></div>{/if}
      {#if !status}<div class="empty-state" role="status"><MaterialIcon name="account_tree" size={28} /><p>Reading repository…</p></div>{:else}
        {#if status.operation}
          <section class="git-card operation" aria-label="Git operation in progress">
            <div class="card-heading"><MaterialIcon name="merge" size={20} /><h3>{status.operation.label}</h3></div>
            <p class="operation-state">{status.operation.conflicts.length} unresolved files</p>
            <div class="actions"><Button size="sm" disabled={busy || status.operation.conflicts.length > 0} onclick={() => run({ kind: "continue" })}><MaterialIcon name="play_arrow" size={16} />Continue</Button>
              {#if status.operation.kind === "rebase"}<Button size="sm" variant="secondary" disabled={busy} onclick={() => run({ kind: "skip" })}>Skip commit</Button>{/if}
              <Button size="sm" variant="secondary" disabled={busy} onclick={() => run({ kind: "abort" })}>Abort operation</Button></div>
            {#each status.operation.conflicts as path}<div class="conflict-row"><strong><FileIcon {path} />{path}</strong>
              <div class="actions"><Button size="sm" variant="secondary" disabled={busy} onclick={() => { tab = "Changes"; void showDiff(path); }}>Edit result</Button>
                <Button size="sm" variant="secondary" disabled={busy} onclick={() => run({ kind: "resolve", path, resolution: "ours" })}>Use current</Button>
                <Button size="sm" variant="secondary" disabled={busy} onclick={() => run({ kind: "resolve", path, resolution: "theirs" })}>Use incoming</Button>
                <Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ kind: "resolve", path, resolution: "delete" })}>Delete file</Button></div>
            </div>{/each}
          </section>
        {/if}
        {#if tab !== "Stashes"}{#key tab}<div class="view-content">
          {#if tab === "Changes"}
            <section class="git-card changes-card" aria-label="Changes to commit">
              <div class="card-heading"><MaterialIcon name="difference" size={20} /><h3>Working changes</h3></div>
              <div class="actions section-actions"><Button variant="secondary" size="sm" disabled={busy || !status.files.some(file => file.work !== file.stage) || !!status.operation?.conflicts.length} onclick={() => run({ kind: "stage" })}><MaterialIcon name="add" size={16} />Stage all</Button>
                <Button variant="secondary" size="sm" disabled={busy || !stagedCount} onclick={() => run({ kind: "unstage" })}><MaterialIcon name="remove" size={16} />Unstage all</Button>
                {#if stagedCount}<span class="staged-count">{stagedCount} {stagedCount === 1 ? "file" : "files"} staged</span>{/if}</div>
              <div class="file-list">{#each status.files as file (file.path)}<div class="file-row" class:active={diff?.path === file.path && diffKind !== "commit"}>
                <button class="file-name" title={file.path} disabled={busy || actionsDisabled} aria-label={file.path} onclick={() => openEditorFile(file.path)}><FileIcon path={file.path} /><span>{file.path}</span></button>
                <span class="file-state" class:conflicted={file.conflicted} class:added={file.head === 0} class:deleted={file.work === 0} title={file.conflicted ? "Conflict" : file.head === 0 ? "New" : file.work === 0 ? "Deleted" : "Modified"}>{file.conflicted ? "!" : file.head === 0 ? "A" : file.work === 0 ? "D" : "M"}</span>
                <div class="row-actions">
                  {#if file.head !== file.stage}<Button variant="secondary" size="icon-sm" aria-label="Staged diff" tooltip="Staged diff" disabled={busy || actionsDisabled || file.conflicted} onclick={() => openEditorDiff(file.path)}><MaterialIcon name="text_compare" size={17} /></Button><Button variant="secondary" size="icon-sm" aria-label="Unstage" tooltip="Unstage" disabled={busy || file.conflicted} onclick={() => run({ kind: "unstage", paths: [file.path] })}><MaterialIcon name="remove" size={17} /></Button>{/if}
                  {#if file.work !== file.stage || file.conflicted}<Button variant="secondary" size="icon-sm" aria-label="Working diff" tooltip="Working diff" disabled={busy || actionsDisabled} onclick={() => showDiff(file.path)}><MaterialIcon name="text_compare" size={17} /></Button><Button variant="secondary" size="icon-sm" aria-label="Stage file" tooltip="Stage file" disabled={busy || file.conflicted} onclick={() => run({ kind: "stage", paths: [file.path] })}><MaterialIcon name="add" size={17} /></Button>{/if}
                </div>
              </div>{/each}</div>
            </section>
          {:else if tab === "Commits"}
            <div class="commit-browser">
              <section class="git-card" aria-label="Source commits"><div class="card-heading"><MaterialIcon name="history" size={20} /><h3>Commits</h3><span class="count">{repository.commits.length}</span></div>
                <div class="commit-list">{#each repository.commits as commit (commit.oid)}<button class:active={commit.oid === commitOid} aria-pressed={commit.oid === commitOid} disabled={busy} onclick={() => inspectCommit(commit.oid)}><MaterialIcon name="commit" size={17} /><span class="commit-subject">{commit.message.split("\n")[0]}</span><code>{commit.oid.slice(0, 8)}</code></button>{:else}<div class="empty-state"><MaterialIcon name="commit" size={28} /><p>No commits yet.</p></div>{/each}</div>
              </section>
              <section class="git-card commit-details" aria-label="Selected commit">{#if selected}
                <div class="card-heading"><MaterialIcon name="commit" size={20} /><h3>{selected.message.split("\n")[0]}</h3><code>{selected.oid.slice(0, 8)}</code></div>
                <p class="commit-author">{selected.author.name} <span>&lt;{selected.author.email}&gt;</span></p>
                {#if selected.message.split("\n").slice(1).join("\n").trim()}<pre>{selected.message.split("\n").slice(1).join("\n").trim()}</pre>{/if}
                <div class="actions"><Button size="sm" variant="secondary" disabled={busy || actionsDisabled || selected.oid === repository.head || !repository.commits.some(commit => commit.oid === selected?.oid)} onclick={async () => { try { if (await oncheckout(selected!.oid)) open = false; } catch (error) { failure = String(error); } }}>Check out commit</Button>
                  <Button size="sm" variant="secondary" disabled={busy} onclick={() => chooseAction("cherry-pick")}>Cherry-pick</Button>
                  <Button size="sm" variant="secondary" disabled={busy} onclick={() => chooseAction("revert")}>Revert</Button>
                  <Button size="sm" variant="secondary" disabled={busy} onclick={() => chooseAction("squash")}>Squash from here</Button>
                  {#if selected.oid === repository.head}<Button size="sm" variant="secondary" disabled={busy} onclick={() => { subject = selected!.message.split("\n")[0]!; body = selected!.message.split("\n").slice(1).join("\n").trim(); amend = true; tab = "Changes"; }}>Amend / reword</Button>{/if}</div>
                <div class="section-divider"></div>
                <div class="commit-files">{#each selected.files as path}<button disabled={busy} class:active={diff?.path === path && diffKind === "commit"} onclick={() => { diffEpoch++; diff=undefined; onopencommitdiff(path,selected!.oid); }}><FileIcon {path} /><span>{path}</span><MaterialIcon name="text_compare" size={17} /></button>{/each}</div>
              {:else}<div class="empty-state"><MaterialIcon name="commit" size={28} /><p>{commitOid ? "Reading commit…" : "Select a commit to inspect it."}</p></div>{/if}</section>
            </div>
          {:else if tab === "Actions"}
            <section class="git-card git-form" aria-label="Local Git actions">
              <div class="card-heading"><MaterialIcon name="account_tree" size={20} /><h3>Git operations</h3></div>
              <div class="field dropdown-field"><label for="git-command">Operation</label><NavigationDropdown id="git-command" label="Git operation" placeholder="Choose operation" value={command} items={commands} disabled={busy || !!status.operation} onchange={value => { command = value as GitAction["kind"]; confirmed = false; }} matchTriggerWidth /></div>
              <div class="field dropdown-field"><label for="git-target">Target <span class="label-detail">({targetType})</span></label><NavigationDropdown id="git-target" label="Git target" value={actionTarget} items={targetItems} disabled={busy || !targetItems.length} placeholder={command === "recover" ? "Choose checkpoint" : targetType === "branch, tag or commit" ? "Choose target" : `Choose ${targetType}`} placeholderIcon={command === "recover" ? "restore" : targetType === "commit" ? "commit" : targetType === "tag" ? "label" : "account_tree"} onchange={value => { if (command === "recover") recoveryTarget = value; else target = value; confirmed = false; }} matchTriggerWidth /></div>
              {#if ["tag", "rename-branch"].includes(command)}<div class="field"><label for="git-new-name">New name</label><input id="git-new-name" bind:value={newName} disabled={busy} /></div>{/if}
              {#if command === "merge"}<div class="field dropdown-field"><label for="git-mode">Merge method</label><NavigationDropdown id="git-mode" label="Merge method" placeholder="Choose merge method" value={mergeMode} items={[{ value: "merge", icon: "merge", label: "Create merge commit" }, { value: "ff-only", icon: "keyboard_double_arrow_right", label: "Fast-forward only" }, { value: "squash", icon: "compress", label: "Squash merge" }]} onchange={value => mergeMode = value as typeof mergeMode} disabled={busy} matchTriggerWidth /></div>{/if}
              {#if command === "reset"}<div class="field dropdown-field"><label for="git-reset-mode">Reset mode</label><NavigationDropdown id="git-reset-mode" label="Reset mode" placeholder="Choose reset mode" value={resetMode} items={[{ value: "soft", icon: "restart_alt", label: "Soft · keep index and working files" }, { value: "mixed", icon: "restart_alt", label: "Mixed · reset index, keep working files" }, { value: "hard", icon: "restart_alt", label: "Hard · replace tracked working files" }]} onchange={value => resetMode = value as typeof resetMode} disabled={busy} matchTriggerWidth /></div>{/if}
              {#if command === "cherry-pick" || command === "revert"}<div class="field"><label for="git-mainline">Parent number for merge commits</label><input id="git-mainline" type="number" min="1" bind:value={mainline} disabled={busy} /></div>{/if}
              {#if ["squash", "rebase", "reset", "recover", "delete-tag", "delete-branch"].includes(command)}<label class="confirmation"><input type="checkbox" bind:checked={confirmed} disabled={busy} /><span>{command === "recover" ? "Reset the current branch to this checkpoint" : command === "delete-branch" ? "Allow deletion of an unmerged branch" : command === "delete-tag" ? "Delete this tag" : "I have reviewed the commits and resulting branch change"}</span></label>{/if}
              {#if command === "squash"}<p class="hint">Combines the selected commit through the branch tip. Enter the replacement message below.</p>{/if}
              {#if command === "rebase"}<p class="hint">Replays this branch onto the target. Conflicts pause for resolution.</p>{/if}
              {#if command === "recover" && !status.recoveries.length}<p class="hint">No recovery checkpoints.</p>{/if}
              <Button class="primary-action operation-action" variant="secondary" disabled={busy || actionsDisabled || !!status.operation || !actionTarget || (["squash", "rebase", "reset", "recover", "delete-tag"].includes(command) && !confirmed)} onclick={execute}><MaterialIcon name={commands.find(item => item.value === command)?.icon ?? "account_tree"} size={18} />{busy ? "Working…" : commands.find(item => item.value === command)?.label}</Button>
            </section>
          {:else if tab === "Remotes"}
            <GitRemotes {repository} {status} {author} disabled={resizeDisabled} {onaction} {onremote} {onbranch} {onsettings} onbusy={value => busy = value} />
          {/if}
        </div>{/key}{/if}
        {#if diff}
          <section class="git-card diff-review" aria-label="Git diff" in:fade={{ duration: motionDuration() }}>
            <div class="card-heading"><FileIcon path={diff.path} size={20} /><h3 title={diff.path}>{diff.path}<span class="review-kind">{diffKind === "working" ? "Unstaged" : diffKind === "staged" ? "Staged" : "Committed"}</span></h3><Button variant="ghost" size="icon-sm" aria-label="Close Git diff" tooltip="Close diff" onclick={() => { diffEpoch++; diff = undefined; }}><MaterialIcon name="close" size={16} /></Button></div>
            <div class="comparison-labels" aria-hidden="true"><span>{diffKind === "commit" ? "Parent" : diffKind === "staged" ? "HEAD" : "Index"}</span><span>{partial ? "Staged draft" : diffKind === "commit" ? "Commit" : diffKind === "staged" ? "Index" : "Working file"}</span></div>
            <GitDiffView {diff} {settings} disabled={busy} editable={partial || !!status.operation?.conflicts.includes(diff.path)} onchange={value => draft = value}
              {...(diffKind === "working" && !status.operation ? { onstage: (content: string) => void run({ kind: "stage", path: diff!.path, content }) } : {})} />
            {#if status.operation?.conflicts.includes(diff.path)}<Button class="primary-action" size="sm" disabled={busy || diff.binary} onclick={() => run({ kind: "resolve", path: diff!.path, content: draft })}>Save resolution</Button>
            {:else if diffKind === "working"}<div class="actions"><Button size="sm" variant="secondary" disabled={busy || diff.binary} onclick={() => { partial = !partial; draft = diff!.after; }}>{partial ? "Cancel staged edit" : "Edit staged version"}</Button>
              {#if partial}<Button size="sm" disabled={busy} onclick={() => run({ kind: "stage", path: diff!.path, content: draft })}>Stage edited version</Button>{/if}
              <Button size="sm" variant="ghost" disabled={busy} onclick={() => { if (command !== "discard" || target !== diff!.path) { command = "discard"; target = diff!.path; } else void run({ kind: "discard", paths: [diff!.path] }); }}>{command === "discard" && target === diff.path ? "Confirm discard unstaged changes" : "Discard unstaged changes…"}</Button>
            </div>{/if}
          </section>
        {/if}
        {#if ["Changes", "Actions", "Stashes"].includes(tab) && !(tab === "Actions" && command === "recover")}
          <section class="git-card commit-form" aria-label="Commit details">
            {#snippet authorIdentity()}
              <div class="identity"><label>Author name<input id="git-author-name" name="name" aria-label="Commit author name" bind:value={name} disabled={busy} autocomplete="name" placeholder="Your name" /></label><label>Author email<input id="git-author-email" name="email" type="email" aria-label="Commit author email" bind:value={email} disabled={busy} autocomplete="email" autocapitalize="none" spellcheck={false} placeholder="you@example.com" /></label></div>
            {/snippet}
            <div class="card-heading"><MaterialIcon name={tab === "Stashes" ? "inventory_2" : "commit"} size={20} /><h3>{tab === "Changes" ? "Commit" : tab === "Stashes" ? "Stash" : "Commit details"}</h3></div>
            {#if tab !== "Changes"}{@render authorIdentity()}<div class="section-divider"></div>{/if}
            <label>{tab === "Stashes" ? "Stash message" : "Commit subject"}<input aria-label="Commit subject" bind:value={subject} disabled={busy} placeholder={tab === "Stashes" ? "What are you setting aside?" : "What changed?"} /></label>
            {#if tab === "Stashes"}
              <div class="stash-controls"><label class="confirmation"><input type="checkbox" bind:checked={includeUntracked} disabled={busy} /><span>Include untracked files</span></label><Button variant="secondary" size="sm" disabled={busy || !!status.operation || !name || !email} onclick={() => run({ kind: "stash-push", message: subject, includeUntracked })}><MaterialIcon name="add" size={16} />Stash changes</Button></div>
            {/if}
            {#if tab !== "Stashes"}<label>Details<textarea aria-label="Commit body" bind:value={body} rows="3" disabled={busy} placeholder="Optional details"></textarea></label>{/if}
            {#if tab === "Changes"}
              <label class="confirmation"><input type="checkbox" bind:checked={amend} disabled={busy || !repository.head} /><span>Amend latest commit</span></label>
              {@render authorIdentity()}
              <Button variant="secondary" class="primary-action" disabled={busy || !canCommit} onclick={() => run({ kind: amend ? "amend" : "commit", message })}><MaterialIcon name="commit" size={18} />{committing ? "Working…" : amend ? "Amend commit" : "Commit staged changes"}</Button>
            {/if}
          </section>
        {/if}
        {#if tab === "Stashes"}
            <section class="git-card" aria-label="Stashes">
              <div class="card-heading"><MaterialIcon name="inventory_2" size={20} /><h3>Stashes</h3><span class="count">{status.stashes.length}</span></div>
              {#each status.stashes as stash}<article class="saved-entry"><div class="entry-heading"><MaterialIcon name="inventory_2" size={17} /><strong>{stash.message}</strong><code>{stash.oid.slice(0, 8)}</code></div>
                <div class="actions"><Button size="sm" variant="secondary" disabled={busy} onclick={() => { tab = "Commits"; void inspectCommit(stash.oid); }}>Inspect</Button>
                  <Button size="sm" variant="secondary" disabled={busy || !!status.operation} onclick={() => run({ kind: "stash-apply", target: stash.oid })}>Apply</Button>
                  <Button size="sm" variant="secondary" disabled={busy || !!status.operation} onclick={() => run({ kind: "stash-pop", target: stash.oid })}>Pop</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onclick={() => { target = stash.oid; command = "stash-drop"; confirmed = false; }}>Drop</Button>
                  {#if command === "stash-drop" && target === stash.oid}<Button size="sm" disabled={busy} onclick={() => run({ kind: "stash-drop", target: stash.oid, force: true })}>Confirm drop</Button>{/if}</div>
              </article>{/each}
            </section>
        {/if}
      {/if}
    </div>
  </div>
</Sheet.Pane>
<style>
  .git-panel { --git-divider: color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; background: var(--color-background); color: var(--color-foreground); font-size: .75rem; container: git-pane / inline-size; }
  .git-panel[data-layout="docked"] { border-left: 2px solid var(--git-divider); }
  /* Account for the close glyph's inset in its 2rem button when matching the text's right edge. */
  .git-header { height: var(--workbench-header-height, 48px); flex: 0 0 var(--workbench-header-height, 48px); min-height: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px calc(12px + 1rem - 9px) 6px calc(var(--git-tab-icon-center, calc(11px + .46875rem)) - .5rem); }
  .pane-title { display: flex; align-items: center; gap: 9px; min-width: 0; }
  h2 { margin: 0; font-size: .6875rem; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .git-context { height: 40px; flex: 0 0 40px; padding: 4px 12px 4px calc(var(--git-tab-icon-center, calc(11px + .46875rem)) - .46875rem); display: flex; align-items: center; justify-content: flex-end; gap: 12px; background: var(--color-toolbar-background); color: var(--color-toolbar-foreground); }
  code { font-family: "JetBrains Mono", monospace; font-size: .625rem; white-space: nowrap; }
  .git-status { margin-left: auto; display: flex; gap: 7px; align-items: center; font-size: .5625rem; white-space: nowrap; }
  @media (max-width: 950px) { .git-status { font-size: .5rem; } }
  .git-tabs { display: flex; min-width: 0; height: var(--workbench-tabs-height, 40px); flex: 0 0 var(--workbench-tabs-height, 40px); padding: 0; background: var(--color-surface); border-block: 2px solid var(--git-divider); overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
  .git-tabs :global(.git-tab) { flex: 1 0 auto; height: var(--workbench-tabs-content-height, 36px); padding: 6px 11px; border-radius: 0; background: var(--color-hover-background); font-size: .625rem; gap: 6px; }
  .git-tabs :global(.git-tab[aria-pressed="true"]) { background: var(--color-background); }
  .git-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px; scroll-padding-block: 16px; }
  .view-content { min-width: 0; }
  .git-card { min-width: 0; padding: 18px; background: var(--color-surface); border-radius: 4px; }
  .git-card + .git-card, .operation + .view-content, .view-content + .git-card { margin-top: 16px; }
  .card-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; min-width: 0; }
  .card-heading h3 { margin: 0; font-size: .8125rem; font-weight: 650; flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .card-heading > code, .count { margin-left: auto; }
  .count { font-size: .625rem; padding: 2px 7px; border-radius: 4px; background: var(--color-background); }
  p { margin: 0; line-height: 1.7; }
  .actions, .row-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .actions :global(button), .stash-controls :global(button) { font-size: .6875rem; }
  .file-list:not(:empty) { margin-top: 12px; }
  .staged-count { margin-left: auto; font-size: .6875rem; }
  .file-list { display: flex; flex-direction: column; gap: 2px; }
  .file-row { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 2px 4px 2px 0; border-radius: 4px; }
  .file-row.active { background: var(--color-background); }
  .file-name { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; border-radius: 4px; padding: 9px 8px; text-align: left; background: transparent; color: inherit; }
  .file-name span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-state { color: var(--color-git-modified); font-family: "JetBrains Mono", monospace; font-size: .625rem; min-width: 12px; text-align: center; }
  .file-state.added { color: var(--color-git-added); }.file-state.deleted, .file-state.conflicted { color: var(--color-git-removed); }
  .row-actions { flex-wrap: nowrap; }
  .empty-state { min-height: 108px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; text-align: center; padding: 20px 12px; }
  .git-error { display: flex; align-items: flex-start; gap: 10px; background: var(--color-error-background, var(--color-surface)); color: var(--color-error-foreground, var(--color-foreground)); padding: 16px; border-radius: 4px; margin-bottom: 16px; overflow-wrap: anywhere; }
  .git-error > :global(.material-symbols-rounded) { margin-top: 2px; }
  .operation-state { margin-bottom: 12px; }
  .conflict-row { margin-top: 18px; padding-top: 16px; background-image: repeating-linear-gradient(to right, var(--color-background) 0 6px, transparent 6px 14px); background-size: 100% 1px; background-repeat: no-repeat; }
  .conflict-row strong { display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; margin-bottom: 12px; }
  .git-form, .commit-form { display: grid; gap: 16px; }
  .git-form .card-heading, .commit-form .card-heading { margin-bottom: 2px; }
  .field, .commit-form label { display: grid; gap: 7px; min-width: 0; }
  .dropdown-field { gap: 0; }
  .dropdown-field > label { padding-bottom: 7px; }
  .dropdown-field:has(:global(.navigation-trigger:enabled)) > label { cursor: pointer; }
  @media (hover: hover) {
    .dropdown-field:has(:global(.navigation-trigger:enabled)):hover > label { color: var(--color-hover-foreground); }
    .dropdown-field:hover :global(.navigation-trigger:enabled) { color: var(--color-hover-foreground); }
  }
  label { font-size: .6875rem; font-weight: 600; }
  .label-detail { font-size: .625rem; opacity: .5; }
  .field :global(.navigation-trigger) { box-sizing: border-box; width: 100%; height: 36px; justify-content: flex-start; padding: 8px 11px; background: var(--color-background); border-radius: 4px; font-size: .75rem; }
  .field :global(.navigation-label) { flex: 1; text-align: left; }
  input:not([type="checkbox"]), textarea { box-sizing: border-box; width: 100%; min-width: 0; padding: 9px 11px; border: 0; border-radius: 4px; background: var(--color-background); color: var(--color-foreground); font: inherit; font-size: .75rem; font-weight: 400; }
  input:not([type="checkbox"]) { height: 36px; }textarea { field-sizing: content; resize: none; overflow: hidden; min-height: 80px; }
  input::placeholder, textarea::placeholder { color: inherit; opacity: .55; }
  input:focus-visible, textarea:focus-visible, .field:focus-within :global(.navigation-trigger:enabled:focus-visible) { background: var(--color-focus-background); color: var(--color-focus-foreground); }
  .identity { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .identity input { padding-block: 8px 10px; }
  .section-divider { height: 1px; background: repeating-linear-gradient(to right, var(--color-background) 0 6px, transparent 6px 14px); margin-block: 4px; }
  .confirmation, .commit-form .confirmation { display: flex; align-items: center; gap: 10px; min-height: 24px; font-weight: 400; cursor: pointer; padding: 4px 0; }
  .confirmation input { appearance: none; position: relative; width: 32px; flex: 0 0 32px; height: 19px; border-radius: 20px; background: var(--color-background); cursor: pointer; }
  .confirmation input::before { content: ""; position: absolute; width: 11px; height: 11px; top: 4px; left: 4px; background: var(--color-foreground); border-radius: 50%; transition: transform 100ms ease-in; }
  .confirmation input:checked { background: var(--color-foreground); }.confirmation input:checked::before { transform: translateX(13px); background: var(--color-background); }
  .confirmation:has(:focus-visible) { background: var(--color-focus-background); color: var(--color-focus-foreground); border-radius: 4px; }
  /* Native disabling blocks repeat actions without changing button colors or fills. */
  input:disabled, textarea:disabled { color: color-mix(in srgb, var(--color-foreground) 45%, var(--color-background)); background-color: var(--color-background); cursor: not-allowed; }
  .confirmation input:disabled::before { opacity: .45; }
  .git-panel :global(.primary-action) { width: 100%; font-size: .75rem; }
  .commit-form :global(.primary-action), .row-actions :global(button), .stash-controls :global(button), .section-actions :global(button), .commit-details .actions :global(button), .git-panel :global(.operation-action) { position: relative; }
  .commit-form :global(.primary-action:disabled)::after, .row-actions :global(button:disabled)::after, .stash-controls :global(button:disabled)::after, .section-actions :global(button:disabled)::after, .commit-details .actions :global(button:disabled)::after, .git-panel :global(.operation-action:disabled)::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: color-mix(in srgb, var(--color-surface) 50%, transparent); pointer-events: none; }
  .hint { font-size: .6875rem; }
  .commit-browser { display: grid; gap: 16px; }
  .commit-list, .commit-files { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .commit-list { max-height: 260px; overflow: auto; }
  .commit-list button, .commit-files button { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px; border-radius: 4px; background: var(--color-background); color: inherit; text-align: left; }
  .commit-list button.active, .commit-files button.active { background: var(--color-focus-background); color: var(--color-focus-foreground); }
  .commit-subject, .commit-files button > span:not(.material-symbols-rounded) { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .commit-author { margin-bottom: 16px; overflow-wrap: anywhere; }.commit-author span { display: block; }
  .commit-details pre { font: inherit; font-size: .75rem; white-space: pre-wrap; overflow-wrap: anywhere; margin-bottom: 16px; }
  .commit-details .section-divider { margin-block: 18px; }
  .entry-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }.entry-heading strong { min-width: 0; flex: 1; overflow-wrap: anywhere; font-weight: 600; }
  .saved-entry { margin-top: 16px; padding: 14px; border-radius: 4px; background: var(--color-background); }.saved-entry .actions :global(button) { background: var(--color-surface); }
  .stash-controls { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .review-kind { display: block; margin-top: 4px; font-size: .625rem; font-weight: 400; }
  .comparison-labels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px; background: var(--color-background); padding: 8px 12px; font-size: .625rem; }
  .comparison-labels span + span { padding-left: 12px; }
  .diff-review .actions, .diff-review > :global(.primary-action) { margin-top: 14px; }
  @container git-pane (max-width: 420px) { .git-scroll { padding: 12px; }.git-card { padding: 14px; }.git-tabs :global(.git-tab) { padding-inline: 9px; }.git-tabs :global(.material-symbols-rounded) { display: none; }.identity { grid-template-columns: minmax(0, 1fr); }.card-heading { margin-bottom: 14px; } }
  @container git-pane (min-width: 760px) { .git-scroll { padding: 24px; }.commit-browser { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); }.git-card { padding: 24px; }.git-tabs :global(.git-tab) { flex: 0 0 auto; padding-inline: 24px; } }
  @media (prefers-reduced-motion: reduce) { .confirmation input::before { transition: none; } }
</style>

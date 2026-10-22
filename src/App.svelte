<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import {middleClickClosesTab} from "$lib/editor/keybindings";
  import { interfaceFontStack, googleFont } from "$lib/editor/fonts";
  import { activateEditorFont } from "$lib/editor/font-storage";
  import { onMount, tick, untrack } from "svelte";
  import { Tooltip } from "bits-ui";
  import { Button } from "$lib/components/ui/button";
  import * as Sheet from "$lib/components/ui/sheet";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import FileIcon from "$lib/components/FileIcon.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import FileDiff from "$lib/components/editor/FileDiff.svelte";
  import SplitEditor from "$lib/components/editor/SplitEditor.svelte";
  import ExplorerDivider from "$lib/components/editor/ExplorerDivider.svelte";
  import PaneDividers from "$lib/components/editor/PaneDividers.svelte";
  import CodeEditor from "$lib/components/editor/CodeEditor.svelte";
  import AIPanel from "$lib/components/assistant/AIPanel.svelte";
  import VaultPage from "$lib/components/vault/VaultPage.svelte";
  import GitPanel from "$lib/components/editor/GitPanel.svelte";
  import CloneRepository from "$lib/components/editor/CloneRepository.svelte";
  import type { GitAction } from "$lib/repository/local-git-types";
  import type { RemoteCommand, CloneRequest } from "$lib/remotes/types";
  import HistoryPanel from "$lib/components/editor/HistoryPanel.svelte";
  import FileTree from "$lib/components/editor/FileTree.svelte";
  import FileName from "$lib/components/editor/FileName.svelte";
  import RepositoryContextMenu from "$lib/components/editor/RepositoryContextMenu.svelte";
  import PageMinimap from "$lib/components/editor/PageMinimap.svelte";
  import { keybindingActions, shortcutsFor, matchesShortcut } from "$lib/editor/keybindings";
  import SettingsPage from "$lib/components/editor/SettingsPage.svelte";
  import ResourcesPage from "$lib/components/resources/ResourcesPage.svelte";
  import { mappedLanguageForPath } from "$lib/editor/languages";
  import { DEFAULT_SETTINGS, normalizeSettings, resolveSettings, languageForPath, type EditorSettings, type SettingsStore } from "$lib/editor/settings";
  import { ancestorDirectories } from "$lib/editor/file-tree";
  import { resolveFileConfiguration } from "$lib/editor/editorconfig";
  import { tabDrag } from "$lib/editor/tab-drag";
  import { prepareSplitMotion } from "$lib/editor/split-motion";
  import type { FormattingSnapshot } from "$lib/editor/formatting";
  import { formatterFor } from "$lib/formatting/routing";
  import { installedPackages, packageFor, subscribeFormatterPackages } from "$lib/formatting/registry";
  import { formatDocument, disposeFormatter } from "$lib/formatting/client";
  import { resolveFormattingConfiguration } from "$lib/formatting/configuration";
  import { repositoryClient, subscribeRepositoryProgress, type RepositorySnapshot, type RepositorySummary, type ImportedFile } from "$lib/repository/client";
  import { attachGitDirectory, gitDirectoryLink } from "$lib/repository/import";
  import { WORKSPACE_KEY, rightDockWidths, normalizeWorkspace, emptyRepositoryWorkspace, reconcileRepositoryWorkspace,
    renameRepositoryWorkspace, commitDiffTab, commitDiffOid, diffTab, isDiffTab, isStagedDiffTab, tabFile, tabLabel, activePaneTab, tabAfterClose, moveWorkspaceTab, resolvePaneSizes, splitPaneSizes, removePaneSize, type WorkspacePage, type WorkspaceState, type RepositoryWorkspace, type EditorSession, type EditorViewport, type HistoryView, type RightPane } from "$lib/editor/workspace";
  import { beginStartup, finishStartup, rememberAppearance } from "$lib/startup";
  import { updateStartupItem, skipStartupItems, type StartupItem, type StartupStatus } from "$lib/startup-progress";

  import {activityScopeKey} from "$lib/repository/activity-scope";
  import type { ActivityScope, ActivityState, ActivitySnapshot, ActivityCommand, ActivityResult, EditGroup } from "$lib/repository/types";

  type Page = WorkspacePage;
  type Form = "repository" | "branch" | "file" | "delete" | "reload";
  let repositories = $state<RepositorySummary[]>([]);
  let repository = $state.raw<RepositorySnapshot | null>(null);
  const markdownRepository = $derived.by(() => {
    const selected = repository;
    return selected ? { id: selected.id, revision: selected.revision, files: new Set(selected.files), read: (file: string) => repositoryClient.read(selected.id, file) } : undefined;
  });
  const gitToolRepository = $derived.by(() => {
    const selected = repository;
    return selected ? { id: selected.id, head: selected.head, branch: selected.branch, branches: selected.branches, commits: selected.commits,
      status: async () => { const status = await repositoryClient.gitStatus(selected.id); return { revision: status.revision, files: status.files, branches: status.branches, tags: status.tags }; },
      commit: (oid: string) => repositoryClient.gitCommit(selected.id, oid),
      diff: (request: import("$lib/repository/local-git-types").GitDiffRequest) => repositoryClient.gitDiff(selected.id, request),
    } : undefined;
  });
  let path = $state("");
  let contents = $state("");
  let openedFiles = $state<string[]>([]);
  let page = $state<Page>("editor");
  let workspace = $state.raw<WorkspaceState>(normalizeWorkspace(null));
  let activity = $state.raw<ActivitySnapshot>({ revision: "", canUndo: false, canRedo: false, legacyRedoAllowed: false, state: null });
  let activityWrites: Promise<void> = Promise.resolve();
  let activityPending = $state(0);
  let activityError = $state("");
  let replaying = $state(false);
  let restoreEpoch = $state(0);
  let treeRestoreEpoch = $state(0);
  let activePane=$state("primary");
  let primarySource=$state<HTMLDivElement>();
  let primaryDiff=$state<{focus():void;flushSession():void}>();
  let diffViewport = $state<EditorViewport>();
  let diffPresented = $state(false);
  let editorDocument = $state<HTMLDivElement>();
  let editorTabs = $state<HTMLDivElement>();
  let splitMotion=$state.raw<{capture:ReturnType<typeof prepareSplitMotion>;id:string;repository:string;path:string;epoch:number;layout:string;played:boolean}>();
  let explorerPreview=$state<number>();
  let explorerResize:{before:ActivityState;epoch:number}|undefined;
  let previewPaneSizes=$state.raw<number[]>();
  let paneResize=$state.raw<{before:ActivityState;repository:string;path:string;layout:string;epoch:number}>();
  let splitEditors=$state<Record<string,{flushSession():void;focus():void;captureFormatting():FormattingSnapshot|undefined;applyFormatting(snapshot:FormattingSnapshot,formatted:string):boolean;formatSettings():EditorSettings}|undefined>>({});
  let pendingPaneFocus:{repository:string;pane:string;file:string}|undefined;
  let splitReady = $state.raw<Record<string,string>>({});
  let splitBuffers = $state.raw<Record<string,string>>({});
  let editorComponent = $state<{ focus():void; flushSession(): void; captureViewport():EditorViewport|undefined;
    captureFormatting(): FormattingSnapshot | undefined;
    applyFormatting(snapshot: FormattingSnapshot, formatted: string): boolean }>();
  let formatting = $state(false);
  let formattingEpoch = 0;
  let settingsComponent = $state<{ resetAll(): void; resetKeybindings(): void }>();
  let replayReady: { id: string; epoch: number; resolve(): void } | undefined;
  let workspaceReady = $state(false);
  let workspaceError = $state("");
  let workspaceSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let workspaceLeaving = false;
  let restoringChrome = 0;
  let chromeRequest = 0;
  let fileTabs = $state<HTMLDivElement>();
  let historyPanel = $state<HTMLDivElement>();
  let changesGraph = $state<{ revealCurrent(panel: HTMLElement): void }>();
  let settingsPanel = $state<HTMLDivElement>();
  let resourcesPanel = $state<HTMLDivElement>();
  const currentWorkspace = $derived(repository ? workspace.repositories[repository.id] ?? emptyRepositoryWorkspace() : emptyRepositoryWorkspace());
  const fileDiffOpen = $derived(currentWorkspace.fileDiffOpen);
  const splitViews = $derived(currentWorkspace.splitViews);
  const focusedSplit=$derived(splitViews.find(view=>view.id===activePane));
  const activeDiffOpen=$derived(focusedSplit?.diffOpen??(focusedSplit?false:fileDiffOpen));
  const activeFileTab=$derived(activePaneTab(currentWorkspace));
  const splitLayout=$derived(JSON.stringify(splitViews.map(view=>[view.id,view.file])));
  const paneSizes=$derived(previewPaneSizes??resolvePaneSizes(currentWorkspace.paneSizes,splitViews.length+1));
  const paneColumns=$derived(paneSizes.map(size=>`minmax(0,${size}fr)`).join(" "));
  const currentSession = $derived(Object.hasOwn(currentWorkspace.documents, path) ? currentWorkspace.documents[path] : undefined);
  let loading = $state(true);
  let starting = $state(true);
  let resourcesStarted = $state(false);
  $effect(() => { if (page === "resources") resourcesStarted = true; });
  let stopStartupProgress = () => {};
  let startupDisposed = false;
  let startupPositionFailed = false;
  let appearanceReady = $state(false);
  let chromeReady = $state(false);
  let editorReady = $state("");
  let configurationReady = $state(false);
  let storageReady = $state(false);
  let busy = $state(false);
  let gitIndexBusy = $state(false);
  let indexSnapshot = $state<{revision:string;workingRevision:string}>();
  const workingRevision = $derived(repository?.revision===indexSnapshot?.revision?indexSnapshot?.workingRevision??"":repository?.revision??"");
  let fileNavigation = $state(false);
  let fileNavigationStatus = $state("Opening file…");
  let fileNavigationRequest = 0;
  let hmrUpdating = $state(false);
  let pending = $state(0);
  let writeFailed = $state(false);
  let error = $state("");
  let fileError = $state("");
  let settings = $state<SettingsStore>(normalizeSettings(null));
  let settingsScope = $state<"global" | "repository" | "file">("global");
  const activeHistoryScope:ActivityScope|undefined=$derived(page==='resources'||page==='vault'?undefined:page==='settings'?
    {kind:'settings',scope:settingsScope,...(settingsScope!=='global'&&repository?{repositoryId:repository.id}:{}),
      ...(settingsScope==='file'?{file:path}:{})}:repository?{kind:'repository',repositoryId:repository.id}:undefined);
  const activeHistory=$derived(activeHistoryScope?activity.histories?.[activityScopeKey(activeHistoryScope)]:undefined);
  const canUndo = $derived(Boolean(activeHistory?.canUndo)||activeHistoryScope?.kind==='repository'&&Boolean(repository?.canUndo));
  const canRedo = $derived(Boolean(activeHistory?.canRedo)||activeHistoryScope?.kind==='repository'&&(activeHistory?.legacyRedoAllowed??activity.scopedLegacyRedoAllowed??activity.legacyRedoAllowed)&&Boolean(repository?.canRedo));
  const settingsResetLabel = $derived(settingsScope === "file" ? "Reset file overrides" : settingsScope === "repository" ? "Reset repository overrides" : "Reset global defaults");
  let preferencePending = $state(0);
  let settingsError = $state("");
  let fileConfiguration = $state<Partial<EditorSettings>>({});
  let configurationRevision = $state(0);
  let systemDark = $state(false);
  let form = $state<Form>("repository");
  let formOpen = $state(false);
  let ollamaOpen = $derived((workspace.rightPanes?.includes("ai") ?? workspace.rightPane === "ai"));
  let vaultRevision = $state(0);
  let gitOpen = $derived((workspace.rightPanes?.includes("git") ?? workspace.rightPane === "git"));
  let gitInitialCommit = $state(""), gitInitialTab = $state("Changes"), gitRequest = $state(0);
  let historyOpen = $derived(workspace.rightPanes?.includes("history") ?? false);
  let historyPreview = $state<number>();
  let historyResize: { before: ActivityState; epoch: number } | undefined;
  let gitActiveTab = $state("Changes");
  let workAreaWidth = $state(0);
  let workbenchHeader = $state<HTMLElement>();
  let workbenchHeaderHeight = $state(48), workbenchTabsHeight = $state(40), workbenchTabsContentHeight = $state(36);
  $effect(() => {
    const header = workbenchHeader, tabs = fileTabs;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height + (entry.target === tabs ? 4 : 0);
        if (height <= 0) continue;
        if (entry.target === header) workbenchHeaderHeight = height;
        else { workbenchTabsHeight = height; workbenchTabsContentHeight = entry.contentRect.height; }
      }
    });
    if (header) observer.observe(header);
    if (tabs) observer.observe(tabs);
    return () => observer.disconnect();
  });
  let gitPreview = $state<number>();
  let gitResize: { before: ActivityState; epoch: number } | undefined;
  let dockResizeWidths = $state.raw<Record<RightPane, number>>();
  const rightPaneCount = $derived(Number(ollamaOpen) + Number(gitOpen && Boolean(repository)) + Number(historyOpen && Boolean(repository)));
  const compactRightPanes = $derived(rightPaneCount > 1 && workAreaWidth < Math.max(1000, 320 * (rightPaneCount + 1)));
  const rightWidths = $derived(rightDockWidths(workAreaWidth, {
    ...(ollamaOpen ? { ai: dockResizeWidths?.ai ?? workspace.aiPaneWidth ?? 380 } : {}),
    ...(gitOpen && repository ? { git: gitPreview ?? dockResizeWidths?.git ?? workspace.gitPaneWidth ?? 320 } : {}),
    ...(historyOpen && repository ? { history: historyPreview ?? dockResizeWidths?.history ?? workspace.historyPaneWidth ?? 440 } : {})
  }));
  const gitMaximumWidth = $derived(Math.max(320, Math.min(1600, workAreaWidth - (rightPaneCount > 1 ? 320 + rightWidths.ai + rightWidths.history : 560))));
  const historyMaximumWidth = $derived(Math.max(320, Math.min(1600, workAreaWidth - (rightPaneCount > 1 ? 320 + rightWidths.ai + rightWidths.git : 560))));
  const gitPaneWidth = $derived(rightWidths.git || 320);
  let formValue = $state("");
  let formInput = $state<HTMLInputElement>();
  let formTarget = $state("");
  let formDirectory = $state(false);
  let formError = $state("");
  let cursor = $state({ line: 1, column: 1 });
  let directoryInput: HTMLInputElement;
  let fileExplorer = $state<HTMLDivElement>();
  let gitDirectoryInput = $state<HTMLInputElement>();
  let pendingImport = $state.raw<{ name: string; files: ImportedFile[]; gitDirectory: string } | null>(null);
  let gitImportError = $state("");
  let writes: Promise<void> = Promise.resolve();
  let preferences: Promise<void> = Promise.resolve();
  let historyRequests: Promise<void> = Promise.resolve();
  let activeAction: Promise<void> = Promise.resolve();
  const reloadWaiters = new Set<() => void>();
  const controlsBusy = $derived(busy || hmrUpdating || Boolean(activityError));
  // The write lock still guards every action. Index-only work freezes its
  // workspace containers without reconfiguring every editor and control.
  const workspaceBusy = $derived(controlsBusy && !gitIndexBusy);
  const activeRepositoryId = $derived(repository?.id);
  const effective = $derived(resolveSettings(settings, activeRepositoryId, path, fileConfiguration));
  const toolbarUndoVisible = $derived(page === "settings" ? effective.showSettingsUndoButton : effective.showUndoButton);
  const toolbarRedoVisible = $derived(page === "settings" ? effective.showSettingsRedoButton : effective.showRedoButton);
  let installedFormatters = $state<{ id: string; sha256: string }[]>([]);
  onMount(() => {
    let disposed = false;
    const refresh = async () => {
      try { const records = await installedPackages(); if (!disposed) installedFormatters = records; }
      catch { if (!disposed) installedFormatters = []; }
    };
    const unsubscribe = subscribeFormatterPackages(() => { formattingEpoch++; disposeFormatter(); void refresh(); });
    void refresh();
    return () => { disposed = true; unsubscribe(); };
  });
  const formatPath=$derived(focusedSplit?.file??path);
  const formatPreferences=$derived(resolveSettings(settings,repository?.id,formatPath,focusedSplit?{}:fileConfiguration));
  const formatter = $derived(formatterFor(formatPath, mappedLanguageForPath(formatPath,formatPreferences.languageMappings)??"auto", formatPreferences.formatters));
  const formatterInstalled = $derived(Boolean(formatter && installedFormatters.some(item => {
    const expected = packageFor(formatter!); return item.id === expected.id && item.sha256 === expected.sha256;
  })));
  const canFormat = $derived(formatterInstalled && Boolean(repository && path && formatter && editorComponent)
    && page === "editor" && !controlsBusy && !fileNavigation && !writeFailed && !fileError
    && !replaying && !starting && configurationReady && !formatPreferences.readOnly);
  const formattingContext = $derived(JSON.stringify([repository?.id, formatPath, page, restoreEpoch,
    controlsBusy, fileNavigation, configurationReady, formatPreferences]));
  const selectedInterfaceFont = $derived(effective.interfaceFont);
  const selectedPalette = $derived(effective.palette);
  const selectedTheme = $derived(effective.mode === "system" ? (systemDark ? "dark" : "light") : effective.mode);
  const selectedInterfaceSize = $derived(effective.interfaceSize);
  $effect(() => {
    const font = selectedInterfaceFont;
    if (googleFont(font)) document.documentElement.style.setProperty("--font-interface", interfaceFontStack(font));
    else document.documentElement.style.removeProperty("--font-interface");
    const activate = () => { void activateEditorFont(font, "interface").catch(() => {}); };
    activate();
    window.addEventListener("code-editor-font-installed", activate);
    return () => window.removeEventListener("code-editor-font-installed", activate);
  });
  const selectedEditorFont = $derived(effective.fontFamily);
  $effect(() => {
    const font = selectedEditorFont;
    const activate = () => { void activateEditorFont(font).catch(() => {}); };
    activate();
    window.addEventListener("code-editor-font-installed", activate);
    return () => window.removeEventListener("code-editor-font-installed", activate);
  });
  $effect(() => {
    // Leaving and returning to the same buffer must still invalidate old work.
    // A persistence acknowledgment with the same context is not a new document.
    void formattingContext;
    formattingEpoch++;
  });
  const configurationPaths = $derived(JSON.stringify((repository?.files ?? []).filter(file => file === ".editorconfig" || file.endsWith("/.editorconfig"))));
  const inheritedConfiguration = $derived(JSON.stringify(resolveSettings(settings, repository?.id)));
  const saving = $derived(pending > 0 || preferencePending > 0 || activityPending > 0 || controlsBusy);
  const status = $derived(!storageReady ? "Local storage unavailable" : writeFailed ? "Changes not saved" : activityError ? "History could not be saved" : settingsError ? "Settings not saved" : saving ? "Saving changes…" : fileNavigation ? fileNavigationStatus : "All changes saved");
  const pages: { id: Page; name: string; icon: string }[] = [{ id: "editor", name: "Editor", icon: "wysiwyg" }, { id: "resources", name: "Resources", icon: "monitoring" }, { id: "vault", name: "Vault", icon: "lock" }, { id: "settings", name: "Settings", icon: "tune" }];

  /** Capture deliberate action boundaries; passive position updates are not actions. */
  function captureActivity(): ActivityState {
    if(fileDiffOpen)primaryDiff?.flushSession();else editorComponent?.flushSession();
    for(const editor of Object.values(splitEditors))editor?.flushSession();
    const captured = normalizeWorkspace(workspace);
    captured.repositoryId = repository?.id ?? "";
    captured.page = page;
    if (repository) captured.repositories[repository.id] = {
      ...(captured.repositories[repository.id] ?? emptyRepositoryWorkspace()), tabs: [...openedFiles], activeFile: path,
    };
    return { workspace: captured, settings: normalizeSettings($state.snapshot(settings)) };
  }
  function recordActivity(label: string, before: ActivityState, after: ActivityState,
    command?: () => ActivityCommand, accepted?: (result: ActivityResult) => void, editGroup?: EditGroup): Promise<ActivityResult> {
    activityPending += 1;
    const task = activityWrites.then(async () => {
      try {
        if (activityError) throw new Error(activityError);
        const operation = command?.();
        const result = await repositoryClient.recordActivity({ expected: activity.revision, label, before, after,
          ...(operation ? { command: operation } : {}), ...(editGroup ? { editGroup } : {}) });
        activity = result.activity;
        accepted?.(result);
        return result;
      } catch (failure) {
        if (!(failure instanceof Error && failure.name === "ActivityRejectedError")) activityError = describe(failure);
        throw failure;
      }
      finally { activityPending -= 1; scheduleWorkspaceSave(); }
    });
    activityWrites = task.then(() => {}, () => {});
    return task;
  }
  function recordWorkspace(label: string, before: ActivityState): Promise<ActivityResult> {
    return recordActivity(label, before, captureActivity());
  }
  function editorIsReady(id: string, epoch: number) {
    focusPendingPane("primary",id);
    editorReady = id;
    if (starting) reportStartupItem("editor.layout", "complete");
    if (replayReady?.id === id && replayReady.epoch === epoch) { replayReady.resolve(); replayReady = undefined; }
  }
  function editorProgress(item: "editor.language" | "editor.layout", status: StartupStatus) {
    if (untrack(() => starting && page === "editor")) reportStartupItem(item, status);
  }
  function reportStartupItem(item: StartupItem, status: StartupStatus) {
    if (!startupDisposed && untrack(() => starting)) updateStartupItem(item, status);
  }
  function skipStartupWork(...items: StartupItem[]) {
    if (!startupDisposed && untrack(() => starting)) skipStartupItems(...items);
  }
  async function startupTask<T>(item: StartupItem, task: () => Promise<T>): Promise<T> {
    reportStartupItem(item, "running");
    try {
      const result = await task();
      reportStartupItem(item, "complete");
      return result;
    } catch (failure) { reportStartupItem(item, "error"); throw failure; }
  }
  async function restoreActivity(result: ActivityResult, fileHistory = false) {
    const target = result.activity.state;
    if (!target) return;
    replaying = true;pendingPaneFocus=undefined;
    try {
      const restored = normalizeWorkspace(target.workspace);
      const id = restored.repositoryId;
      let snapshot = id ? result.repository?.id === id ? result.repository : await repositoryClient.open(id) : null;
      const previous = repository;
      if (snapshot && previous?.id === snapshot.id && snapshot.files.length === previous.files.length &&
        snapshot.files.every((file, index) => file === previous.files[index])) snapshot = { ...snapshot, files: previous.files };
      const state = snapshot ? reconcileRepositoryWorkspace(restored.repositories[id] ?? emptyRepositoryWorkspace(), snapshot.files)
        : emptyRepositoryWorkspace();
      let text = "", failure = "";
      if (snapshot && state.activeFile) {
        try { text = await readEditorFile(snapshot, state.activeFile, state.stagedDiffOpen, state.commitDiffOid); }
        catch (problem) { failure = describe(problem); }
      }
      if (snapshot) {
        restored.repositories[id] = state;
      }
      splitBuffers={};
      workspace = restored;
      if (!fileHistory) settings = normalizeSettings(target.settings);
      page = restored.page;
      repository = snapshot; openedFiles = state.tabs; path = state.activeFile; contents = text; fileError = failure;
      if (!fileHistory || snapshot?.files.some(file => file === ".editorconfig" || file.endsWith("/.editorconfig"))) configurationRevision += 1;
      const epoch = restoreEpoch + 1;
      if (!fileHistory) treeRestoreEpoch += 1;
      const ready = snapshot && state.activeFile && page === "editor" && !failure
        ? new Promise<void>(resolve => { replayReady = { id: `${id}:${state.activeFile}`, epoch, resolve }; }) : Promise.resolve();
      restoreEpoch = epoch;
      await tick();
      if (fileHistory) await ready;
      else await Promise.all([restoreChrome(true), ready]);
    } finally { replaying = false; replayReady = undefined; rememberNavigation(); scheduleWorkspaceSave(); }
  }
  function toggleFileDiff(){
    if(!repository||!path||controlsBusy||fileNavigation||fileError)return;
    const pane=focusedSplit;
    if(pane){
      if(pane.diffOpen)closeSplitTab(pane.id,activePaneTab(pane));
      else{
        const key=diffTab(pane.file);
        void changePaneTabs('Open file diff',value=>({...value,splitViews:value.splitViews.map(view=>view.id===pane.id?
          {...view,tabs:view.tabs.includes(key)?view.tabs:[...view.tabs.slice(0,view.tabs.indexOf(view.file)+1),key,...view.tabs.slice(view.tabs.indexOf(view.file)+1)],diffOpen:true,stagedDiffOpen:false,commitDiffOid:undefined}:view)}),{pane:pane.id,file:pane.file});
      }
    }else if(fileDiffOpen)void closeFile(activeFileTab);
    else{diffViewport=editorComponent?.captureViewport();void selectFile(diffTab(path));}
  }
  function openSplit(tab:string,sourceId?:string){
    const file=tabFile(tab);
    if(!repository||!path||controlsBusy||fileNavigation||writeFailed)return;
    pendingPaneFocus=undefined;
    const before=captureActivity();
    stopSplitMotion();
    const capture=!fileDiffOpen&&!splitViews.some(view=>view.diffOpen)&&editorDocument&&editorTabs?prepareSplitMotion(editorDocument,editorTabs):undefined;
    const views=[...splitViews],index=sourceId?views.findIndex(view=>view.id===sourceId)+1:0;
    const id=crypto.randomUUID();
    const session:EditorSession={selection:[{anchor:0,head:0}],mainIndex:0,scrollTop:0,scrollLeft:0};
    views.splice(index,0,{id,file,session,tabs:[tab],documents:{[file]:session},...(isDiffTab(tab)?{diffOpen:true}:{}),...(isStagedDiffTab(tab)?{stagedDiffOpen:true}:{}),...(commitDiffOid(tab)?{commitDiffOid:commitDiffOid(tab)}:{})});
    updateWorkspace(repository.id,{splitViews:views,paneSizes:splitPaneSizes(currentWorkspace.paneSizes,index)});
    if(capture)splitMotion={capture,id,repository:repository.id,path,epoch:restoreEpoch,layout:JSON.stringify(views.map(view=>[view.id,view.file])),played:false};
    page='editor';
    void recordWorkspace(`Open ${file} in split view`,before).catch(()=>{});
  }
  function stopSplitMotion(){splitMotion?.capture.cancel();splitMotion=undefined;}
  function splitPaneReady(paneId:string,documentId:string){
    splitReady={...splitReady,[paneId]:documentId};
    focusPendingPane(paneId,documentId);
    const motion=splitMotion;
    if(!motion||motion.id!==paneId||motion.played)return;
    motion.played=true;
    void tick().then(()=>{
      if(splitMotion!==motion)return;
      const running=motion.capture.play(paneId);
      void running.finished.then(()=>{if(splitMotion===motion)splitMotion=undefined;});
    });
  }
  $effect(()=>{
    const motion=splitMotion;
    if(motion&&(repository?.id!==motion.repository||path!==motion.path||page!=='editor'||fileDiffOpen||restoreEpoch!==motion.epoch||splitLayout!==motion.layout))stopSplitMotion();
  });
  function startExplorerResize(){stopSplitMotion();explorerResize={before:captureActivity(),epoch:restoreEpoch};}
  function setRightPane(pane: RightPane, open: boolean) {
    const current = workspace.rightPanes ?? (workspace.rightPane ? [workspace.rightPane] : []);
    if (current.includes(pane) === open) return;
    const before = captureActivity();
    const next = { ...workspace, rightPanes: open ? [...current, pane] : current.filter(entry => entry !== pane) };
    delete next.rightPane;
    workspace = next;
    scheduleWorkspaceSave();
    void recordWorkspace(`${open ? "Open" : "Close"} ${pane === "ai" ? "AI" : pane === "history" ? "History" : "Git"} pane`, before).catch(() => {});
  }
  function saveAIWidth(width: number) {
    const before = captureActivity();
    workspace = { ...workspace, aiPaneWidth: width };
    scheduleWorkspaceSave();
    void recordWorkspace("Resize AI pane", before).catch(() => {});
  }
  function startHistoryResize(){
    stopSplitMotion();historyResize={before:captureActivity(),epoch:restoreEpoch};dockResizeWidths={...rightWidths};
  }
  function startGitResize(){
    stopSplitMotion();gitResize={before:captureActivity(),epoch:restoreEpoch};dockResizeWidths={...rightWidths};
  }
  function saveDockWidth(pane: "history" | "git", width: number) {
    // An explicit resize starts from the displayed widths. Keep its neighbours
    // fixed instead of redistributing oversized saved preferences every frame.
    workspace = { ...workspace,
      ...(historyOpen ? { historyPaneWidth: pane === "history" ? width : rightWidths.history } : {}),
      ...(gitOpen ? { gitPaneWidth: pane === "git" ? width : rightWidths.git } : {}),
      ...(ollamaOpen ? { aiPaneWidth: rightWidths.ai } : {})
    };
    scheduleWorkspaceSave();
  }
  function finishHistoryResize(width: number | undefined) {
    const resizing = historyResize; historyResize = undefined;
    if (resizing && width !== undefined && !replaying && restoreEpoch === resizing.epoch) {
      saveDockWidth("history", width);
      void recordWorkspace("Resize History pane", resizing.before).catch(() => {});
    }
    historyPreview = undefined;
    dockResizeWidths = undefined;
  }
  function finishGitResize(width:number|undefined){
    const resizing=gitResize;gitResize=undefined;
    if(resizing&&width!==undefined&&!replaying&&restoreEpoch===resizing.epoch){
      saveDockWidth("git",width);
      void recordWorkspace('Resize Git pane',resizing.before).catch(()=>{});
    }
    gitPreview=undefined;
    dockResizeWidths=undefined;
  }
  function finishExplorerResize(width:number|undefined){
    const resizing=explorerResize;explorerResize=undefined;
    if(resizing&&width!==undefined&&!replaying&&restoreEpoch===resizing.epoch){
      workspace={...workspace,explorerWidth:width};scheduleWorkspaceSave();
      void recordWorkspace('Resize repository explorer',resizing.before).catch(()=>{});
    }
    explorerPreview=undefined;
  }
  function startPaneResize(){
    if(!repository)return;
    pendingPaneFocus=undefined;stopSplitMotion();
    const before=captureActivity();
    paneResize={before,repository:repository.id,path,layout:splitLayout,epoch:restoreEpoch};
  }
  function previewPaneResize(sizes:number[]){if(paneResize)previewPaneSizes=sizes;}
  function finishPaneResize(sizes:number[]|undefined){
    const resizing=paneResize;
    if(resizing&&sizes&&repository?.id===resizing.repository&&path===resizing.path&&splitLayout===resizing.layout&&restoreEpoch===resizing.epoch&&page==='editor'){
      const previous=resolvePaneSizes(currentWorkspace.paneSizes,sizes.length);
      if(sizes.some((size,index)=>Math.abs(size-previous[index]!)>0.00001)){
        updateWorkspace(repository.id,{paneSizes:sizes});
        void recordWorkspace('Resize editor panes',resizing.before).catch(()=>{});
      }
    }
    paneResize=undefined;previewPaneSizes=undefined;
  }
  $effect(()=>{
    const resizing=paneResize;
    if(resizing&&(repository?.id!==resizing.repository||path!==resizing.path||splitLayout!==resizing.layout||restoreEpoch!==resizing.epoch||page!=='editor')){
      paneResize=undefined;previewPaneSizes=undefined;
    }
  });
  function closeSplit(viewId=splitViews[0]?.id){
    if(!repository||!viewId||!splitViews.some(view=>view.id===viewId)||controlsBusy||fileNavigation||writeFailed)return;
    const before=captureActivity();
    updateWorkspace(repository.id,{splitViews:splitViews.filter(view=>view.id!==viewId),paneSizes:removePaneSize(currentWorkspace.paneSizes,splitViews.findIndex(view=>view.id===viewId)+1)});
    void recordWorkspace('Close split view',before).catch(()=>{});
  }
  function rememberSplit(viewId:string,id:string,state:EditorSession){
    if(replaying||!repository)return;
    const prefix=`${repository.id}:`,file=id.startsWith(prefix)?id.slice(prefix.length):'';
    const view=splitViews.find(view=>view.id===viewId);
    if(!view||!view.tabs.some(tab=>tabFile(tab)===file)||!repository.files.includes(file))return;
    updateWorkspace(repository.id,{splitViews:splitViews.map(view=>view.id===viewId?{...view,
      documents:{...view.documents,[file]:state},...(view.file===file?{session:state}:{})}:view)});
  }
  function focusPendingPane(pane:string,id:string){
    const requested=pendingPaneFocus;
    if(!requested||requested.repository!==repository?.id||requested.pane!==pane||id!==`${requested.repository}:${requested.file}`)return;
    if(pane==='primary'&&fileDiffOpen&&!diffPresented)return;
    pendingPaneFocus=undefined;
    void tick().then(()=>{
      if(repository?.id!==requested.repository||page!=='editor')return;
      if(pane==='primary'){if(path===requested.file)(fileDiffOpen?primaryDiff:editorComponent)?.focus();}
      else if(splitViews.find(view=>view.id===pane)?.file===requested.file)splitEditors[pane]?.focus();
    });
  }
  function changePaneTabs(label:string,change:(value:RepositoryWorkspace)=>RepositoryWorkspace,focus?:{pane:string;file:string},replacePrimary=false):Promise<void>{
    if(!repository||controlsBusy||fileNavigation||writeFailed||replaying)return Promise.resolve();
    pendingPaneFocus=undefined;
    const id=repository.id,request=++fileNavigationRequest;
    const isCurrent=()=>repository?.id===id&&request===fileNavigationRequest;
    fileNavigation=true;fileNavigationStatus='Updating tabs…';stopSplitMotion();
    activeAction=(async()=>{
      try{
        await writes;
        if(!isCurrent()||writeFailed||activityError)return;
        const before=captureActivity(),previous=before.workspace.repositories[id]!;
        const next=change(previous);
        if(next===previous||JSON.stringify(next)===JSON.stringify(previous))return;
        let text=contents,failure=fileError;
        if(next.activeFile!==path){
          text='';failure='';
          if(next.activeFile)try{text=await readEditorFile(repository!,next.activeFile,next.stagedDiffOpen,next.commitDiffOid);}catch(problem){failure=describe(problem);}
        }
        if(!isCurrent())return;
        if(focus)pendingPaneFocus={repository:id,file:focus.file,pane:focus.pane!=='primary'&&!next.splitViews.some(view=>view.id===focus.pane)?'primary':focus.pane};
        if(activePaneTab(next)!==activeFileTab)diffPresented=false;
        updateWorkspace(id,next);openedFiles=next.tabs;path=next.activeFile;contents=text;fileError=failure;
        if(focus)activePane=pendingPaneFocus?.pane??focus.pane;
        if(replacePrimary)restoreEpoch++;
        page='editor';
        await tick();
        void recordWorkspace(label,before).catch(problem=>{error=describe(problem);});
        if(focus){
          const pane=pendingPaneFocus?.pane;
          if(pane==='primary'&&editorReady===`${id}:${focus.file}`)focusPendingPane(pane,editorReady);
          else if(pane&&splitReady[pane]===`${id}:${focus.file}`)focusPendingPane(pane,splitReady[pane]!);
        }
      }catch(problem){if(isCurrent())error=describe(problem);}
      finally{if(isCurrent())fileNavigation=false;}
    })();
    return activeAction;
  }
  function selectSplitTab(paneId:string,tab:string){
    const file=tabFile(tab);activePane=paneId;
    const pane=splitViews.find(view=>view.id===paneId);
    if(!pane||!pane.tabs.includes(tab))return;
    pendingPaneFocus=undefined;
    if(activePaneTab(pane)===tab){splitEditors[paneId]?.focus();return;}
    void changePaneTabs('Select tab',value=>({...value,splitViews:value.splitViews.map(view=>view.id===paneId?
      {...view,file,diffOpen:isDiffTab(tab),stagedDiffOpen:isStagedDiffTab(tab),commitDiffOid:commitDiffOid(tab),session:view.documents[file]??{selection:[{anchor:0,head:0}],mainIndex:0,scrollTop:0,scrollLeft:0}}:view)}),{pane:paneId,file});
  }
  function closeSplitTab(paneId:string,file:string){
    const current=splitViews.find(view=>view.id===paneId),remaining=current?.tabs.filter(opened=>opened!==file)??[];
    const focus=current&&activePaneTab(current)===file&&remaining.length?{pane:paneId,file:tabFile(tabAfterClose(current.tabs,file)!)}:undefined;
    void changePaneTabs(`Close ${tabFile(file)}${isDiffTab(file)?" (diff)":""}`,value=>{
      const pane=value.splitViews.find(view=>view.id===paneId);
      if(!pane||!pane.tabs.includes(file))return value;
      if(pane.tabs.length===1)return {...value,splitViews:value.splitViews.filter(view=>view.id!==paneId),
        paneSizes:removePaneSize(value.paneSizes,value.splitViews.indexOf(pane)+1)};
      const tabs=pane.tabs.filter(opened=>opened!==file);
      const active=activePaneTab(pane)===file?tabAfterClose(pane.tabs,file)!:activePaneTab(pane);
      return {...value,splitViews:value.splitViews.map(view=>view.id===paneId?{...view,tabs,file:tabFile(active),diffOpen:isDiffTab(active),stagedDiffOpen:isStagedDiffTab(active),commitDiffOid:commitDiffOid(active),
        session:view.documents[tabFile(active)]??pane.session}:view)};
    },focus);
  }
  function dropTab(fromPane:string,toPane:string,file:string,index:number){
    void changePaneTabs(fromPane===toPane?'Reorder tabs':'Move tab',value=>moveWorkspaceTab(value,fromPane,toPane,file,index),
      fromPane===toPane?undefined:{pane:toPane,file:tabFile(file)},fromPane==='primary'&&toPane!=='primary'&&openedFiles.length===1);
  }
  function toggleDirectory(expandedDirectories: string[], treeFocus: string) {
    if (!repository || replaying || controlsBusy) return;
    const before = captureActivity();
    updateWorkspace(repository.id, { expandedDirectories, treeFocus });
    void recordWorkspace("Toggle folder", before).catch(() => {});
  }
  async function selectRepository(id: string) {
    if (id === repository?.id) return;
    await perform(async () => {
      const before = captureActivity();
      await openRepository(id);
      await recordWorkspace("Switch repository", before);
    });
  }
  function keyboardAction(event:KeyboardEvent){
    if(event.isComposing||event.getModifierState("AltGraph"))return undefined;
    return keybindingActions.find(action=>action.scope==='application'&&shortcutsFor(action.id,effective.keybindings).some(key=>matchesShortcut(event,key)));
  }
  function shortcutTarget(event:KeyboardEvent){
    const target=event.target;
    return !(target instanceof Element&&target.closest('input, textarea, select, [data-git-draft], [data-ai-composer], [contenteditable="true"]:not(.cm-content)'));
  }
  function preventBrowserSave(event: KeyboardEvent) {
    // CodeMirror reserves Save after trying configured editor/completion commands.
    if(event.target instanceof Element&&event.target.closest('.cm-content'))return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s"
      && !(shortcutTarget(event)&&keyboardAction(event))) event.preventDefault();
  }
  function applicationKeydown(event: KeyboardEvent) {
    if(event.defaultPrevented||!shortcutTarget(event))return;
    const action=keyboardAction(event);if(!action)return;
    event.preventDefault();
    if(action.id==='undo'){undo();return;}
    if(action.id==='redo'){redo();return;}
    if(action.id==='openEditor'){navigate('editor');return;}
    if(action.id==='commit'){toggleGit("Changes");return;}
    if(action.id==='git'){toggleGit();return;}
    if(action.id==='openHistory'){navigate('history');return;}
    if(action.id==='openSettings'){navigate('settings');return;}
    if(page!=='editor'||!repository||controlsBusy||fileNavigation||writeFailed)return;
    const pane=focusedSplit,tab=pane?activePaneTab(pane):activeFileTab;
    if(action.id==='resetZoom'){zoomEditor(0);return;}
    if(action.id==='zoomIn'||action.id==='zoomOut'){zoomEditor(action.id==='zoomIn'?1:-1);return;}
    if(action.id==='format'){if(!activeDiffOpen)void formatCurrentDocument();}
    else if(action.id==='diff')toggleFileDiff();
    else if(action.id==='closeTab'){if(pane)closeSplitTab(pane.id,tab);else if(tab)void closeFile(tab);}
    else if(action.id==='splitTab'){if(tab)openSplit(tab,pane?.id);}
    else if(action.id==='nextTab'||action.id==='previousTab'){
      const tabs=pane?.tabs??openedFiles;if(!tabs.length)return;
      const index=(tabs.indexOf(tab)+(action.id==='nextTab'?1:-1)+tabs.length)%tabs.length;
      if(pane)selectSplitTab(pane.id,tabs[index]!);else void selectFile(tabs[index]!);
    }
  }

  function saveWorkspaceNow() {
    clearTimeout(workspaceSaveTimer);
    if (!workspaceReady || activityPending || replaying || activityError) return;
    try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ ...workspace, activityRevision: activity.revision })); workspaceError = ""; }
    catch (failure) { workspaceError = `Your workspace layout could not be remembered: ${describe(failure)}`; }
  }
  function scheduleWorkspaceSave() {
    if (!workspaceReady) return;
    if (workspaceLeaving) { saveWorkspaceNow(); return; }
    clearTimeout(workspaceSaveTimer);
    workspaceSaveTimer = setTimeout(saveWorkspaceNow, 80);
  }
  function updateWorkspace(id: string, patch: Partial<RepositoryWorkspace>) {
    const previous = workspace.repositories[id] ?? emptyRepositoryWorkspace();
    workspace = { ...workspace, repositories: { ...workspace.repositories, [id]: { ...previous, ...patch } } };
    scheduleWorkspaceSave();
  }
  function rememberNavigation() {
    if (!workspaceReady || !storageReady || loading || replaying) return;
    if (repository) updateWorkspace(repository.id, { tabs: [...openedFiles], activeFile: path });
    workspace = { ...workspace, repositoryId: repository?.id ?? "", page };
    scheduleWorkspaceSave();
  }
  function rememberEditor(id: string, state: EditorSession) {
    if (replaying) return;
    const separator = id.indexOf(":");
    const repositoryId = id.slice(0, separator), file = id.slice(separator + 1);
    if (separator < 0 || repository?.id === repositoryId && !repository.files.includes(file)) return;
    const stored = workspace.repositories[repositoryId] ?? emptyRepositoryWorkspace();
    updateWorkspace(repositoryId, { documents: { ...stored.documents, [file]: state } });
  }
  function rememberTree(id: string, expandedDirectories: string[], treeFocus: string) {
    if (replaying) return;
    updateWorkspace(id, { expandedDirectories, treeFocus });
  }
  function rememberFocus(event: FocusEvent) {
    if (!workspaceReady || loading || starting || replaying || !repository || !(event.target instanceof Element)) return;
    const focused=event.target.closest<HTMLElement>('.split-editor, .file-tabs[data-pane-id]')?.dataset.paneId;
    if(focused)activePane=focused;
    else if(event.target.closest('.primary-pane, .file-tabs:not([data-pane-id])'))activePane='primary';
    if(pendingPaneFocus){
      const targetPane=event.target.closest<HTMLElement>('.split-editor')?.dataset.paneId??
        (event.target.closest('.editor-document > .code-editor')?'primary':undefined);
      if(targetPane!==pendingPaneFocus.pane)pendingPaneFocus=undefined;
    }
    const focus = event.target.closest(".cm-content") && !event.target.closest('[data-ai-composer]') ? "editor" : event.target.closest('[role="treeitem"]') ? "tree" : "none";
    if (focus !== currentWorkspace.focus) updateWorkspace(repository.id, { focus });
  }
  function tabReveal(node:HTMLElement){
    const width=node.getBoundingClientRect().width;
    return {
      duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:180,
      easing:(t:number)=>1-Math.pow(1-t,3),
      css:(t:number)=>`transform:translateX(${-width*(1-t)}px);clip-path:inset(0 0 0 ${width*(1-t)}px)`,
    };
  }
  function scrollTabs(event: WheelEvent & { currentTarget: HTMLDivElement }) {
    const tabs = event.currentTarget;
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || tabs.scrollWidth <= tabs.clientWidth) return;
    const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(tabs).fontSize) * 1.5
      : event.deltaMode === 2 ? tabs.clientWidth : 1;
    tabs.scrollLeft += event.deltaY * unit;
    event.preventDefault();
  }
  function rememberScroll(area: keyof RepositoryWorkspace["scroll"], element: HTMLElement) {
    if (!workspaceReady || loading || restoringChrome || replaying || !repository || !element.clientHeight) return;
    updateWorkspace(repository.id, { scroll: { ...currentWorkspace.scroll,
      [area]: area === "tabs" ? element.scrollLeft : element.scrollTop } });
  }
  async function restoreChrome(restoreTreeFocus = false) {
    const request = ++chromeRequest, id = repository?.id, targetPage = page;
    const stored = currentWorkspace;
    restoringChrome += 1;
    try {
      await tick();
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (request !== chromeRequest || repository?.id !== id || page !== targetPage) return;
      if (fileExplorer) fileExplorer.scrollTop = stored.scroll.explorer;
      if (fileTabs) fileTabs.scrollLeft = stored.scroll.tabs;
      if (historyOpen && historyPanel) historyPanel.scrollTop = stored.scroll.history;
      if (page === "settings" && settingsPanel) settingsPanel.scrollTop = stored.scroll.settings;
      if (page === "resources" && resourcesPanel) resourcesPanel.scrollTop = stored.scroll.resources ?? 0;
      if (restoreTreeFocus && stored.focus === "tree") {
        const row = [...(fileExplorer?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])]
          .find(element => element.getAttribute("aria-label") === stored.treeFocus);
        row?.focus({ preventScroll: true });
      }
    } finally { restoringChrome -= 1; }
  }
  function flushWorkspace() {
    if(fileDiffOpen)primaryDiff?.flushSession();else editorComponent?.flushSession();
    for(const editor of Object.values(splitEditors))editor?.flushSession();
    rememberNavigation();saveWorkspaceNow();
  }
  function leaveWorkspace() { workspaceLeaving = true; flushWorkspace(); }
  $effect(() => {
    void repository?.id; void path; void openedFiles; void page;
    if (workspaceReady && !loading && !busy && !fileNavigation) untrack(rememberNavigation);
  });

  $effect(() => {
    // Keep the first-paint cache until the actual repository settings are known.
    if (loading || starting && !configurationReady) return;
    if(document.documentElement.dataset.palette!==selectedPalette)document.documentElement.dataset.palette=selectedPalette;
    if(document.documentElement.dataset.theme!==selectedTheme)document.documentElement.dataset.theme=selectedTheme;
    document.documentElement.classList.toggle("dark", document.documentElement.dataset.theme === "dark");
    if(document.documentElement.dataset.interfaceFont!==selectedInterfaceFont)document.documentElement.dataset.interfaceFont=selectedInterfaceFont;
    if(document.documentElement.dataset.interfaceSize!==selectedInterfaceSize)document.documentElement.dataset.interfaceSize=selectedInterfaceSize;
    rememberAppearance(selectedTheme, selectedPalette, selectedInterfaceFont, selectedInterfaceSize);
    appearanceReady = false;
    reportStartupItem("preferences.appearance", "running");
    let cancelled = false;
    void tick().then(() => document.fonts.ready).then(() => {
      if (cancelled || startupDisposed) return;
      reportStartupItem("preferences.appearance", "complete");
      appearanceReady = true;
    });
    return () => { cancelled = true; };
  });
  $effect(() => {
    const id = activeRepositoryId; const selected = path; const paths: string[] = JSON.parse(configurationPaths);
    const inherited: EditorSettings = JSON.parse(inheritedConfiguration);
    void configurationRevision;
    if (loading) return;
    let cancelled = false;
    configurationReady = false;
    if (untrack(() => starting)) editorReady = "";
    if (!id || !selected) {
      fileConfiguration = {}; configurationReady = true;
      skipStartupWork("preferences.rules"); return;
    }
    reportStartupItem("preferences.rules", "running");
    void resolveFileConfiguration(paths, file => repositoryClient.read(id, file), selected, inherited)
      .then(configuration => { if (!cancelled) {
        fileConfiguration = configuration;
        reportStartupItem("preferences.rules", paths.length ? "complete" : "skipped");
      } })
      .catch(failure => { if (!cancelled) {
        fileConfiguration = {}; error = `Cannot apply .editorconfig: ${describe(failure)}`;
        reportStartupItem("preferences.rules", "error");
      } })
      .finally(() => { if (!cancelled) configurationReady = true; });
    return () => { cancelled = true; };
  });
  $effect(() => {
    if (startupDisposed || !starting || loading || !chromeReady || !configurationReady || !appearanceReady) return;
    if (repository && path && page === "editor" && !fileError && editorReady !== `${repository.id}:${path}`) return;
    if(repository&&page==="editor"&&splitViews.some(view=>splitReady[view.id]!==`${repository!.id}:${view.file}`))return;
    untrack(() => {
      if (!startupPositionFailed) reportStartupItem("workspace.position", "complete");
      starting = false;
      stopStartupProgress();
      finishStartup(Boolean(error || fileError), () => {
        // Inert protects startup from interaction, so restore focus only on reveal.
        if (document.getElementById("app")?.hasAttribute("inert")) return;
        if (currentWorkspace.focus === "editor" && page === "editor") {
          document.querySelector<HTMLElement>(".cm-content")?.focus({ preventScroll: true });
        } else if (currentWorkspace.focus === "tree") {
          [...(fileExplorer?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])]
            .find(element => element.getAttribute("aria-label") === currentWorkspace.treeFocus)?.focus({ preventScroll: true });
        }
      });
    });
  });
  $effect(() => {
    if (!writeFailed && !settingsError && !activityError && !pending && !preferencePending && !activityPending && !busy) {
      for (const release of reloadWaiters) release();
      reloadWaiters.clear();
    }
  });
  onMount(() => {
    beginStartup();
    stopStartupProgress = subscribeRepositoryProgress(event => {
      if (starting) reportStartupItem(event.item, event.status);
    });
    reportStartupItem("workspace.tabs", "running");
    reportStartupItem("workspace.position", "running");
    let cachedActivityRevision: unknown;
    try {
      const cached = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "null");
      workspace = normalizeWorkspace(cached);
      cachedActivityRevision = cached?.activityRevision;
    }
    catch (failure) {
      if (!(failure instanceof SyntaxError)) workspaceError = `Your workspace layout could not be restored: ${describe(failure)}`;
    }
    const visibility = () => { if (document.visibilityState === "hidden") flushWorkspace(); };
    document.addEventListener("visibilitychange", visibility);
    const media = matchMedia("(prefers-color-scheme: dark)");
    systemDark = media.matches;
    const changeMode = () => { systemDark = media.matches; };
    media.addEventListener("change", changeMode);
    const beforeUpdate = async () => {
      flushWorkspace();
      hmrUpdating = true;
      await tick();
      await Promise.all([writes, preferences, historyRequests, activeAction, activityWrites]);
      // Vite awaits listeners with allSettled: a rejection would not retain the buffer.
      if (writeFailed || settingsError || activityError) await new Promise<void>(resolve => reloadWaiters.add(resolve));
    };
    const afterUpdate = () => { hmrUpdating = false; };
    import.meta.hot?.on("vite:beforeUpdate", beforeUpdate);
    import.meta.hot?.on("vite:beforeFullReload", beforeUpdate);
    import.meta.hot?.on("vite:afterUpdate", afterUpdate);
    void (async () => {
      try {
        const restoredActivity = await repositoryClient.loadActivity();
        if (startupDisposed) return;
        activity = restoredActivity;
        if (activity.state && cachedActivityRevision !== activity.revision) workspace = normalizeWorkspace(activity.state.workspace);
        const [list, stored] = await Promise.all([
          startupTask("repository.list", () => repositoryClient.list()),
          startupTask("preferences.saved", () => repositoryClient.loadPreferences()),
        ]);
        if (startupDisposed) return;
        repositories = list; settings = normalizeSettings(activity.state?.settings ?? stored); storageReady = true;
        workspace = { ...workspace, repositories: Object.fromEntries(Object.entries(workspace.repositories)
          .filter(([id]) => list.some(item => item.id === id))) };
        page = workspace.page;
        const selected = list.find(item => item.id === workspace.repositoryId) ?? (activity.state ? undefined : list[0]);
        if (selected) {
          await startupTask("repository.selected", () => openRepository(selected.id));
        } else {
          reportStartupItem("recovery.repository", "complete");
          skipStartupWork("repository.selected", "files.scan", "files.tree",
            "git.branches", "git.commits", "git.edits", "editor.document", "editor.language", "editor.layout", "workspace.folders");
          reportStartupItem("workspace.tabs", "complete");
        }
      } catch (failure) { error = describe(failure); }
      finally {
        if (startupDisposed) return;
        loading = false; workspaceReady = true; rememberNavigation();
        try {
          await restoreChrome();
          if (repository) {
            reportStartupItem("files.tree", "complete");
            reportStartupItem("workspace.folders", "complete");
          }
        }
        catch (failure) {
          error = describe(failure); startupPositionFailed = true;
          reportStartupItem("workspace.position", "error");
        }
        finally { if (!startupDisposed) chromeReady = true; }
      }
    })();
    return () => {
      startupDisposed = true;
      stopSplitMotion();
      stopStartupProgress();
      leaveWorkspace();
      clearTimeout(workspaceSaveTimer);
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", changeMode);
      import.meta.hot?.off("vite:beforeUpdate", beforeUpdate);
      import.meta.hot?.off("vite:beforeFullReload", beforeUpdate);
      import.meta.hot?.off("vite:afterUpdate", afterUpdate);
    };
  });
  const describe = (failure: unknown) => failure instanceof Error ? failure.message : String(failure);
  function protectPending(event: BeforeUnloadEvent) {
    leaveWorkspace();
    // If the user cancels navigation, resume batched layout writes.
    setTimeout(() => { workspaceLeaving = false; }, 0);
    if (pending > 0 || preferencePending > 0 || activityPending > 0 || busy || writeFailed || settingsError || activityError) { event.preventDefault(); event.returnValue = ""; }
  }
  async function openRepository(id: string) {
    pendingPaneFocus=undefined;rememberNavigation();
    const snapshot = await repositoryClient.open(id);
    if (startupDisposed) return;
    const stored = reconcileRepositoryWorkspace(workspace.repositories[id] ?? emptyRepositoryWorkspace(), snapshot.files);
    reportStartupItem("files.tree", "running");
    reportStartupItem("workspace.folders", "running");
    let restoredContents = "", restoredError = "";
    if (stored.activeFile) {
      try { restoredContents = await startupTask("editor.document", () => readEditorFile(snapshot, stored.activeFile, stored.stagedDiffOpen, stored.commitDiffOid)); }
      catch (failure) { restoredError = describe(failure); }
    }
    else skipStartupWork("editor.document", "editor.language", "editor.layout");
    if (restoredError || page !== "editor") skipStartupWork("editor.language", "editor.layout");
    if (startupDisposed) return;
    updateWorkspace(id, stored);
    repository = snapshot; openedFiles = stored.tabs; path = stored.activeFile;
    contents = restoredContents; fileError = restoredError; writeFailed = false;
    reportStartupItem("workspace.tabs", "complete");
    void restoreChrome(true);
  }
  const committedFiles=new Map<string,Promise<string|null>>();
  function loadCommittedFile(file=path):Promise<string|null>{
    const selected=repository;
    if(!selected||!file)return Promise.resolve(null);
    const key=JSON.stringify([selected.id,selected.head,file]);
    const cached=committedFiles.get(key);if(cached)return cached;
    const result=repositoryClient.readCommitted(selected.id,file,selected.head).catch(error=>{committedFiles.delete(key);throw error;});
    if(committedFiles.size>=32)committedFiles.delete(committedFiles.keys().next().value!);
    committedFiles.set(key,result);return result;
  }
  let languageWorkspaceCache: { key: string; value: Promise<Record<string,string>>; resolved?: Record<string,string> } | undefined;
  function languageWorkspace(): Promise<Record<string,string>> {
    const key = `${repository?.id}:${workingRevision}:${JSON.stringify(effective.languageMappings)}`;
    if (languageWorkspaceCache?.key === key) return languageWorkspaceCache.value;
    const entry: NonNullable<typeof languageWorkspaceCache> = { key, value: Promise.resolve({}) };
    entry.value = readLanguageWorkspace().then(files => { entry.resolved = files; return files; }).catch(error => {
      if (languageWorkspaceCache === entry) languageWorkspaceCache = undefined;
      throw error;
    });
    languageWorkspaceCache = entry;
    return entry.value;
  }
  async function readLanguageWorkspace(): Promise<Record<string,string>> {
    const snapshot = repository;
    const revision=workingRevision;
    if (!snapshot) return {};
    const mappings={...effective.languageMappings};
    const entries = await Promise.all(snapshot.files.filter(file => {
      const mapped=mappedLanguageForPath(file,mappings);
      return mapped!==undefined ? mapped!=="text" : /\.(?:[cm]?[jt]sx?|jsonc?|html?|css|scss|less|ya?ml|md|markdown|graphql|gql|liquid|toml|svg)$/i.test(file);
    }).map(async file => {
      try { return [file, await repositoryClient.read(snapshot.id,file)] as const; }
      catch (failure) {
        if (failure instanceof Error && /^(This is a binary file|This file is not UTF-8 text)/.test(failure.message)) return undefined;
        throw failure;
      }
    }));
    if (repository?.id !== snapshot.id || workingRevision !== revision) throw new Error("The repository changed while preparing language analysis. Try again.");
    return Object.fromEntries(entries.filter((entry): entry is readonly [string,string] => entry !== undefined));
  }
  function readEditorFile(snapshot:RepositorySnapshot,file:string,staged=false,commit?:string):Promise<string>{
    if(commit)return Promise.resolve("");
    return staged&&!snapshot.files.includes(file)?Promise.resolve(""):repositoryClient.read(snapshot.id,file);
  }
  function loadStagedFile(file=path){
    return repositoryClient.gitDiff(repository!.id,{kind:"staged",path:file});
  }
  async function openFile(nextPath: string, isCurrent = () => true, beforeApply = () => {},tab=nextPath) {
    if (!repository) return;
    const id = repository.id;
    let nextContents = ""; let nextError = "";
    try { nextContents = await readEditorFile(repository, nextPath, isStagedDiffTab(tab),commitDiffOid(tab)); }
    catch (failure) { nextError = describe(failure); }
    if (repository?.id !== id || !isCurrent()) return;
    beforeApply();
    if(activeFileTab!==tab)diffPresented=false;
    path = nextPath; contents = nextContents; fileError = nextError; cursor = { line: 1, column: 1 };
    if (!openedFiles.includes(tab)){
      const index=isDiffTab(tab)?openedFiles.indexOf(nextPath)+1:openedFiles.length;
      openedFiles=[...openedFiles.slice(0,index),tab,...openedFiles.slice(index)];
    }
    updateWorkspace(id,{fileDiffOpen:isDiffTab(tab),stagedDiffOpen:isStagedDiffTab(tab),commitDiffOid:commitDiffOid(tab),tabs:[...openedFiles],activeFile:nextPath});
  }
  async function refresh(snapshot: RepositorySnapshot, preferred = path) {
    const restored=reconcileRepositoryWorkspace(workspace.repositories[snapshot.id] ?? emptyRepositoryWorkspace(), snapshot.files);
    updateWorkspace(snapshot.id, restored);
    repository = snapshot;
    configurationRevision += 1;
    openedFiles = openedFiles.filter(tab => isStagedDiffTab(tab)||Boolean(commitDiffOid(tab))||snapshot.files.includes(tabFile(tab)));
    if(!openedFiles.length)openedFiles=restored.tabs;
    const selected=activePaneTab(restored);
    const next = preferred===restored.activeFile&&openedFiles.includes(selected)?selected:
      snapshot.files.includes(preferred)?preferred:openedFiles.includes(selected)?selected:openedFiles[0];
    if (next) await openFile(tabFile(next),()=>true,()=>{},next); else { path = ""; contents = ""; fileError = ""; }
  }
  /** Queue every transaction with its workspace context, never debounce edits. */
  function changed(value:string,before:EditorSession,after:EditorSession,action?:"format",group?:EditGroup){
    changedFile(path,value,before,after,action,undefined,group);
  }
  function changedFile(file:string,value: string, beforeSession: EditorSession, afterSession: EditorSession, action?: "format",secondary?:string,group?:EditGroup) {
    if (!repository || !file || writeFailed || activityError || replaying) return;
    formattingEpoch++;
    const before = captureActivity();
    if(file===path)contents = value;
    splitBuffers={...splitBuffers,[`${repository.id}:${file}`]:value};
    const id = repository.id;
    const after = captureActivity();
    if(secondary){
      const previous=before.workspace.repositories[id]!.splitViews.find(view=>view.id===secondary);
      const next=after.workspace.repositories[id]!.splitViews.find(view=>view.id===secondary);
      if(previous){previous.session=beforeSession;previous.documents[file]=beforeSession;}
      if(next){next.session=afterSession;next.documents[file]=afterSession;}
    }else{
      before.workspace.repositories[id]!.documents[file]=beforeSession;
      after.workspace.repositories[id]!.documents[file]=afterSession;
    }
    pending += 1;
    writes = recordActivity(`${action === "format" ? "Format" : "Edit"} ${file}`, before, after, () => {
      if (!repository || repository.id !== id) throw new Error("The repository changed before this edit could be saved.");
      return { method: "write", args: action === "format" ? [id, file, value, repository.revision, undefined, "format"] : [id, file, value, repository.revision] };
    }, result => {
      if (result.repository) {
        const cache = languageWorkspaceCache;
        const beforeKey = `${repository?.id}:${workingRevision}:${JSON.stringify(effective.languageMappings)}`;
        if (cache?.resolved && cache.key === beforeKey && repository?.id === id && result.repository.id === id) {
          const files = { ...cache.resolved };
          if (Object.hasOwn(files, file)) files[file] = value;
          languageWorkspaceCache = {
            key: `${id}:${result.repository.revision}:${JSON.stringify(effective.languageMappings)}`,
            value: Promise.resolve(files), resolved: files
          };
        }
        repository = { ...result.repository, files: repository?.id === id ? repository.files : result.repository.files };
      }
      if (file === ".editorconfig" || file.endsWith("/.editorconfig")) configurationRevision += 1;
    }, group).then(() => {}).catch(failure => { writeFailed = true; error = describe(failure); }).finally(() => { pending -= 1;if(!pending&&!writeFailed)splitBuffers={}; });
  }
  async function formatCurrentDocument() {
    if (!canFormat || formatting || !repository || !formatter || activeDiffOpen) return;
    const pane=focusedSplit;
    const component=pane?splitEditors[pane.id]:editorComponent;
    if(!component)return;
    const snapshot = component.captureFormatting();
    if (!snapshot) return;
    const id = repository.id, file = formatPath, route = formatter;
    const preferences = { ...(pane?splitEditors[pane.id]!.formatSettings():effective) };
    const epoch = ++formattingEpoch;
    const valid = () => epoch === formattingEpoch && canFormat && repository?.id === id
      && formatPath === file && (focusedSplit?splitEditors[focusedSplit.id]:editorComponent) === component && !activeDiffOpen && !startupDisposed;
    formatting = true;
    error = "";
    try {
      await Promise.all([writes, activityWrites]);
      if (!valid()) return;
      const options = await resolveFormattingConfiguration(repository!.files,
        config => repositoryClient.read(id, config), file, route.engine);
      if (!valid()) return;
      const formatted = await formatDocument({ path: file, text: snapshot.text,
        language: mappedLanguageForPath(file,preferences.languageMappings)??"auto", indentSize: preferences.indentSize,
        indentWithTabs: preferences.indentWithTabs, formatters: preferences.formatters, options });
      if (valid()) component.applyFormatting(snapshot, formatted);
    } catch (failure) {
      if (valid()) error = `Formatting could not be completed: ${describe(failure)}`;
    } finally { formatting = false; }
  }
  function perform(action: () => Promise<void>, recovery = false, onerror?: (failure: unknown) => void, indexOnly = false): Promise<void> {
    if (busy || fileNavigation || (hmrUpdating && !recovery)) return Promise.resolve();
    gitIndexBusy = indexOnly; busy = true;
    activeAction = (async () => {
      try {
        await writes;
        await activityWrites;
        if (!recovery && (writeFailed || activityError)) throw new Error("Your visible changes could not be saved. Download the file before reloading this repository.");
        error = ""; await action();
      } catch (failure) { if (onerror) onerror(failure); else error = describe(failure); }
      finally { busy = false; gitIndexBusy = false; }
    })();
    return activeAction;
  }
  function showGit(oid = "", tab = "Changes") {
    if (!repository || controlsBusy || writeFailed) return;
    void perform(async () => { gitInitialCommit = oid; gitInitialTab = tab; gitRequest++; setRightPane("git", true); });
  }
  function toggleGit(tab = "Actions") {
    if (gitOpen && gitActiveTab === tab) setRightPane("git", false);
    else showGit("", tab);
  }
  function loadCommitFile(file:string,oid:string){
    return repositoryClient.gitDiff(repository!.id,{kind:"commit",path:file,oid});
  }
  function openCommitDiff(file:string,oid:string){
    if(!repository||controlsBusy||fileNavigation||writeFailed)return;
    if(workAreaWidth<1000)for(const pane of ["history","git","ai"] as const)setRightPane(pane,false);
    diffViewport=undefined;
    void selectFile(commitDiffTab(file,oid));
  }
  function openGitFile(file:string){
    if(!repository||controlsBusy||fileNavigation||writeFailed)return;
    if(!repository.files.includes(file)){openStagedDiff(file);return;}
    if(workAreaWidth<1000)for(const pane of ["history","git","ai"] as const)setRightPane(pane,false);
    void selectFile(file);
  }
  function openStagedDiff(file:string){
    if(!repository||controlsBusy||fileNavigation||writeFailed)return;
    // Compact right panes cover the editor; reveal the requested document.
    if(workAreaWidth<1000)for(const pane of ["history","git","ai"] as const)setRightPane(pane,false);
    diffViewport=undefined;
    void selectFile(diffTab(file,true));
  }
  async function gitAction(request: GitAction): Promise<void> {
    let failure: unknown, completed = false;
    const indexOnly=request.kind==="stage"||request.kind==="unstage";
    await perform(async () => {
      if (!repository) return;
      const before = captureActivity();
      const result = await recordActivity(`Git: ${request.kind}`, before, before,
        () => ({ method: "gitAction", args: [repository!.id, request, repository!.revision] }));
      if (result.repository) {
        if(indexOnly){
          const previous=repository,revision=workingRevision;
          // Staging changes the index and revision token, never working files,
          // source refs or private history. Keep those mounted inputs stable.
          indexSnapshot={revision:result.repository.revision,workingRevision:revision};
          repository={...result.repository,files:previous.files,history:previous.history,
            commits:previous.commits,branches:previous.branches};
        }else await refresh(result.repository);
      }
      completed = true;
    }, false, error => { failure = error; },indexOnly);
    if (failure) throw failure;
    if (!completed) throw new Error("Wait for the current editor operation before continuing.");
  }
  async function remoteAction(request: RemoteCommand): Promise<void> {
    let failure: unknown, completed = false;
    await perform(async () => {
      if (!repository) throw new Error("Open a repository before using Git remotes.");
      // Network commands and credentials never enter either undo history or its recovery commands.
      repository = await repositoryClient.remoteAction(repository.id, request, repository.revision);
      completed = true;
    }, false, error => { failure = error; });
    if (failure) throw failure;
    if (!completed) throw new Error("Wait for the current editor operation before continuing.");
  }
  let cloneOpen = $state(false);
  async function cloneRepository(request: CloneRequest): Promise<void> {
    let failure: unknown, completed = false;
    await perform(async () => {
      const before = captureActivity(); rememberNavigation();
      const cloned = await repositoryClient.cloneRemote(request);
      repositories = await repositoryClient.list(); storageReady = true; openedFiles = [];
      await refresh(cloned, cloned.files.find(file => /^readme\b/i.test(file)) ?? cloned.files.find(file => /\.(?:md|txt|[cm]?[jt]sx?|json|html|css|svelte|py|rs|go|ya?ml|toml)$/i.test(file)) ?? cloned.files[0] ?? ""); page = "editor";
      await recordWorkspace("Clone repository", before); completed = true;
    }, false, error => { failure = error; });
    if (failure) throw failure;
    if (!completed) throw new Error("Wait for the current editor operation before cloning.");
  }
  async function openUpstreamSettings() {
    setRightPane("git", false); settingsScope = "global"; navigate("settings"); await tick();
    const section = document.querySelector<HTMLElement>('[aria-label="Upstream connections"]');
    section?.scrollIntoView({ block: "start" });
    section?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }
  function navigate(next: Page) {
    if (next === "history") { openHistory(currentWorkspace.historyView); return; }
    if (controlsBusy || fileNavigation || writeFailed || next === page) return;
    pendingPaneFocus=undefined;
    const before = captureActivity();
    error = "";
    page = next;
    if (next === "vault") { setRightPane("ai", false); setRightPane("git", false); setRightPane("history", false); }
    void recordWorkspace("Change view", before).catch(() => {});
    void restoreChrome();
  }
  function openHistory(historyView: HistoryView) {
    if (!repository || controlsBusy || fileNavigation || writeFailed) return;
    const before = captureActivity();
    pendingPaneFocus = undefined;
    error = "";
    updateWorkspace(repository.id, { historyView, scroll: { ...currentWorkspace.scroll, history: historyView === currentWorkspace.historyView ? currentWorkspace.scroll.history : 0 } });
    const current = workspace.rightPanes ?? (workspace.rightPane ? [workspace.rightPane] : []);
    workspace = { ...workspace, rightPanes: [...new Set([...current, "history" as const])] };
    delete workspace.rightPane;
    scheduleWorkspaceSave();
    void recordWorkspace("Open history", before).catch(() => {});
    void restoreChrome();
  }
  function selectHistoryView(historyView: HistoryView) {
    if (!repository || controlsBusy || fileNavigation || writeFailed || historyView === currentWorkspace.historyView) return;
    const before = captureActivity();
    updateWorkspace(repository.id, { historyView, scroll: { ...currentWorkspace.scroll, history: 0 } });
    void recordWorkspace("Change history view", before).catch(() => {});
    void restoreChrome();
  }
  /** File reads lock editing without recoloring every repository control. */
  function selectFile(tab: string): Promise<void> {
    const nextPath=tabFile(tab);activePane="primary";
    if (controlsBusy || writeFailed || !repository) return Promise.resolve();
    pendingPaneFocus=undefined;
    if (activeFileTab===tab && !fileNavigation) { navigate("editor"); return Promise.resolve(); }
    const request = ++fileNavigationRequest;
    const isCurrent = () => request === fileNavigationRequest;
    fileNavigationStatus = "Opening file…";
    fileNavigation = true;
    activeAction = (async () => {
      try {
        await writes;
        if (writeFailed || activityError) throw new Error("Your visible changes could not be saved. Download the file before reloading this repository.");
        if (!isCurrent()) return;
        error = "";
        let before: ActivityState | undefined;
        await openFile(nextPath, isCurrent, () => { before = captureActivity(); },tab);
        if (isCurrent() && before) {
          page = "editor";
          await tick(); // Include automatically revealed ancestors in this tab action.
          void recordWorkspace("Open or select tab", before).catch(failure=>{error=describe(failure);});
        }
      } catch (failure) { if (isCurrent()) error = describe(failure); }
      finally { if (isCurrent()) fileNavigation = false; }
    })();
    return activeAction;
  }
  function closeFile(target: string): Promise<void> {
    if (controlsBusy || fileNavigation || writeFailed || !repository) return Promise.resolve();
    const index = openedFiles.indexOf(target);
    if (index < 0) return Promise.resolve();
    const request = ++fileNavigationRequest;
    const isCurrent = () => request === fileNavigationRequest;
    fileNavigationStatus = "Closing file…";
    fileNavigation = true;
    activeAction = (async () => {
      try {
        await writes;
        await activityWrites;
        if (writeFailed || activityError) throw new Error("Your visible changes could not be saved. Keep this file open until its changes are recovered.");
        if (!isCurrent()) return;
        error = "";
        let before = captureActivity();
        const remaining = openedFiles.filter(file => file !== target);
        const promoted=!remaining.length?splitViews[0]:undefined;
        if(promoted)remaining.push(...promoted.tabs);
        if (activeFileTab === target) {
          const next = promoted?activePaneTab(promoted):tabAfterClose(openedFiles,target);
          if (next) await openFile(tabFile(next), isCurrent, () => { before = captureActivity(); },next);
          else { path = ""; contents = ""; fileError = ""; cursor = { line: 1, column: 1 };updateWorkspace(repository.id,{fileDiffOpen:false,stagedDiffOpen:false,commitDiffOid:undefined}); }
        }
        if (!isCurrent()) return;
        openedFiles = remaining;
        if(promoted){
          updateWorkspace(repository.id,{splitViews:splitViews.filter(view=>view.id!==promoted.id),paneSizes:removePaneSize(currentWorkspace.paneSizes,0),fileDiffOpen:promoted.diffOpen===true,stagedDiffOpen:promoted.stagedDiffOpen===true,commitDiffOid:promoted.commitDiffOid,documents:{...currentWorkspace.documents,...promoted.documents}});
          restoreEpoch++;
        }
        // Publish the selected tab before moving focus; the passive navigation
        // effect waits until the file-navigation lock has been released.
        updateWorkspace(repository.id,{tabs:[...remaining],activeFile:path});
        await tick();
        await recordWorkspace(`Close ${tabFile(target)}${isDiffTab(target)?" (diff)":""}`, before);
        await tick();
        if (isCurrent()) {
          const selected = document.querySelector<HTMLButtonElement>(".file-tabs button.active");
          (selected ?? document.getElementById("panel-editor"))?.focus({ preventScroll: true });
        }
      } catch (failure) { if (isCurrent()) error = describe(failure); }
      finally { if (isCurrent()) fileNavigation = false; }
    })();
    return activeAction;
  }
  function requestHistory(direction: "undo" | "redo", requestedScope = activeHistoryScope) {
    if (hmrUpdating || activityError || !requestedScope) return;
    formattingEpoch++;
    historyRequests = historyRequests.then(async () => {
      await activeAction;
      await Promise.all([writes, preferences, activityWrites]);
      if (writeFailed || activityError) return;
      let restoredRepository: string | undefined;
      await perform(async () => {
        if(fileDiffOpen)primaryDiff?.flushSession();else editorComponent?.flushSession();
        try {
          const scope=requestedScope;
          if(!scope)return;
          const context={repositoryId:scope.kind==='repository'?scope.repositoryId:repository?.id??'',state:captureActivity(),scope};
          const expected=activity.revision;
          const result=direction==='undo'?await repositoryClient.undoActivity(activity.revision,context):
            await repositoryClient.redoActivity(activity.revision,context);
          activity=result.activity;
          if(activity.revision===expected)return;
          if(scope.kind==='settings'){
            if(result.activity.state)settings=normalizeSettings(result.activity.state.settings);
            scheduleWorkspaceSave();
          }else {
            await restoreActivity(result, true);
            restoredRepository = scope.repositoryId;
          }
        } catch (failure) { activityError = describe(failure); throw failure; }
      }, true);
      await tick();
      if (restoredRepository === repository?.id && historyOpen && currentWorkspace.historyView === "changes" && historyPanel) {
        changesGraph?.revealCurrent(historyPanel);
      }
    }).catch(failure => { error = describe(failure); });
  }
  function undo() { requestHistory("undo"); }
  function redo() { requestHistory("redo"); }
  async function loadHistoryChange(oid: string) {
    if (!repository || controlsBusy || fileNavigation || writeFailed) return;
    await perform(async () => {
      if (!repository || oid === repository.historyHead) return;
      const before = captureActivity();
      await restoreActivity(await recordActivity(`Load change ${oid.slice(0, 8)}`, before, before,
        () => ({ method: "selectHistory", args: [repository!.id, oid, repository!.revision] })));
    });
  }
  async function checkoutVersion(oid: string): Promise<boolean> {
    if (!repository || controlsBusy || fileNavigation || writeFailed || oid === repository.head) return false;
    let completed = false;
    let failure: unknown;
    await perform(async () => {
      if (!repository || oid === repository.head) return;
      const before = captureActivity();
      const previousRevision = activity.revision;
      const result = await recordActivity(`Check out commit ${oid.slice(0, 8)}`, before, before,
        () => ({ method: "checkoutCommit", args: [repository!.id, oid, repository!.revision] }));
      if (result.activity.revision === previousRevision && result.repository) await refresh(result.repository);
      else await restoreActivity(result);
      completed = true;
    }, false, error => { failure = error; });
    if (failure) throw failure;
    return completed;
  }
  async function renameEntry(target: string, name: string): Promise<void> {
    if (!name || name === "." || name === ".." || /[/\\]/.test(name)) throw new Error("Enter a name without directory separators.");
    await moveEntry(target, target.slice(0, target.lastIndexOf("/") + 1) + name);
  }
  async function moveEntry(target: string, next: string): Promise<void> {
    if (!repository || controlsBusy || fileNavigation || writeFailed) throw new Error("Wait for the current repository operation to finish.");
    if (next === target) return;
    let failure: unknown;
    await perform(async () => {
      if (!repository) throw new Error("The repository is no longer open.");
      const before = captureActivity(), after = structuredClone(before);
      after.workspace.repositories[repository.id] = renameRepositoryWorkspace(
        after.workspace.repositories[repository.id] ?? emptyRepositoryWorkspace(), target, next);
      await restoreActivity(await recordActivity(`Move ${target}`, before, after,
        () => ({ method: "rename", args: [repository!.id, target, next, repository!.revision] })));
    }, false, problem => { failure = problem; });
    if (failure) throw failure;
  }
  async function addDroppedFiles(directory: string, files: Promise<ImportedFile[]>): Promise<void> {
    // File reads can reject while pending editor writes are still draining.
    void files.catch(() => {});
    if (!repository || controlsBusy || fileNavigation || writeFailed) throw new Error("Wait for the current repository operation to finish.");
    const id = repository.id;
    let failure: unknown;
    await perform(async () => {
      const dropped = await files;
      if (!repository || repository.id !== id) throw new Error("The repository changed before the files could be added.");
      if (directory && !repository.files.some(file => file.startsWith(`${directory}/`))) throw new Error("The destination folder no longer exists.");
      const additions = dropped.map(file => ({ path: directory ? `${directory}/${file.path}` : file.path, data: file.data }));
      const before = captureActivity();
      await restoreActivity(await recordActivity("Add files", before, before,
        () => ({ method: "addFiles", args: [id, additions, repository!.revision] })));
    }, false, problem => { failure = problem; });
    if (failure) throw failure;
  }
  function showForm(kind: Form, target = path, initialValue = "") {
    if (fileNavigation || busy || writeFailed && kind !== "reload" || (hmrUpdating && kind !== "reload")) return;
    form = kind; formTarget = target; formDirectory = Boolean(repository?.files.some(file => file.startsWith(`${target}/`)));
    formValue = initialValue; formError = ""; formOpen = true;
  }
  function showNewFile(directory: string) {
    if (repository) showForm("file", directory, directory ? `${directory}/` : "");
  }
  async function changeBranch(branch: string) {
    if (!repository || controlsBusy || fileNavigation || writeFailed || branch === repository.branch) return;
    await perform(async () => {
      if (!repository) return;
      const before = captureActivity();
      const previousRevision = activity.revision;
      const result = await recordActivity(`Switch to ${branch}`, before, before,
        () => ({ method: "switchBranch", args: [repository!.id, branch, repository!.revision] }));
      if (result.activity.revision === previousRevision && result.repository) await refresh(result.repository);
      else await restoreActivity(result);
    });
  }
  function focusFilePath(event: Event) {
    if (form !== "file" || !formInput) return;
    event.preventDefault();
    formInput.focus();
    formInput.setSelectionRange(formInput.value.length, formInput.value.length);
  }
  async function submitForm(event: SubmitEvent) {
    event.preventDefault(); formError = "";
    if (form === "reload") {
      await perform(async () => {
        const recovered = await repositoryClient.loadActivity();
        activity = recovered;
        if (recovered.state) await restoreActivity({ activity: recovered });
        else if (repository) await openRepository(repository.id);
        writeFailed = false; activityError = ""; settingsError = ""; error = ""; formOpen = false;
        scheduleWorkspaceSave();
      }, true); return;
    }
    await perform(async () => {
      try {
        if (form === "repository") {
          const before = captureActivity();
          rememberNavigation();
          const created = await repositoryClient.create(formValue.trim());
          repositories = await repositoryClient.list(); storageReady = true; openedFiles = []; await refresh(created, ""); page = "editor";
          await recordWorkspace("New repository", before);
        } else if (repository) {
          if (form === "branch") await refresh(await repositoryClient.createBranch(repository.id, formValue.trim(), repository.revision));
          if (form === "file") {
            const before = captureActivity(), after = structuredClone(before), file = formValue.trim();
            const state = after.workspace.repositories[repository.id] ?? emptyRepositoryWorkspace();
            state.tabs = [...state.tabs.filter(path => path !== file), file]; state.activeFile = file;
            state.expandedDirectories = [...new Set([...state.expandedDirectories, ...ancestorDirectories(file)])];
            after.workspace.repositories[repository.id] = state; after.workspace.page = "editor";
            await restoreActivity(await recordActivity(`Create ${file}`, before, after,
              () => ({ method: "createFile", args: [repository!.id, file, "", repository!.revision] })));
          }
          if (form === "delete") {
            const before = captureActivity();
            await restoreActivity(await recordActivity(`Delete ${formTarget}`, before, before,
              () => ({ method: "remove", args: [repository!.id, formTarget, repository!.revision] })));
          }
        }
        formOpen = false;
      } catch (failure) { formError = describe(failure); }
    });
  }
  async function readDirectory(selected: File[]): Promise<ImportedFile[]> {
    return Promise.all(selected.map(async file => ({
      path: (file.webkitRelativePath || file.name).split("/").slice(1).join("/") || file.name,
      data: new Uint8Array(await file.arrayBuffer())
    })));
  }
  async function finishImport(name: string, files: ImportedFile[]) {
    const before = captureActivity();
    rememberNavigation();
    const imported = await repositoryClient.create(name, files);
    repositories = await repositoryClient.list(); storageReady = true; openedFiles = []; await refresh(imported, ""); page = "editor";
    await recordWorkspace("Import repository", before);
  }
  async function importDirectory(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const selected = Array.from(input.files ?? []); input.value = "";
    if (!selected.length) return;
    await perform(async () => {
      const firstPath = selected[0]!.webkitRelativePath || selected[0]!.name;
      const name = firstPath.split("/")[0]!;
      const files = await readDirectory(selected);
      const gitDirectory = gitDirectoryLink(files);
      if (gitDirectory !== null) {
        gitImportError = ""; pendingImport = { name, files, gitDirectory };
      } else await finishImport(name, files);
    });
  }
  async function importGitDirectory(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const selected = Array.from(input.files ?? []); input.value = "";
    const request = pendingImport;
    if (!selected.length || !request) return;
    await perform(async () => {
      gitImportError = "";
      try {
        await finishImport(request.name, attachGitDirectory(request.files, await readDirectory(selected)));
        pendingImport = null;
      } catch (failure) { gitImportError = describe(failure); }
    });
  }
  function zoomEditor(direction:number) {
    if(page!=='editor'||!repository||!path||controlsBusy||fileNavigation||writeFailed||replaying)return;
    const fontSize=direction===0?DEFAULT_SETTINGS.fontSize:Math.max(7,Math.min(32,effective.fontSize+direction));
    if(fontSize===effective.fontSize)return;
    saveSettings({...settings,repositories:{...settings.repositories,
      [repository.id]:{...settings.repositories[repository.id],fontSize}}});
  }
  function editorZoomWheel(node:HTMLElement){
    let lastTime=0,lastDirection=0;
    const wheel=(event:WheelEvent)=>{
      if(!(event.target instanceof Element)||!event.target.closest('.cm-scroller')||event.target.closest('.cm-tooltip, [data-ai-composer]'))return;
      const delta=event.deltaY||event.deltaX;if(!delta)return;
      const key=delta<0?'WheelUp':'WheelDown';
      const action=(['zoomIn','zoomOut'] as const).find(id=>shortcutsFor(id,effective.keybindings).some(binding=>matchesShortcut({...event,key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey,shiftKey:event.shiftKey},binding)));
      if(!action)return;
      event.preventDefault();event.stopPropagation();
      const direction=action==='zoomIn'?1:-1,time=performance.now();
      if(direction===lastDirection&&time-lastTime<50)return;
      lastTime=time;lastDirection=direction;zoomEditor(direction);
    };
    node.addEventListener('wheel',wheel,{capture:true,passive:false});
    return {destroy(){node.removeEventListener('wheel',wheel,true);}};
  }
  function saveSettings(value: SettingsStore) {
    if (replaying || activityError) return;
    const before = captureActivity(), next = normalizeSettings(value);
    if (JSON.stringify(before.settings) === JSON.stringify(next)) return;
    settings = next;
    preferencePending += 1;
    preferences = recordWorkspace("Change settings", before).then(() => { settingsError = ""; })
      .catch(failure => { settingsError = describe(failure); }).finally(() => { preferencePending -= 1; });
  }

  function downloadBuffer() {
    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = path.split("/").pop() || "unsaved.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

</script>

<svelte:window onkeydowncapture={preventBrowserSave} onbeforeunload={protectPending} onpagehide={leaveWorkspace} onpageshow={() => { workspaceLeaving = false; }} />
<svelte:document onfocusin={rememberFocus} onkeydown={applicationKeydown} />
<input class="directory-input" bind:this={directoryInput} type="file" webkitdirectory multiple aria-label="Import directory" onchange={importDirectory} />

<Tooltip.Provider>
<main aria-label="Code editor" class="app-shell">
  <RepositoryContextMenu disabled={!repository || workspaceBusy || fileNavigation || writeFailed} oncreate={() => showNewFile("")}>
    {#snippet child({ props })}
  <aside {...props} style:--explorer-width={explorerPreview!==undefined||workspace.explorerWidth!==undefined?`${explorerPreview??workspace.explorerWidth}px`:undefined} class="sidebar" inert={gitIndexBusy} aria-label="Repository explorer">
    <div class="files-section" bind:this={fileExplorer} onscroll={event => rememberScroll("explorer", event.currentTarget)}>
      <div class="section-heading">
        {#if repository}
          <div class="branch-label" inert={fileNavigation}>
            <NavigationDropdown label="Branch" value={repository.branch ?? ""} placeholder={repository.branch ?? (repository.head ? `Detached ${repository.head.slice(0, 8)}` : "Detached HEAD")} placeholderIcon="folder_open"
              items={(repository.branches ?? (repository.branch ? [repository.branch] : [])).map(branch => ({ value: branch, label: branch, icon: branch === repository?.branch ? "folder_open" : "folder_data" }))}
              disabled={workspaceBusy || writeFailed} onchange={branch => void changeBranch(branch)}
              actions={[{ label: "New branch", icon: "account_tree", onselect: () => showForm("branch") }]} />
          </div>
        {:else}<span>FILES</span>{/if}
      </div>
      <div class="root-files">
        {#key repository?.id}
          <FileTree showIcons={effective.fileExplorerIcons} files={repository?.files ?? []} selectedPath={path} disabled={workspaceBusy || writeFailed}
            initialState={currentWorkspace} restoreEpoch={treeRestoreEpoch} ontoggle={toggleDirectory} onstate={(expanded, focused) => { if (repository) rememberTree(repository.id, expanded, focused); }}
            dragDisabled={fileNavigation} dropRoot={fileExplorer} onmove={moveEntry}
            {...(repository ? { onimport: addDroppedFiles } : {})}
            onselect={file => void selectFile(file)} onrename={renameEntry} ondelete={file => showForm("delete", file)} oncreate={showNewFile} />
        {/key}
      </div>
      {#if !repository?.files.length}<p class="empty-files">{repository ? "No files yet. Start with a new file." : "Your files will appear here."}</p>{/if}
    </div>
    <ExplorerDivider disabled={!workspaceReady||workspaceBusy||fileNavigation||writeFailed||replaying} onstart={startExplorerResize} onpreview={width=>{explorerPreview=width;}} onend={finishExplorerResize}/>
  </aside>
    {/snippet}
  </RepositoryContextMenu>
  <div class="work-area" bind:clientWidth={workAreaWidth}
    style:--workbench-header-height={`${workbenchHeaderHeight}px`}
    style:--workbench-tabs-height={`${workbenchTabsHeight}px`}
    style:--workbench-tabs-content-height={`${workbenchTabsContentHeight}px`}>
  <section class="workbench" inert={gitIndexBusy} hidden={compactRightPanes}>
    <header class="topbar" bind:this={workbenchHeader}>
      <nav class="breadcrumb" aria-label="Repository navigation" inert={fileNavigation}>
        <div class="header-picker repository-picker">
          <NavigationDropdown label="Repository" value={repository?.id ?? ""} placeholder="Choose a repository" placeholderIcon="folder_open"
            items={repositories.map(item => ({ value: item.id, label: item.name, icon: item.id === repository?.id ? "folder_open" : "folder" }))}
            disabled={workspaceBusy || loading || writeFailed}
            onchange={id => { void selectRepository(id); }}
            actions={[
              { label: "New repository", icon: "create_new_folder", onselect: () => showForm("repository") },
              { label: "Import directory", icon: "drive_folder_upload", onselect: () => directoryInput.click() },
              { label: "Clone repository", icon: "cloud_download", onselect: () => cloneOpen = true }
            ]} />
        </div>
        <span aria-hidden="true">/</span>
        <div class="header-picker page-picker">
          <NavigationDropdown label="Page" value={page} placeholder="Editor"
            items={pages.map(item => ({ value: item.id, label: item.name, icon: item.icon }))}
            disabled={workspaceBusy || writeFailed} onchange={value => navigate(value as Page)} />
        </div>
        {#if page === "settings"}
          <span aria-hidden="true">/</span>
          <div class="header-picker settings-picker">
            <NavigationDropdown label="Settings scope" value={settingsScope} placeholder="Global defaults"
              items={[
                { value: "global", label: "Global defaults", icon: "public" },
                ...(repository ? [{ value: "repository", label: "Repository settings", icon: "folder_managed" }] : []),
                ...(repository && path ? [{ value: "file", label: "File settings", icon: "display_settings" }] : [])
              ]}
              disabled={workspaceBusy || writeFailed}
              onchange={value => { settingsScope = value as "global" | "repository" | "file"; }} />
          </div>
        {/if}
      </nav>
      <div class="save-status" role="status" aria-label="Persistence status" aria-live="polite"><span class:pending={saving} class:failed={writeFailed || Boolean(settingsError)} class="status-dot"></span>{loading ? "Opening local storage…" : status}</div></header>
    {#if page !== "resources" && page !== "vault"}<div class="editor-toolbar" inert={fileNavigation} onwheel={scrollTabs}>
      {#if storageReady}
        {#if toolbarUndoVisible || toolbarRedoVisible || (page === "editor" && effective.showStagedHistoryButton)}<div class="editor-actions" role="group" aria-label={page==='settings'?'Settings history':'File actions'}>
          {#if toolbarUndoVisible}<Button variant="ghost" size="icon-sm" class="history-action" aria-label="Undo" tooltip="Undo" disabled={workspaceBusy || writeFailed || (!canUndo && pending === 0 && activityPending === 0)} onclick={undo}><MaterialIcon name="undo" size={18} /></Button>{/if}
          {#if toolbarRedoVisible}<Button variant="ghost" size="icon-sm" class="history-action" aria-label="Redo" tooltip="Redo" disabled={workspaceBusy || writeFailed || !canRedo} onclick={redo}><MaterialIcon name="redo" size={18} /></Button>{/if}
          {#if page === "editor" && effective.showStagedHistoryButton}<Button variant="ghost" size="icon-sm" aria-label="Open staged history" tooltip="Open staged history" disabled={!repository || workspaceBusy || writeFailed} onclick={() => openHistory("changes")}><MaterialIcon name="manage_history" size={18} /></Button>{/if}
        </div>{/if}
        {#if page === "editor"}
          {#if effective.showZoomOutButton || effective.showZoomInButton}<div class="editor-actions" role="group" aria-label="Editor zoom">
            {#if effective.showZoomInButton}<Button variant="ghost" size="icon-sm" aria-label="Zoom in" tooltip="Zoom in" disabled={!repository||!path||workspaceBusy||fileNavigation||writeFailed||effective.fontSize>=32} onclick={()=>zoomEditor(1)}><MaterialIcon name="zoom_in" size={18}/></Button>{/if}
            {#if effective.showZoomOutButton}<Button variant="ghost" size="icon-sm" aria-label="Zoom out" tooltip="Zoom out" disabled={!repository||!path||workspaceBusy||fileNavigation||writeFailed||effective.fontSize<=7} onclick={()=>zoomEditor(-1)}><MaterialIcon name="zoom_out" size={18}/></Button>{/if}
          </div>{/if}
          {#if effective.showFormatButton}<Button variant="ghost" size="icon-sm" aria-label="Format file" aria-busy={formatting}
            tooltip={formatter && formatterInstalled ? "Format file" : "No formatter available for this file type"}
            disabled={!canFormat || formatting || activeDiffOpen} onclick={formatCurrentDocument}>
            <MaterialIcon name="align_horizontal_left" size={18} />
          </Button>{/if}
          {#if effective.showDiffButton}<div class="editor-actions" role="group" aria-label="Git actions">
          {#if effective.showDiffButton}<Button variant="ghost" size="icon-sm" aria-label={activeDiffOpen ? "Close file diff" : "Open file diff"} aria-pressed={activeDiffOpen}
            tooltip="File diff" disabled={!repository || !path || Boolean(fileError) || workspaceBusy || fileNavigation || writeFailed} onclick={toggleFileDiff}>
            <MaterialIcon name="text_compare" size={18} />
          </Button>{/if}
          </div>{/if}
        {/if}
        {#if page === "settings" && effective.showSettingsKeybindingsResetButton}
          <Button variant="ghost" size="icon-sm" aria-label="Reset keybindings" tooltip={settingsScope === "repository" ? "Use inherited keybindings" : "Restore default keybindings"} disabled={workspaceBusy || writeFailed || settingsScope === "file"} onclick={() => settingsComponent?.resetKeybindings()}>
            <MaterialIcon name="settings_backup_restore" size={18} />
          </Button>
        {/if}
        {#if page === "settings" && effective.showSettingsResetButton}
          <Button variant="ghost" size="icon-sm" aria-label={settingsResetLabel} tooltip={settingsResetLabel} disabled={workspaceBusy || writeFailed} onclick={() => settingsComponent?.resetAll()}>
            <MaterialIcon name="reset_settings" size={18} />
          </Button>
        {/if}
        <div class="editor-actions toolbar-right" role="group" aria-label="Pane actions">
          {#if page === "editor"}
            {#if effective.showCommitHistoryButton}<Button variant="ghost" size="icon-sm" aria-label="Open History" aria-expanded={historyOpen && currentWorkspace.historyView === "versions"} tooltip={historyOpen && currentWorkspace.historyView === "versions" ? "Close History" : "Open History"} disabled={!repository || workspaceBusy || writeFailed} onclick={() => { if (controlsBusy || fileNavigation || writeFailed) return; if (historyOpen && currentWorkspace.historyView === "versions") setRightPane("history", false); else openHistory("versions"); }}><MaterialIcon name="history" size={18} /></Button>{/if}
            {#if effective.showGitButton}<Button variant="ghost" size="icon-sm" aria-label="Git operations" aria-expanded={gitOpen} tooltip={gitOpen && gitActiveTab === "Actions" ? "Close Git pane" : "Git operations"} disabled={!repository || workspaceBusy || writeFailed} onclick={() => toggleGit()}><MaterialIcon name="account_tree" size={18} /></Button>{/if}
          {/if}
        <Button variant="ghost" size="icon-sm" class="toolbar-chat" aria-label="AI chat" aria-expanded={ollamaOpen} tooltip="AI chat" tooltipSide="left" onclick={() => { setRightPane("ai", !ollamaOpen); }}><MaterialIcon name="robot" size={18} /></Button>
        </div>
      {/if}
    </div>{/if}
    {#if (error && !activityError) || writeFailed || settingsError}<div role="alert" class="error-banner"><MaterialIcon name="error" size={20} /><div><strong>{writeFailed ? "Your changes need attention" : "Something could not be completed"}</strong><p>{error || settingsError}</p></div>{#if writeFailed}<Button variant="outline" size="sm" onclick={downloadBuffer}>Download unsaved file</Button><Button variant="outline" size="sm" onclick={() => showForm("reload")}>Reload repository</Button>{:else}{#if settingsError}<Button variant="outline" size="sm" onclick={() => showForm("reload")}>Reload to recover</Button>{/if}<Button variant="ghost" size="icon-sm" aria-label="Dismiss error" onclick={() => { error = ""; }}><MaterialIcon name="close" size={18} /></Button>{/if}</div>{/if}
    {#if workspaceError}<p role="alert" class="error-banner">{workspaceError}</p>{/if}
    {#if activityError && !writeFailed && !settingsError}<div role="alert" class="error-banner"><p>Your action history could not be saved: {activityError}</p><Button onclick={() => location.reload()}>Reload to recover</Button></div>{/if}
    <div aria-busy={fileNavigation} id="panel-editor" role="region" tabindex="-1" aria-label="Editor" hidden={page !== "editor"} class="editor-panel">
      {#if repository && path}
        <div class="editor-layout">
        <div class="editor-tabs" class:split={splitViews.length>0} style:grid-template-columns={paneColumns} bind:this={editorTabs}>
        <div class="file-tabs" use:tabDrag={{pane:"primary",repository:repository.id,disabled:workspaceBusy||fileNavigation||writeFailed||replaying,paths:openedFiles,ondrop:dropTab}} onwheel={scrollTabs} aria-label="Open files" bind:this={fileTabs} onscroll={event => rememberScroll("tabs", event.currentTarget)}>
          {#each openedFiles as opened (opened)}
            <div class="file-tab" class:diff-tab={isDiffTab(opened)} in:tabReveal role="group" aria-label={`File tab ${tabLabel(opened,true)}`} data-tab-path={opened} data-file-context-target class:active={opened === activeFileTab}
              onpointerdown={event => { if (middleClickClosesTab(effective,event)) event.preventDefault(); }}
              onauxclick={event => {
                if (!middleClickClosesTab(effective,event)) return;
                event.preventDefault();
                if (!workspaceBusy && !fileNavigation && !writeFailed) void closeFile(opened);
              }}>
              <FileName path={tabFile(opened)} tab disabled={workspaceBusy || writeFailed} onsplit={()=>openSplit(opened)} onclosesplit={splitViews.length?()=>closeSplit():undefined}>
                {#snippet child({ props })}
                  <button {...props} class="file-tab-select" class:active={opened === activeFileTab} aria-label={`Switch to ${tabLabel(opened,true)}`} disabled={workspaceBusy || writeFailed} onclick={() => void selectFile(opened)}><FileIcon path={tabFile(opened)} size={15} />{tabLabel(opened)}</button>
                {/snippet}
              </FileName>
              <Button variant="ghost" size="icon-sm" class="file-tab-close" aria-label={`Close ${tabLabel(opened,true)}`} tooltip={`Close ${tabLabel(opened)}`}
                inert={fileNavigation} disabled={workspaceBusy || writeFailed} onclick={() => void closeFile(opened)}><MaterialIcon name="close" size={14} /></Button>
            </div>
          {/each}
        </div>
        {#each splitViews as pane (pane.id)}
          <div class="file-tabs split-file-tabs" use:tabDrag={{pane:pane.id,repository:repository.id,disabled:workspaceBusy||fileNavigation||writeFailed||replaying,paths:pane.tabs,ondrop:dropTab}}
            onwheel={scrollTabs} aria-label="Split open files" data-pane-id={pane.id}>
            {#each pane.tabs as opened (opened)}
            <div class="file-tab" class:diff-tab={isDiffTab(opened)} in:tabReveal class:active={opened===activePaneTab(pane)} role="group" aria-label={`Split file tab ${tabLabel(opened,true)}`} data-tab-path={opened} data-file-context-target
              onpointerdown={event=>{if(middleClickClosesTab(effective,event))event.preventDefault();}}
              onauxclick={event=>{if(middleClickClosesTab(effective,event)){event.preventDefault();closeSplitTab(pane.id,opened);}}}>
              <FileName path={tabFile(opened)} tab disabled={workspaceBusy||fileNavigation||writeFailed} onsplit={()=>openSplit(opened,pane.id)} onclosesplit={()=>closeSplit(pane.id)}>
                {#snippet child({props})}
                  <button {...props} class="file-tab-select" class:active={opened===activePaneTab(pane)} aria-label={`Focus split file ${tabLabel(opened,true)}`} disabled={workspaceBusy||fileNavigation||writeFailed} onclick={()=>selectSplitTab(pane.id,opened)}>
                    <FileIcon path={tabFile(opened)} size={15} />{tabLabel(opened)}
                  </button>
                {/snippet}
              </FileName>
              <Button variant="ghost" size="icon-sm" class="file-tab-close" aria-label={`Close split file ${tabLabel(opened,true)}`} tooltip={`Close ${tabLabel(opened)}`}
                disabled={workspaceBusy||fileNavigation||writeFailed} onclick={()=>closeSplitTab(pane.id,opened)}><MaterialIcon name="close" size={14} /></Button>
            </div>
            {/each}
          </div>
        {/each}
        </div>
        <div class="editor-surface">{#if fileError}<div class="file-unavailable"><MaterialIcon name="draft" size={40} /><h2>This file is preserved</h2><p>{fileError}</p><p>Text editing is available for UTF-8 files. This file remains in your repository.</p></div>{:else}<div class="editor-document" use:editorZoomWheel class:split={splitViews.length>0} style:grid-template-columns={paneColumns} bind:this={editorDocument}><div class="code-editor primary-pane"><div class="primary-source" bind:this={primarySource} hidden={fileDiffOpen&&diffPresented}><CodeEditor loadBaseline={loadCommittedFile} baselineRevision={repository.head} loadWorkspace={languageWorkspace} workspacePaths={repository.files} workspaceRevision={workingRevision} bind:this={editorComponent} {restoreEpoch} documentId={`${repository.id}:${path}`} {path} value={contents} settings={effective} session={currentSession} active={!fileDiffOpen && page === "editor" && (!(starting || replaying) || configurationReady)} onready={editorIsReady} onprogress={editorProgress} restoreFocus={currentWorkspace.focus === "editor"} onsession={rememberEditor} onfocus={() => { if (repository && !replaying) updateWorkspace(repository.id, { focus: "editor" }); }} disabled={workspaceBusy || fileNavigation || writeFailed || (currentWorkspace.stagedDiffOpen===true||Boolean(currentWorkspace.commitDiffOid))} isLocked={()=>controlsBusy||fileNavigation} onchange={changed} onundo={undo} onredo={redo} oncursor={(line, column) => { cursor = { line, column }; }} /></div>{#if fileDiffOpen}<FileDiff bind:this={primaryDiff} onchange={changed} onundo={undo} onredo={redo} onsession={rememberEditor} disabled={workspaceBusy||fileNavigation||writeFailed} isLocked={()=>controlsBusy||fileNavigation} source={primarySource} viewport={diffViewport} session={currentSession} documentId={`${repository.id}:${path}`} {path} value={contents} settings={effective} baselineRevision={currentWorkspace.commitDiffOid??(currentWorkspace.stagedDiffOpen?repository.revision:repository.head)} loadBaseline={loadCommittedFile} loadStaged={currentWorkspace.stagedDiffOpen?loadStagedFile:undefined} loadCommit={currentWorkspace.commitDiffOid?()=>loadCommitFile(path,currentWorkspace.commitDiffOid!):undefined} {restoreEpoch} onready={(id,epoch)=>{diffPresented=true;editorIsReady(id,epoch);}} />{/if}</div>{#each splitViews as pane (pane.id)}<SplitEditor bind:this={splitEditors[pane.id]} repositoryId={repository.id} path={pane.file} diffOpen={pane.diffOpen===true} stagedDiffOpen={pane.stagedDiffOpen===true} commitOid={pane.commitDiffOid} paneId={pane.id} revision={workingRevision} indexRevision={repository.revision} baselineRevision={repository.head} {configurationRevision}
       files={repository.files} {settings} {pending} sharedValue={pane.file===path?contents:splitBuffers[`${repository.id}:${pane.file}`]} sharedError={pane.file===path?fileError:''}
       disabled={workspaceBusy||writeFailed} isLocked={()=>controlsBusy||fileNavigation} active={page==='editor'} {restoreEpoch}
       session={pane.session} loadFile={file=>repositoryClient.read(repository!.id,file)} loadBaseline={file=>loadCommittedFile(file)} loadStaged={file=>loadStagedFile(file)} loadCommit={loadCommitFile} loadWorkspace={languageWorkspace}
       onchange={(value,before,after,action,group)=>changedFile(pane.file,value,before,after,action,pane.id,group)} onundo={undo} onredo={redo} onsession={(id,state)=>rememberSplit(pane.id,id,state)} onready={id=>splitPaneReady(pane.id,id)} />{/each}</div>{/if}</div>
        {#if splitViews.length&&!fileError}
          {#key `${repository.id}:${splitLayout}`}
            <PaneDividers sizes={paneSizes} disabled={workspaceBusy||fileNavigation||writeFailed||replaying||starting}
              onstart={startPaneResize} onpreview={previewPaneResize} onend={finishPaneResize} />
          {/key}
        {/if}
        </div>
        {#if effective.editorFooter}<footer class="editor-status"><span>Ln {cursor.line}, Col {cursor.column}</span><span>{effective.indentWithTabs ? "Tabs" : "Spaces"}: {effective.indentWithTabs ? effective.tabSize : effective.indentSize}</span><span>UTF-8</span><span class="status-spacer"></span><span>{effective.readOnly ? "Read-only" : languageForPath(path,"auto",effective.languageMappings)}</span></footer>{/if}
      {:else}<div class="welcome"><h1>{#if repository?.files.length}code.{:else}Your code.<br />Your corner of the internet.{/if}</h1><span class="eyebrow">A HEADLESS BROWSER IDE</span>{#if !repository?.files.length}<p>{repository ? "A fresh repository, ready for its first file." : "An editor with room to think. Bring a directory, or begin with a blank repository. Everything stays here, in your browser."}</p>{/if}<div class="welcome-actions"><Button style={repository ? "--color-hover-background: var(--color-primary)" : ""} disabled={loading || workspaceBusy} onclick={() => showForm(repository ? "file" : "repository")}><MaterialIcon name={repository ? "note_add" : "add"} size={18} />{repository ? "New file" : "Create a repository"}</Button><Button variant="outline" disabled={loading || workspaceBusy} onclick={() => directoryInput.click()}>Import directory<MaterialIcon name="arrow_outward" size={16} /></Button><Button variant="outline" disabled={loading || workspaceBusy} onclick={() => cloneOpen = true}>Clone repository<MaterialIcon name="cloud_download" size={16} /></Button></div></div>{/if}
    </div>
    {#if resourcesStarted || page === "resources"}<div hidden={page !== "resources"} bind:this={resourcesPanel} onscroll={event => rememberScroll("resources", event.currentTarget)} id="panel-resources" role="region" tabindex="-1" aria-label="Resources" class="scroll-panel">{#if storageReady}<ResourcesPage {repository} repositoryCount={repositories.length} />{/if}</div>{/if}

    <div class="page-with-minimap" class:hide-scrollbars={!effective.scrollbars} hidden={page !== "settings"}><div inert={fileNavigation} bind:this={settingsPanel} onscroll={event => rememberScroll("settings", event.currentTarget)} id="panel-settings" role="region" tabindex="-1" aria-label="Settings" hidden={page !== "settings"} class="scroll-panel"><SettingsPage files={repository?.files} bind:this={settingsComponent} {settings} bind:scope={settingsScope} disabled={page === "settings" && workspaceBusy} {path} {fileConfiguration} {...(repository ? { repositoryId: repository.id } : {})} onchange={saveSettings} /></div>{#if effective.minimap}<PageMinimap target={settingsPanel} label="Settings" />{/if}</div>
    {#if page === "vault" && storageReady}<VaultPage onchange={() => vaultRevision++} />{/if}
  </section>
  <div class="right-panes" class:compact={compactRightPanes}>
  {#if repository}<HistoryPanel bind:open={() => historyOpen, value => setRightPane("history", value)} bind:panel={historyPanel} bind:graph={changesGraph}
    docked={workAreaWidth >= 1000 || compactRightPanes} width={rightWidths.history || 440} maximumWidth={historyMaximumWidth}
    resizeDisabled={compactRightPanes || !workspaceReady || workspaceBusy || fileNavigation || writeFailed || replaying || starting}
    {repository} frozen={gitIndexBusy} settings={effective} view={currentWorkspace.historyView} disabled={workspaceBusy || fileNavigation || writeFailed}
    onviewchange={selectHistoryView} onselectchange={loadHistoryChange} onselectcommit={showGit} onscroll={panel => rememberScroll("history", panel)}
    onresizestart={startHistoryResize}
    onresizepreview={width => historyPreview = width} onresizeend={finishHistoryResize}/>{/if}
  {#if repository}{#key repository.id}<GitPanel bind:tab={gitActiveTab} bind:open={() => gitOpen, value => setRightPane("git", value)} docked={workAreaWidth >= 1000 || compactRightPanes} request={gitRequest} width={gitPaneWidth} maximumWidth={gitMaximumWidth}
    actionsDisabled={!workspaceReady || controlsBusy || fileNavigation || writeFailed || replaying || starting}
    resizeDisabled={compactRightPanes || !workspaceReady || workspaceBusy || fileNavigation || writeFailed || replaying || starting}
    onresizestart={startGitResize} onresizepreview={width => gitPreview = width} onresizeend={finishGitResize}
    {repository} settings={effective} initialCommit={gitInitialCommit} initialTab={gitInitialTab} onaction={gitAction} oncheckout={checkoutVersion} onremote={remoteAction} onbranch={changeBranch} onsettings={openUpstreamSettings} onopencommitdiff={openCommitDiff} onopendiff={openStagedDiff} onopenfile={openGitFile} />{/key}{/if}
  <AIPanel stacked={compactRightPanes} bind:open={() => ollamaOpen, value => setRightPane("ai", value)} availableWidth={workAreaWidth} savedWidth={rightWidths.ai || 380} reservedWidth={rightPaneCount > 1 ? 320 + rightWidths.git + rightWidths.history : 560} onwidthchange={saveAIWidth} {vaultRevision} {markdownRepository} showSendButton={effective.showAISendButton} enterAction={effective.aiEnterAction} instructions={effective.aiInstructions} skills={effective.aiSkills} tools={effective.aiTools} modelContexts={effective.aiModelContexts} gitRepository={gitToolRepository} editorSettings={{ personal: settings.global, effective: resolveSettings(settings, repository?.id), ...(repository ? { repository: { id: repository.id, overrides: settings.repositories[repository.id] ?? {} } } : {}) }}
    oncontextchange={(key, limit) => {
      if (repository) saveSettings({ ...settings, repositories: { ...settings.repositories, [repository.id]: { ...settings.repositories[repository.id], aiModelContexts: { ...effective.aiModelContexts, [key]: limit } } } });
      else saveSettings({ ...settings, global: { ...settings.global, aiModelContexts: { ...settings.global.aiModelContexts, [key]: limit } } });
    }} />
  </div>
  </div>
</main>
<CloneRepository bind:open={cloneOpen} onclone={cloneRepository} onsettings={openUpstreamSettings} />
<Sheet.Root bind:open={formOpen}>
  <Sheet.Content class="repository-form-panel" onOpenAutoFocus={focusFilePath}>
    <Sheet.Header>
      <Sheet.Title>{form === "repository" ? "New repository" : form === "branch" ? "New branch" : form === "file" ? "New file" : form === "delete" ? (formDirectory ? "Delete folder" : "Delete file") : "Reload repository"}</Sheet.Title>
      <Sheet.Description>{form === "repository" ? "A private place for your files, stored in this browser." : form === "branch" ? "Create and switch to a branch from the current commit. Your working changes stay with you." : form === "delete" ? (formDirectory ? "The folder and all its files will be removed from the working tree. You can restore them with Undo." : "The file will be removed from the working tree. You can restore it with Undo.") : form === "reload" ? "Unsaved visible changes will be discarded. Download the file first if you need to keep them." : "Use a relative path. Folders are created as needed."}</Sheet.Description>
    </Sheet.Header>
    <form class="repository-form" onsubmit={submitForm}>
      {#if form === "repository" || form === "branch" || form === "file"}
        <label for="form-value">{form === "repository" ? "Repository name" : form === "branch" ? "Branch name" : "File path"}</label>
        <input id="form-value" bind:this={formInput} bind:value={formValue} required
          placeholder={form === "repository" ? "My next idea" : form === "branch" ? "feature/my-change" : "src/index.ts"} disabled={workspaceBusy} />
      {:else if form === "delete"}<p class="delete-name">{formTarget}</p>{/if}
      {#if formError}<p role="alert">{formError}</p>{/if}
      <div class="form-buttons">
        <Button variant="outline" disabled={busy} onclick={() => { formOpen = false; }}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Working…" : form === "repository" ? "Create repository" : form === "branch" ? "Create branch" : form === "file" ? "Create file" : form === "delete" ? "Delete" : "Reload and discard"}</Button>
      </div>
    </form>
  </Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={() => pendingImport !== null, open => { if (!open && !workspaceBusy) pendingImport = null; }}>
  <Sheet.Content class="repository-form-panel">
    <Sheet.Header>
      <Sheet.Title>Import Git history</Sheet.Title>
      <Sheet.Description>This folder stores its Git history elsewhere. Choose its Git directory to import the repository with its history.</Sheet.Description>
    </Sheet.Header>
    {#if pendingImport}
      <div class="repository-form git-import">
        <p>The <code>.git</code> file in <strong>{pendingImport.name}</strong> points to:</p>
        <code class="git-directory-path">{pendingImport.gitDirectory}</code>
        <p>Relative paths start from the folder you just selected. Choose the directory containing <code>HEAD</code>, <code>config</code>, and <code>objects</code>. You may need to show hidden folders in the picker.</p>
        {#if gitImportError}<p role="alert">{gitImportError}</p>{/if}
        <input class="directory-input" bind:this={gitDirectoryInput} type="file" webkitdirectory multiple aria-label="Import Git directory" onchange={importGitDirectory} />
        <div class="form-buttons">
          <Button variant="outline" disabled={workspaceBusy} onclick={() => { pendingImport = null; }}>Cancel</Button>
          <Button disabled={workspaceBusy} onclick={() => gitDirectoryInput?.click()}>{busy ? "Importing…" : "Choose Git directory"}</Button>
        </div>
      </div>
    {/if}
  </Sheet.Content>
</Sheet.Root>

</Tooltip.Provider>

<style>
  .app-shell { display: flex; height: 100dvh; overflow: hidden; }
  .right-panes { display: contents; }
  .right-panes.compact { display: flex; flex-direction: column; width: 100%; min-width: 0; height: 100%; }
  .right-panes.compact :global(.sheet-dock) { flex: 1 1 0 !important; height: 0; width: 100%; }
  .right-panes.compact :global(.docked-content) { width: 100% !important; }
  .workbench[hidden] { display: none; }
  .work-area { display: flex; flex: 1; min-width: 0; height: 100%; }
  .sidebar { position:relative; --explorer-default-width:245px; border-right: 2px solid color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); width:clamp(160px,var(--explorer-width,var(--explorer-default-width)),max(160px,min(600px,calc(100vw - 240px)))); flex: 0 0 auto; display: flex; flex-direction: column; background: var(--color-surface); }
  .section-heading { display: flex; justify-content: space-between; align-items: center; font-size: 0.5625rem; letter-spacing: .14em; font-weight: 750; margin-bottom: 7px; }
  input { border: 0; background: var(--color-background); color: var(--color-foreground); border-radius: 4px; padding: 10px 12px; font-size: 0.75rem; }
  .directory-input { display: none; }
  .files-section { padding: 15px 11px; flex: 1; overflow: auto; }.files-section .section-heading { padding: 0; margin-bottom: 1px; }.empty-files { font-size: 0.625rem; padding: 10px 6px; line-height: 1.8; }
  /* Tab icons are .9375rem wide after 14px padding; share their center with both headers. */
  .workbench { --tab-icon-center: calc(14px + .46875rem); flex: 1; min-width: 0; display: flex; flex-direction: column; }.topbar { min-height: 48px; padding: 6px 28px 6px calc(var(--tab-icon-center) - .5rem); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }.breadcrumb { display: flex; gap: 11px; align-items: center; font-size: 0.6875rem; min-width: 0; max-width: 100%; }.breadcrumb > :global(.material-symbols-rounded) { flex-shrink: 0; }
  .header-picker { position: relative; min-width: 0; }.repository-picker { flex: 0 1 auto; max-width: 260px; }.page-picker { flex-shrink: 0; }
  .save-status { margin-left: auto; display: flex; gap: 7px; align-items: center; font-size: 0.5625rem; white-space: nowrap; }.status-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--color-foreground); }.status-dot.pending { animation: saving 1s ease-in-out infinite alternate; }.status-dot.failed { width: 7px; height: 7px; border-radius: 1px; }
  .branch-label { display: flex; flex: 1; align-items: center; min-width: 0; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0; }.root-files { padding-left: 14px; }
  .branch-label :global(.navigation-trigger) { padding-inline: 14px 8px; }
  .editor-layout { position:relative;display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;overflow:hidden; }
  .editor-tabs { min-width:0;flex-shrink:0;overflow:hidden; }.editor-tabs.split { display:grid;gap:2px;background:var(--color-surface); }
  .split-file-tabs { border-left:2px solid color-mix(in srgb,var(--color-surface) 20%,var(--color-background)); }
  .editor-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; }.editor-panel[hidden], .scroll-panel[hidden] { display: none; }.file-tabs { display: flex; min-height: 38px; border-top: 2px solid color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); border-bottom: 2px solid color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); overflow-x: auto; background: var(--color-surface); }.file-tab { border-right: 2px solid color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); background: var(--color-hover-background); position: relative; display: flex; align-items: center; gap: 8px; flex-shrink: 0; padding: 8px 14px; font-size: 0.625rem; white-space: nowrap; }.file-tab.active { background: var(--color-background); }.file-tabs button { display: flex; gap: 8px; align-items: center; border: 0; background: transparent; color: inherit; font: inherit; padding: 0; white-space: nowrap; }
  .file-tab.diff-tab {
    background-image: repeating-linear-gradient(45deg, transparent 0 15px, var(--color-surface) 15px 16px);
  }
  .file-tab.diff-tab.active {
    background-image: repeating-linear-gradient(45deg, transparent 0 15px, color-mix(in srgb, var(--color-surface) 25%, transparent) 15px 16px);
  }
  /* Stretch the native selection button over the tab padding without nesting controls. */
  .file-tab :global(.file-name.custom) { position: static; }
  .file-tab-select::before { content: ""; position: absolute; inset: 0 -2px 0 0; }
  .file-tab:has(:focus-visible) { background-color: var(--color-focus-background); color: var(--color-focus-foreground); }
  .file-tab :global(button) { --color-hover-background: transparent; }
  .file-tab :global(.file-tab-close) { position: relative; z-index: 1; width: 20px; height: 20px; padding: 0; border-radius: 2px; }
  @media (hover: hover) {
    .file-tab:has(.file-tab-select:enabled):hover {
      color: var(--color-hover-foreground);
    }
  }
  .editor-toolbar { overflow-x: auto; scrollbar-width: none; --first-action-half-width: 1rem; display: flex; align-items: center; justify-content: flex-start; gap: 16px; height: 40px; flex: 0 0 40px; padding: 4px 20px 4px calc(var(--tab-icon-center) - var(--first-action-half-width)); background: var(--color-toolbar-background); color: var(--color-toolbar-foreground); font-weight: 700; --color-ring: var(--color-toolbar-foreground); }.editor-toolbar:has(> .editor-actions:first-child > :global(.history-action:first-child)) { --first-action-half-width: 16px; }.editor-actions { flex-shrink: 0; display: flex; gap: 2px; align-items: center; }.editor-actions:not(:last-child) { margin-right: 8px; }.editor-actions :global(.history-action) { width: 32px; height: 32px; }.editor-toolbar :global(button) { --color-hover-background: color-mix(in srgb, var(--color-foreground) 50%, transparent); }.editor-toolbar :global(button:disabled) { background: transparent; color: color-mix(in srgb, var(--color-surface) 65%, transparent); }
  .primary-pane { position:relative;min-width:0;min-height:0;height:100%;overflow:hidden; }.primary-source { height:100%;min-height:0; }.primary-source[hidden] { display:none; }
  .editor-document { height:100%;min-height:0; }.editor-document.split { overflow:hidden;display:grid;gap:2px;background:var(--color-surface); }.editor-document[hidden] { display:none; }
  .editor-surface { flex: 1; min-height: 0; position: relative; }.editor-status { display: flex; gap: 20px; padding: 7px 22px; font-size: 0.5625rem; }.status-spacer { flex: 1; }.file-unavailable { max-width: 430px; margin: 80px auto; text-align: center; }.file-unavailable h2 { font-family: Rationale, sans-serif; font-weight: 400; font-size: 1.75rem; }.file-unavailable p { font-size: 0.75rem; line-height: 1.8; }
  .welcome { margin: auto; padding: 48px 38px 60px; max-width: 740px; width: 100%; }.eyebrow { font-size: 0.5625rem; font-weight: 700; letter-spacing: .18em; }.welcome h1 { font-family: Rationale, sans-serif; font-size: clamp(38px, 4vw, 58px); font-weight: 400; line-height: 1.03; margin: 16px 0 8px; letter-spacing: -.02em; }.welcome > .eyebrow { display: block; margin-bottom: 25px; }.welcome > p { max-width: 430px; font-size: 0.75rem; line-height: 1.9; margin-bottom: 25px; }.welcome-actions { display: flex; flex-wrap: wrap; gap: 12px; }.welcome-actions :global(button) { font-size: 0.6875rem; }
  /* Graph rows place the first lane center 20px inside the history page. */
  .page-with-minimap { display:flex;flex:1;min-height:0;min-width:0; }.page-with-minimap[hidden] { display:none; }
  .page-with-minimap.hide-scrollbars:has(> :global(.page-minimap:not([hidden]))) > .scroll-panel { scrollbar-width:none; }
  .page-with-minimap.hide-scrollbars:has(> :global(.page-minimap:not([hidden]))) > .scroll-panel::-webkit-scrollbar { display:none; }
  .scroll-panel { position: relative; flex: 1; min-height: 0; overflow: auto; }
  .repository-form label { font-size: 0.625rem; font-weight: 650; }
  .error-banner { display: flex; align-items: center; gap: 12px; margin: 0; padding: 15px 23px; background: var(--color-surface); color: var(--color-foreground); font-size: 0.6875rem; }.error-banner > div { flex: 1; }.error-banner p { margin: 4px 0 0; line-height: 1.6; }
  :global(.repository-form-panel) { padding: 32px 24px; }.repository-form { display: flex; flex-direction: column; padding: 8px 16px; gap: 10px; }.repository-form [role="alert"] { margin: 6px 0; font-size: 0.6875rem; }.form-buttons { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }.delete-name { font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
  .git-import p { font-size: 0.75rem; line-height: 1.7; margin: 0; }.git-directory-path { padding: 12px; border-radius: 4px; font-size: 0.6875rem; overflow-wrap: anywhere; }
  @keyframes saving { to { opacity: .3; } }
  @media (max-width: 950px) { .sidebar { --explorer-default-width:215px; }.save-status { font-size: 0.5rem; } }
  .editor-toolbar::-webkit-scrollbar { display: none; }
  .editor-toolbar .toolbar-right { margin-left: auto; margin-right: 0; }
  @media (max-width: 650px) { .topbar { padding-right: 15px; }.breadcrumb { gap: 6px; flex-wrap: wrap; }.save-status { max-width: 95px; white-space: normal; }.editor-toolbar { padding-right: 7px; }.welcome { padding: 25px 20px; }.welcome h1 { font-size: 2.125rem; }.editor-status { gap: 12px; padding-inline: 12px; }.editor-status > span:nth-child(3) { display: none; } }
</style>

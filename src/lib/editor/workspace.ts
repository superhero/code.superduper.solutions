// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { filePath } from "../repository/paths.ts";
import { SETTINGS_TABS, isSettingsTab, type SettingsTab } from "./settings-tabs.ts";

/** Small UI snapshots contain positions and paths, never repository content. */
export const WORKSPACE_KEY = "code.workspace.v1";
export type WorkspacePage = "editor" | "history" | "resources" | "vault" | "settings";
export type HistoryView = "changes" | "versions";
export type RightPane = "history" | "git" | "ai" | "vault" | "resources" | "settings";
export type SidePane = "explorer" | RightPane;
// Empty path segments cannot occur in repository filenames.
const diffPrefix='diff://';
const stagedDiffPrefix='staged-diff://';
const commitDiffPrefix='commit-diff://';
export const commitDiffTab=(file:string,oid:string):string=>`${commitDiffPrefix}${oid}/${file}`;
export const commitDiffOid=(tab:string):string|undefined=>/^commit-diff:\/\/([a-f0-9]{40})\//.exec(tab)?.[1];
export const diffTab=(file:string,staged=false):string=>(staged?stagedDiffPrefix:diffPrefix)+file;
export const isStagedDiffTab=(tab:string):boolean=>tab.startsWith(stagedDiffPrefix);
export const isDiffTab=(tab:string):boolean=>tab.startsWith(diffPrefix)||isStagedDiffTab(tab)||Boolean(commitDiffOid(tab));
export const tabFile=(tab:string):string=>commitDiffOid(tab)?tab.slice(commitDiffPrefix.length+41):isStagedDiffTab(tab)?tab.slice(stagedDiffPrefix.length):tab.startsWith(diffPrefix)?tab.slice(diffPrefix.length):tab;
export const tabLabel=(tab:string,fullPath=false):string=>`${fullPath?tabFile(tab):tabFile(tab).split('/').pop()}${commitDiffOid(tab)?` (commit ${commitDiffOid(tab)!.slice(0,8)} diff)`:isStagedDiffTab(tab)?' (staged diff)':isDiffTab(tab)?' (diff)':''}`;
/** Closing a comparison returns to its source when that tab is still in this pane. */
export function tabAfterClose(tabs:readonly string[],closed:string):string|undefined{
  const remaining=tabs.filter(tab=>tab!==closed);
  const source=tabFile(closed);
  return isDiffTab(closed)&&remaining.includes(source)?source:remaining[Math.min(tabs.indexOf(closed),remaining.length-1)];
}
export const activePaneTab=(pane:RepositoryWorkspace|SplitView):string=>
  'activeFile' in pane?(pane.commitDiffOid?commitDiffTab(pane.activeFile,pane.commitDiffOid):pane.fileDiffOpen?diffTab(pane.activeFile,pane.stagedDiffOpen):pane.activeFile):(pane.commitDiffOid?commitDiffTab(pane.file,pane.commitDiffOid):pane.diffOpen?diffTab(pane.file,pane.stagedDiffOpen):pane.file);

export interface EditorSession {
  selection: { anchor: number; head: number }[];
  mainIndex: number;
  scrollTop: number;
  scrollLeft: number;
}
/** Visible document anchor for transferring a viewport between editor layouts. */
export interface EditorViewport {
  documentId:string;
  from:number;
  offset:number;
  scrollLeft:number;
}
export interface SplitView {
  id:string;
  tabs:string[];
  documents:Record<string,EditorSession>;
  /** Active document aliases used by the mounted editor. */
  file:string;
  session:EditorSession;
  diffOpen?:boolean;
  stagedDiffOpen?:boolean;
  commitDiffOid?:string|undefined;
}
export interface RepositoryWorkspace {
  tabs: string[];
  activeFile: string;
  historyView: HistoryView;
  fileDiffOpen: boolean;
  stagedDiffOpen?:boolean;
  commitDiffOid?:string|undefined;
  splitViews:SplitView[];
  /** Empty means automatic equal columns; otherwise one fraction per visible pane. */
  paneSizes:number[];
  documents: Record<string, EditorSession>;
  expandedDirectories: string[];
  treeFocus: string;
  scroll: { explorer: number; tabs: number; history: number; settings: number; resources?: number };
  focus: "editor" | "tree" | "none";
  settingsScroll?: Partial<Record<SettingsTab, number>>;
}
export interface WorkspaceState {
  explorerOpen?: boolean;
  paneOrder?: SidePane[];
  explorerWidth?:number;
  gitPaneWidth?:number;
  aiPaneWidth?:number;
  historyPaneWidth?:number;
  vaultPaneWidth?:number;
  resourcesPaneWidth?:number;
  settingsPaneWidth?:number;
  settingsTab?: SettingsTab;
  rightPane?:"git" | "ai";
  rightPanes?: RightPane[];
  version: 1;
  repositoryId: string;
  page: WorkspacePage;
  repositories: Record<string, RepositoryWorkspace>;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const own = (value: Record<string, unknown>, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined;
const coordinate = (value: unknown): number => typeof value === "number" && Number.isFinite(value)
  ? Math.min(2_147_483_647, Math.max(0, value)) : 0;
const safeId = (value: unknown): value is string => typeof value === "string" && Boolean(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
function path(value: unknown): string {
  if (typeof value !== "string") return "";
  try { return filePath(value); } catch { return ""; }
}
const paths = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.map(path).filter(Boolean))] : [];

function tabKeys(value:unknown):string[]{
  return Array.isArray(value)?[...new Set(value.filter((tab):tab is string=>typeof tab==='string'&&Boolean(path(tabFile(tab)))))] : [];
}
function selectedTab(tabs:string[],file:string,diff:boolean,staged=false,commit?:unknown):string{
  const oid=typeof commit==='string'&&/^[a-f0-9]{40}$/.test(commit)?commit:undefined;
  const selected=oid?commitDiffTab(file,oid):diff?diffTab(file,staged):file;
  return tabs.includes(selected)?selected:tabs[0]??'';
}
function normalizePaneSizes(value:unknown,count:number):number[]{
  if(!Array.isArray(value)||value.length!==count||!value.length||
    !value.every(size=>typeof size==='number'&&Number.isFinite(size)&&size>0))return [];
  let total=value.reduce((sum,size:number)=>sum+size,0);
  if(Math.abs(total-1)<=Number.EPSILON*count)return [...value];
  const scale=Number.isFinite(total)?1:value.reduce((maximum,size:number)=>Math.max(maximum,size),0);
  if(scale!==1)total=value.reduce((sum,size:number)=>sum+size/scale,0);
  return value.map((size:number)=>Math.max(Number.MIN_VALUE,(size/scale)/total));
}

/** Resolve legacy/equal layouts without turning their automatic sizing into a preference. */
export function resolvePaneSizes(sizes:number[],count:number):number[]{
  if(!Number.isInteger(count)||count<1)return [];
  const normalized=normalizePaneSizes(sizes,count);
  return normalized.length?normalized:Array(count).fill(1/count);
}

/** Insert immediately after the source, sharing that pane's explicit width. */
export function splitPaneSizes(sizes:number[],sourceIndex:number):number[]{
  const result=normalizePaneSizes(sizes,sizes.length);
  if(!result.length||!Number.isInteger(sourceIndex)||sourceIndex<0||sourceIndex>=result.length)return result;
  const half=Math.max(Number.MIN_VALUE,result[sourceIndex]!/2);
  result.splice(sourceIndex,1,half,half);
  return result;
}

/** Closing a pane gives its space to its left neighbour (or the next primary). */
export function removePaneSize(sizes:number[],index:number):number[]{
  const result=normalizePaneSizes(sizes,sizes.length);
  if(!result.length||!Number.isInteger(index)||index<0||index>=result.length)return result;
  const removed=result.splice(index,1)[0]!;
  if(result.length){
    const adjacent=Math.max(0,index-1);
    result[adjacent]=result[adjacent]!+removed;
  }
  return result;
}

function normalizeSession(value: unknown): EditorSession {
  const input = record(value);
  const ranges = own(input, "selection");
  const selection = Array.isArray(ranges) ? ranges.map(range => {
    const entry = record(range);
    return { anchor: Math.floor(coordinate(own(entry, "anchor"))), head: Math.floor(coordinate(own(entry, "head"))) };
  }) : [];
  if (!selection.length) selection.push({ anchor: 0, head: 0 });
  return {
    selection,
    mainIndex: Math.min(selection.length - 1, Math.floor(coordinate(own(input, "mainIndex")))),
    scrollTop: coordinate(own(input, "scrollTop")),
    scrollLeft: coordinate(own(input, "scrollLeft")),
  };
}

function normalizeDocuments(value:unknown):Record<string,EditorSession>{
  return Object.fromEntries(Object.entries(record(value)).filter(([key])=>Boolean(path(key)))
    .map(([key,value])=>[key,normalizeSession(value)]));
}

export function emptyRepositoryWorkspace(): RepositoryWorkspace {
  return { tabs: [], activeFile: "", historyView: "changes", fileDiffOpen: false, splitViews:[], paneSizes:[], documents: {}, expandedDirectories: [], treeFocus: "",
    scroll: { explorer: 0, tabs: 0, history: 0, settings: 0 }, focus: "none" };
}

/** The former long Settings page becomes the initial Appearance tab. */
export function settingsScrollTop(workspace: RepositoryWorkspace, tab: SettingsTab): number {
  return workspace.settingsScroll?.[tab] ?? (tab === "appearance" ? workspace.scroll.settings : 0);
}

function normalizeRepository(value: unknown): RepositoryWorkspace {
  const input = record(value);
  const tabs = tabKeys(own(input, "tabs"));
  const active = path(own(input, "activeFile"));
  const requestedDiff=own(input,'fileDiffOpen')===true;
  const requestedStaged=own(input,'stagedDiffOpen')===true;
  const requestedCommit=own(input,'commitDiffOid');
  // Migrate the former whole-workspace diff into a comparison tab.
  if(requestedDiff&&!requestedStaged&&!requestedCommit&&active&&tabs.includes(active)&&!tabs.includes(diffTab(active)))tabs.splice(tabs.indexOf(active)+1,0,diffTab(active));
  const selected=selectedTab(tabs,active,requestedDiff,requestedStaged,requestedCommit);
  const scroll = record(own(input, "scroll"));
  const storedSettingsScroll = record(own(input, "settingsScroll"));
  const settingsScroll = Object.fromEntries(SETTINGS_TABS.filter(tab => Object.hasOwn(storedSettingsScroll, tab.id))
    .map(tab => [tab.id, coordinate(own(storedSettingsScroll, tab.id))]));
  const focus = own(input, "focus");
  const storedViews=own(input,'splitViews');
  const legacyFile=path(own(input,'splitFile'));
  const candidates=Array.isArray(storedViews)?storedViews:legacyFile?[{id:'legacy-split',file:legacyFile,session:own(record(own(input,'splitDocuments')),legacyFile)}]:[];
  const ids=new Set<string>();
  const splitViews:SplitView[]=[];
  for(const candidate of candidates){
    const entry=record(candidate),id=own(entry,'id'),active=path(own(entry,'file'));
    const tabs=own(entry,'tabs')===undefined?(active?[active]:[]):tabKeys(own(entry,'tabs'));
    if(!safeId(id)||id==='primary'||!tabs.length||ids.has(id))continue;
    const selected=selectedTab(tabs,active,own(entry,'diffOpen')===true,own(entry,'stagedDiffOpen')===true,own(entry,'commitDiffOid')),file=tabFile(selected);
    const documents=normalizeDocuments(own(entry,'documents'));
    const activeSession=active===file?own(entry,'session'):undefined;
    const session=activeSession!==undefined?normalizeSession(activeSession):
      Object.hasOwn(documents,file)?documents[file]!:normalizeSession(undefined);
    Object.defineProperty(documents,file,{value:session,enumerable:true,writable:true,configurable:true});
    ids.add(id);splitViews.push({id,tabs,documents,file,session,...(isDiffTab(selected)?{diffOpen:true}:{}),...(isStagedDiffTab(selected)?{stagedDiffOpen:true}:{}),...(commitDiffOid(selected)?{commitDiffOid:commitDiffOid(selected)}:{})});
  }
  return {
    tabs,
    activeFile: tabFile(selected),
    historyView: own(input, "historyView") === "versions" ? "versions" : "changes",
    fileDiffOpen: isDiffTab(selected),
    ...(isStagedDiffTab(selected)?{stagedDiffOpen:true}:{}),...(commitDiffOid(selected)?{commitDiffOid:commitDiffOid(selected)}:{}),
    splitViews,
    paneSizes:normalizePaneSizes(own(input,'paneSizes'),splitViews.length+1),
    documents: normalizeDocuments(own(input,'documents')),
    expandedDirectories: paths(own(input, "expandedDirectories")),
    treeFocus: path(own(input, "treeFocus")),
    ...(Object.keys(settingsScroll).length ? { settingsScroll } : {}),
    scroll: { explorer: coordinate(own(scroll, "explorer")), tabs: coordinate(own(scroll, "tabs")),
      history: coordinate(own(scroll, "history")), settings: coordinate(own(scroll, "settings")),
      ...(Object.hasOwn(scroll, "resources") ? { resources: coordinate(own(scroll, "resources")) } : {}) },
    focus: focus === "editor" || focus === "tree" ? focus : "none",
  };
}

/** Recover corrupt or incompatible snapshots without changing repository data. */
export function normalizeWorkspace(value: unknown): WorkspaceState {
  const input = record(value);
  const empty: WorkspaceState = { version: 1, repositoryId: "", page: "editor", repositories: {} };
  if (own(input, "version") !== 1) return empty;
  const repositoryId = own(input, "repositoryId");
  const page = own(input, "page");
  const explorerWidth=own(input,"explorerWidth");
  const explorerOpen=own(input,"explorerOpen");
  const paneOrder=own(input,"paneOrder");
  const gitPaneWidth=own(input,"gitPaneWidth");
  const aiPaneWidth=own(input,"aiPaneWidth");
  const historyPaneWidth=own(input,"historyPaneWidth");
  const vaultPaneWidth=own(input,"vaultPaneWidth");
  const resourcesPaneWidth=own(input,"resourcesPaneWidth");
  const settingsPaneWidth=own(input,"settingsPaneWidth");
  const settingsTab=own(input,"settingsTab");
  const rightPane=own(input,"rightPane");
  const rightPanes=own(input,"rightPanes");
  const selectedPanes: RightPane[] = Array.isArray(rightPanes)
    ? rightPanes.filter((pane): pane is RightPane => pane === "history" || pane === "git" || pane === "ai" || pane === "vault" || pane === "resources" || pane === "settings")
    : rightPane === "git" || rightPane === "ai" ? [rightPane] : [];
  if (page === "history") selectedPanes.push("history");
  if (page === "vault") selectedPanes.push("vault");
  if (page === "resources") selectedPanes.push("resources");
  if (page === "settings") selectedPanes.push("settings");
  return {
    ...(typeof explorerOpen === 'boolean' ? { explorerOpen } : {}),
    ...(Array.isArray(paneOrder) ? { paneOrder: [...new Set(paneOrder.filter((pane): pane is SidePane => pane === 'explorer' || pane === 'history' || pane === 'git' || pane === 'ai' || pane === 'vault' || pane === 'resources' || pane === 'settings'))] } : {}),
    ...(typeof explorerWidth==="number"&&Number.isFinite(explorerWidth)?{explorerWidth:Math.max(160,Math.min(600,Math.round(explorerWidth)))}:{}),
    ...(typeof gitPaneWidth==="number"&&Number.isFinite(gitPaneWidth)?{gitPaneWidth:Math.max(320,Math.min(1600,Math.round(gitPaneWidth)))}:{}),
    ...(typeof aiPaneWidth === "number" && Number.isFinite(aiPaneWidth) ? {aiPaneWidth: Math.max(320, Math.min(640, Math.round(aiPaneWidth)))} : {}),
    ...(typeof historyPaneWidth === "number" && Number.isFinite(historyPaneWidth) ? {historyPaneWidth: Math.max(320, Math.min(1600, Math.round(historyPaneWidth)))} : {}),
    ...(typeof vaultPaneWidth === "number" && Number.isFinite(vaultPaneWidth) ? {vaultPaneWidth: Math.max(320, Math.min(640, Math.round(vaultPaneWidth)))} : {}),
    ...(typeof resourcesPaneWidth === "number" && Number.isFinite(resourcesPaneWidth) ? {resourcesPaneWidth: Math.max(320, Math.min(1600, Math.round(resourcesPaneWidth)))} : {}),
    ...(typeof settingsPaneWidth === "number" && Number.isFinite(settingsPaneWidth) ? {settingsPaneWidth: Math.max(320, Math.min(1600, Math.round(settingsPaneWidth)))} : {}),
    ...(isSettingsTab(settingsTab) ? { settingsTab } : {}),
    ...(Array.isArray(rightPanes) || page === "history" || page === "vault" || page === "resources" || page === "settings" ? { rightPanes: [...new Set(selectedPanes)] } : rightPane === "git" || rightPane === "ai" ? {rightPane} : {}),
    version: 1,
    repositoryId: safeId(repositoryId) ? repositoryId : "",
    page: "editor",
    repositories: Object.fromEntries(Object.entries(record(own(input, "repositories")))
      .filter(([id]) => safeId(id)).map(([id, value]) => [id, normalizeRepository(value)])),
  };
}

/** Reconcile after checkout, deletion or restore without opening an unseen file. */
export function reconcileRepositoryWorkspace(value: RepositoryWorkspace, files: string[]): RepositoryWorkspace {
  const workspace = normalizeRepository(value);
  const existing = new Set(paths(files));
  const directories = new Set<string>();
  for (const filename of existing) {
    const parts = filename.split("/");
    for (let index = 1; index < parts.length; index++) directories.add(parts.slice(0, index).join("/"));
  }
  // Index comparisons remain available for staged deletions with no working file.
  const retained=(tab:string)=>isStagedDiffTab(tab)||Boolean(commitDiffOid(tab))||existing.has(tabFile(tab));
  workspace.tabs = workspace.tabs.filter(retained);
  for(let index=workspace.splitViews.length-1;index>=0;index--){
    const view=workspace.splitViews[index]!;
    view.tabs=view.tabs.filter(retained);
    const comparisonFiles=new Set(view.tabs.filter(tab=>isStagedDiffTab(tab)||Boolean(commitDiffOid(tab))).map(tabFile));
    view.documents=Object.fromEntries(Object.entries(view.documents).filter(([filename])=>existing.has(filename)||comparisonFiles.has(filename)));
    if(!view.tabs.length){
      workspace.paneSizes=removePaneSize(workspace.paneSizes,index+1);
      workspace.splitViews.splice(index,1);
      continue;
    }
    const selected=selectedTab(view.tabs,view.file,view.diffOpen===true,view.stagedDiffOpen,view.commitDiffOid);
    view.file=tabFile(selected);if(isDiffTab(selected))view.diffOpen=true;else delete view.diffOpen;
    if(isStagedDiffTab(selected))view.stagedDiffOpen=true;else delete view.stagedDiffOpen;
    if(commitDiffOid(selected))view.commitDiffOid=commitDiffOid(selected);else delete view.commitDiffOid;
    view.session=view.documents[view.file]??normalizeSession(undefined);
    Object.defineProperty(view.documents,view.file,{value:view.session,enumerable:true,writable:true,configurable:true});
  }
  if(!workspace.tabs.length&&workspace.splitViews.length){
    const promoted=workspace.splitViews.shift()!;
    workspace.paneSizes=removePaneSize(workspace.paneSizes,0);
    workspace.tabs=promoted.tabs;workspace.activeFile=promoted.file;workspace.fileDiffOpen=promoted.diffOpen===true;
    if(promoted.stagedDiffOpen)workspace.stagedDiffOpen=true;else delete workspace.stagedDiffOpen;
    if(promoted.commitDiffOid)workspace.commitDiffOid=promoted.commitDiffOid;else delete workspace.commitDiffOid;
    workspace.documents={...workspace.documents,...promoted.documents};
  }
  const selected=selectedTab(workspace.tabs,workspace.activeFile,workspace.fileDiffOpen,workspace.stagedDiffOpen,workspace.commitDiffOid);
  workspace.activeFile=tabFile(selected);workspace.fileDiffOpen=isDiffTab(selected);
  if(isStagedDiffTab(selected))workspace.stagedDiffOpen=true;else delete workspace.stagedDiffOpen;
    if(commitDiffOid(selected))workspace.commitDiffOid=commitDiffOid(selected);else delete workspace.commitDiffOid;
  const stagedFiles=new Set(workspace.tabs.filter(tab=>isStagedDiffTab(tab)||Boolean(commitDiffOid(tab))).map(tabFile));
  workspace.documents = Object.fromEntries(Object.entries(workspace.documents).filter(([filename]) => existing.has(filename)||stagedFiles.has(filename)));
  workspace.expandedDirectories = workspace.expandedDirectories.filter(directory => directories.has(directory));
  if (!existing.has(workspace.treeFocus) && !directories.has(workspace.treeFocus)) workspace.treeFocus = "";
  if (!workspace.activeFile && workspace.focus === "editor") workspace.focus = "none";
  return workspace;
}

/** A file or directory move carries its UI state along using whole path segments. */
export function renameRepositoryWorkspace(value: RepositoryWorkspace, from: string, to: string): RepositoryWorkspace {
  filePath(from);
  filePath(to);
  const workspace = normalizeRepository(value);
  const remap = (value: string): string => value === from ? to : value.startsWith(`${from}/`) ? `${to}${value.slice(from.length)}` : value;
  const historical = new Set([...workspace.tabs, ...workspace.splitViews.flatMap(view => view.tabs)].filter(tab => Boolean(commitDiffOid(tab))).map(tabFile));
  const remapDocuments = (documents: Record<string, EditorSession>) => Object.fromEntries(Object.entries(documents)
    .flatMap(([filename, session]) => historical.has(filename) && remap(filename) !== filename
      ? [[filename, session], [remap(filename), session]] : [[remap(filename), session]]));
  const remapTab=(tab:string)=>commitDiffOid(tab)?tab:isDiffTab(tab)?diffTab(remap(tabFile(tab)),isStagedDiffTab(tab)):remap(tab);
  workspace.tabs = [...new Set(workspace.tabs.map(remapTab))];
  workspace.activeFile = workspace.commitDiffOid?workspace.activeFile:remap(workspace.activeFile);
  workspace.splitViews=workspace.splitViews.map(view=>{
    const file=view.commitDiffOid?view.file:remap(view.file),documents=remapDocuments(view.documents);
    return {...view,file,tabs:[...new Set(view.tabs.map(remapTab))],documents,session:documents[file]??view.session};
  });
  workspace.documents = remapDocuments(workspace.documents);
  workspace.expandedDirectories = [...new Set(workspace.expandedDirectories.map(remap))];
  workspace.treeFocus = remap(workspace.treeFocus);
  return workspace;
}

/** Move a tab at an insertion boundary in the original target order. */
export function moveWorkspaceTab(workspace:RepositoryWorkspace,fromPane:string,toPane:string,file:string,index:number):RepositoryWorkspace{
  const sourceIndex=fromPane==='primary'?-1:workspace.splitViews.findIndex(view=>view.id===fromPane);
  const targetIndex=toPane==='primary'?-1:workspace.splitViews.findIndex(view=>view.id===toPane);
  if((fromPane!=='primary'&&sourceIndex<0)||(toPane!=='primary'&&targetIndex<0)||path(tabFile(file))!==tabFile(file))return workspace;
  const source=sourceIndex<0?workspace:workspace.splitViews[sourceIndex]!;
  const target=targetIndex<0?workspace:workspace.splitViews[targetIndex]!;
  const original=source.tabs.indexOf(file);
  if(original<0||!Number.isInteger(index)||index<0||index>target.tabs.length)return workspace;
  const same=fromPane===toPane,existing=target.tabs.indexOf(file);
  const targetTabs=target.tabs.filter(filename=>filename!==file);
  targetTabs.splice(index-(existing>=0&&existing<index?1:0),0,file);
  if(same&&targetTabs.every((filename,position)=>filename===source.tabs[position]))return workspace;
  const result={...workspace,splitViews:[...workspace.splitViews]};
  const assign=(paneIndex:number,tabs:string[],active:string,documents:Record<string,EditorSession>)=>{
    if(paneIndex<0){
      result.tabs=tabs;result.activeFile=tabFile(active);result.fileDiffOpen=isDiffTab(active);result.documents=documents;
      if(isStagedDiffTab(active))result.stagedDiffOpen=true;else delete result.stagedDiffOpen;
    if(commitDiffOid(active))result.commitDiffOid=commitDiffOid(active);else delete result.commitDiffOid;
      return;
    }
    const pane={...workspace.splitViews[paneIndex]!,tabs,file:tabFile(active),documents,
      session:documents[tabFile(active)]??normalizeSession(undefined)};
    if(isDiffTab(active))pane.diffOpen=true;else delete pane.diffOpen;
    if(isStagedDiffTab(active))pane.stagedDiffOpen=true;else delete pane.stagedDiffOpen;
    if(commitDiffOid(active))pane.commitDiffOid=commitDiffOid(active);else delete pane.commitDiffOid;
    result.splitViews[paneIndex]=pane;
  };
  if(same){
    assign(sourceIndex,targetTabs,activePaneTab(sourceIndex<0?workspace:workspace.splitViews[sourceIndex]!),source.documents);
    return result;
  }
  const sourceTabs=source.tabs.filter(filename=>filename!==file);
  const previousActive=activePaneTab(sourceIndex<0?workspace:workspace.splitViews[sourceIndex]!);
  const sourceActive=previousActive===file?(sourceTabs[original]??sourceTabs[original-1]??''):previousActive;
  const sourceFile=tabFile(file);
  const sourceSession=Object.hasOwn(source.documents,sourceFile)?source.documents[sourceFile]!:
    sourceIndex>=0&&workspace.splitViews[sourceIndex]!.file===sourceFile?workspace.splitViews[sourceIndex]!.session:normalizeSession(undefined);
  const documents=Object.hasOwn(target.documents,sourceFile)&&existing>=0?target.documents:
    {...target.documents,[sourceFile]:sourceSession};
  assign(sourceIndex,sourceTabs,sourceActive,source.documents);
  assign(targetIndex,targetTabs,file,documents);
  if(!sourceTabs.length){
    if(sourceIndex<0){
      const promoted=result.splitViews.shift()!;
      result.tabs=promoted.tabs;result.activeFile=promoted.file;result.fileDiffOpen=promoted.diffOpen===true;
      if(promoted.stagedDiffOpen)result.stagedDiffOpen=true;else delete result.stagedDiffOpen;
    if(promoted.commitDiffOid)result.commitDiffOid=promoted.commitDiffOid;else delete result.commitDiffOid;
      result.documents={...result.documents,...promoted.documents};
      result.paneSizes=removePaneSize(result.paneSizes,0);
    }else{
      result.splitViews.splice(sourceIndex,1);
      result.paneSizes=removePaneSize(result.paneSizes,sourceIndex+1);
    }
  }
  return result;
}

/** Share the dock without overwriting each pane's preferred width. */
export function rightDockWidths(available: number, preferred: Partial<Record<RightPane, number>>, resizing?: RightPane): Record<RightPane, number> {
  const widths = { history: 0, git: 0, ai: 0, vault: 0, resources: 0, settings: 0 };
  const panes = (Object.keys(preferred) as RightPane[]).filter(pane => preferred[pane] !== undefined);
  const paneMinimum = Math.min(320, Math.max(0, available / (panes.length + 1)));
  for (const pane of panes) widths[pane] = Math.max(paneMinimum, Math.min(pane === "ai" || pane === "vault" ? 640 : 1600, preferred[pane]!));
  if (!panes.length) return widths;
  const editorMinimum = Math.min(320, Math.max(0, available / 2));
  // Honour the dragged width first. Only shrink neighbours when the editor
  // has no spare space, and never take them below their minimums.
  const priority = resizing && panes.includes(resizing) ? resizing : undefined;
  if (priority) widths[priority] = Math.min(widths[priority], Math.max(paneMinimum, available - editorMinimum - paneMinimum * (panes.length - 1)));
  const flexible = panes.filter(pane => pane !== priority);
  const minimum = paneMinimum * flexible.length + (priority ? widths[priority] : 0);
  const extra = flexible.reduce((sum, pane) => sum + widths[pane] - paneMinimum, 0);
  const room = Math.max(0, available - editorMinimum - minimum);
  const ratio = extra ? Math.min(1, room / extra) : 1;
  for (const pane of flexible) widths[pane] = Math.floor(paneMinimum + (widths[pane] - paneMinimum) * ratio);
  return widths;
}

/** Keep the editor and most recently opened side pane; evict older panes to fit. */
export function fitWorkspacePanes(available: number, state: WorkspaceState, opened?: SidePane): WorkspaceState {
  if (!Number.isFinite(available) || available <= 0) return state;
  const right = state.rightPanes ?? (state.rightPane ? [state.rightPane] : []);
  const visible: SidePane[] = [...(state.explorerOpen === false ? [] : ['explorer' as const]), ...right];
  const order = [...new Set([...(state.paneOrder ?? []), ...visible])].filter(pane => visible.includes(pane));
  if (opened && order.includes(opened)) { order.splice(order.indexOf(opened), 1); order.push(opened); }
  const newest = order.at(-1), editorMinimum = Math.min(320, available / 2);
  const minimum = (pane: SidePane) => Math.min(pane === 'explorer' ? 160 : 320, available / 2);
  while (order.reduce((sum, pane) => sum + minimum(pane), editorMinimum) > available) {
    const oldest = order.findIndex(pane => pane !== newest);
    if (oldest < 0) break;
    order.splice(oldest, 1);
  }
  const rightPanes = right.filter(pane => order.includes(pane)), explorerOpen = order.includes('explorer');
  if (state.rightPane === undefined && state.explorerOpen === explorerOpen &&
    state.rightPanes?.join() === rightPanes.join() && state.paneOrder?.join() === order.join()) return state;
  const next = { ...state, explorerOpen, rightPanes, paneOrder: order };
  delete next.rightPane;
  return next;
}

/** Shrink the explorer before discarding its saved preferred width. */
export function explorerDockWidth(available: number, rightPaneCount: number, preferred = 245): number {
  const editorMinimum = Math.min(320, Math.max(0, available / 2));
  return Math.max(0, Math.min(preferred, available - editorMinimum * (rightPaneCount + 1)));
}

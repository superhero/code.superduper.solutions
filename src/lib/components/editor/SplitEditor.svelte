<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import type {FormattingSnapshot} from '$lib/editor/formatting';
  import {untrack} from 'svelte';
  import CodeEditor from './CodeEditor.svelte';
  import FileDiff from './FileDiff.svelte';
  import {resolveSettings,type SettingsStore,type EditorSettings} from '$lib/editor/settings';
  import {resolveFileConfiguration} from '$lib/editor/editorconfig';
  import type {EditorSession,EditorViewport} from '$lib/editor/workspace';
  import type {EditGroup} from '$lib/repository/types';
  import type {GitDiff} from '$lib/repository/local-git-types';
  let {repositoryId,path,paneId,diffOpen=false,stagedDiffOpen=false,commitOid,revision,indexRevision,baselineRevision,configurationRevision,files,settings,pending,sharedValue,sharedError='',disabled,isLocked,active,restoreEpoch,session,
    loadFile,loadBaseline,loadStaged,loadCommit,loadWorkspace,onchange,onundo,onredo,onsession,onready}:
    {repositoryId:string;path:string;paneId:string;diffOpen?:boolean;stagedDiffOpen?:boolean;commitOid?:string|undefined;revision:string;indexRevision:string;baselineRevision:string|null;configurationRevision:number;files:string[];settings:SettingsStore;pending:number;
      sharedValue?:string|undefined;sharedError?:string;disabled:boolean;isLocked():boolean;active:boolean;restoreEpoch:number;session?:EditorSession|undefined;
      loadFile(path:string):Promise<string>;loadBaseline(path:string):Promise<string|null>;loadStaged(path:string):Promise<GitDiff>;loadCommit(path:string,oid:string):Promise<GitDiff>;loadWorkspace():Promise<Record<string,string>>;
      onchange(value:string,before:EditorSession,after:EditorSession,action?:"format",group?:EditGroup):void;onundo():void;onredo():void;
      onsession(id:string,state:EditorSession):void;onready(id:string,epoch:number):void}=$props();
  let editor=$state<{flushSession():void;focus():void;captureViewport():EditorViewport|undefined;captureFormatting():FormattingSnapshot|undefined;applyFormatting(snapshot:FormattingSnapshot,formatted:string):boolean}>();
  let source=$state<HTMLDivElement>();
  let comparison=$state<{focus():void;flushSession():void}>();
  let diffPresented=$state(false),viewport=$state<EditorViewport>();
  let diffIdentity='';
  interface Display {
    id:string;file:string;repository:string;value:string;configuration:Partial<EditorSettings>;
    revision:string;baselineRevision:string|null;files:string[];epoch:number;session:EditorSession|undefined;
  }
  let display=$state.raw<Display>();
  let text=$state.raw<{id:string;revision:string;value:string;error:string}>();
  let rules=$state.raw<{id:string;configuration:Partial<EditorSettings>;error:string}>();
  // App replaces a pane's session record while remembering scrolling. Keep
  // stable primitive inputs between that record and expensive editor effects.
  const file=$derived(path),repository=$derived(repositoryId);
  const id=$derived(`${repository}:${file}`);
  const configPaths=$derived(JSON.stringify(files.filter(file=>file==='.editorconfig'||file.endsWith('/.editorconfig'))));
  const failure=$derived(text?.id===id?text.error:'');
  const ruleError=$derived(rules?.id===id?rules.error:'');
  const displayFile=$derived(display?.file??file),displayRepository=$derived(display?.repository??repository);
  const displayId=$derived(display?.id??''),displayValue=$derived(display?.value??'');
  const displayEpoch=$derived(display?.epoch??restoreEpoch),displaySession=$derived(display?.session);
  const displayBaseline=$derived(display?.baselineRevision??null),displayRevision=$derived(display?.revision??'');
  const displayFiles=$derived(display?.files??files);
  const displayConfiguration=$derived(display?.configuration);
  const effective=$derived(resolveSettings(settings,displayRepository,displayFile,displayConfiguration??{}));
  export function captureFormatting(){return diffOpen?undefined:editor?.captureFormatting();}
  export function applyFormatting(snapshot:FormattingSnapshot,formatted:string){return !diffOpen&&(editor?.applyFormatting(snapshot,formatted)??false);}
  export function formatSettings(){return effective;}
  export function focus(){if(diffOpen)comparison?.focus();else editor?.focus();}
  export function flushSession(){if(diffOpen)comparison?.flushSession();else editor?.flushSession();}
  $effect.pre(()=>{
    const key=diffOpen?`${id}:${stagedDiffOpen}:${commitOid??""}`:'';
    if(key!==diffIdentity){
      diffIdentity=key;diffPresented=false;
      if(key)viewport=untrack(()=>editor?.captureViewport());
    }
  });
  $effect(()=>{
    const document=id,source=file,version=revision;
    if(commitOid||stagedDiffOpen&&!files.includes(source)){text={id:document,revision:version,value:'',error:''};return;}
    if(sharedValue!==undefined){text={id:document,revision:version,value:sharedValue,error:sharedError};return;}
    const previous=untrack(()=>text);
    if(previous?.id===document&&previous.revision===version)return;
    if(pending)return;
    let cancelled=false;
    void untrack(()=>loadFile(source)).then(value=>{
      if(!cancelled)text={id:document,revision:version,value,error:''};
    }).catch(error=>{if(!cancelled)text={id:document,revision:version,value:'',error:String(error instanceof Error?error.message:error)};});
    return()=>{cancelled=true;};
  });
  $effect(()=>{
    const document=id,source=file,paths:string[]=JSON.parse(configPaths),inherited=resolveSettings(settings,repository);
    void configurationRevision;
    rules=undefined;
    let cancelled=false;
    void untrack(()=>resolveFileConfiguration(paths,loadFile,source,inherited)).then(result=>{
      if(!cancelled)rules={id:document,configuration:result,error:''};
    }).catch(error=>{if(!cancelled)rules={id:document,configuration:{},error:`Cannot apply .editorconfig: ${String(error)}`};});
    return()=>{cancelled=true;};
  });
  $effect(()=>{
    const document=id,version=revision,epoch=restoreEpoch,baseline=baselineRevision;
    const loaded=text,configured=rules,workspaceFiles=files;
    if(loaded?.id!==document||loaded.revision!==version||loaded.error||configured?.id!==document)return;
    const previous=untrack(()=>display);
    const saved=previous?.id===document&&previous.epoch===epoch?previous.session:untrack(()=>session);
    display={id:document,file,repository,value:loaded.value,configuration:configured.configuration,
      revision:version,baselineRevision:baseline,files:workspaceFiles,epoch,session:saved};
  });
  $effect(()=>{if(failure)onready(id,restoreEpoch);});
  function locked(){return display?.id!==id||Boolean(failure)||isLocked();}
  function remember(document:string,state:EditorSession){
    untrack(()=>{
      if(display?.id===document)display={...display,session:state};
      onsession(document,state);
    });
  }
  function changed(value:string,before:EditorSession,after:EditorSession,action?:"format",group?:EditGroup){
    if(!display||locked())return;
    display={...display,value,session:after};
    text={id:display.id,revision,value,error:''};
    onchange(value,before,after,action,group);
  }
</script>

<section class="split-editor" data-pane-id={paneId} aria-label={`Split editor: ${path}`}>
  {#if ruleError}<p role="alert">{ruleError}</p>{/if}
  {#if failure}<p role="alert">{failure}</p>{/if}
  {#if display}<div class="split-source" bind:this={source} hidden={diffOpen&&diffPresented}><CodeEditor bind:this={editor} documentLabel="Split editor document" documentId={displayId} path={displayFile} value={displayValue} settings={effective}
    disabled={disabled||stagedDiffOpen||Boolean(commitOid)||displayId!==id||Boolean(failure)} isLocked={locked} active={active&&!diffOpen} restoreEpoch={displayEpoch} baselineRevision={displayBaseline}
    session={displaySession} loadBaseline={()=>loadBaseline(displayFile)} {loadWorkspace} workspacePaths={displayFiles} workspaceRevision={displayRevision}
    {onundo} {onredo} onsession={remember} onready={(document,epoch)=>{if(document===id&&!diffOpen)onready(document,epoch);}} onchange={changed} /></div>
    {#if diffOpen&&displayId===id}<FileDiff bind:this={comparison} onchange={changed} {onundo} {onredo} onsession={remember} disabled={disabled||displayId!==id||Boolean(failure)} isLocked={locked} {source} {viewport} session={displaySession} documentId={displayId}
      path={displayFile} value={displayValue} settings={effective} baselineRevision={commitOid??(stagedDiffOpen?indexRevision:displayBaseline)} loadBaseline={()=>loadBaseline(displayFile)}
      loadStaged={stagedDiffOpen?()=>loadStaged(displayFile):undefined} loadCommit={commitOid?()=>loadCommit(displayFile,commitOid!):undefined}
      restoreEpoch={displayEpoch} onready={(document,epoch)=>{diffPresented=true;onready(document,epoch);}} />{/if}
  {:else if !failure}<p role="status">Opening split editor…</p>{/if}
</section>

<style>
  .split-editor { position:relative;height:100%;min-height:0;min-width:0;background:var(--color-background);border-left:2px solid color-mix(in srgb,var(--color-surface) 20%,var(--color-background)); }
  .split-source { height:100%;min-height:0; }.split-source[hidden] { display:none; }
  p { margin:16px;font-size:.75rem; }
</style>

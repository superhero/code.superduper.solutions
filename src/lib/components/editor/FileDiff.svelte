<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script module lang="ts">
  import {GutterMarker} from '@codemirror/view';
  class DiffNumberMarker extends GutterMarker {
    readonly elementClass:string;
    constructor(kind:string,edges:number){super();this.elementClass=`cm-diff-changedNumber cm-diff-${kind}${edges&1?' cm-diff-block-start':''}${edges&2?' cm-diff-block-end':''}`;}
  }
</script>
<script lang="ts">
  import {onMount,untrack,tick} from 'svelte';
  import PaneDividers from './PaneDividers.svelte';
  import {FoldMotion} from '$lib/editor/fold-motion';
  import {animateDiff} from '$lib/editor/diff-motion';
  import {MergeView,getChunks} from '@codemirror/merge';
  import {EditorState,EditorSelection,StateEffect,StateField,Annotation,RangeSet} from '@codemirror/state';
  import {EditorView,Decoration,drawSelection,lineNumbers,gutterLineClass,highlightActiveLine,highlightActiveLineGutter} from '@codemirror/view';
  import {foldGutter} from '@codemirror/language';
  import {editorKeybindings} from '$lib/editor/editor-keybindings';
  import {editorTheme} from '$lib/editor/configuration';
  import {syntaxColors} from '$lib/editor/highlighting';
  import {joinedSelectionBackground} from '$lib/editor/selection-background';
  import {loadLanguage} from '$lib/editor/languages';
  import {editorScrolling} from '$lib/editor/scrolling';
  import {documentMinimap,minimapChanges} from '$lib/editor/minimap';
  import type {GitChangeKind} from '$lib/editor/git-gutter';
  import {diffNavigation} from '$lib/editor/diff-navigation';
  import {EditGrouping} from '$lib/editor/edit-grouping';
  import type {EditGroup} from '$lib/repository/types';
  import type {GitDiff} from '$lib/repository/local-git-types';
  import type {EditorSettings} from '$lib/editor/settings';
  import type {EditorViewport,EditorSession} from '$lib/editor/workspace';

  let {documentId,path,value,settings,baselineRevision,loadBaseline,loadStaged,loadCommit,restoreEpoch,onready,viewport,session,source,disabled=false,isLocked,onchange,onundo,onredo,onsession}:
    {documentId:string;path:string;value:string;settings:EditorSettings;baselineRevision:string|null;
      loadBaseline():Promise<string|null>;restoreEpoch:number;onready(id:string,epoch:number):void;
      loadStaged?:(()=>Promise<GitDiff>)|undefined;
      loadCommit?:(()=>Promise<GitDiff>)|undefined;
      disabled?:boolean;isLocked?():boolean;
      onchange(value:string,before:EditorSession,after:EditorSession,action?:"format",group?:EditGroup):void;onundo():void;onredo():void;
      onsession?(id:string,state:EditorSession):void;
      viewport?:EditorViewport|undefined;session?:EditorSession|undefined;source?:HTMLElement|undefined}=$props();
  let container:HTMLDivElement;
  let comparison=$state.raw<MergeView>();
  const external=Annotation.define<boolean>();
  const grouping=new EditGrouping();
  function undo(){grouping.reset();onundo();}
  function redo(){grouping.reset();onredo();}
  function readSession(view:EditorView,state=view.state):EditorSession{
    return {selection:state.selection.ranges.map(({anchor,head})=>({anchor,head})),mainIndex:state.selection.mainIndex,
      scrollTop:view.scrollDOM.scrollTop,scrollLeft:view.scrollDOM.scrollLeft};
  }
  export function flushSession(){if(comparison)onsession?.(documentId,readSession(comparison.b));}
  function rememberBlur(_event:FocusEvent,view:EditorView){
    grouping.reset();
    const id=documentId,saved=readSession(view);
    // DOM removal can emit blur inside Svelte's rendering reaction.
    queueMicrotask(()=>{if(comparison?.b===view&&documentId===id)onsession?.(id,saved);});
  }

  const staged=$derived(loadStaged!==undefined);
  const committed=$derived(loadCommit!==undefined);
  const immutable=$derived(staged||committed);
  export function focus(){container?.querySelector<HTMLElement>(`[aria-label="${committed?'Commit file':staged?'Staged file':'Current file'}"]`)?.focus({preventScroll:true});}
  let mounted=$state(false),loading=$state(true),failure=$state('');
  let presented=$state(false);
  let original=$state('');
  let stagedValue=$state('');
  let sizes=$state([.5,.5]);
  let resizeStart=[.5,.5];
  const numberMarkers={
    added:[0,1,2,3].map(edges=>new DiffNumberMarker('added',edges)),
    modified:[0,1,2,3].map(edges=>new DiffNumberMarker('modified',edges)),
    removed:[0,1,2,3].map(edges=>new DiffNumberMarker('removed',edges))
  };
  let stopMotion=()=>{};
  let revealedDocument='';
  let appliedEpoch=-1;
  function closeDiff(_node:HTMLElement){
    stopMotion();
    const motion=animateDiff(container,source,false);stopMotion=motion.cancel;
    return {duration:motion.duration,tick:(progress:number)=>{if(progress===0)motion.cancel();}};
  }
  const configuration=$derived(JSON.stringify(settings));
  // History restoration updates the existing views; only document/configuration/baseline changes rebuild.
  const buildKey=$derived(JSON.stringify([mounted,documentId,path,configuration,baselineRevision,staged,committed]));
  onMount(()=>{mounted=true;});
  $effect(()=>{
    const [ready,id,file,serialized]=JSON.parse(buildKey) as [boolean,string,string,string,string|null];
    if(!ready)return;
    return untrack(()=>{
      const epoch=restoreEpoch,working=value,readOnly=immutable,options:EditorSettings=JSON.parse(serialized),reveal=revealedDocument!==id,initial=reveal?viewport:undefined,saved=session;
      grouping.reset();
      let cancelled=false,merge:MergeView|undefined,frame=0;
      const foldCleanups:(()=>void)[]=[];
      loading=true;failure='';presented=false;
      const loadSnapshot=loadCommit??loadStaged;
      const snapshot=loadSnapshot?loadSnapshot().then(diff=>{
        if(diff.binary)throw new Error('Binary files cannot be displayed as a text diff.');
        return diff;
      }):loadBaseline().then(before=>({before,after:working}));
      void Promise.all([snapshot,loadLanguage(file,'auto',options.syntaxPackages,options.languageMappings)]).then(async([diff,syntax])=>{
        if(cancelled)return;
        original=diff.before??'';
        const current=diff.after;
        if(readOnly)stagedValue=current;
        const extensions=(old:boolean)=>[
          editorTheme(options),syntaxColors(options),syntax,drawSelection(),joinedSelectionBackground,editorScrolling(options),diffNavigation,
          ...(!old&&options.highlightActiveLine?[highlightActiveLine(),highlightActiveLineGutter()]:[]),
          EditorState.readOnly.of(old||readOnly||options.readOnly),EditorView.editable.of(!old&&!readOnly&&!options.readOnly),
          EditorState.transactionFilter.of(transaction=>transaction.docChanged&&!transaction.annotation(external)&&
            (old||readOnly||untrack(()=>disabled||isLocked?.()))?[]:transaction),
          ...(!old?[EditorView.updateListener.of(update=>{
            for(const transaction of update.transactions){
              if(transaction.docChanged&&!transaction.annotation(external))
                onchange(transaction.state.sliceDoc(),readSession(update.view,transaction.startState),readSession(update.view,transaction.state),undefined,grouping.next(transaction,id));
              else if(transaction.selection||transaction.annotation(external))grouping.reset();
            }
            if(update.selectionSet||update.docChanged)onsession?.(id,readSession(update.view));
          }),EditorView.domEventHandlers({blur:rememberBlur,pointerdown:()=>{grouping.reset();},scroll:()=>{flushSession();}})]:[]),
          editorKeybindings(options,{undo,redo},old||readOnly||options.readOnly),
          EditorState.tabSize.of(options.tabSize||1),
          ...(options.lineNumbers?[lineNumbers()]:[]),
          ...(options.foldGutter?[foldGutter()]:[]),
          ...(options.minimap?[documentMinimap]:[]),
          ...(options.lineWrapping?[EditorView.lineWrapping]:[])
        ];
        merge=new MergeView({
          a:{doc:original,extensions:[...extensions(true),EditorView.contentAttributes.of({'aria-label':committed?'Parent file':'Committed file',tabindex:'0'})]},
          b:{doc:current,extensions:[...extensions(false),EditorView.contentAttributes.of({'aria-label':committed?'Commit file':readOnly?'Staged file':'Current file',tabindex:'0'})]},
          parent:container,gutter:false,highlightChanges:true,diffConfig:{scanLimit:10_000,timeout:100}
        });
        appliedEpoch=epoch;comparison=merge;
        for(const view of [merge.a,merge.b])foldCleanups.push(new FoldMotion().attach(view));
        // Derive markers from MergeView chunks on every transaction, including
        // edits and alignment updates, without running a second diff.
        for(const view of [merge.a,merge.b]){
          const markers=(state:EditorState)=>{
            const info=getChunks(state),ranges=[],rows=[],changes:Record<number,GitChangeKind>={};
            for(const chunk of info?.chunks??[]){
              const count=(doc:typeof state.doc,from:number,to:number)=>from===to?0:
                doc.lineAt(Math.min(to-1,doc.length)).number-doc.lineAt(Math.min(from,doc.length)).number+1;
              const docA=info!.side==='a'?state.doc:merge!.a.state.doc,docB=info!.side==='b'?state.doc:merge!.b.state.doc;
              const paired=Math.min(count(docA,chunk.fromA,chunk.toA),count(docB,chunk.fromB,chunk.toB));
              const from=info!.side==='a'?chunk.fromA:chunk.fromB,to=info!.side==='a'?chunk.toA:chunk.toB;
              for(let pos=from,index=0;pos<to&&pos<=state.doc.length;index++){
                const kind=index<paired?'modified':info!.side==='a'?'removed':'added';
                const next=state.doc.lineAt(pos).to+1;
                // Fold gutters omit unchanged, nonfoldable rows. Their DOM
                // siblings cannot identify actual change-block boundaries.
                const edges=Number(index===0||index===paired)|(Number(index+1===paired||next>=to||next>state.doc.length)<<1);
                ranges.push(numberMarkers[kind][edges]!.range(pos));
                rows.push(Decoration.line({class:`cm-diff-changedLine cm-diff-${kind}`}).range(pos));
                changes[state.doc.lineAt(pos).number]=kind;
                pos=next;
              }
            }
            return {numbers:RangeSet.of(ranges,true),lines:Decoration.set(rows,true),changes};
          };
          const field=StateField.define({create:markers,update:(_value,transaction)=>markers(transaction.state),provide:field=>[
            gutterLineClass.from(field,value=>value.numbers),EditorView.decorations.from(field,value=>value.lines),
            minimapChanges.from(field,value=>value.changes)
          ]});
          view.dispatch({effects:StateEffect.appendConfig.of(field)});
        }
        loading=false;await document.fonts.ready;
        const restore=(again:boolean)=>{
          if(cancelled||!merge)return;
          const comparison=merge;
          frame=requestAnimationFrame(()=>{
            if(cancelled)return;
            comparison.b.requestMeasure({
              read:()=>{
                const view=comparison.b;
                if(initial?.documentId===id){
                  const block=view.lineBlockAt(Math.min(initial.from,view.state.doc.length));
                  return {top:view.scrollDOM.scrollTop+view.documentTop+block.top-view.scrollDOM.getBoundingClientRect().top-initial.offset,left:initial.scrollLeft};
                }
                return {top:saved?.scrollTop??0,left:saved?.scrollLeft??0};
              },
              write:position=>{
                if(cancelled)return;
                for(const view of [comparison.a,comparison.b]){
                  view.scrollDOM.scrollTop=position.top;view.scrollDOM.scrollLeft=position.left;
                }
                if(again)restore(false);else {
                  presented=true;
                  void tick().then(()=>{
                    if(cancelled)return;
                    stopMotion();
                    if(reveal){revealedDocument=id;stopMotion=animateDiff(container,source,true).cancel;}
                    onready(id,epoch);
                  });
                }
              }
            });
          });
        };
        restore(true);
      }).catch(error=>{
        if(cancelled)return;loading=false;failure=error instanceof Error?error.message:String(error);presented=true;onready(id,epoch);
      });
      return()=>{cancelled=true;cancelAnimationFrame(frame);stopMotion();foldCleanups.forEach(cleanup=>cleanup());if(comparison===merge)comparison=undefined;merge?.destroy();};
    });
  });
  $effect(()=>{
    const live=comparison,current=immutable?stagedValue:value,epoch=restoreEpoch,id=documentId,ready=presented;
    if(!live||!ready)return;
    return untrack(()=>{
      const restoring=epoch!==appliedEpoch,saved=restoring?session:undefined;
      if(restoring)grouping.reset();
      const clamp=(position:number)=>Math.max(0,Math.min(current.length,position));
      const ranges=saved?.selection.map(({anchor,head})=>EditorSelection.range(clamp(anchor),clamp(head)));
      if(live.b.state.sliceDoc()!==current||ranges?.length)live.b.dispatch({
        ...(live.b.state.sliceDoc()!==current?{changes:{from:0,to:live.b.state.doc.length,insert:current}}:{}),
        ...(ranges?.length?{selection:EditorSelection.create(ranges,Math.max(0,Math.min(saved!.mainIndex,ranges.length-1)))}:{}),
        annotations:external.of(true)
      });
      if(!restoring)return;
      appliedEpoch=epoch;
      let cancelled=false;
      live.b.requestMeasure({
        read:()=>({top:saved?.scrollTop??live.b.scrollDOM.scrollTop,left:saved?.scrollLeft??live.b.scrollDOM.scrollLeft}),
        write:position=>{
          if(cancelled)return;
          for(const view of [live.a,live.b]){view.scrollDOM.scrollTop=position.top;view.scrollDOM.scrollLeft=position.left;}
          onready(id,epoch);
        }
      });
      return()=>{cancelled=true;};
    });
  });

</script>

<section class="file-diff" class:presented class:commit-comparison={committed} style:--diff-columns={sizes.map(size=>`minmax(0,${size}fr)`).join(' ')} out:closeDiff aria-label={committed?'Commit file diff':staged?'Staged file diff':'File diff'} aria-busy={loading || !presented}>
  {#if failure}<p role="alert">The file diff could not load: {failure}</p>{/if}
  {#if committed}<div class="comparison-heading"><span>Parent</span><span>Commit {baselineRevision?.slice(0,8)}</span></div>{/if}
  <div class="diff-layout">
    <div class="diff-editors" bind:this={container}></div>
    {#if presented&&!loading&&!failure}
      <PaneDividers {sizes} onstart={()=>{resizeStart=[...sizes];stopMotion();}}
        onpreview={next=>{sizes=next;}} onend={next=>{sizes=next??resizeStart;}} />
    {/if}
  </div>
  {#if !loading&&!failure&&original===(immutable?stagedValue:value)}<span class="diff-unchanged" role="status">No changes</span>{/if}
</section>

<style>
  .file-diff { position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;pointer-events:none; }
  .file-diff.presented { background:var(--color-background);pointer-events:auto; }
  .comparison-heading { display:grid;grid-template-columns:var(--diff-columns,1fr 1fr);gap:2px;padding:6px 12px;font-size:.625rem; }
  .diff-layout { position:relative;display:flex;flex:1;min-height:0; }
  .diff-editors { position:relative;flex:1;min-width:0;min-height:0;overflow:hidden;visibility:hidden; }
  .presented .diff-editors { visibility:visible; }
  .diff-editors :global(.cm-mergeView) { height:100%;overflow:hidden; }
  .diff-editors :global(.cm-mergeViewEditors) { display:grid;grid-template-columns:var(--diff-columns,1fr 1fr);height:100%;gap:2px;background:var(--color-surface); }
  .diff-editors :global(.cm-mergeViewEditor) { min-width:0;height:100%; }
  .diff-editors :global(.cm-mergeViewEditor + .cm-mergeViewEditor) {
    border-left:2px solid color-mix(in srgb,var(--color-surface) 20%,var(--color-background));
    box-sizing:border-box;
  }
  .diff-editors :global(.cm-mergeViewEditor:first-child .cm-editor),
  .commit-comparison .diff-editors :global(.cm-editor) {
    background-image:repeating-linear-gradient(45deg,transparent 0 15px,var(--color-surface) 15px 16px);
  }
  /* Override MergeView's unbounded editor defaults independently of theme
     injection order, including development hot reloads. */
  .diff-editors :global(.cm-mergeView .cm-editor) { height:100% !important;overflow-y:hidden !important; }
  .diff-editors :global(.cm-mergeView .cm-editor .cm-scroller) { height:100% !important;overflow-y:auto !important; }
  .diff-editors :global(.cm-gutters),
  .diff-editors :global(.cm-lineNumbers .cm-gutterElement) { background:var(--color-background);color:var(--color-foreground); }
  .diff-editors :global(.cm-gutters .cm-gutterElement.cm-activeLineGutter) {
    background:color-mix(in srgb,var(--syntax-activeLine, var(--color-surface)) 25%,var(--color-background));color:var(--color-foreground);
  }
  .diff-editors :global(.cm-diff-modified) { --diff-change-color:var(--color-git-modified); }
  .diff-editors :global(.cm-diff-added) { --diff-change-color:var(--color-git-added); }
  .diff-editors :global(.cm-diff-removed) { --diff-change-color:var(--color-git-removed); }
  .diff-editors :global(.cm-gutterElement.cm-diff-changedNumber) { background:var(--diff-change-color);color:var(--color-background); }
  .diff-editors :global(.cm-gutterElement.cm-diff-block-start) { --change-edge-top:1px; }
  .diff-editors :global(.cm-gutterElement.cm-diff-block-end) { --change-edge-bottom:-1px; }
  .diff-editors :global(.cm-line.cm-diff-changedLine) { background:color-mix(in srgb,var(--diff-change-color) 15%,transparent); }
  .diff-editors :global(.cm-line.cm-diff-changedLine.cm-activeLine) { background:color-mix(in srgb,color-mix(in srgb,var(--diff-change-color) 30%,var(--syntax-activeLine, var(--color-surface))) 25%,transparent); }
  .diff-editors :global(.cm-gutterElement.cm-diff-changedNumber.cm-activeLineGutter) { background:color-mix(in srgb,var(--diff-change-color) 65%,var(--syntax-activeLine, var(--color-surface))); }
  .diff-editors :global(.cm-diff-changedLine .cm-changedText) { background:color-mix(in srgb,var(--diff-change-color) 35%,transparent);border-radius:4px; }
  .file-diff > p { position:absolute;top:40px;left:16px;font-size:.75rem;z-index:1; }
  .diff-unchanged { position:absolute;bottom:8px;right:16px;font-size:.6875rem;background:var(--color-surface);padding:3px 8px;border-radius:4px; }
</style>

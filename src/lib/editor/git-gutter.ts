// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {StateEffect,StateField,Text,RangeSetBuilder,RangeSet,type Range,type EditorState} from '@codemirror/state';
import {EditorView,Decoration,GutterMarker,WidgetType,gutterLineClass,gutterWidgetClass} from '@codemirror/view';
import {Chunk} from '@codemirror/merge';

export type GitChangeKind='added'|'modified'|'removed';
export const gitChangeColors={added:'--color-git-added',modified:'--color-git-modified',removed:'--color-git-removed'} as const;
export const setCommittedText=StateEffect.define<string|undefined>();
class ChangeMarker extends GutterMarker {
  readonly kind:GitChangeKind;
  readonly atEnd:boolean;
  constructor(kind:GitChangeKind,atEnd=false){super();this.kind=kind;this.atEnd=atEnd;}
  toDOM(){const dom=document.createElement('span');dom.className=`cm-git-line-marker cm-git-${this.kind}${this.atEnd?' cm-git-removed-end':''}`;dom.title=this.kind==='added'?'Added line':this.kind==='modified'?'Modified line':'Deleted lines';return dom;}

}
const added=new ChangeMarker('added'),modified=new ChangeMarker('modified'),removed=new ChangeMarker('removed'),removedEnd=new ChangeMarker('removed',true);
interface Changes {baseline:Text|undefined;chunks:readonly Chunk[];markers:RangeSet<GutterMarker>;deletions:RangeSet<GutterMarker>}
function markers(baseline:Text,doc:Text,chunks:readonly Chunk[]){
  const builder=new RangeSetBuilder<GutterMarker>(),deletions=new RangeSetBuilder<GutterMarker>();
  for(const chunk of chunks){
    const oldLines=baseline.length===0||chunk.fromA===chunk.toA?0:baseline.lineAt(Math.min(chunk.toA-1,baseline.length)).number-baseline.lineAt(Math.min(chunk.fromA,baseline.length)).number+1;
    const first=doc.lineAt(Math.min(chunk.fromB,doc.length)).number;
    const last=chunk.fromB===chunk.toB?first-1:doc.lineAt(Math.min(chunk.toB-1,doc.length)).number;
    const newLines=Math.max(0,last-first+1);
    for(let line=first;line<=last;line++)builder.add(doc.line(line).from,doc.line(line).from,line-first<oldLines?modified:added);
    if(oldLines>newLines){
      const position=Math.min(chunk.toB,doc.length),atEnd=chunk.toB>doc.length;
      const anchor=doc.lineAt(position).from;
      deletions.add(anchor,anchor,atEnd?removedEnd:removed);
    }
  }
  return{markers:builder.finish(),deletions:deletions.finish()};
}
export const gitLineChanges=StateField.define<Changes>({
  create(){return{baseline:undefined,chunks:[],markers:new RangeSetBuilder<GutterMarker>().finish(),deletions:new RangeSetBuilder<GutterMarker>().finish()};},
  update(value,transaction){
    let baseline=value.baseline,replaced=false;
    for(const effect of transaction.effects)if(effect.is(setCommittedText)){
      baseline=effect.value===undefined?undefined:Text.of(effect.value.replace(/\r\n?/g,'\n').split('\n'));replaced=true;
    }
    if(!replaced&&!transaction.docChanged)return value;
    if(!baseline)return{baseline,chunks:[],markers:new RangeSetBuilder<GutterMarker>().finish(),deletions:new RangeSetBuilder<GutterMarker>().finish()};
    const config={scanLimit:10_000,timeout:50};
    const chunks=replaced?Chunk.build(baseline,transaction.state.doc,config):Chunk.updateB(value.chunks,baseline,transaction.state.doc,transaction.changes,config);
    return{baseline,chunks,...markers(baseline,transaction.state.doc,chunks)};
  }
});
class NumberChangeMarker extends GutterMarker {
  readonly elementClass:string;
  constructor(kind:GitChangeKind){super();this.elementClass=`cm-git-line-marker cm-git-${kind}`;}
}
class DeletionBoundary extends GutterMarker {
  readonly elementClass:string;
  constructor(){super();this.elementClass='cm-git-deletion-boundary';}
}
class DeletionSpacer extends WidgetType {
  eq(other:WidgetType){return other instanceof DeletionSpacer;}
  get estimatedHeight(){return 4;}
  toDOM(){const element=document.createElement('div');element.className='cm-git-deletion-boundary';element.title='Deleted lines';element.setAttribute('aria-hidden','true');return element;}
}
const deletionSpacer=new DeletionSpacer();
const numberMarkers={added:new NumberChangeMarker('added'),modified:new NumberChangeMarker('modified')};
const deletionBoundary=new DeletionBoundary();
export const gitChangeGutter=[gitLineChanges,gutterWidgetClass.of((_view,widget)=>widget instanceof DeletionSpacer?deletionBoundary:null),EditorView.decorations.compute([gitLineChanges],state=>{
  const changes=state.field(gitLineChanges),ranges:Range<Decoration>[]=[];
  for(const cursor=changes.markers.iter();cursor.value;cursor.next())
    ranges.push(Decoration.line({class:`cm-git-changedLine cm-git-${cursor.value===added?'added':'modified'}-line`}).range(cursor.from));
  for(const cursor=changes.deletions.iter();cursor.value;cursor.next())
    ranges.push(Decoration.widget({widget:deletionSpacer,block:true,side:cursor.value===removedEnd?1:-1}).range(cursor.value===removedEnd?state.doc.length:cursor.from));
  return Decoration.set(ranges,true);
}),gutterLineClass.compute([gitLineChanges],state=>{
  const changes=state.field(gitLineChanges),ranges:Range<GutterMarker>[]=[];
  for(const cursor=changes.markers.iter();cursor.value;cursor.next())
    ranges.push(numberMarkers[cursor.value===added?'added':'modified'].range(cursor.from));
  return RangeSet.of(ranges,true);
}),EditorView.theme({
  '.cm-line.cm-git-added-line':{backgroundColor:'color-mix(in srgb,var(--color-git-added) 15%,transparent)'},
  '.cm-line.cm-git-modified-line':{backgroundColor:'color-mix(in srgb,var(--color-git-modified) 15%,transparent)'},
  '& .cm-line.cm-git-added-line.cm-activeLine':{backgroundColor:'color-mix(in srgb,color-mix(in srgb,var(--color-git-added) 30%,var(--syntax-activeLine, var(--color-surface))) 25%,transparent)'},
  '& .cm-line.cm-git-modified-line.cm-activeLine':{backgroundColor:'color-mix(in srgb,color-mix(in srgb,var(--color-git-modified) 30%,var(--syntax-activeLine, var(--color-surface))) 25%,transparent)'},
  '.cm-gutters .cm-gutterElement.cm-git-added':{backgroundColor:'var(--color-git-added)',color:'var(--color-background)'},
  '.cm-gutters .cm-gutterElement.cm-git-modified':{backgroundColor:'var(--color-git-modified)',color:'var(--color-background)'},
  '& .cm-gutters .cm-gutterElement.cm-git-added.cm-activeLineGutter':{backgroundColor:'color-mix(in srgb,var(--color-git-added) 65%,var(--syntax-activeLine, var(--color-surface)))',color:'var(--color-background)'},
  '& .cm-gutters .cm-gutterElement.cm-git-modified.cm-activeLineGutter':{backgroundColor:'color-mix(in srgb,var(--color-git-modified) 65%,var(--syntax-activeLine, var(--color-surface)))',color:'var(--color-background)'},
  '.cm-git-deletion-boundary, .cm-gutters .cm-gutterElement.cm-git-deletion-boundary':{height:'4px',minHeight:'4px',boxSizing:'border-box',backgroundColor:'var(--color-git-removed)',boxShadow:'inset 0 1px 0 0 color-mix(in srgb,var(--color-surface) 20%,var(--color-background)), inset 0 -1px 0 0 color-mix(in srgb,var(--color-surface) 20%,var(--color-background))',pointerEvents:'none'}
})];

/** One shared classification for the editor gutter and minimap. */
export function changedGitLines(state:EditorState):Record<number,GitChangeKind>{
  const result:Record<number,GitChangeKind>={};
  for(const cursor=state.field(gitLineChanges).markers.iter();cursor.value;cursor.next())
    result[state.doc.lineAt(cursor.from).number]=cursor.value===added?'added':'modified';
  for(const cursor=state.field(gitLineChanges).deletions.iter();cursor.value;cursor.next())
    result[state.doc.lineAt(cursor.from).number]='removed';
  return result;
}

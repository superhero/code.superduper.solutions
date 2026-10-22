// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {EditorView,ViewPlugin,type ViewUpdate} from '@codemirror/view';
import {Facet,type Text} from '@codemirror/state';
import {foldedRanges,language,highlightingFor} from '@codemirror/language';
import {highlightTree} from '@lezer/highlight';
import {semanticHighlights} from './highlighting';
import {paintMinimapChanges,type MinimapChangeRow} from './minimap-changes';
import {minimapDragging} from './minimap-drag';
import {minimapGeometry} from './minimap-geometry';
import {scrollEditor,scrollEditorBy} from './scrolling';
import {changedGitLines,gitLineChanges,gitChangeColors,type GitChangeKind} from './git-gutter';

export const minimapChanges=Facet.define<Record<number,GitChangeKind>,Record<number,GitChangeKind>>({combine:values=>values[0]??{}});
type Segment={from:number;to:number;fold?:boolean};
type Row={line:number;segments:Segment[]};
type Token={from:number;to:number;classes:string};
type TokenColor={foreground:string;background:string};

/** Each view owns its bitmap, parsed tokens and viewport. Never mutate contentDOM. */
const canvasMap=ViewPlugin.fromClass(class {
  readonly dom=document.createElement('div');
  readonly inner=document.createElement('div');
  readonly canvas=document.createElement('canvas');
  readonly overlay=document.createElement('div');
  readonly context:CanvasRenderingContext2D;
  readonly resize:ResizeObserver;
  readonly colors:MutationObserver;
  readonly view:EditorView;
  frame=0;destroyed=false;width=0;
  doc:Text|undefined;
  parser:unknown;
  folds:unknown;
  rows:Row[]=[];
  tokens:Token[]=[];
  tokenColors=new Map<string,TokenColor>();
  dirty=true;
  painted:{width:number;height:number;lineHeight:number;charWidth:number;padding:number;offset:number}|undefined;
  constructor(view:EditorView){
    this.view=view;
    this.dom.className='cm-minimap-gutter';this.dom.role='group';this.dom.tabIndex=0;
    this.dom.setAttribute('aria-label','Document minimap');
    this.dom.setAttribute('aria-description','Click or drag to scroll. Arrow keys, Page Up, Page Down, Home and End also scroll.');
    this.inner.className='cm-minimap-inner';
    const container=document.createElement('div');container.className='cm-minimap-overlay-container';
    this.overlay.className='cm-minimap-overlay';container.append(this.overlay);
    this.inner.append(this.canvas,container);this.dom.append(this.inner);
    view.scrollDOM.append(this.dom);
    this.context=this.canvas.getContext('2d')!;
    this.dom.addEventListener('keydown',this.keydown);
    view.scrollDOM.addEventListener('scroll',this.schedule,{passive:true});
    this.resize=new ResizeObserver(this.schedule);this.resize.observe(view.dom);this.resize.observe(view.scrollDOM);
    this.colors=new MutationObserver(()=>{this.tokenColors.clear();this.dirty=true;this.schedule();});
    this.colors.observe(view.dom,{attributes:true,attributeFilter:['style','class']});
    this.colors.observe(view.dom.ownerDocument.documentElement,{attributes:true,attributeFilter:['data-theme','data-palette']});
    view.dom.ownerDocument.fonts.addEventListener('loadingdone',this.schedule);
    this.schedule();
  }
  keydown=(event:KeyboardEvent)=>{
    const scroll=this.view.scrollDOM;
    const steps:Record<string,number>={ArrowUp:-this.view.defaultLineHeight,ArrowDown:this.view.defaultLineHeight,PageUp:-scroll.clientHeight,PageDown:scroll.clientHeight};
    if(event.key==='Home')scrollEditor(this.view,0);
    else if(event.key==='End')scrollEditor(this.view,scroll.scrollHeight);
    else if(Object.hasOwn(steps,event.key))scrollEditorBy(this.view,steps[event.key]!);
    else return;
    event.preventDefault();event.stopPropagation();
  };
  schedule=()=>{
    if(!this.frame&&!this.destroyed)this.frame=requestAnimationFrame(()=>{this.frame=0;if(!this.destroyed)this.paint();});
  };
  update(update:ViewUpdate){
    if(update.docChanged||update.selectionSet||
      update.startState.facet(language)!==update.state.facet(language)||
      update.startState.facet(minimapChanges)!==update.state.facet(minimapChanges)||
      foldedRanges(update.startState)!==foldedRanges(update.state))this.dirty=true;
    if(this.dirty||update.geometryChanged||update.viewportChanged)this.schedule();
  }
  content(){
    const state=this.view.state,doc=state.doc,parser=state.facet(language)?.parser,folds=foldedRanges(state);
    if(this.doc===doc&&this.parser===parser&&this.folds===folds)return;
    this.dirty=true;
    this.tokens=[];this.rows=[];
    if(parser){
      const tree=parser.parse(doc.toString());
      highlightTree(tree,{style:tags=>highlightingFor(state,tags)},(from,to,classes)=>this.tokens.push({from,to,classes}));
      const scoped=semanticHighlights(tree,doc),tokens:Token[]=[];
      let next=0;
      for(const token of this.tokens){
        while(next<scoped.length&&scoped[next]!.to<=token.from)next++;
        let from=token.from;
        for(let index=next;index<scoped.length&&scoped[index]!.from<token.to;index++){
          const name=scoped[index]!;
          if(name.from>from)tokens.push({from,to:Math.min(name.from,token.to),classes:token.classes});
          from=Math.max(from,name.to);
        }
        if(from<token.to)tokens.push({from,to:token.to,classes:token.classes});
      }
      this.tokens=[...tokens,...scoped].sort((a,b)=>a.from-b.from);
    }
    const collapsed:Segment[]=[];
    for(const cursor=folds.iter();cursor.value;cursor.next())collapsed.push({from:cursor.from,to:cursor.to});
    let nextFold=0;
    for(let from=0;from<=doc.length;){
      const line=doc.lineAt(from),segments:Segment[]=[];
      let cursor=from,end=line.to;
      while(nextFold<collapsed.length&&collapsed[nextFold]!.from<=end){
        const fold=collapsed[nextFold++]!;
        if(fold.to<=cursor)continue;
        if(fold.from>cursor)segments.push({from:cursor,to:fold.from});
        segments.push({...fold,fold:true});cursor=fold.to;end=doc.lineAt(cursor).to;
      }
      if(cursor<=end)segments.push({from:cursor,to:end});
      this.rows.push({line:line.number,segments});
      from=end+1;
    }
    this.doc=doc;this.parser=parser;this.folds=folds;
  }
  color(classes:string){
    let color=this.tokenColors.get(classes);
    if(color)return color;
    if(!classes){const styles=getComputedStyle(this.view.contentDOM);color={foreground:styles.color,background:styles.backgroundColor};}
    else{
      // Probe theme classes outside the editable document and its DOM observer.
      const probe=document.createElement('span');probe.className=classes;
      probe.style.cssText='position:absolute;visibility:hidden;pointer-events:none';
      this.view.dom.append(probe);const styles=getComputedStyle(probe);
      color={foreground:styles.color,background:styles.getPropertyValue('--cm-token-background').trim()||styles.backgroundColor};probe.remove();
    }
    this.tokenColors.set(classes,color);return color;
  }
  paint(){
    const view=this.view,scroll=view.scrollDOM,height=scroll.clientHeight;
    if(!height||!view.dom.clientWidth)return;
    const scrollable=scroll.scrollHeight>height+1;
    this.dom.style.display=scrollable?'':'none';
    scroll.classList.toggle('cm-has-minimap',scrollable);
    if(!scrollable){minimapGeometry.delete(this.dom);return;}
    this.content();
    const width=Math.min(120,view.dom.clientWidth/6);
    const lineHeight=view.defaultLineHeight/8,charWidth=view.defaultCharacterWidth/5;
    const padding=parseFloat(getComputedStyle(view.contentDOM).paddingTop)/8||0;
    const max=scroll.scrollHeight-height,ratio=max>0?scroll.scrollTop/max:0;
    const offset=Math.max(0,(padding+this.rows.length*lineHeight-height)*ratio);
    const overlayHeight=height/8;
    this.overlay.style.height=`${overlayHeight}px`;
    this.overlay.style.top=`${Math.min(scroll.scrollTop/8,(height-overlayHeight)*ratio)}px`;
    minimapGeometry.set(this.dom,{document:view.state.doc,rows:this.rows,lineHeight,padding,offset,height,overlayHeight});
    // Short documents keep the same bitmap while scrolling. Viewport and
    // measurement notifications also often leave all painted geometry intact.
    const painted=this.painted;
    if(!this.dirty&&painted&&painted.width===width&&painted.height===height&&painted.lineHeight===lineHeight&&
      painted.charWidth===charWidth&&painted.padding===padding&&painted.offset===offset)return;
    this.dirty=false;this.painted={width,height,lineHeight,charWidth,padding,offset};
    if(!painted||painted.width!==width){this.width=width;this.dom.style.width=`${width}px`;this.canvas.style.width=`${width}px`;}
    if(!painted||painted.height!==height){this.dom.style.height=`${height}px`;this.canvas.style.height=`${height}px`;}
    const bitmapWidth=Math.max(8,Math.round(width*2)),bitmapHeight=Math.round(height*2);
    if(this.canvas.width!==bitmapWidth)this.canvas.width=bitmapWidth;
    if(this.canvas.height!==bitmapHeight)this.canvas.height=bitmapHeight;
    const ctx=this.context;ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,bitmapWidth/2,bitmapHeight/2);
    const first=Math.max(0,Math.floor((offset-padding)/lineHeight)),last=Math.min(this.rows.length,Math.ceil((offset+height-padding)/lineHeight));
    const changes=view.state.facet(minimapChanges),styles=getComputedStyle(view.dom);
    const selection=view.state.selection.ranges.filter(range=>!range.empty);
    const changedRows:MinimapChangeRow[]=[],changeColors=new Map<GitChangeKind,string>();
    const start=this.rows[first]?.segments[0]?.from??0;
    let tokenIndex=0,endToken=this.tokens.length;
    while(tokenIndex<endToken){const middle=(tokenIndex+endToken)>>>1;if(this.tokens[middle]!.to<=start)tokenIndex=middle+1;else endToken=middle;}
    for(let index=first;index<last;index++){
      const row=this.rows[index]!,y=padding+index*lineHeight-offset;
      const kind=changes[row.line];
      if(kind){
        let color=changeColors.get(kind);
        if(!color){color=styles.getPropertyValue(gitChangeColors[kind]).trim();changeColors.set(kind,color);}
        changedRows.push({from:y,to:y+lineHeight,color});
      }
      let x=4;
      const draw=(from:number,to:number,classes:string)=>{
        const text=view.state.doc.sliceString(from,to);
        const color=this.color(classes);
        if(color.background!=='rgba(0, 0, 0, 0)'){
          ctx.fillStyle=color.background;ctx.fillRect(x,y,Math.min(text.length*charWidth,Math.max(0,width-3-x)),lineHeight);
        }
        if(selection.some(range=>range.from<to&&range.to>from)){
          ctx.fillStyle=styles.getPropertyValue('--color-editor-selection-background').trim();ctx.fillRect(x,y,text.length*charWidth,lineHeight);
        }
        ctx.fillStyle=color.foreground;
        for(const match of text.matchAll(/\S+/g)){
          const start=x+match.index*charWidth;
          if(start<width-3)ctx.fillRect(start,y,Math.min(match[0].length*charWidth,width-3-start),Math.max(1,lineHeight*.65));
        }
        x+=text.length*charWidth;
      };
      for(const segment of row.segments){
        if(segment.fold){ctx.fillStyle=this.color('').foreground;ctx.fillRect(x,y,3,lineHeight*.65);x+=4;continue;}
        let position=segment.from;
        while(tokenIndex<this.tokens.length&&this.tokens[tokenIndex]!.to<=position)tokenIndex++;
        while(position<segment.to){
          const token=this.tokens[tokenIndex];
          if(!token||token.from>=segment.to){draw(position,segment.to,'');break;}
          if(token.from>position){draw(position,token.from,'');position=token.from;}
          const end=Math.min(segment.to,token.to);draw(position,end,token.classes);position=end;
          if(position>=token.to)tokenIndex++;
        }
      }
    }
    paintMinimapChanges(this.canvas,ctx,this.inner,height,changedRows);
  }
  destroy(){
    this.view.scrollDOM.classList.remove('cm-has-minimap');
    this.destroyed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.colors.disconnect();
    this.dom.removeEventListener('keydown',this.keydown);this.view.scrollDOM.removeEventListener('scroll',this.schedule);
    this.view.dom.ownerDocument.fonts.removeEventListener('loadingdone',this.schedule);minimapGeometry.delete(this.dom);this.dom.remove();
  }
},{provide:plugin=>EditorView.scrollMargins.of(view=>({right:view.plugin(plugin)?.width||Math.min(120,view.dom.clientWidth/6)}))});

const theme=EditorView.theme({
  '&.cm-editor':{overflow:'hidden'},
  '.cm-minimap-gutter':{position:'sticky',zIndex:'200',top:'0',right:'0',left:'auto',width:'min(120px,16.666667%)',height:'100%',minHeight:'0',flexShrink:'0',alignSelf:'flex-start',overflow:'hidden',padding:'0',border:'none',backgroundColor:'color-mix(in srgb,var(--color-surface) 20%,var(--color-background))'},
  '.cm-minimap-inner':{position:'relative',width:'100%',height:'100%',overflow:'hidden'},
  '.cm-minimap-inner canvas':{display:'block'},
  '.cm-minimap-overlay-container':{position:'absolute',inset:'0'},
  '.cm-minimap-overlay':{position:'absolute',top:'0',right:'0',width:'100%',backgroundColor:'var(--palette-4)',opacity:'.2'},
  '.cm-minimap-overlay:hover':{opacity:'.3'},
  '.cm-minimap-overlay-active .cm-minimap-overlay':{opacity:'.4'},
  '.cm-minimap-gutter:focus, .cm-minimap-gutter:focus-visible':{outline:'none'}
});
export const documentMinimap=[canvasMap,theme,minimapDragging];
export const editorMinimap=[minimapChanges.compute([gitLineChanges],changedGitLines),documentMinimap];

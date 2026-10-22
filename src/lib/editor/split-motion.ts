// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

type Box={left:number;top:number;width:number;height:number};
type Image={id:string;box:Box;shell:HTMLElement;map?:{element:HTMLElement;inset:number;width:number}};
type Layer={host:HTMLElement;overlay:HTMLElement;bounds:DOMRect;images:Image[]};
type Motion={duration:number;finished:Promise<void>;cancel():void};

const primary='primary';
const selector=':scope > .code-editor, :scope > .split-editor, :scope > .file-tabs';
const identity=(element:HTMLElement)=>element.dataset.paneId??primary;
const box=(element:HTMLElement,bounds:DOMRect):Box=>{
  const rect=element.getBoundingClientRect();
  return {left:rect.left-bounds.left,top:rect.top-bounds.top,width:rect.width,height:rect.height};
};

/** Freeze sticky minimap geometry before moving its visual copy out of the scroller. */
function freezeMap(original:HTMLElement,copy:HTMLElement){
  const nodes=[original,...original.querySelectorAll<HTMLElement>('*')];
  const copies=[copy,...copy.querySelectorAll<HTMLElement>('*')];
  const bounds=new Map(nodes.map(element=>[element,element.getBoundingClientRect()]));
  nodes.forEach((element,index)=>{
    const rect=bounds.get(element)!,parent=bounds.get(element.parentElement!);
    Object.assign(copies[index]!.style,{
      position:'absolute',left:`${parent?rect.left-parent.left:0}px`,top:`${parent?rect.top-parent.top:0}px`,
      right:'auto',bottom:'auto',width:`${rect.width}px`,height:`${rect.height}px`,
      minWidth:'0',maxWidth:'none',minHeight:'0',maxHeight:'none',margin:'0',transform:'none',boxSizing:'border-box'
    });
  });
}

/** Clone pixels and scroll offsets, without giving disposable DOM editor semantics. */
function image(original:HTMLElement,layer:Layer):Image{
  const rect=box(original,layer.bounds),shell=document.createElement('div');
  const clone=original.cloneNode(true) as HTMLElement;
  const originals=[original,...original.querySelectorAll<HTMLElement>('*')];
  const copies=[clone,...clone.querySelectorAll<HTMLElement>('*')];
  const scrolling=originals.map(element=>({top:element.scrollTop,left:element.scrollLeft}));
  shell.dataset.splitImage=identity(original);
  Object.assign(shell.style,{
    position:'absolute',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,
    overflow:'hidden',background:'var(--color-background)'
  });
  for(const copy of copies){
    for(const attribute of ['id','aria-label','aria-labelledby','aria-describedby','tabindex','contenteditable','role','data-pane-id'])copy.removeAttribute(attribute);
  }
  Object.assign(clone.style,{
    position:'relative',left:'0',top:'0',width:`${rect.width}px`,height:`${rect.height}px`,
    minWidth:'0',maxWidth:'none',margin:'0',transform:'none',animation:'none',transition:'none'
  });
  originals.forEach((element,index)=>{
    if(element.classList.contains('cm-scroller')){
      const bounds=element.getBoundingClientRect();
      Object.assign(copies[index]!.style,{width:`${bounds.width}px`,height:`${bounds.height}px`,minWidth:'0',maxWidth:'none',flex:'none'});
    }else if(element.classList.contains('cm-content')){
      Object.assign(copies[index]!.style,{width:`${element.getBoundingClientRect().width}px`,minWidth:'0',maxWidth:'none',flex:'none'});
    }
  });
  shell.append(clone);layer.overlay.append(shell);
  originals.forEach((element,index)=>{
    const copy=copies[index]!;
    copy.scrollTop=scrolling[index]!.top;copy.scrollLeft=scrolling[index]!.left;
    if(element instanceof HTMLCanvasElement&&copy instanceof HTMLCanvasElement){
      copy.width=element.width;copy.height=element.height;copy.getContext('2d')?.drawImage(element,0,0);
    }
  });

  const sourceMap=original.querySelector<HTMLElement>('.cm-minimap-gutter');
  const clonedMap=clone.querySelector<HTMLElement>('.cm-minimap-gutter');
  let map:Image['map'];
  if(sourceMap&&clonedMap){
    const mapBounds=sourceMap.getBoundingClientRect();
    const inset=Math.max(0,original.getBoundingClientRect().right-mapBounds.right);
    const placeholder=document.createElement('div');
    Object.assign(placeholder.style,{width:`${mapBounds.width}px`,height:`${mapBounds.height}px`,flex:`0 0 ${mapBounds.width}px`,visibility:'hidden'});
    // Preserve the scroller's original horizontal extent when extracting its
    // sticky map, including a document scrolled to the far-right limit.
    clonedMap.replaceWith(placeholder);
    const holder=document.createElement('div');
    holder.className=original.querySelector<HTMLElement>('.cm-editor')?.className??'cm-editor';
    Object.assign(holder.style,{
      inset:'0',width:'100%',height:'100%',minWidth:'0',maxWidth:'none',margin:'0',
      overflow:'hidden',background:'transparent',pointerEvents:'none',zIndex:'1',display:'block'
    });
    holder.style.setProperty('position','absolute','important');
    freezeMap(sourceMap,clonedMap);
    Object.assign(clonedMap.style,{
      left:'auto',right:`${inset}px`,top:`${mapBounds.top-layer.bounds.top-rect.top}px`,
      transformOrigin:'right top'
    });
    for(const part of clonedMap.querySelectorAll<HTMLElement>('.cm-minimap-inner, .cm-minimap-overlay-container, .cm-minimap-overlay'))part.style.width='100%';
    const sourceCanvas=sourceMap.querySelector('canvas'),clonedCanvas=clonedMap.querySelector('canvas');
    if(sourceCanvas&&clonedCanvas&&sourceCanvas.width>=6){
      // The map narrows by clipping its original pixels. Keep the final four
      // bitmap columns of its change gutter attached to the shrinking edge.
      const strip=document.createElement('canvas'),canvasBounds=sourceCanvas.getBoundingClientRect();
      const density=sourceCanvas.width/canvasBounds.width;
      strip.width=4;strip.height=sourceCanvas.height;
      strip.getContext('2d')?.drawImage(sourceCanvas,sourceCanvas.width-6,0,4,sourceCanvas.height,0,0,4,sourceCanvas.height);
      Object.assign(strip.style,{
        position:'absolute',right:`${2/density}px`,top:clonedCanvas.style.top,width:`${4/density}px`,height:`${canvasBounds.height}px`,
        backgroundColor:getComputedStyle(sourceMap).backgroundColor,pointerEvents:'none'
      });
      clonedCanvas.getContext('2d')?.clearRect(clonedCanvas.width-6,0,4,clonedCanvas.height);
      clonedCanvas.after(strip);
    }
    holder.append(clonedMap);shell.append(holder);
    map={element:clonedMap,inset,width:mapBounds.width};
  }
  const scroller=original.querySelector<HTMLElement>('.cm-scroller');
  if(scroller){
    const scrollbarWidth=scroller.offsetWidth-scroller.clientWidth;
    if(scrollbarWidth>0){
      const bounds=scroller.getBoundingClientRect(),scrollbar=document.createElement('div'),spacer=document.createElement('div');
      const appearance=getComputedStyle(scroller);
      // A native scroll track with the same viewport and scroll extent keeps
      // the original thumb painted at the moving edge of this visual copy.
      Object.assign(scrollbar.style,{
        position:'absolute',right:`${Math.max(0,original.getBoundingClientRect().right-bounds.right)}px`,top:`${bounds.top-layer.bounds.top-rect.top}px`,
        width:`${scrollbarWidth}px`,height:`${scroller.clientHeight}px`,overflowY:'scroll',overflowX:'hidden',
        padding:'0',border:'0',boxSizing:'border-box',background:'var(--color-background)',pointerEvents:'none',zIndex:'2',
        scrollbarWidth:appearance.scrollbarWidth,scrollbarColor:appearance.scrollbarColor
      });
      Object.assign(spacer.style,{height:`${scroller.scrollHeight}px`,width:'0'});
      scrollbar.dataset.splitScrollbar='';scrollbar.append(spacer);shell.append(scrollbar);scrollbar.scrollTop=scroller.scrollTop;
    }
  }
  return {id:identity(original),box:rect,shell,...(map?{map}:{})};
}

/**
 * Cover the old layout before changing columns. Only inert copies resize during
 * the slide; live CodeMirror views receive their final dimensions once.
 */
export function prepareSplitMotion(editorDocument:HTMLElement,tabs:HTMLElement):{play(newId:string):Motion;cancel():void}{
  const duration=matchMedia('(prefers-reduced-motion:reduce)').matches?0:240;
  const layers:Layer[]=[],animations:Animation[]=[];
  let stopped=false,played=false;
  let resolveFinished=()=>{};
  const finished=new Promise<void>(resolve=>{resolveFinished=resolve;});
  const cancel=()=>{
    if(stopped)return;stopped=true;
    layers.forEach(layer=>layer.overlay.remove());animations.forEach(animation=>animation.cancel());
    document.removeEventListener('pointerdown',cancel,true);
    document.removeEventListener('keydown',cancel,true);
    document.removeEventListener('wheel',cancel,true);
    window.removeEventListener('resize',cancel);
    resolveFinished();
  };
  if(duration){
    for(const [index,host]of [editorDocument,tabs].entries()){
      const bounds=host.getBoundingClientRect(),overlay=document.createElement('div'),appearance=getComputedStyle(host);
      overlay.dataset.splitMotion=index===0?'editors':'tabs';overlay.ariaHidden='true';overlay.inert=true;
      Object.assign(overlay.style,{
        position:'fixed',left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,
        overflow:'hidden',pointerEvents:'none',zIndex:'400',background:'var(--color-surface)',
        fontFamily:appearance.fontFamily,fontSize:appearance.fontSize,fontWeight:appearance.fontWeight,fontStyle:appearance.fontStyle,
        lineHeight:appearance.lineHeight,letterSpacing:appearance.letterSpacing,color:appearance.color
      });
      const layer:Layer={host,overlay,bounds,images:[]};
      // Enumerate before appending the overlay so its visual copies cannot
      // become inputs to the next split.
      const originals=[...host.querySelectorAll<HTMLElement>(selector)];
      host.parentElement!.append(overlay);layers.push(layer);
      layer.images=originals.map(original=>image(original,layer));
    }
    document.addEventListener('pointerdown',cancel,true);
    document.addEventListener('keydown',cancel,true);
    document.addEventListener('wheel',cancel,{capture:true,passive:true});
    window.addEventListener('resize',cancel);
  }
  return {cancel,play(newId){
    if(stopped||played||!duration){cancel();return {duration:0,finished,cancel};}
    played=true;
    const timing:KeyframeAnimationOptions={duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'};
    for(const layer of layers){
      const targets=[...layer.host.querySelectorAll<HTMLElement>(selector)];
      const target=targets.find(element=>identity(element)===newId);
      if(!target){cancel();return {duration:0,finished,cancel};}
      const index=targets.indexOf(target);
      const previous=index>0?layer.images.find(item=>item.id===identity(targets[index-1]!)):undefined;
      const boundary=previous?previous.box.left+previous.box.width:0;
      const entering=image(target,layer);
      entering.box={...entering.box,left:boundary,width:0};
      layer.images.push(entering);
      for(const snapshot of layer.images){
        const live=targets.find(element=>identity(element)===snapshot.id);
        if(!live)continue;
        const final=box(live,layer.bounds),initial=snapshot.box;
        animations.push(snapshot.shell.animate([
          {left:`${initial.left}px`,width:`${initial.width}px`},
          {left:`${final.left}px`,width:`${final.width}px`}
        ],timing));
        if(snapshot.map){
          const liveMap=live.querySelector<HTMLElement>('.cm-minimap-gutter');
          if(liveMap){
            const bounds=liveMap.getBoundingClientRect(),inset=Math.max(0,live.getBoundingClientRect().right-bounds.right);
            if(inset!==snapshot.map.inset||bounds.width!==snapshot.map.width)animations.push(snapshot.map.element.animate([
              {right:`${snapshot.map.inset}px`,width:`${snapshot.map.width}px`},{right:`${inset}px`,width:`${bounds.width}px`}
            ],timing));
          }
        }
      }
    }
    void Promise.all(animations.map(animation=>animation.finished)).then(cancel,cancel);
    return {duration,finished,cancel};
  }};
}

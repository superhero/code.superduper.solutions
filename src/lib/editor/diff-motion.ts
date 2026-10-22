// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

/** Slide disposable images; never resize CodeMirror or its minimaps per frame. */
export function animateDiff(container:HTMLElement,source:HTMLElement|undefined,opening:boolean){
  const live=container.querySelector<HTMLElement>('.cm-mergeView');
  const committed=live?.querySelector<HTMLElement>('.cm-merge-a');
  const current=live?.querySelector<HTMLElement>('.cm-merge-b');
  const duration=matchMedia('(prefers-reduced-motion:reduce)').matches?0:240;
  if(!live||!committed||!current||!duration)return {duration:0,cancel:()=>{}};
  const bounds=container.getBoundingClientRect(),{width,height}=bounds;
  const split=current.getBoundingClientRect().left-bounds.left;
  const scroll=current.querySelector<HTMLElement>('.cm-scroller')!;
  const scrollbarInset=Math.max(0,bounds.right-scroll.getBoundingClientRect().right)+Math.max(0,scroll.offsetWidth-scroll.clientWidth);
  const overlay=document.createElement('div');
  overlay.dataset.diffMotion=opening?'open':'close';overlay.ariaHidden='true';overlay.inert=true;
  Object.assign(overlay.style,{position:'absolute',inset:'0',overflow:'hidden',pointerEvents:'none',zIndex:'4',background:'var(--color-background)',clipPath:`inset(0 ${scrollbarInset}px 0 0)`});
  const freezeMap=(original:HTMLElement,copy:HTMLElement)=>{
    const nodes=[original,...original.querySelectorAll<HTMLElement>('*')];
    const clones=[copy,...copy.querySelectorAll<HTMLElement>('*')];
    const boxes=new Map(nodes.map(element=>[element,element.getBoundingClientRect()]));
    nodes.forEach((element,index)=>{
      const box=boxes.get(element)!,parent=boxes.get(element.parentElement!);
      Object.assign(clones[index]!.style,{
        position:'absolute',left:`${parent?box.left-parent.left:0}px`,top:`${parent?box.top-parent.top:0}px`,
        right:'auto',bottom:'auto',width:`${box.width}px`,height:`${box.height}px`,
        minWidth:'0',maxWidth:'none',minHeight:'0',maxHeight:'none',margin:'0',transform:'none',boxSizing:'border-box'
      });
    });
  };
  const image=(original:HTMLElement,name:string,imageWidth:number)=>{
    const wrapper=document.createElement('div');wrapper.dataset.diffImage=name;
    Object.assign(wrapper.style,{position:'absolute',left:'0',top:'0',width:`${imageWidth}px`,height:`${height}px`,overflow:'hidden',background:'var(--color-background)'});
    const clone=original.cloneNode(true) as HTMLElement;
    const originals=[original,...original.querySelectorAll<HTMLElement>('*')];
    const copies=[clone,...clone.querySelectorAll<HTMLElement>('*')];
    const scrolling=originals.map(element=>({top:element.scrollTop,left:element.scrollLeft}));
    const sourceMap=original.querySelector<HTMLElement>('.cm-minimap-gutter');
    const mapWidth=sourceMap?.getBoundingClientRect().width;
    const mapInset=sourceMap?Math.max(0,original.getBoundingClientRect().right-sourceMap.getBoundingClientRect().right):0;
    for(const element of copies){
      for(const attribute of ['id','aria-label','tabindex','contenteditable','role'])element.removeAttribute(attribute);
      element.classList.remove('cm-merge-a','cm-merge-b');
    }
    Object.assign(clone.style,{position:'relative',width:`${imageWidth}px`,height:`${height}px`,margin:'0'});
    const clonedMap=clone.querySelector<HTMLElement>('.cm-minimap-gutter');
    if(clonedMap&&mapWidth!==undefined){
      // Sticky gutters rely on their live scrolling layout. A visual copy has
      // no CodeMirror layout manager, so anchor its minimap explicitly instead.
      clone.append(clonedMap);
      freezeMap(sourceMap!,clonedMap);
      Object.assign(clonedMap.style,{position:'absolute',left:'auto',right:`${mapInset}px`,top:'0',height:'100%',width:`${mapWidth}px`});
      if(name==='current')clonedMap.style.visibility='hidden';
    }
    if(name==='minimap')freezeMap(original,clone);
    wrapper.append(clone);overlay.append(wrapper);
    return ()=>{
      originals.forEach((element,index)=>{
        const copy=copies[index]!;copy.scrollTop=scrolling[index]!.top;copy.scrollLeft=scrolling[index]!.left;
        if(element instanceof HTMLCanvasElement&&copy instanceof HTMLCanvasElement){
          copy.width=element.width;copy.height=element.height;copy.getContext('2d')?.drawImage(element,0,0);
        }
      });
      return wrapper;
    };
  };
  const prepareLeft=image(committed,'committed',committed.getBoundingClientRect().width);
  const prepareRight=image(opening?source?.querySelector<HTMLElement>('.cm-editor')??current:current,'current',width);
  // The full-width current image moves right, which would carry its minimap
  // beyond the clipping edge. Keep a separate painted copy pinned at that edge.
  const minimap=current.querySelector<HTMLElement>('.cm-minimap-gutter');
  // Preserve the scrollbar reservation and both handoff endpoints.
  const minimapInset=minimap?Math.max(0,bounds.right-minimap.getBoundingClientRect().right):0;
  const sourceMap=source?.querySelector<HTMLElement>('.cm-minimap-gutter')?.getBoundingClientRect();
  const sourceInset=sourceMap?.width?Math.max(0,bounds.right-sourceMap.right):minimapInset;
  const startInset=opening?sourceInset:minimapInset,endInset=opening?minimapInset:sourceInset;
  const prepareMinimap=minimap?image(minimap,'minimap',minimap.getBoundingClientRect().width):undefined;
  container.append(overlay);
  const left=prepareLeft(),right=prepareRight();
  let pinned:HTMLElement|undefined;
  if(prepareMinimap){
    pinned=prepareMinimap();
    pinned.className=current.className;pinned.classList.remove('cm-merge-a','cm-merge-b');
    Object.assign(pinned.style,{left:'auto',right:`${startInset}px`,zIndex:'1'});
    // Its copied CodeMirror theme sets position:relative!important on the root.
    pinned.style.setProperty('position','absolute','important');
  }
  // Keep the live scrollbar painted outside the overlay's clipped content area.
  const timing:KeyframeAnimationOptions={duration,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'};
  const frames=(from:number,to:number)=>[{transform:`translateX(${from}px)`},{transform:`translateX(${to}px)`}];
  const animations=[left.animate(frames(opening?-split:0,opening?0:-split),timing),right.animate(frames(opening?0:split,opening?split:0),timing)];
  if(pinned&&startInset!==endInset)animations.push(pinned.animate(frames(0,startInset-endInset),timing));
  let stopped=false;
  const cancel=()=>{
    if(stopped)return;stopped=true;
    overlay.remove();animations.forEach(animation=>animation.cancel());
  };
  void Promise.all(animations.map(animation=>animation.finished)).then(cancel,cancel);
  return {duration,cancel};
}

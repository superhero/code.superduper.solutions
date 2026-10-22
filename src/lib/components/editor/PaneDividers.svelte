<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import {onDestroy,untrack} from 'svelte';

  let {sizes,disabled=false,onstart,onpreview,onend}:
    {sizes:number[];disabled?:boolean;onstart():void;onpreview(sizes:number[]):void;onend(sizes:number[]|undefined):void}=$props();
  let root=$state<HTMLDivElement>();
  let width=$state(0),dragging=$state<number|null>(null);
  const gap=2;
  type Drag={index:number;pointer:number;element:HTMLDivElement;startX:number;available:number;sizes:number[];latest:number[];pendingX:number;frame:number;
    cursor:string;cursorPriority:string;selection:string;selectionPriority:string};
  let drag:Drag|undefined;
  const available=$derived(Math.max(0,width-gap*(sizes.length-1)));

  function pair(index:number,weights=sizes,space=available){
    const left=(weights[index]??0)*space,right=(weights[index+1]??0)*space,total=left+right;
    const minimum=Math.min(160,space/weights.length/2,total/2);
    return {left,total,minimum};
  }
  function center(index:number){
    return sizes.slice(0,index+1).reduce((sum,size)=>sum+size,0)*available+gap*index+gap/2;
  }
  function resize(weights:number[],index:number,space:number,left:number){
    const range=pair(index,weights,space),next=[...weights];
    if(space<=0||range.total<=0)return next;
    const bounded=Math.max(range.minimum,Math.min(range.total-range.minimum,left));
    next[index]=bounded/space;
    next[index+1]=(range.total-bounded)/space;
    return next;
  }
  function applyPosition(current:Drag,x:number){
    const next=resize(current.sizes,current.index,current.available,
      (current.sizes[current.index]??0)*current.available+x-current.startX);
    if(next.some((value,index)=>Math.abs(value-(current.latest[index]??0))>1e-10)){
      current.latest=next;
      onpreview(next);
    }
  }
  function cancel(){finish(undefined);}
  function escape(event:KeyboardEvent){
    if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();cancel();}
  }
  function finish(final:number[]|undefined){
    const current=drag;
    if(!current)return;
    drag=undefined;dragging=null;
    cancelAnimationFrame(current.frame);
    window.removeEventListener('keydown',escape,true);
    window.removeEventListener('blur',cancel);
    window.removeEventListener('resize',cancel);
    const style=document.documentElement.style;
    if(current.cursor)style.setProperty('cursor',current.cursor,current.cursorPriority);else style.removeProperty('cursor');
    if(current.selection)style.setProperty('user-select',current.selection,current.selectionPriority);else style.removeProperty('user-select');
    if(current.element.hasPointerCapture(current.pointer))current.element.releasePointerCapture(current.pointer);
    onend(final);
  }
  function start(event:PointerEvent,index:number){
    if(disabled||drag||event.button!==0||!root)return;
    const rect=root.getBoundingClientRect(),space=rect.width-gap*(sizes.length-1);
    if(space<=0)return;
    event.preventDefault();
    const element=event.currentTarget as HTMLDivElement,style=document.documentElement.style;
    const current:Drag={index,pointer:event.pointerId,element,startX:event.clientX,available:space,sizes:[...sizes],latest:[...sizes],pendingX:event.clientX,frame:0,
      cursor:style.getPropertyValue('cursor'),cursorPriority:style.getPropertyPriority('cursor'),
      selection:style.getPropertyValue('user-select'),selectionPriority:style.getPropertyPriority('user-select')};
    width=rect.width;drag=current;dragging=index;
    style.setProperty('cursor','col-resize');style.setProperty('user-select','none');
    element.setPointerCapture(event.pointerId);
    window.addEventListener('keydown',escape,true);
    window.addEventListener('blur',cancel);
    window.addEventListener('resize',cancel);
    onstart();
  }
  function move(event:PointerEvent){
    const current=drag;
    if(!current||event.pointerId!==current.pointer)return;
    current.pendingX=event.clientX;
    if(!current.frame)current.frame=requestAnimationFrame(()=>{
      current.frame=0;
      if(drag===current)applyPosition(current,current.pendingX);
    });
  }
  function release(event:PointerEvent){
    const current=drag;
    if(!current||event.pointerId!==current.pointer)return;
    applyPosition(current,event.clientX);
    finish(current.latest);
  }
  function lost(event:PointerEvent){if(drag?.pointer===event.pointerId)cancel();}
  function key(event:KeyboardEvent,index:number){
    if(disabled||event.altKey||event.ctrlKey||event.metaKey||!root)return;
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(drag)cancel();
    const space=root.getBoundingClientRect().width-gap*(sizes.length-1),range=pair(index,sizes,space);
    if(space<=0)return;
    const step=event.shiftKey?48:16;
    const left=event.key==='Home'?range.minimum:event.key==='End'?range.total-range.minimum:
      range.left+(event.key==='ArrowLeft'?-step:step);
    const next=resize(sizes,index,space,left);
    onstart();onpreview(next);onend(next);
  }
  $effect(()=>{
    const element=root;
    if(!element)return;
    width=element.getBoundingClientRect().width;
    const observer=new ResizeObserver(()=>{
      const next=element.getBoundingClientRect().width;
      if(drag&&Math.abs(next-width)>.5)untrack(cancel);
      width=next;
    });
    observer.observe(element);
    return()=>observer.disconnect();
  });
  $effect(()=>{const count=sizes.length;if(disabled||(drag&&count!==drag.sizes.length))untrack(cancel);});
  onDestroy(cancel);
</script>

<div class="pane-dividers" bind:this={root}>
  {#each sizes.slice(1) as _,index (index)}
    {@const range=pair(index)}
    <!-- A focusable separator exposes the ARIA window-splitter range and its keyboard controls. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="pane-divider" class:active={dragging===index} class:disabled style:left={`${center(index)}px`}
      role="separator" tabindex={disabled?-1:0} aria-orientation="vertical" aria-disabled={disabled}
      aria-label={`Resize editor panes ${index+1} and ${index+2}`}
      aria-valuemin={range.total?Math.round(range.minimum/range.total*100):0}
      aria-valuemax={range.total?Math.round((range.total-range.minimum)/range.total*100):100}
      aria-valuenow={range.total?Math.round(range.left/range.total*100):50}
      onpointerdown={event=>start(event,index)} onpointermove={move} onpointerup={release}
      onpointercancel={lost} onlostpointercapture={lost} onkeydown={event=>key(event,index)}></div>
  {/each}
</div>

<style>
  .pane-dividers{position:absolute;inset:0;z-index:10;pointer-events:none;}
  .pane-divider{position:absolute;top:0;bottom:0;width:10px;transform:translateX(-1px);pointer-events:auto;cursor:col-resize;touch-action:none;outline:none;}
  .pane-divider::after{content:'';position:absolute;top:0;bottom:0;left:0;width:2px;background:var(--color-accent);opacity:0;transition:opacity 100ms ease-in;}
  .pane-divider:is(:hover,:focus-visible)::after{opacity:1;transition-delay:300ms;}
  .pane-divider.active::after{opacity:1;transition:none;}
  .pane-divider.disabled{pointer-events:none;}
  :global(html[data-tab-dragging]) .pane-divider{pointer-events:none;}
  @media(prefers-reduced-motion:reduce){.pane-divider::after{transition:none;}}
</style>

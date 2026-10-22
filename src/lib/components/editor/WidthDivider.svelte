<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import {onDestroy,untrack} from 'svelte';
  let {disabled=false,label,edge='right',minimum=160,maximum=600,onstart,onpreview,onend}:
    {disabled?:boolean;label:string;edge?:'left'|'right';minimum?:number;maximum?:number;onstart():void;onpreview(width:number):void;onend(width:number|undefined):void}=$props();
  let handle=$state<HTMLDivElement>(),dragging=$state(false),width=$state(245);
  let drag:{pointer:number;x:number;start:number;latest:number;pending:number;frame:number;cursor:string;selection:string}|undefined;
  const bound=(value:number)=>Math.round(Math.max(minimum,Math.min(maximum,value)));
  function finish(commit=false){
    const current=drag;if(!current)return;drag=undefined;dragging=false;cancelAnimationFrame(current.frame);
    window.removeEventListener('keydown',escape,true);window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);
    document.documentElement.style.cursor=current.cursor;document.documentElement.style.userSelect=current.selection;
    if(handle?.hasPointerCapture(current.pointer))handle.releasePointerCapture(current.pointer);
    onend(commit&&Math.abs(current.latest-current.start)>=1?current.latest:undefined);
  }
  const cancel=()=>finish(false);
  function escape(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();}}
  function apply(x:number){if(!drag)return;drag.latest=bound(drag.start+(x-drag.x)*(edge==='left'?-1:1));width=drag.latest;onpreview(width);}
  function start(event:PointerEvent){
    if(disabled||event.button!==0||!handle||drag)return;
    event.preventDefault();event.stopPropagation();
    width=handle.parentElement!.getBoundingClientRect().width;
    drag={pointer:event.pointerId,x:event.clientX,start:width,latest:width,pending:event.clientX,frame:0,cursor:document.documentElement.style.cursor,selection:document.documentElement.style.userSelect};
    dragging=true;handle.setPointerCapture(event.pointerId);document.documentElement.style.cursor='col-resize';document.documentElement.style.userSelect='none';
    window.addEventListener('keydown',escape,true);window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);onstart();
  }
  function move(event:PointerEvent){
    if(!drag||event.pointerId!==drag.pointer)return;drag.pending=event.clientX;
    if(!drag.frame)drag.frame=requestAnimationFrame(()=>{if(!drag)return;drag.frame=0;apply(drag.pending);});
  }
  function release(event:PointerEvent){if(drag?.pointer===event.pointerId){apply(event.clientX);finish(true);}}
  function key(event:KeyboardEvent){
    if(disabled||event.altKey||event.ctrlKey||event.metaKey||!handle||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();cancel();
    const current=handle.parentElement!.getBoundingClientRect().width,step=event.shiftKey?48:16;
    const next=bound(event.key==='Home'?minimum:event.key==='End'?maximum:current+(event.key==='ArrowLeft'?-step:step)*(edge==='left'?-1:1));
    if(next!==current){onstart();width=next;onpreview(next);onend(next);}
  }
  $effect(()=>{void minimum;void maximum;untrack(cancel);});
  $effect(()=>{if(disabled)untrack(cancel);});
  $effect(()=>{
    if(!handle)return;
    const observer=new ResizeObserver(()=>{if(!drag&&handle)width=handle.parentElement!.getBoundingClientRect().width;});
    observer.observe(handle.parentElement!);return()=>observer.disconnect();
  });
  onDestroy(cancel);
</script>
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div bind:this={handle} class="width-divider" class:left={edge==='left'} class:dragging class:disabled role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={Math.round(width)} aria-disabled={disabled} tabindex={disabled?-1:0}
  onpointerdown={start} onpointermove={move} onpointerup={release} onpointercancel={cancel} onlostpointercapture={cancel} onkeydown={key}></div>
<style>
  .width-divider{position:absolute;top:0;bottom:0;right:-4px;width:10px;z-index:20;cursor:col-resize;touch-action:none;outline:none;}
  .width-divider.left{left:-4px;right:auto;}
  .width-divider::after{content:'';position:absolute;top:0;bottom:0;left:4px;width:2px;background:var(--color-accent);opacity:0;transition:opacity 100ms ease-in;}
  .width-divider:is(:hover,:focus-visible)::after{opacity:1;transition-delay:300ms;}
  .width-divider.dragging::after{opacity:1;transition:none;}
  @media(prefers-reduced-motion:reduce){.width-divider::after{transition:none;}}
  .width-divider.disabled{pointer-events:none;}
  :global(html[data-tab-dragging]) .width-divider{pointer-events:none;}
</style>

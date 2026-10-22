// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Facet} from '@codemirror/state';
import {EditorView,ViewPlugin,type ViewUpdate} from '@codemirror/view';

interface ScrollSettings {scrollSpeed:number;smoothScrolling:boolean}
const settings=Facet.define<ScrollSettings,ScrollSettings>({combine:values=>values[0]??{scrollSpeed:1,smoothScrolling:true}});
const motion=ViewPlugin.fromClass(class {
  frame=0;
  x=0;y=0;lastX=0;lastY=0;
  remainderX=0;remainderY=0;directionX=0;directionY=0;
  carryWheel=false;
  readonly view:EditorView;
  readonly reduced:MediaQueryList;
  constructor(view:EditorView){
    this.view=view;this.reduced=view.dom.ownerDocument.defaultView!.matchMedia('(prefers-reduced-motion: reduce)');
    view.scrollDOM.addEventListener('wheel',this.wheel,{passive:false,capture:true});
    view.scrollDOM.addEventListener('scroll',this.scrolled);
    view.dom.addEventListener('pointerdown',this.cancel,true);
    view.contentDOM.addEventListener('keydown',this.cancel);
    this.reduced.addEventListener('change',this.cancel);
  }
  cancel=()=>{cancelAnimationFrame(this.frame);this.frame=0;this.remainderX=this.remainderY=this.directionX=this.directionY=0;this.carryWheel=false;};
  scrolled=()=>{
    const scroll=this.view.scrollDOM;
    if((this.frame||this.remainderX||this.remainderY)&&
      (Math.abs(scroll.scrollTop-this.lastY)>.01||Math.abs(scroll.scrollLeft-this.lastX)>.01))this.cancel();
  };
  wheel=(event:WheelEvent)=>{
    if(event.ctrlKey||event.metaKey||event.defaultPrevented)return;
    if(event.target instanceof Element&&event.target.closest('.cm-tooltip'))return;
    const scroll=this.view.scrollDOM,config=this.view.state.facet(settings);
    // A programmatic scroll may precede its queued scroll event. Discard its
    // old animation or fractional target before reading a new wheel gesture.
    this.scrolled();
    let dx=event.deltaX,dy=event.deltaY;
    if(event.shiftKey&&!dx){dx=dy;dy=0;}
    if(event.deltaMode===1){dx*=this.view.defaultLineHeight;dy*=this.view.defaultLineHeight;}
    else if(event.deltaMode===2){dx*=scroll.clientWidth;dy*=scroll.clientHeight;}
    if(!dx&&!dy)return;
    // A browser may round scrollTop to physical pixels. Carry its unapplied
    // fraction into the next wheel event rather than dropping small gestures.
    const directionX=Math.sign(dx),directionY=Math.sign(dy);
    if(directionX&&directionX!==this.directionX)this.remainderX=0;
    if(directionY&&directionY!==this.directionY)this.remainderY=0;
    if(directionX)this.directionX=directionX;if(directionY)this.directionY=directionY;
    // Reversing a wheel gesture must discard the old destination immediately.
    const x=(this.frame&&dx*(this.x-scroll.scrollLeft)>=0?this.x:scroll.scrollLeft)+dx*config.scrollSpeed+(!this.frame?this.remainderX:0);
    const y=(this.frame&&dy*(this.y-scroll.scrollTop)>=0?this.y:scroll.scrollTop)+dy*config.scrollSpeed+(!this.frame?this.remainderY:0);
    const moved=this.move(x,y,true);
    // Keep saturated wheel gestures inside the editor instead of handing the
    // remainder to a parent scroller at the beginning/end of the document.
    if(moved||dy&&scroll.scrollHeight>scroll.clientHeight||dx&&scroll.scrollWidth>scroll.clientWidth){event.preventDefault();event.stopPropagation();}
  };
  move(x:number,y:number,fromWheel=false){
    const scroll=this.view.scrollDOM;
    this.remainderX=this.remainderY=0;this.carryWheel=fromWheel;
    if(!fromWheel)this.directionX=this.directionY=0;
    x=Math.max(0,Math.min(x,scroll.scrollWidth-scroll.clientWidth));
    y=Math.max(0,Math.min(y,scroll.scrollHeight-scroll.clientHeight));
    this.x=x;this.y=y;
    if(!this.view.state.facet(settings).smoothScrolling||this.reduced.matches){
      cancelAnimationFrame(this.frame);this.frame=0;
      const moved=scroll.scrollLeft!==x||scroll.scrollTop!==y;
      scroll.scrollLeft=x;scroll.scrollTop=y;this.lastX=scroll.scrollLeft;this.lastY=scroll.scrollTop;
      if(this.carryWheel){this.remainderX=this.x-this.lastX;this.remainderY=this.y-this.lastY;}
      return moved;
    }
    if(!this.frame&&scroll.scrollLeft===x&&scroll.scrollTop===y)return false;
    // Retarget one running animation rather than restarting its easing for
    // every wheel event. Read the live position to preserve layout corrections.
    if(this.frame)return true;
    let previous=performance.now();
    this.lastX=scroll.scrollLeft;this.lastY=scroll.scrollTop;
    const tick=(time:number)=>{
      const blend=1-Math.exp(-Math.max(0,Math.min(64,time-previous))/35);previous=Math.max(previous,time);
      this.x=Math.max(0,Math.min(this.x,scroll.scrollWidth-scroll.clientWidth));
      this.y=Math.max(0,Math.min(this.y,scroll.scrollHeight-scroll.clientHeight));
      const dx=this.x-scroll.scrollLeft,dy=this.y-scroll.scrollTop;
      const settled=Math.abs(dx)<1.5&&Math.abs(dy)<1.5;
      scroll.scrollLeft=settled?this.x:scroll.scrollLeft+dx*blend;
      scroll.scrollTop=settled?this.y:scroll.scrollTop+dy*blend;
      this.lastX=scroll.scrollLeft;this.lastY=scroll.scrollTop;
      if(settled&&this.carryWheel){this.remainderX=this.x-this.lastX;this.remainderY=this.y-this.lastY;}
      this.frame=settled?0:requestAnimationFrame(tick);
    };
    this.frame=requestAnimationFrame(tick);return true;
  }
  update(update:ViewUpdate){if(update.docChanged||update.startState.facet(settings)!==update.state.facet(settings))this.cancel();}
  destroy(){
    this.cancel();this.view.scrollDOM.removeEventListener('wheel',this.wheel,true);this.view.scrollDOM.removeEventListener('scroll',this.scrolled);
    this.view.dom.removeEventListener('pointerdown',this.cancel,true);this.view.contentDOM.removeEventListener('keydown',this.cancel);this.reduced.removeEventListener('change',this.cancel);
  }
});
export function editorScrolling(value:ScrollSettings){return[settings.of(value),motion];}
export function scrollEditor(view:EditorView,top:number){
  const plugin=view.plugin(motion);
  if(plugin)plugin.move(view.scrollDOM.scrollLeft,top);else view.scrollDOM.scrollTop=top;
}

export function scrollEditorBy(view:EditorView,delta:number){
  const plugin=view.plugin(motion),scroll=view.scrollDOM;
  plugin?.scrolled();
  const top=(plugin?.frame?plugin.y:scroll.scrollTop)+delta*view.state.facet(settings).scrollSpeed;
  scrollEditor(view,top);
}

export function stopEditorScrolling(view:EditorView){view.plugin(motion)?.cancel();}

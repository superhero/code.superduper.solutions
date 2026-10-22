// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {ViewPlugin,type EditorView} from '@codemirror/view';
import {mergeViewSiblings} from '@codemirror/merge';
import {stopEditorScrolling} from './scrolling';

/** Keep the two bounded diff viewports aligned, including minimap gestures. */
const synchronizedTop=new WeakMap<EditorView,number>();
export const diffNavigation=ViewPlugin.fromClass(class {
  readonly view:EditorView;
  constructor(view:EditorView){
    this.view=view;view.scrollDOM.addEventListener('scroll',this.sync);
    for(const event of ['wheel','pointerdown','touchstart','keydown'])view.dom.addEventListener(event,this.claim,{capture:true,passive:true});
  }
  claim=(event:Event)=>{
    if(event instanceof WheelEvent&&(event.ctrlKey||event.metaKey||event.defaultPrevented||event.target instanceof Element&&event.target.closest('.cm-tooltip')))return;
    const siblings=mergeViewSiblings(this.view);if(!siblings)return;
    const other=siblings.a===this.view?siblings.b:siblings.a;
    // Claim navigation before either animation writes another frame. A queued
    // scroll event from the previous driver must not cancel this newer gesture.
    stopEditorScrolling(other);other.scrollDOM.scrollTop=this.view.scrollDOM.scrollTop;
    synchronizedTop.set(other,other.scrollDOM.scrollTop);
  };
  sync=()=>{
    const top=this.view.scrollDOM.scrollTop;
    const expected=synchronizedTop.get(this.view);synchronizedTop.delete(this.view);
    if(expected!==undefined&&Math.abs(top-expected)<1)return;
    const siblings=mergeViewSiblings(this.view);if(!siblings)return;
    const other=siblings.a===this.view?siblings.b:siblings.a;
    if(Math.abs(other.scrollDOM.scrollTop-top)<1)return;
    stopEditorScrolling(other);
    const before=other.scrollDOM.scrollTop;other.scrollDOM.scrollTop=top;
    // Ignore the resulting event, including when the shorter side clamps it.
    // Feeding that clamped position back would pull the active pane backwards.
    if(other.scrollDOM.scrollTop!==before)synchronizedTop.set(other,other.scrollDOM.scrollTop);
  };
  destroy(){
    this.view.scrollDOM.removeEventListener('scroll',this.sync);
    for(const event of ['wheel','pointerdown','touchstart','keydown'])this.view.dom.removeEventListener(event,this.claim,true);
    synchronizedTop.delete(this.view);
  }
});

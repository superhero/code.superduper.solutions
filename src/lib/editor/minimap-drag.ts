// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {ViewPlugin,EditorView,type ViewUpdate} from '@codemirror/view';
import {scrollEditor,stopEditorScrolling} from './scrolling';
import {minimapGeometry} from './minimap-geometry';

/** Continue a click anywhere on the minimap as one viewport drag gesture. */
export const minimapDragging=ViewPlugin.fromClass(class {
  readonly view:EditorView;
  map:HTMLElement|undefined;
  startY=0;startTop=0;factor=1;dragging=false;
  anchor:{from:number;fraction:number;target:number;corrections:number;until:number;queued:boolean}|undefined;
  constructor(view:EditorView){
    this.view=view;view.dom.addEventListener('mousedown',this.start,true);
    for(const event of ['wheel','keydown'])view.dom.addEventListener(event,this.cancelAnchor,true);
    view.scrollDOM.addEventListener('scroll',this.correctAnchor,{passive:true});
    view.dom.ownerDocument.addEventListener('pointerdown',this.cancelAnchor,true);
    view.dom.ownerDocument.defaultView!.addEventListener('blur',this.cancelAnchor);
  }
  cancelAnchor=()=>{this.anchor=undefined;};
  anchorTarget(from:number,fraction:number){
    const scroll=this.view.scrollDOM,block=this.view.lineBlockAt(from);
    const documentTop=scroll.scrollTop+(this.view.documentTop-scroll.getBoundingClientRect().top)/this.view.scaleY;
    return Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,documentTop+(block.top+block.height*fraction)/this.view.scaleY-scroll.clientHeight/2));
  }
  correctAnchor=()=>{
    const anchor=this.anchor;if(!anchor)return;
    if(performance.now()>anchor.until){this.cancelAnchor();return;}
    // Offscreen wrapped heights are estimates. Retain the logical click until
    // CodeMirror has measured the destination, then correct its pixel target.
    this.view.requestMeasure({key:this,
      read:()=>this.anchor===anchor?this.anchorTarget(anchor.from,anchor.fraction):anchor.target,
      write:target=>{
        if(this.anchor!==anchor)return;
        if(performance.now()>anchor.until){this.cancelAnchor();return;}
        const changed=Math.abs(target-anchor.target)>=1;
        if(changed){
          if(++anchor.corrections>6){this.cancelAnchor();return;}
          anchor.target=target;if(this.map&&!this.dragging)this.startTop=target;
        }
        if(changed||Math.abs(this.view.scrollDOM.scrollTop-target)>=1.5){
          if(!anchor.queued){
            anchor.queued=true;
            // CodeMirror restores its scroll anchor after measure writes. Apply
            // the latest destination once that adjustment has finished.
            queueMicrotask(()=>{
              anchor.queued=false;
              if(this.anchor===anchor&&performance.now()<=anchor.until)scrollEditor(this.view,anchor.target);
            });
          }
        }
        const viewport=this.view.viewport;
        if(!changed&&anchor.from>=viewport.from&&anchor.from<=viewport.to&&Math.abs(this.view.scrollDOM.scrollTop-target)<1.5)this.cancelAnchor();
      }
    });
  };
  update(update:ViewUpdate){
    if(update.docChanged)this.cancelAnchor();
    else if(this.anchor&&(update.viewportChanged||update.geometryChanged))this.correctAnchor();
  }
  start=(event:MouseEvent)=>{
    if(event.button!==0||!(event.target instanceof Element))return;
    const map=event.target.closest<HTMLElement>('.cm-minimap-gutter');if(!map)return;
    const scroll=this.view.scrollDOM,max=scroll.scrollHeight-scroll.clientHeight;if(max<=0)return;
    this.stop();this.cancelAnchor();stopEditorScrolling(this.view);
    const inner=map.querySelector<HTMLElement>('.cm-minimap-inner'),geometry=minimapGeometry.get(map);
    if(!inner||!geometry||geometry.document!==this.view.state.doc||!geometry.rows.length)return;
    const inside=Boolean(event.target.closest('.cm-minimap-overlay'));
    let target=scroll.scrollTop;
    if(!inside){
      // The bitmap compresses logical lines, whereas wrapping and diff widgets
      // can give those lines very different heights in the actual editor.
      const rowPosition=Math.max(0,Math.min(geometry.rows.length,(event.clientY-inner.getBoundingClientRect().top+geometry.offset-geometry.padding)/geometry.lineHeight));
      const rowIndex=Math.min(geometry.rows.length-1,Math.floor(rowPosition));
      const row=geometry.rows[rowIndex]!,from=this.view.state.doc.line(row.line).from,fraction=Math.min(1,rowPosition-rowIndex);
      target=this.anchorTarget(from,fraction);this.anchor={from,fraction,target,corrections:0,until:performance.now()+1000,queued:false};
    }
    this.map=map;this.startY=event.clientY;this.startTop=Math.max(0,Math.min(max,target));
    this.factor=Math.max(8,max/(geometry.height-geometry.overlayHeight));this.dragging=false;
    map.querySelector('.cm-minimap-overlay-container')?.classList.add('cm-minimap-overlay-active');map.focus({preventScroll:true});
    this.view.dom.ownerDocument.defaultView!.addEventListener('mousemove',this.move);
    this.view.dom.ownerDocument.defaultView!.addEventListener('mouseup',this.stop);
    this.view.dom.ownerDocument.defaultView!.addEventListener('blur',this.blur);
    event.preventDefault();event.stopImmediatePropagation();scrollEditor(this.view,this.startTop);
    this.correctAnchor();
  };
  move=(event:MouseEvent)=>{
    if(!this.map)return;
    if(!(event.buttons&1)){this.stop();return;}
    const delta=event.clientY-this.startY;
    if(!this.dragging&&Math.abs(delta)<2)return;
    this.dragging=true;this.cancelAnchor();stopEditorScrolling(this.view);
    this.view.scrollDOM.scrollTop=this.startTop+delta*this.factor;
    event.preventDefault();event.stopImmediatePropagation();
  };
  stop=()=>{
    this.map?.querySelector('.cm-minimap-overlay-container')?.classList.remove('cm-minimap-overlay-active');this.map=undefined;this.dragging=false;
    this.view.dom.ownerDocument.defaultView!.removeEventListener('mousemove',this.move);
    this.view.dom.ownerDocument.defaultView!.removeEventListener('mouseup',this.stop);
    this.view.dom.ownerDocument.defaultView!.removeEventListener('blur',this.blur);
  };
  blur=()=>{this.stop();this.cancelAnchor();};
  destroy(){
    this.stop();this.cancelAnchor();this.view.dom.removeEventListener('mousedown',this.start,true);
    for(const event of ['wheel','keydown'])this.view.dom.removeEventListener(event,this.cancelAnchor,true);
    this.view.scrollDOM.removeEventListener('scroll',this.correctAnchor);
    this.view.dom.ownerDocument.removeEventListener('pointerdown',this.cancelAnchor,true);
    this.view.dom.ownerDocument.defaultView!.removeEventListener('blur',this.cancelAnchor);
  }
});

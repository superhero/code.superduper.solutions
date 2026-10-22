// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

import { foldEffect, unfoldEffect } from "@codemirror/language";
import { StateEffect, StateField, Transaction, type TransactionSpec } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

const setFoldViewportFloor = StateEffect.define<number>();
/** Retain enough trailing space that collapsing code never clamps scrollTop. */
export const foldViewportFloor = StateField.define<number>({
  create:()=>0,
  update(value,transaction){
    if(transaction.docChanged)value=0;
    for(const effect of transaction.effects)if(effect.is(setFoldViewportFloor))value=effect.value;
    return value;
  },
  provide:field=>EditorView.contentAttributes.from(field,height=>height?{style:`min-height: max(100%, ${height}px)`}:{})
});

type Snapshot = { image: HTMLElement; headerIndex:number; top: number; bottom: number; scrollTop: number; scrollLeft: number };
const timing: KeyframeAnimationOptions = { duration: 180, easing: "ease-in-out", fill: "both" };

/** Animate a disposable viewport image, never CodeMirror's measured/editable DOM. */
export class FoldMotion {
  private cleanup: (() => void) | undefined;

  cancel = () => { this.cleanup?.(); };

  /** Preserve the merge view's own transaction handler while adding motion. */
  attach(view: EditorView) {
    const dispatch = view.dispatch;
    view.dispatch = ((...input: (Transaction | readonly Transaction[] | TransactionSpec)[]) => {
      const first = input[0];
      const transactions: readonly Transaction[] = input.length === 1 && first instanceof Transaction ? [first]
        : input.length === 1 && Array.isArray(first) ? first as readonly Transaction[]
        : [view.state.update(...input as TransactionSpec[])];
      this.dispatch(transactions, view, next => dispatch(next));
    }) as typeof view.dispatch;
    return () => { this.cancel(); view.dispatch = dispatch; };
  }

  dispatch(transactions: readonly Transaction[], view: EditorView, update: (transactions:readonly Transaction[])=>void = next => view.update(next)) {
    const ranges = transactions.flatMap(transaction => transaction.effects.flatMap(effect =>
      effect.is(foldEffect) || effect.is(unfoldEffect) ? [effect.value] : []));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!ranges.length || transactions.some(transaction => transaction.docChanged) ||
        motion.matches || !view.dom.isConnected) {
      if (transactions.some(transaction => transaction.docChanged)) this.cancel();
      update(transactions);
      return;
    }

    this.cancel();
    const from = Math.min(...ranges.map(range => range.from));
    const to = Math.max(...ranges.map(range => range.to));
    const before = snapshot(view, from, to);
    // Folding and selections take effect immediately, including during rapid input.
    const scrollAnchor = view.scrollSnapshot();
    const finalState = transactions.at(-1)!.state;
    update([...transactions, finalState.update({effects:[scrollAnchor, setFoldViewportFloor.of(before.scrollTop + view.scrollDOM.clientHeight)]})]);
    // CodeMirror applies height corrections and scroll anchoring in its next
    // measurement pass. Keep the old viewport visible until that pass finishes.
    const pending = document.createElement("div");
    const viewport = view.scrollDOM.getBoundingClientRect(), editor = view.dom.getBoundingClientRect();
    const minimap = view.scrollDOM.querySelector(".cm-minimap-gutter")?.getBoundingClientRect();
    Object.assign(pending.style, {position:"absolute", pointerEvents:"none", overflow:"hidden", zIndex:"2",
      left:`${viewport.left-editor.left}px`, top:`${viewport.top-editor.top}px`,
      width:`${minimap && minimap.width>0 ? minimap.left-viewport.left : view.scrollDOM.clientWidth}px`,
      height:`${view.scrollDOM.clientHeight}px`, background:getComputedStyle(view.dom).backgroundColor});
    pending.inert=true;pending.setAttribute("aria-hidden","true");pending.append(before.image.cloneNode(true));view.dom.append(pending);
    const frame=requestAnimationFrame(()=>{
      if(this.cleanup!==cancel)return;
      const after=snapshot(view,from,to);
      cancel();
      this.animate(view,before,after,motion);
    });
    const cancel=()=>{cancelAnimationFrame(frame);pending.remove();if(this.cleanup===cancel)this.cleanup=undefined;
      for(const name of ["pointerdown","keydown","wheel"])view.dom.removeEventListener(name,cancel,true);};
    this.cleanup=cancel;
    for(const name of ["pointerdown","keydown","wheel"])view.dom.addEventListener(name,cancel,true);
  }

  private animate(view:EditorView,before:Snapshot,after:Snapshot,motion:MediaQueryList) {
    const viewport = view.scrollDOM.getBoundingClientRect();
    if (before.scrollLeft !== after.scrollLeft ||
        after.top < 0 || after.top >= viewport.height || before.bottom === after.bottom) return;

    // Bound long/offscreen folds to the viewport; never render hidden document text.
    const available = viewport.height - after.top;
    const oldHeight = Math.min(available, Math.max(0, before.bottom - before.top));
    const newHeight = Math.min(available, Math.max(0, after.bottom - after.top));
    if (oldHeight === newHeight) return;
    const expanded = oldHeight > newHeight ? before : after;
    const overlay = document.createElement("div");
    overlay.className = "cm-fold-motion";
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    const editorRect = view.dom.getBoundingClientRect();
    const minimap = view.scrollDOM.querySelector(".cm-minimap-gutter")?.getBoundingClientRect();
    const overlayWidth = minimap && minimap.width > 0 ? minimap.left - viewport.left : view.scrollDOM.clientWidth;
    Object.assign(overlay.style, {
      position: "absolute", pointerEvents: "none", overflow: "hidden", zIndex: "2",
      left: `${viewport.left - editorRect.left}px`, top: `${viewport.top - editorRect.top}px`,
      width: `${Math.max(0, Math.min(view.scrollDOM.clientWidth, overlayWidth))}px`, height: `${view.scrollDOM.clientHeight}px`,
      background: getComputedStyle(view.dom).backgroundColor
    });
    const head = slice(after.image, 0, after.top);
    head.dataset.foldPart="head";
    // The native unfolded header is already clean; retain its boundary only
    // in the disposable animation image until the opening slide finishes.
    head.querySelectorAll(".cm-content .cm-line")[after.headerIndex]?.classList.add("cm-fold-boundary");
    const fullHeight = Math.max(oldHeight, newHeight);
    const body = slice(expanded.image, expanded.top, fullHeight);
    body.style.top = `${after.top}px`;
    body.style.willChange = "clip-path";
    body.dataset.oldHeight = String(oldHeight);
    body.dataset.newHeight = String(newHeight);
    body.dataset.foldPart = "body";
    const tailTop = after.top + newHeight;
    const tail = slice(after.image, tailTop, viewport.height - tailTop);
    overlay.append(head, body, tail);
    view.dom.append(overlay);
    const hidden = [view.contentDOM, view.scrollDOM.querySelector<HTMLElement>(".cm-gutters"),
      ...view.scrollDOM.querySelectorAll<HTMLElement>(".cm-layer")].filter((node): node is HTMLElement => !!node);
    const opacities = hidden.map(node => node.style.opacity);
    hidden.forEach(node => { node.style.opacity = "0"; });
    const animations = [
      body.animate([
        { clipPath: `inset(0 0 ${fullHeight - oldHeight}px 0)` },
        { clipPath: `inset(0 0 ${fullHeight - newHeight}px 0)` }
      ], timing),
      tail.animate([{ transform: `translateY(${oldHeight - newHeight}px)` }, { transform: "translateY(0)" }], timing)
    ];
    const stop = () => {
      if (this.cleanup !== stop) return;
      this.cleanup = undefined;
      animations.forEach(animation => animation.cancel());
      overlay.remove();
      hidden.forEach((node,index) => { node.style.opacity = opacities[index]!; });
      for (const event of ["pointerdown", "keydown", "wheel"]) view.dom.removeEventListener(event, stop, true);
      motion.removeEventListener("change", stop);
      window.removeEventListener("resize", stop);
    };
    this.cleanup = stop;
    for (const event of ["pointerdown", "keydown", "wheel"]) view.dom.addEventListener(event, stop, true);
    motion.addEventListener("change", stop);
    window.addEventListener("resize", stop);
    void Promise.all(animations.map(animation => animation.finished)).then(stop, () => {});
  }
}

function snapshot(view: EditorView, from: number, to: number): Snapshot {
  const top = view.documentTop;
  const start = view.lineBlockAt(from).bottom;
  const end = view.lineBlockAt(to).bottom;
  const viewport = view.scrollDOM.getBoundingClientRect();
  const image = document.createElement("div");
  const style = getComputedStyle(view.scrollDOM);
  Object.assign(image.style, { position: "absolute", width: "100%", height: `${viewport.height}px`,
    font: style.font, lineHeight: style.lineHeight, color: style.color, tabSize: style.tabSize });
  for (const source of [view.contentDOM, view.scrollDOM.querySelector<HTMLElement>(".cm-gutters")]) {
    if (!source) continue;
    const rect = source.getBoundingClientRect();
    const clone = source.cloneNode(true) as HTMLElement;
    // Clones are purely visual, with no duplicate editor labels, IDs, or tab stops.
    for (const element of [clone, ...clone.querySelectorAll("*")]) {
      for (const attribute of ["id", "aria-label", "contenteditable", "tabindex"]) element.removeAttribute(attribute);
    }
    Object.assign(clone.style, { position: "absolute", margin: "0", boxSizing: "border-box",
      left: `${rect.left - viewport.left}px`, top: `${rect.top - viewport.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px` });
    image.append(clone);
  }
  const node=view.domAtPos(from).node;
  const header=(node instanceof Element?node:node.parentElement)?.closest(".cm-line");
  const headerIndex=Array.from(view.contentDOM.querySelectorAll(".cm-line")).indexOf(header as HTMLElement);
  return { image, headerIndex, top: top + start - viewport.top, bottom: top + end - viewport.top,
    scrollTop: view.scrollDOM.scrollTop, scrollLeft: view.scrollDOM.scrollLeft };
}

function slice(image: HTMLElement, top: number, height: number) {
  const part = document.createElement("div");
  Object.assign(part.style, { position: "absolute", overflow: "hidden", left: "0", right: "0",
    top: `${top}px`, height: `${height}px` });
  const content = image.cloneNode(true) as HTMLElement;
  content.style.top = `${-top}px`;
  part.append(content);
  return part;
}


/** Mark folded headers; unfolding removes the native boundary immediately. */
export const foldBoundaries = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(foldEffect) && !effect.is(unfoldEffect)) continue;
      const header = transaction.state.doc.lineAt(effect.value.from).from;
      value = value.update({filter: from => from !== header,
        add: effect.is(foldEffect) ? [Decoration.line({class:'cm-fold-boundary'}).range(header)] : []});
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field)
});

<!-- Copyright (C) 2026 Erik Landvall; SPDX-License-Identifier: AGPL-3.0-only -->
<script lang="ts">
  let { target, label }: { target: HTMLElement | undefined; label: string } = $props();
  let canvas: HTMLCanvasElement;
  let rail: HTMLDivElement;
  let top = $state(0), height = $state(100), scrollable = $state(false), progress = $state(0);

  $effect(() => {
    const panel = target;
    if (!panel || !canvas || !rail) return;
    let frame = 0, dragging = false, grab = 0, disposed = false;
    const scale = 1 / 8;
    let dirty = true, refreshAll = true;
    type Paint = { x: number; y: number; width: number; height: number; color: string; alpha: number;
      radius?: number; stroke?: string; lineWidth?: number; path?: Path2D; matrix?: DOMMatrix };
    type Surface = { node: Element; opacity: number; boxes: PaintEntry[];
      x: number; y: number; width: number; height: number; dx: number; dy: number };
    type PaintEntry = Paint | Surface;
    let boxes: PaintEntry[] = [];
    const surfaces = new Map<Element, Surface>();
    const interactions = new Set<Element>();
    const moving = new Set<Element>();
    const position = () => {
      const maximum = Math.max(0, panel.scrollHeight - panel.clientHeight);
      const ratio = maximum ? panel.scrollTop / maximum : 0;
      const travel = Math.min(maximum * scale, rail.clientHeight * (1 - scale));
      height = scale * 100;
      top = rail.clientHeight ? travel * ratio / rail.clientHeight * 100 : 0;
      progress = ratio * 100;
    };
    const draw = () => {
      frame = 0;
      if (!panel.clientWidth || !panel.clientHeight) return;
      scrollable = panel.scrollHeight > panel.clientHeight + 1;
      if (!scrollable || !rail.clientHeight) return;
      const width = rail.clientWidth, viewHeight = rail.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio; canvas.height = viewHeight * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      const bounds = panel.getBoundingClientRect();
      const sx = width / panel.clientWidth;
      const maximum = Math.max(0, panel.scrollHeight - panel.clientHeight);
      const scrollRatio = maximum ? panel.scrollTop / maximum : 0;
      const offset = Math.max(0, panel.scrollHeight * scale - viewHeight) * scrollRatio;
      const retained = new Set<Element>();
      // Reuse each row's detailed paint geometry. A moving row only needs its
      // origin updated unless its content, dimensions or own animation changes.
      const capture = (root: Node, opacity: number): PaintEntry[] => {
        const entries: PaintEntry[] = [];
        const visibleColor = (color: string) => color !== "transparent" && !/^(?:rgba|hsla)\(.*,[ ]*0(?:\.0+)?\)$|\/[ ]*0(?:\.0+)?\)$/.test(color);
        const geometry = (rect: DOMRect) => ({x:rect.left-bounds.left+panel.scrollLeft,
          y:rect.top-bounds.top+panel.scrollTop,width:rect.width,height:rect.height});
        const visit = (node: Node, opacity: number) => {
          if (node instanceof Element) {
            if (node.matches('[hidden], script, style, .sr-only')) return;
            if (node !== root && node.hasAttribute('data-minimap-surface')) {
              const rect = node.getBoundingClientRect(), current = geometry(rect);
              let surface = surfaces.get(node);
              const animating = node.hasAttribute('data-minimap-moving');
              if (!surface || refreshAll || interactions.has(node) || animating || surface.opacity !== opacity
                || Math.abs(surface.width - rect.width) > .1 || Math.abs(surface.height - rect.height) > .1) {
                surface = { node, opacity, boxes: capture(node, opacity), ...current, dx:0, dy:0 };
              } else {
                surface.dx = current.x - surface.x; surface.dy = current.y - surface.y;
              }
              if (animating) moving.add(node); else moving.delete(node);
              retained.add(node);
              surfaces.set(node, surface); entries.push(surface);
              return;
            }
            const style = getComputedStyle(node);
            if (style.display === "none" || style.visibility === "hidden") return;
            const alpha = opacity * Number(style.opacity);
            if (!alpha) return;
            for (const rect of node.getClientRects()) {
              if (!rect.width || !rect.height) continue;
              if (visibleColor(style.backgroundColor) || parseFloat(style.borderTopWidth)) {
                entries.push({...geometry(rect), color:style.backgroundColor, alpha,
                  radius:style.borderTopLeftRadius.includes('%') ? Math.min(rect.width,rect.height)/2 : parseFloat(style.borderTopLeftRadius)||0,
                  stroke:style.borderTopColor,lineWidth:parseFloat(style.borderTopWidth)||0});
              }
            }
            // Checkpoint hover/focus fills live on the row's pseudo-element,
            // leaving its branch-count gutter outside the highlighted area.
            if (node === root && node.hasAttribute('data-minimap-surface')) {
              const before = getComputedStyle(node, '::before');
              if (before.content !== 'none' && visibleColor(before.backgroundColor)) {
                const rect = geometry(node.getBoundingClientRect());
                const left = parseFloat(before.left) || 0, top = parseFloat(before.top) || 0;
                entries.push({ ...rect, x:rect.x + left, y:rect.y + top,
                  width:parseFloat(before.width) || rect.width - left,
                  height:parseFloat(before.height) || rect.height - top,
                  color:before.backgroundColor, alpha:alpha * Number(before.opacity),
                  radius:parseFloat(before.borderTopLeftRadius) || 0 });
              }
            }
            if (node instanceof SVGPathElement) {
              const matrix = node.getScreenCTM();
              if (matrix) entries.push({...geometry(node.getBoundingClientRect()),color:style.fill,alpha,
                stroke:style.stroke,lineWidth:parseFloat(style.strokeWidth)||1,
                path:new Path2D(node.getAttribute('d')||''),
                matrix:new DOMMatrix([matrix.a,matrix.b,matrix.c,matrix.d,
                  matrix.e-bounds.left+panel.scrollLeft,matrix.f-bounds.top+panel.scrollTop])});
              return;
            }
            for (const child of node.childNodes) visit(child,alpha);
          } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            const element = node.parentElement;
            if (!element || element.closest('svg, .material-symbols-rounded, [aria-hidden="true"]')) return;
            const range = document.createRange();range.selectNodeContents(node);
            const color = getComputedStyle(element).color;
            for (const rect of range.getClientRects()) entries.push({...geometry(rect),color,alpha:opacity});
          }
        };
        visit(root, opacity);
        return entries;
      };
      if (dirty) {
        boxes = [...panel.children].flatMap(child => capture(child, 1));
        for (const node of surfaces.keys()) if (!retained.has(node)) { surfaces.delete(node); moving.delete(node); }
        dirty = false; refreshAll = false;
      } else {
        for (const node of interactions) {
          const surface = surfaces.get(node);
          if (surface) {
            // Interaction-only updates use the same absolute origin as capture.
            const rect = node.getBoundingClientRect();
            surface.x = rect.left - bounds.left + panel.scrollLeft;
            surface.y = rect.top - bounds.top + panel.scrollTop;
            surface.dx = surface.dy = 0;
            surface.boxes = capture(node, surface.opacity);
          }
        }
      }
      interactions.clear();
      const paint = (entries: PaintEntry[], dx = 0, dy = 0) => { for (const box of entries) {
        if ('boxes' in box) { paint(box.boxes, box.dx, box.dy); continue; }
        const y = (box.y + dy) * scale - offset;
        if (y + box.height * scale < 0 || y > viewHeight) continue;
        ctx.save();ctx.globalAlpha=box.alpha;
        if (box.path && box.matrix) {
          ctx.translate(dx*sx,dy*scale-offset);ctx.scale(sx,scale);
          const m=box.matrix;ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);
          if (box.color !== 'none') {ctx.fillStyle=box.color;ctx.fill(box.path);}
          if (box.stroke && box.stroke !== 'none') {ctx.strokeStyle=box.stroke;ctx.lineWidth=box.lineWidth||1;ctx.stroke(box.path);}
        } else {
          ctx.beginPath();ctx.roundRect((box.x+dx)*sx,y,Math.max(1,box.width*sx),Math.max(1,box.height*scale),(box.radius||0)*Math.min(sx,scale));
          ctx.fillStyle=box.color;ctx.fill();
          if (box.lineWidth && box.stroke) {ctx.strokeStyle=box.stroke;ctx.lineWidth=Math.max(.5,box.lineWidth*Math.min(sx,scale));ctx.stroke();}
        }
        ctx.restore();
      } };
      paint(boxes);
      position();
      if (moving.size) { dirty = true; schedule(); }
    };
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(draw); };
    const invalidate = (all = true) => { dirty = true; refreshAll ||= all; schedule(); };
    const interact = (event: Event) => {
      if (!surfaces.size) { invalidate(); return; }
      const node = event.target instanceof Element ? event.target.closest('[data-minimap-surface]') : null;
      if (node && surfaces.has(node)) { interactions.add(node); schedule(); }
    };
    const resize = new ResizeObserver(entries => invalidate(entries.some(entry => entry.target === panel || entry.target === rail)));
    resize.observe(panel); resize.observe(rail);
    for (const child of panel.children) resize.observe(child);
    const mutation = new MutationObserver(records => {
      let all = false;
      for (const record of records) {
        const node = record.target instanceof Element ? record.target : record.target.parentElement;
        const surface = node?.closest('[data-minimap-surface]');
        if (surface) interactions.add(surface);
        else if (!node?.closest('[data-minimap-scope]')) all = true;
      }
      invalidate(all);
    });
    mutation.observe(panel, { subtree: true, childList: true, characterData: true, attributes: true });
    const theme = new MutationObserver(() => invalidate());
    theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-palette','style','class']});
    panel.addEventListener('pointerover',interact);panel.addEventListener('pointerout',interact);
    panel.addEventListener('focusin',interact);panel.addEventListener('focusout',interact);
    panel.addEventListener('transitionend',interact);panel.addEventListener('transitioncancel',interact);
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      const y = event.clientY - rail.getBoundingClientRect().top - grab;
      const maximum = Math.max(0, panel.scrollHeight - panel.clientHeight);
      const travel = Math.min(maximum * scale, rail.clientHeight * (1 - scale));
      panel.scrollTop = travel > 0 ? y / travel * maximum : 0;
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const y = event.clientY - rail.getBoundingClientRect().top;
      const start = top / 100 * rail.clientHeight, size = height / 100 * rail.clientHeight;
      grab = y >= start && y <= start + size ? y - start : size / 2;
      dragging = true; rail.setPointerCapture(event.pointerId); move(event);
    };
    const up = () => { dragging = false; };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      panel.scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? panel.clientHeight : 1);
    };
    rail.addEventListener("pointerdown", down); rail.addEventListener("pointermove", move);
    rail.addEventListener("pointerup", up); rail.addEventListener("pointercancel", up);
    rail.addEventListener("lostpointercapture", up); rail.addEventListener("wheel", wheel, { passive: false });
    panel.addEventListener("scroll", schedule, { passive: true });
    void document.fonts.ready.then(() => invalidate());
    schedule();
    return () => {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect();theme.disconnect();
      panel.removeEventListener("pointerover",interact);panel.removeEventListener("pointerout",interact);
      panel.removeEventListener("focusin",interact);panel.removeEventListener("focusout",interact);
      panel.removeEventListener("transitionend",interact);panel.removeEventListener("transitioncancel",interact);
      panel.removeEventListener("scroll", schedule);
      rail.removeEventListener("pointerdown", down); rail.removeEventListener("pointermove", move);
      rail.removeEventListener("pointerup", up); rail.removeEventListener("pointercancel", up);
      rail.removeEventListener("lostpointercapture", up); rail.removeEventListener("wheel", wheel);
    };
  });
  function navigate(event: KeyboardEvent) {
    if (!target) return;
    const amount = event.key === "ArrowDown" ? 40 : event.key === "ArrowUp" ? -40
      : event.key === "PageDown" ? target.clientHeight : event.key === "PageUp" ? -target.clientHeight : 0;
    if (amount || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      target.scrollTop = event.key === "Home" ? 0 : event.key === "End" ? target.scrollHeight : target.scrollTop + amount;
    }
  }
</script>

<div class="page-minimap" hidden={!scrollable} bind:this={rail!} role="scrollbar" aria-controls={target?.id} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label={`${label} minimap`} tabindex="0" onkeydown={navigate}>
  <canvas bind:this={canvas!} aria-hidden="true"></canvas>
  <div class="viewport" style:top={`${top}%`} style:height={`${height}%`}></div>
</div>

<style>
  .page-minimap { position:relative;flex:0 0 var(--page-minimap-width,clamp(48px,8vw,120px));min-height:0;overflow:hidden;touch-action:none;background:color-mix(in srgb,var(--color-surface) 20%,var(--color-background));cursor:pointer;outline:none; }
  .page-minimap[hidden] { display:none; }
  canvas { position:absolute;inset:0;width:100%;height:100%;pointer-events:none; }
  .viewport { position:absolute;left:0;right:0;pointer-events:none;background:color-mix(in srgb,var(--color-foreground) 12%,transparent); }
  .page-minimap:focus-visible .viewport { background:color-mix(in srgb,var(--color-hover-foreground) 22%,transparent); }
</style>

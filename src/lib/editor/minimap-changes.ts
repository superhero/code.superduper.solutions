// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export interface MinimapChangeRow {from:number;to:number;color:string}

/** Resolve the canvas' normalized sRGB color without reading bitmap pixels. */
function backgroundColor(color:string){
  const hex=/^#([\da-f]{6})$/i.exec(color);
  if(hex){
    const value=parseInt(hex[1]!,16);
    return `rgb(${value>>16} ${value>>8&255} ${value&255} / .24)`;
  }
  const rgb=/^rgba?\(([^)]+)\)$/.exec(color);
  if(rgb)return `rgb(${rgb[1]!.split(/[\s,/]+/).slice(0,3).join(' ')} / .24)`;
  return `color-mix(in srgb,${color} 24%,transparent)`;
}

/** Draw both Git strips and their shared background from the renderer's rows. */
export function paintMinimapChanges(canvas:HTMLCanvasElement,context:CanvasRenderingContext2D,inner:HTMLElement,height:number,rows:readonly MinimapChangeRow[]){
  // Integer bitmap coordinates keep both gutters identical at fractional pane
  // widths. Clear the complete strips, including unchanged rows and selections.
  context.save();context.setTransform(1,0,0,1,0,0);
  context.clearRect(2,0,4,canvas.height);context.clearRect(canvas.width-6,0,4,canvas.height);
  const runs:MinimapChangeRow[]=[],colors=new Map<string,string>();
  for(const row of rows){
    context.fillStyle=row.color;
    const from=row.from*2,rowHeight=(row.to-row.from)*2;
    context.fillRect(2,from,4,rowHeight);context.fillRect(canvas.width-6,from,4,rowHeight);
    const color=String(context.fillStyle);
    const previous=runs.at(-1);
    if(previous?.color===color&&previous.to>=row.from-1e-7)previous.to=row.to;
    else runs.push({from:row.from,to:row.to,color});
  }
  context.restore();
  const scale=height/canvas.height,stops:string[]=[];
  for(const run of runs){
    let color=colors.get(run.color);
    if(!color){color=backgroundColor(run.color);colors.set(run.color,color);}
    // Keep the old opaque-pixel bounds at each run's outer edges without a
    // layout read or a separate gradient segment for every adjacent row.
    const from=Math.max(0,Math.ceil(run.from*2))*scale,to=Math.min(canvas.height,Math.floor(run.to*2))*scale;
    if(to<=from)continue;
    stops.push(`transparent ${from}px`,`${color} ${from}px`,`${color} ${to}px`,`transparent ${to}px`);
  }
  const background=stops.length?`linear-gradient(to bottom,${stops.join(',')})`:'none';
  if(inner.style.backgroundImage!==background)inner.style.backgroundImage=background;
}

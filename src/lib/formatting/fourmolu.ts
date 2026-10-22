// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { WASI } from '@bjorn3/browser_wasi_shim';
import { parse } from 'node-html-parser';
interface FourmoluExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  malloc(length:number):number; free(pointer:number):void;
  runFourmolu(pointer:number,length:number):number;
  getString(pointer:number):number; getStringLen(pointer:number):number; freeStringWithLen(pointer:number):void;
}
let instance: FourmoluExports | undefined;
export async function initialize(bytes:Uint8Array<ArrayBuffer>):Promise<void>{
  const wasi=new WASI([],[],[]);
  const result=await WebAssembly.instantiate(bytes,{wasi_snapshot_preview1:wasi.wasiImport});
  // Wizer already initialized the artifact. Match the official worker without
  // calling _initialize again or giving the formatter a host filesystem.
  wasi.inst=result.instance as WebAssembly.Instance & {exports:{memory:WebAssembly.Memory}};
  instance=result.instance.exports as FourmoluExports;
}
export async function format(inputText:string,options:{printerOpts:Record<string,unknown>;formatBackpack:boolean}):Promise<string>{
  if(!instance)throw new Error('Fourmolu was not initialized.');
  const hs=instance,input=new TextEncoder().encode(JSON.stringify({inputText,printerOpts:options.printerOpts,
    checkIdempotence:true,unsafeMode:false,formatBackpack:options.formatBackpack}));
  const pointer=hs.malloc(input.length)>>>0;
  try{
    new Uint8Array(hs.memory.buffer,pointer,input.length).set(input);
    const output=hs.runFourmolu(pointer,input.length)>>>0;
    try{
      const start=hs.getString(output)>>>0,length=hs.getStringLen(output)>>>0;
      const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(hs.memory.buffer,start,length))) as {formatError?:string|null;outputHTML?:string};
      if(result.formatError)throw new Error(`Fourmolu: ${result.formatError}`);
      if(typeof result.outputHTML!=='string')throw new Error('Fourmolu returned an invalid response.');
      // The official wrapper returns syntax-highlighted HTML, not source text.
      // Parse as inert data in this worker, preserving text, entities and spacing.
      const root=parse(result.outputHTML,{blockTextElements:{}}),pre=root.querySelector('pre');
      if(!pre)throw new Error('Fourmolu did not return a source block.');
      return pre.textContent;
    }finally{hs.freeStringWithLen(output);}
  }finally{hs.free(pointer);}
}

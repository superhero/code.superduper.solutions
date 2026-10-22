// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { languagePackages, installedPackages, readPackage, subscribeLanguagePackages } from './registry';
import { decodePayload } from '../formatting/packages';
import type { EngineRequest, EngineResult } from './catalog';
import {loadTypeLibraries,typeRegistry} from './type-registry';
import {npmTypeRegistry} from './npm-type-registry';
import type {TypeLibraryChoices} from './type-libraries';
/** One editor-owned session; disabling, switching repositories and removal terminate it. */
export class LanguageSession {
  private worker: Worker | undefined;
  private url = '';
  private next = 0;
  private epoch = 0;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private loading: Promise<Worker | undefined> | undefined;
  private pending = new Map<number,{resolve(value:EngineResult):void;reject(reason:Error):void;timer:ReturnType<typeof setTimeout>}>();
  private unsubscribe: () => void;
  private engine: string;
  private typeLibraries:TypeLibraryChoices;
  private changed: ()=>void;
  constructor(engine: string, changed: ()=>void,typeLibraries:TypeLibraryChoices={}) {
    this.engine=engine;this.changed=changed;this.typeLibraries=typeLibraries;
    const refresh=()=>{this.stop();changed();};
    const languageUnsubscribe=subscribeLanguagePackages(refresh);
    const typeUnsubscribe=engine==='typescript'?typeRegistry.subscribe(refresh):()=>{};
    const npmUnsubscribe=engine==='typescript'?npmTypeRegistry.subscribe(refresh):()=>{};
    this.unsubscribe=()=>{languageUnsubscribe();typeUnsubscribe();npmUnsubscribe();};
  }
  private stop(reason = new Error("The language engine stopped.")) {
    this.epoch++; this.loading=undefined; clearTimeout(this.idle);this.worker?.terminate();this.worker=undefined;
    if(this.url)URL.revokeObjectURL(this.url);this.url='';
    for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(reason);}this.pending.clear();
  }
  dispose(){this.unsubscribe();this.stop();}
  private async start(): Promise<Worker | undefined> {
    if(this.worker)return this.worker;
    if(this.loading)return this.loading;
    const epoch=this.epoch;
    this.loading=(async()=>{
      const item=languagePackages.find(item=>item.id===this.engine);
      if(!item)throw new Error('Unknown language engine.');
      const installed=await installedPackages();
      if(!installed.some(record=>record.id===item.id&&record.sha256===item.sha256))return undefined;
      const {envelope}=await readPackage(item);
      const types=this.engine==='typescript'?await loadTypeLibraries(this.typeLibraries):{files:{},payloads:[]};
      if(epoch!==this.epoch)throw new Error('The language engine stopped.');
      this.url=URL.createObjectURL(new Blob([decodePayload(envelope)],{type:'text/javascript'}));
      const worker=new Worker(this.url,{type:'module',name:`code-language-${item.id}`});this.worker=worker;worker.postMessage({resources:envelope.resources??{},typeLibraries:types.files,typeLibraryPayloads:types.payloads});
      worker.onmessage=event=>{
        const {id,result,error}=event.data as {id:number;result:EngineResult;error?:string};
        const pending=this.pending.get(id);if(!pending)return;this.pending.delete(id);clearTimeout(pending.timer);
        if(error)pending.reject(new Error(error));else pending.resolve(result);
      };
      worker.onerror=event=>{this.stop(new Error(event.message || "The language engine failed to start."));};
      return worker;
    })();
    try{return await this.loading;}finally{if(epoch===this.epoch)this.loading=undefined;}
  }
  async prepare():Promise<boolean>{return Boolean(await this.start());}
  async request(request: EngineRequest): Promise<EngineResult> {
    const worker=await this.start();if(!worker)return {};clearTimeout(this.idle);
    try{return await new Promise<EngineResult>((resolve,reject)=>{
      const id=++this.next,timer=setTimeout(()=>{this.stop();reject(new Error('The language engine timed out.'));},20_000);
      this.pending.set(id,{resolve,reject,timer});worker.postMessage({id,request});
    });}finally{clearTimeout(this.idle);if(!this.pending.size)this.idle=setTimeout(()=>this.stop(),60_000);}
  }
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {openDB,type DBSchema} from 'idb';
import {createPackageEvents} from '../packages/registry';
import {validatePackage,type FormatterPackage} from '../formatting/packages';
import type {NpmTypeArtifact} from './npm-types';
import NpmTypeWorker from './npm-types.worker.ts?worker&inline';

interface NpmTypeDB extends DBSchema{
  metadata:{key:string;value:FormatterPackage};
  packages:{key:string;value:ArrayBuffer};
}
const database=()=>openDB<NpmTypeDB>('code-npm-type-packages',1,{
  upgrade(db){db.createObjectStore('metadata',{keyPath:'id'});db.createObjectStore('packages');},
  blocking(_current,_blocked,event){(event.target as IDBDatabase).close();},
});
const events=createPackageEvents('code-npm-type-packages');
async function installedPackages(){const db=await database();try{return await db.getAll('metadata');}finally{db.close();}}
async function readPackage(item:FormatterPackage){
  const db=await database();let bytes:ArrayBuffer|undefined;
  try{bytes=await db.get('packages',item.id);}finally{db.close();}
  if(!bytes)throw new Error(`Install ${item.name} from Type libraries before using its declarations.`);
  return {bytes,envelope:await validatePackage(bytes,item)};
}
function prepare(request:{name:string}|{import:ArrayBuffer},onprogress:(message:string)=>void,signal:AbortSignal):Promise<NpmTypeArtifact>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const worker=new NpmTypeWorker({name:'code-npm-types'});
    const finish=(failure?:Error,result?:NpmTypeArtifact)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();if(failure)reject(failure);else resolve(result!);};
    const abort=()=>finish(signal.reason instanceof Error?signal.reason:new Error('Type package installation cancelled.'));
    const timer=setTimeout(()=>finish(new Error('The npm type download timed out. Try again.')),120000);
    signal.addEventListener('abort',abort,{once:true});
    worker.onmessage=event=>{const {progress,result,error}=event.data;if(progress)onprogress(progress);else finish(error?new Error(error):undefined,result);};
    worker.onerror=event=>finish(new Error(event.message||'The npm type installer could not start.'));
    worker.postMessage(request,'import'in request?[request.import]:[]);
  });
}
async function store(artifact:NpmTypeArtifact,signal:AbortSignal){
  await validatePackage(artifact.bytes,artifact.item);signal.throwIfAborted();
  const db=await database();
  try{signal.throwIfAborted();const transaction=db.transaction(['metadata','packages'],'readwrite');
    await transaction.objectStore('metadata').put(artifact.item);await transaction.objectStore('packages').put(artifact.bytes,artifact.item.id);await transaction.done;
  }finally{db.close();}
  events.publish();return artifact.item;
}
async function installPackage(name:string,onprogress:(message:string)=>void,signal:AbortSignal){return store(await prepare({name},onprogress,signal),signal);}
async function importPackage(bytes:ArrayBuffer,signal:AbortSignal){return store(await prepare({import:bytes},()=>{},signal),signal);}
async function removePackage(id:string){const db=await database();try{const transaction=db.transaction(['metadata','packages'],'readwrite');await transaction.objectStore('metadata').delete(id);await transaction.objectStore('packages').delete(id);await transaction.done;}finally{db.close();}events.publish();}
export const npmTypeRegistry={installedPackages,readPackage,installPackage,importPackage,removePackage,subscribe:events.subscribe};

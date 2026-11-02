// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Test-only static delivery. No inference or protocol substitution occurs here.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdir,stat,rename,rm,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
export async function decisionFixtures(context,directory,profiles,report){
 const files=new Map(profiles.flatMap(p=>p.artifacts??[]).filter(f=>f.kind==='weights'&&f.id.endsWith('.gguf')).map(f=>[new URL(f.url).pathname,f]));
 const prepared=new Map();const root=resolve(directory,'verified-gguf');await mkdir(root,{recursive:true});
 const server=createServer(async(req,res)=>{
  const hash=(req.url??'').split('?')[0].slice(1),file=[...files.values()].find(f=>f.sha256===hash);
  if(!file||!prepared.has(hash)){res.writeHead(404).end();return;}
  const match=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/),start=match?Number(match[1]):0,end=match?.[2]?Number(match[2]):file.bytes-1;
  if(start<0||end>=file.bytes||end<start){res.writeHead(416).end();return;}
  res.writeHead(match?206:200,{'content-length':end-start+1,'accept-ranges':'bytes','access-control-allow-origin':'*','access-control-expose-headers':'content-range, content-length, accept-ranges','cross-origin-resource-policy':'cross-origin',...(match?{'content-range':`bytes ${start}-${end}/${file.bytes}`}:{})});
  const stream=createReadStream(prepared.get(hash),{start,end});res.on('close',()=>stream.destroy());stream.on('error',error=>res.destroy(error));stream.pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await context.route('https://huggingface.co/**',async route=>{
  const file=files.get(new URL(route.request().url()).pathname);
  if(!file){await route.continue();return;}
  await route.fulfill({status:307,headers:{location:'http://127.0.0.1:'+server.address().port+'/'+file.sha256,'access-control-allow-origin':'*'}});
 });
 return {async prepare(id){
  const profile=profiles.find(p=>p.id===id);for(const file of profile.artifacts.filter(f=>f.kind==='weights'&&f.id.endsWith('.gguf'))){
   if(prepared.has(file.sha256))continue;
   const path=resolve(root,file.sha256),temporary=path+'.partial';let bytes=0;const hash=createHash('sha256');
   report('fixture-preparation',{id,url:file.url,sha256:file.sha256,bytes:file.bytes});
   if(process.env.MODEL_LIVE_DECISION_CACHE){
    const source=resolve(process.env.MODEL_LIVE_DECISION_CACHE,file.sha256+'.blob');
    if((await stat(source)).size!==file.bytes)throw Error('Pinned static-cache size differs: '+file.id);
    for await(const block of createReadStream(source,{highWaterMark:8*1024*1024})){bytes+=block.length;hash.update(block);}
    if(bytes!==file.bytes||hash.digest('hex')!==file.sha256)throw Error('Pinned static-cache checksum differs: '+file.id);
    prepared.set(file.sha256,source);report('fixture-verified',{id,sha256:file.sha256,bytes,delivery:'read-only reference cache'});continue;
   }
   try{
    const chunk=16*1024*1024;
    let existing=await stat(temporary).then(info=>Math.floor(info.size/chunk)*chunk,()=>0);
    if(existing>file.bytes)existing=0;
    const handle=await open(temporary,existing?'r+':'w');await handle.truncate(existing);
    let next=existing,done=existing,last=existing;
    try{const workers=await Promise.allSettled(Array.from({length:4},async()=>{
      for(;;){const start=next;if(start>=file.bytes)return;const end=Math.min(start+chunk,file.bytes)-1;next=end+1;
        const url=new URL(file.url);url.searchParams.set('browser_range',`${start}-${end}`);
        const response=await fetch(url,{headers:{Range:`bytes=${start}-${end}`},signal:AbortSignal.timeout(120000)});
        if(response.status!==206||response.headers.get('content-range')!==`bytes ${start}-${end}/${file.bytes}`){await response.body?.cancel();throw Error('Pinned fixture returned an incorrect range');}
        const block=Buffer.from(await response.arrayBuffer());if(block.length!==end-start+1)throw Error('Pinned fixture range is truncated');
        let written=0;while(written<block.length){const value=await handle.write(block,written,block.length-written,start+written);if(!value.bytesWritten)throw Error('Fixture write stalled');written+=value.bytesWritten;}
        done+=block.length;if(done-last>512*1024*1024){last=done;report('fixture-progress',{id,bytes:done});}
      }
    }));const failure=workers.find(r=>r.status==='rejected');if(failure)throw failure.reason;}finally{await handle.close();}
    for await(const block of createReadStream(temporary)){bytes+=block.length;hash.update(block);}
    if(bytes!==file.bytes||hash.digest('hex')!==file.sha256)throw Error('Pinned fixture checksum/size mismatch');
    await rename(temporary,path);prepared.set(file.sha256,path);report('fixture-verified',{id,sha256:file.sha256,bytes});
   }catch(error){await rm(temporary,{force:true});throw error;}
  }
 },async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

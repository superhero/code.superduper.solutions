// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from llm-sds-01; continuous-sources.json preserves source provenance.
import {createFrontend,parseFsmnCmvn,verifiedBytes,sessionOptions,createProbabilityReader,validateNativeFrontend} from '../firered/frontend.js';
const REV='f6e9fbb4cefa7397216c763f21307993f147f585',MODEL_SHA='756887ce01695a9bb00dd85ca0f743653de03b18ba54d2e9ef4f4bb9b3edbf9f',CMVN_SHA='6820fef9687708c4fc3fab2530179c8fcea6262daa25514380056cd8f6eb1754';

export async function createDetector({backend='cpu',ort,assets,device,stage=()=>{}}){
  const gpu=backend==='gpu';if(!['cpu','gpu'].includes(backend))throw Error('Unknown FSMN backend');if(gpu&&!device)throw Error('FSMN requires an explicit GPUDevice');
  const info={family:'FunASR FSMN-VAD',revision:REV,model_sha256:MODEL_SHA,representation:'official native FP32 ONNX; quantized509kB artifact not used',requested_backend:backend,strict_cpu_fallback:gpu&&!assets.allowCpuShapeFallback,placement:'pending runtime audit',postprocessing:'speech probability=1-softmax(class0 silence), shared0.5 threshold; upstream E2EVad SNR/window endpoint logic not applied',cpu_work:['audio packet/tail copying','command submission','scalar probability reporting'],cache_readback_bytes:0,probability_readback_bytes:0,model_calls:0,feature_right_context_ms:20};
  let frontend,session,reader,caches=[],zeroBuffers=[],closed=false;
  const dispose=t=>t?.dispose?.();
  try{
    stage('Load pinned FunASR ONNX and CMVN');const [model,norm]=await Promise.all([verifiedBytes(assets.model,MODEL_SHA),verifiedBytes(assets.cmvn,CMVN_SHA)]);
    frontend=await createFrontend({backend,device,ort,windowType:'hamming',lfr:5,cmvn:parseFsmnCmvn(new TextDecoder().decode(norm))});info.frontend=frontend.info;
    stage('Validate FunASR frontend against native Kaldi');info.frontend_validation=await validateNativeFrontend(frontend,{backend,device,reference:assets.frontendReference,referenceSha256:assets.frontendReferenceSha256});
    const outputNames=['logits',...Array.from({length:4},(_,i)=>'out_cache'+i)];stage('Initialize FunASR '+backend);session=await ort.InferenceSession.create(model,sessionOptions({backend,device,ort,outputs:outputNames,audit:assets.audit,allowCpuShapeFallback:assets.allowCpuShapeFallback}));
    if(gpu){reader=await createProbabilityReader(device,{classes:248});for(let i=0;i<4;i++)zeroBuffers.push(device.createBuffer({label:'fsmn/initial-cache'+i,size:128*19*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}));}
    async function reset(){
      caches.forEach(dispose);frontend.reset();caches=Array.from({length:4},(_,i)=>{if(gpu){device.queue.writeBuffer(zeroBuffers[i],0,new Float32Array(128*19));return ort.Tensor.fromGpuBuffer(zeroBuffers[i],{dataType:'float32',dims:[1,128,19,1]});}return new ort.Tensor('float32',new Float32Array(128*19),[1,128,19,1]);});
    }
    async function process(packet,options={}){
      if(closed)throw Error('FSMN detector closed');const features=frontend.process(packet,options);if(!features.frames)return[];
      const feeds={speech:features.tensor};caches.forEach((t,i)=>feeds['in_cache'+i]=t);const previous=caches;let result;
      try{result=await session.run(feeds);}finally{features.tensor.dispose?.();}
      caches=Array.from({length:4},(_,i)=>result['out_cache'+i]);previous.forEach(dispose);info.model_calls++;
      try{
        if(gpu&&caches.some(t=>t.location!=='gpu-buffer'))throw Error('FSMN caches were not retained on GPU');
        const probs=gpu?await reader.read(result.logits,features.frames):Float32Array.from({length:features.frames},(_,i)=>Math.max(0,Math.min(1,1-result.logits.data[i*248])));if(gpu)info.probability_readback_bytes+=features.frames*4;
        return Array.from(probs,(probability,i)=>({start:(features.startFrame+i)*.01,end:(features.startFrame+i+1)*.01,probability,speech:probability>=(assets.threshold??.5)}));
      }finally{dispose(result.logits);}
    }
    async function close(){if(closed)return;closed=true;caches.forEach(dispose);frontend.close();reader?.close();await session.release();zeroBuffers.forEach(b=>b.destroy());info.closed=true;}
    await reset();return{sampleRate:16000,reset,process,flush:()=>process(new Float32Array(0),{final:true}),close,info};
  }catch(error){caches.forEach(dispose);frontend?.close();reader?.close();await session?.release?.();zeroBuffers.forEach(b=>b.destroy());throw error;}
}

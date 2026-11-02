// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from llm-sds-01; continuous-sources.json preserves source provenance.
import {createFrontend,parseFireRedCmvn,verifiedBytes,sessionOptions,createProbabilityReader,validateNativeFrontend} from './frontend.js';
const REV='c30ec49e8cc69642b0ee65362eba11b9d11c6e54';
const MODEL_SHA='b3c97836130dc34fc32d56fab551e88cf9454511de2b3c250a5e6578dee74b93',CMVN_SHA='c87f6f13edf0f0ec7535ddfc9cc3387d9268cb234b70182d566c5e2edf3ca473';

export async function createDetector({backend='cpu',ort,assets,device,stage=()=>{}}){
  const gpu=backend==='gpu';if(!['cpu','gpu'].includes(backend))throw Error('Unknown FireRed backend');if(gpu&&!device)throw Error('FireRed requires an explicit GPUDevice');
  const info={family:'FireRed Stream-VAD',revision:REV,model_sha256:MODEL_SHA,representation:'official native FP32 ONNX',requested_backend:backend,strict_cpu_fallback:gpu&&!assets.allowCpuShapeFallback,placement:'pending runtime audit',postprocessing:'raw speech probability with shared0.5 threshold; upstream endpoint smoothing not applied',cpu_work:['audio packet/tail copying','command submission','scalar probability reporting'],cache_readback_bytes:0,probability_readback_bytes:0,model_calls:0};
  let frontend,session,reader,cache,zeroBuffer,closed=false;
  function dispose(tensor){tensor?.dispose?.();}
  try{
    stage('Load pinned FireRed ONNX and CMVN');const [model,stats]=await Promise.all([verifiedBytes(assets.model,MODEL_SHA),verifiedBytes(assets.cmvn,CMVN_SHA)]);
    const cmvn=parseFireRedCmvn(stats);frontend=await createFrontend({backend,device,ort,windowType:'povey',lfr:1,cmvn});info.frontend=frontend.info;
    stage('Validate FireRed frontend against native Kaldi');info.frontend_validation=await validateNativeFrontend(frontend,{backend,device,reference:assets.frontendReference,referenceSha256:assets.frontendReferenceSha256});
    stage('Initialize FireRed '+backend);session=await ort.InferenceSession.create(model,sessionOptions({backend,device,ort,outputs:['probs','caches_out'],audit:assets.audit,allowCpuShapeFallback:assets.allowCpuShapeFallback}));
    if(gpu){reader=await createProbabilityReader(device);zeroBuffer=device.createBuffer({label:'firered/initial-cache',size:8*128*19*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});}
    async function reset(){
      dispose(cache);frontend.reset();if(gpu){device.queue.writeBuffer(zeroBuffer,0,new Float32Array(8*128*19));cache=ort.Tensor.fromGpuBuffer(zeroBuffer,{dataType:'float32',dims:[8,1,128,19]});}else cache=new ort.Tensor('float32',new Float32Array(8*128*19),[8,1,128,19]);
    }
    async function process(packet,options={}){
      if(closed)throw Error('FireRed detector closed');const features=frontend.process(packet,options);if(!features.frames)return[];
      const previous=cache;let result;
      try{result=await session.run({feat:features.tensor,caches_in:cache});}finally{features.tensor.dispose?.();}
      cache=result.caches_out;dispose(previous);info.model_calls++;
      try{
        if(gpu&&cache.location!=='gpu-buffer')throw Error('FireRed cache was not retained on GPU');
        const probs=gpu?await reader.read(result.probs,features.frames):result.probs.data;if(gpu)info.probability_readback_bytes+=features.frames*4;
        return Array.from(probs,(probability,i)=>({start:(features.startFrame+i)*.01,end:(features.startFrame+i+1)*.01,probability,speech:probability>=(assets.threshold??.5)}));
      }finally{dispose(result.probs);}
    }
    async function close(){if(closed)return;closed=true;dispose(cache);frontend.close();reader?.close();await session.release();zeroBuffer?.destroy();info.closed=true;}
    await reset();return{sampleRate:16000,reset,process,flush:()=>process(new Float32Array(0),{final:true}),close,info};
  }catch(error){dispose(cache);frontend?.close();reader?.close();await session?.release?.();zeroBuffer?.destroy();throw error;}
}

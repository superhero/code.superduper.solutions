// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from llm-sds-01; continuous-sources.json preserves source provenance.
import {cpuFeatures,gpuFrontend} from './frontend.js';

async function load(url, binary=false) {
  if(typeof url!=='string')throw Error('MarbleNet requires explicit asset URLs');
  const response=await fetch(url);if(!response.ok)throw Error(`MarbleNet asset HTTP ${response.status}: ${url}`);
  return binary?new Float32Array(await response.arrayBuffer()):response.json();
}
const SELECT=`struct P { first:u32,count:u32,pad0:u32,pad1:u32 }
@group(0) @binding(0) var<storage,read> probabilities:array<f32>;
@group(0) @binding(1) var<storage,read_write> selected:array<f32>;
@group(0) @binding(2) var<uniform> p:P;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){if(id.x<p.count){selected[id.x]=probabilities[2u*(p.first+id.x)+1u];}}`;
const maxDifference=(actual,expected)=>{if(actual.length!==expected.length)throw Error(`MarbleNet golden length ${actual.length} != ${expected.length}`);let max=0;for(let i=0;i<actual.length;i++){if(!Number.isFinite(actual[i]))throw Error('MarbleNet golden nonfinite value');max=Math.max(max,Math.abs(actual[i]-expected[i]));}return max;};

export async function createDetector({backend,ort,assets,device,stage=()=>{}}) {
  if(!['cpu','gpu'].includes(backend))throw Error('MarbleNet backend must be cpu or gpu');
  stage('Load MarbleNet exact official frontend coefficients');
  const [meta,window,mel]=await Promise.all([load(assets.frontend),load(assets.window,true),load(assets.mel,true)]);
  if(window.length!==400||mel.length!==80*257||meta.right_feature_context!==145)throw Error('Unexpected MarbleNet frontend manifest');
  let ownedDevice=false;
  if(backend==='gpu'){
    if(!device){const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('WebGPU adapter unavailable');device=await adapter.requestDevice();ownedDevice=true;}
    ort.env.webgpu.device=device;
  }
  const options={executionProviders:[backend==='gpu'?'webgpu':'wasm'],logSeverityLevel:2,logVerbosityLevel:0};
  if(backend==='gpu'){options.extra={session:{disable_cpu_ep_fallback:'1'}};options.preferredOutputLocation={probabilities:'gpu-buffer'};}
  stage(`Initialize MarbleNet ${backend} model`);
  const session=await ort.InferenceSession.create(assets.model,options);
  const front=backend==='gpu'?await gpuFrontend(device,window,mel):null;
  const selector=backend==='gpu'?await device.createComputePipelineAsync({label:'marblenet class-one selection',layout:'auto',compute:{module:device.createShaderModule({code:SELECT}),entryPoint:'main'}}):null;
  const selectParams=backend==='gpu'?device.createBuffer({label:'marblenet probability slice params',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}):null;
  let pcm=new Float32Array(65536),used=0,nextOutput=0,finalized=false,closed=false;
  const info={model:'NVIDIA Frame-VAD Multilingual MarbleNet v2.0',backend,source:'exact official FP32 tensors, locally exported ONNX',sample_rate:16000,threshold:.5,hop_samples:320,output_spacing_ms:20,neural_receptive_field_feature_frames:291,right_context_ms:1450,frontend_lookahead_ms_conservative:16,delivery:'250ms packet arrivals; emit only frames with complete native future context; final flush uses native end padding',preprocessing:backend==='gpu'?'WebGPU FP32 preemphasis/window/FFT/mel/log; original coefficients':'JavaScript CPU FP32 FFT/mel/log; original coefficients',neural_cpu_fallback:backend==='gpu'?'disabled':'CPU reference',cpu_work:backend==='gpu'?['PCM capture/upload','host submissions and frame clock','probability vector readback and threshold/report objects']:['frontend','neural graph','threshold/report objects'],counters:{model_calls:0,probability_readback_bytes:0,frontend_gpu_calls:0},input_names:session.inputNames,output_names:session.outputNames};

  async function probabilities(first,frames,begin,count){
    let feature,tensor,outputs;
    try{
      if(backend==='gpu'){feature=front.compute(used,first,frames);info.counters.frontend_gpu_calls++;tensor=ort.Tensor.fromGpuBuffer(feature.buffer,{dataType:'float32',dims:[1,80,frames]});}
      else tensor=new ort.Tensor('float32',cpuFeatures(pcm.subarray(0,used),first,frames,window,mel),[1,80,frames]);
      outputs=await session.run({features:tensor});info.counters.model_calls++;
      const output=outputs[session.outputNames[0]];
      if(backend==='cpu'){const result=new Float32Array(count);for(let i=0;i<count;i++)result[i]=output.data[2*(begin+i)+1];return result;}
      const bytes=Math.max(16,Math.ceil(count*4/16)*16);
      const selected=device.createBuffer({label:'marblenet compact probabilities',size:bytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
      const readback=device.createBuffer({label:'marblenet probability readback',size:bytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      try{
        device.queue.writeBuffer(selectParams,0,new Uint32Array([begin,count,0,0]));
        const bind=device.createBindGroup({layout:selector.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:output.gpuBuffer}},{binding:1,resource:{buffer:selected}},{binding:2,resource:{buffer:selectParams}}]});
        const command=device.createCommandEncoder(),pass=command.beginComputePass();pass.setPipeline(selector);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();command.copyBufferToBuffer(selected,0,readback,0,bytes);device.queue.submit([command.finish()]);
        await readback.mapAsync(GPUMapMode.READ);const values=new Float32Array(readback.getMappedRange(),0,count).slice();readback.unmap();info.counters.probability_readback_bytes+=count*4;return values;
      }finally{selected.destroy();readback.destroy();}
    }finally{for(const output of Object.values(outputs||{}))output.dispose?.();tensor?.dispose?.();feature?.dispose();}
  }

  async function drain(final){
    if(used<512)return[];
    const valid=Math.floor(used/160)+1;
    const last=final?Math.floor((valid-1)/2):Math.floor((Math.floor((used-257)/160)-145)/2);
    if(last<nextOutput)return[];
    const first=Math.max(0,2*nextOutput-146);
    const frames=valid-first+((valid-first)%2);
    const count=last-nextOutput+1;
    const values=await probabilities(first,frames,nextOutput-first/2,count),result=[];
    for(let i=0;i<values.length;i++){
      const start=(nextOutput+i)*.02,end=Math.min(start+.02,used/16000);
      if(end>start)result.push({start,end,probability:values[i],speech:values[i]>=.5});
    }
    nextOutput=last+1;return result;
  }
  return{
    info,
    async validate(){
      stage(`Validate MarbleNet ${backend} against original-source Torch golden`);
      const [goldPcm,goldFeatures,goldProbabilities]=await Promise.all([load(assets.goldenPcm,true),load(assets.goldenFeatures,true),load(assets.goldenProbabilities,true)]);
      used=goldPcm.length;pcm=new Float32Array(Math.max(65536,used));pcm.set(goldPcm);front?.append(goldPcm,0);
      const frames=meta.golden.features_shape[2];let actualFeatures;
      if(backend==='cpu')actualFeatures=cpuFeatures(goldPcm,0,frames,window,mel);
      else{
        const features=front.compute(used,0,frames);
        const readback=device.createBuffer({label:'marblenet golden features validation only',size:goldFeatures.byteLength,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
        try{const command=device.createCommandEncoder();command.copyBufferToBuffer(features.buffer,0,readback,0,goldFeatures.byteLength);device.queue.submit([command.finish()]);await readback.mapAsync(GPUMapMode.READ);actualFeatures=new Float32Array(readback.getMappedRange()).slice();readback.unmap();}finally{readback.destroy();features.dispose();}
      }
      const featureError=maxDifference(actualFeatures,goldFeatures);
      const full=await probabilities(0,frames,0,goldProbabilities.length),probabilityError=maxDifference(full,goldProbabilities);
      const emitted=[];used=0;nextOutput=0;finalized=false;
      for(let offset=0;offset<goldPcm.length;offset+=4000){const packet=goldPcm.subarray(offset,offset+4000);pcm.set(packet,used);front?.append(packet,used);used+=packet.length;emitted.push(...await drain(false));}
      emitted.push(...await drain(true));if(emitted.length!==Math.ceil(goldPcm.length/320))throw Error('MarbleNet golden stream omitted or duplicated frames');const expected=goldProbabilities.subarray(0,emitted.length);
      const streamingError=maxDifference(Float32Array.from(emitted.map(f=>f.probability)),expected);
      used=0;nextOutput=0;finalized=false;info.counters={model_calls:0,probability_readback_bytes:0,frontend_gpu_calls:0};
      const validation={passed:featureError<.001&&probabilityError<.0001&&streamingError<.0001,feature_max_absolute_error:featureError,full_probability_max_absolute_error:probabilityError,streaming_probability_max_absolute_error:streamingError,streamed_frames:emitted.length,reference:'original upstream masked Jasper blocks + checkpoint frontend, deterministic4s PCM',validation_readbacks_excluded_from_timing:true};
      if(!validation.passed)throw Error('MarbleNet golden mismatch '+JSON.stringify(validation));return validation;
    },
    async reset(){if(closed)throw Error('MarbleNet is closed');used=0;nextOutput=0;finalized=false;},
    async process(packet,options={}){
      if(closed||finalized)throw Error('MarbleNet needs reset before reuse after close/flush');
      if(!(packet instanceof Float32Array))throw Error('Expected 16kHz mono Float32Array');
      if(used+packet.length>pcm.length){let length=pcm.length;while(length<used+packet.length)length*=2;const next=new Float32Array(length);next.set(pcm.subarray(0,used));pcm=next;}
      pcm.set(packet,used);front?.append(packet,used);used+=packet.length;
      if(options.final){finalized=true;return drain(true);}return drain(false);
    },
    async flush(){if(closed)throw Error('MarbleNet is closed');if(finalized)return[];finalized=true;return drain(true);},
    async close(){if(closed)return;closed=true;await session.release();front?.close();selectParams?.destroy();if(ownedDevice)device.destroy();pcm=new Float32Array(0);}
  };
}

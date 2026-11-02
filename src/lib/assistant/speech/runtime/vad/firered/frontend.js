// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from llm-sds-01; continuous-sources.json preserves source provenance.
// Matching Kaldi-style streaming fbank frontend, implemented for this experiment.
// Semantics: FireRed audio_feat.py; FunASR frontend.py; kaldi-native-fbank.
// This is a local browser implementation, not an upstream browser release.
const SR=16000, LENGTH=400, SHIFT=160, FFT=512, MEL=80, BINS=256, CAP=256;
const f32=Math.fround;
const mel=hz=>f32(1127*Math.log(f32(1+f32(hz/700))));

function constants(windowType){
  const window=Float32Array.from({length:LENGTH},(_,i)=>windowType==='hamming'?.54-.46*Math.cos(2*Math.PI*i/(LENGTH-1)):Math.pow(.5-.5*Math.cos(2*Math.PI*i/(LENGTH-1)),.85));
  const weights=new Float32Array(MEL*BINS),low=mel(20),delta=f32(f32(mel(8000)-low)/81);
  for(let m=0;m<MEL;m++){
    const left=f32(low+f32(m*delta)),center=f32(low+f32((m+1)*delta)),right=f32(low+f32((m+2)*delta));
    for(let k=0;k<BINS;k++){const v=mel(16000/FFT*k);if(v>left&&v<right)weights[m*BINS+k]=v<=center?f32(f32(v-left)/f32(center-left)):f32(f32(right-v)/f32(right-center));}
  }
  const cosine=Float32Array.from({length:FFT},(_,i)=>Math.cos(2*Math.PI*i/FFT));
  const sine=Float32Array.from({length:FFT},(_,i)=>Math.sin(2*Math.PI*i/FFT));
  return{window,weights,cosine,sine};
}

function powerSpectrum(raw,offset,window){
  const real=new Float32Array(FFT),imag=new Float32Array(FFT);let mean=0;
  for(let i=0;i<LENGTH;i++)mean=f32(mean+f32(raw[offset+i]*32768));mean=f32(mean/LENGTH);
  let previous=f32(f32(raw[offset]*32768)-mean);
  for(let i=0;i<LENGTH;i++){const value=f32(f32(raw[offset+i]*32768)-mean);real[i]=f32(f32(value-f32(.97*previous))*window[i]);previous=value;}
  for(let i=1,j=0;i<FFT;i++){let bit=FFT>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];}}
  for(let len=2;len<=FFT;len*=2){const angle=-2*Math.PI/len,cr=Math.cos(angle),ci=Math.sin(angle);for(let base=0;base<FFT;base+=len){let wr=1,wi=0;for(let i=0;i<len/2;i++){
    const a=base+i,b=a+len/2,tr=wr*real[b]-wi*imag[b],ti=wr*imag[b]+wi*real[b],ar=real[a],ai=imag[a];real[b]=ar-tr;imag[b]=ai-ti;real[a]=ar+tr;imag[a]=ai+ti;const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;
  }}}
  return Float32Array.from({length:BINS},(_,i)=>f32(f32(real[i]*real[i])+f32(imag[i]*imag[i])));
}

export function parseFireRedCmvn(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);let start=-1;
  for(let i=0;i<bytes.length-5;i++)if(bytes[i]===0&&bytes[i+1]===66){start=i+2;break;}
  if(start<0)throw Error('FireRed CMVN requires a Kaldi binary matrix');
  const type=String.fromCharCode(bytes[start],bytes[start+1]);let p=start+3;
  if(bytes[p++]!==4)throw Error('Invalid Kaldi matrix row marker');const rows=view.getInt32(p,true);p+=4;
  if(bytes[p++]!==4)throw Error('Invalid Kaldi matrix column marker');const cols=view.getInt32(p,true);p+=4;
  if(rows!==2||cols!==81||!['DM','FM'].includes(type))throw Error('Unexpected FireRed CMVN shape/type');
  const read=index=>type==='DM'?view.getFloat64(p+index*8,true):view.getFloat32(p+index*4,true),count=read(80);
  if(count<1)throw Error('Invalid FireRed CMVN count');
  const shift=new Float32Array(80),scale=new Float32Array(80);
  for(let i=0;i<80;i++){const mean=read(i)/count;shift[i]=-mean;scale[i]=1/Math.sqrt(Math.max(1e-20,read(81+i)/count-mean*mean));}
  return{shift,scale};
}

export function parseFsmnCmvn(text){
  function vector(tag){const line=text.slice(text.indexOf(tag)).split('\n').find(s=>s.includes('<LearnRateCoef>'));if(!line)throw Error('Missing FSMN '+tag);const numbers=line.slice(line.indexOf('[')+1,line.lastIndexOf(']')).trim().split(/\s+/).map(Number);if(numbers.length!==400||numbers.some(x=>!Number.isFinite(x)))throw Error('Invalid FSMN CMVN vector');return Float32Array.from(numbers);}
  return{shift:vector('<AddShift>'),scale:vector('<Rescale>')};
}

const U='struct Params { frames:u32, oldTotal:u32, historyCount:u32, outputs:u32, outputStart:u32, total:u32, dim:u32, historyOut:u32 };';
export async function createFrontend({backend,device,ort,windowType='povey',lfr=1,cmvn}){
  if(![1,5].includes(lfr))throw Error('Unsupported LFR width');
  const dim=MEL*lfr,c=constants(windowType),buffers=[],pipelines={},info={sample_rate:SR,frame_samples:LENGTH,hop_samples:SHIFT,fft:FFT,mel_bins:MEL,window:windowType,lfr,frontend_backend:backend==='gpu'?'WebGPU':'JavaScript CPU',dither:0,preemphasis:.97,snip_edges:true,additional_right_context_frames:(lfr-1)/2,pcm_scale:32768};
  let tail=new Float32Array(0),oldTotal=0,nextOutput=0,history=[],historyCount=0,histA,histB;
  const gpu=backend==='gpu';
  function make(label,elements,usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC){const b=device.createBuffer({label:'vad-fbank/'+label,size:Math.max(16,Math.ceil(elements*4/16)*16),usage});buffers.push(b);return b;}
  let rawBuffer,windowBuffer,powerBuffer,melBuffer,featureBuffer,uniform,windowWeights,melWeights,trigBuffer,cmvnBuffer;
  if(gpu){
    if(!device)throw Error('GPU frontend requires shared ORT GPUDevice');
    rawBuffer=make('pcm',CAP*SHIFT+LENGTH);windowBuffer=make('window',CAP*FFT);powerBuffer=make('power',CAP*BINS);melBuffer=make('mel',CAP*MEL);featureBuffer=make('features',CAP*dim);histA=make('history-a',4*MEL);histB=make('history-b',4*MEL);uniform=make('params',8,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);windowWeights=make('window-weights',LENGTH);melWeights=make('mel-weights',c.weights.length);trigBuffer=make('cos-sin',FFT*2);cmvnBuffer=make('cmvn',dim*2);
    device.queue.writeBuffer(windowWeights,0,c.window);device.queue.writeBuffer(melWeights,0,c.weights);const trig=new Float32Array(FFT*2);trig.set(c.cosine);trig.set(c.sine,FFT);device.queue.writeBuffer(trigBuffer,0,trig);const norm=new Float32Array(dim*2);norm.set(cmvn.shift);norm.set(cmvn.scale,dim);device.queue.writeBuffer(cmvnBuffer,0,norm);
    const shaders={
      window:`${U}
@group(0) @binding(0) var<storage,read> pcm:array<f32>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read_write> out:array<f32>;
@group(0) @binding(3) var<uniform> p:Params;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){let f=gid.x;if(f>=p.frames){return;}let off=f*160u;var mean=0.0;for(var n=0u;n<400u;n++){mean+=pcm[off+n]*32768.0;}mean/=400.0;var previous=pcm[off]*32768.0-mean;for(var n=0u;n<512u;n++){var value=0.0;if(n<400u){let current=pcm[off+n]*32768.0-mean;value=(current-0.97*previous)*weights[n];previous=current;}out[f*512u+n]=value;}}`,
      power:`${U}
@group(0) @binding(0) var<storage,read> wave:array<f32>;
@group(0) @binding(1) var<storage,read> trig:array<f32>;
@group(0) @binding(2) var<storage,read_write> power:array<f32>;
@group(0) @binding(3) var<uniform> p:Params;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){let i=gid.x;if(i>=p.frames*256u){return;}let f=i/256u;let k=i%256u;var re=0.0;var im=0.0;for(var n=0u;n<400u;n++){let phase=(n*k)%512u;let value=wave[f*512u+n];re+=value*trig[phase];im-=value*trig[512u+phase];}power[i]=re*re+im*im;}`,
      mel:`${U}
@group(0) @binding(0) var<storage,read> power:array<f32>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read_write> mel:array<f32>;
@group(0) @binding(3) var<uniform> p:Params;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){let i=gid.x;if(i>=p.frames*80u){return;}let f=i/80u;let m=i%80u;var energy=0.0;for(var k=0u;k<256u;k++){energy+=power[f*256u+k]*weights[m*256u+k];}mel[i]=log(max(energy,0.00000011920928955078125));}`,
      splice:`${U}
@group(0) @binding(0) var<storage,read> mel:array<f32>;
@group(0) @binding(1) var<storage,read> history:array<f32>;
@group(0) @binding(2) var<storage,read> cmvn:array<f32>;
@group(0) @binding(3) var<storage,read_write> out:array<f32>;
@group(0) @binding(4) var<uniform> p:Params;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){let i=gid.x;if(i>=p.outputs*p.dim){return;}let row=i/p.dim;let d=i%p.dim;let m=d%80u;let global=clamp(i32(p.outputStart+row+d/80u)-${(lfr-1)/2},0,i32(p.total)-1);var value=0.0;if(u32(global)<p.oldTotal){value=history[(u32(global)-(p.oldTotal-p.historyCount))*80u+m];}else{value=mel[(u32(global)-p.oldTotal)*80u+m];}out[i]=(value+cmvn[d])*cmvn[p.dim+d];}`,
      history:`${U}
@group(0) @binding(0) var<storage,read> mel:array<f32>;
@group(0) @binding(1) var<storage,read> previous:array<f32>;
@group(0) @binding(2) var<storage,read_write> next:array<f32>;
@group(0) @binding(3) var<uniform> p:Params;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){let i=gid.x;if(i>=p.historyOut*80u){return;}let frame=p.total-p.historyOut+i/80u;let m=i%80u;if(frame<p.oldTotal){next[i]=previous[(frame-(p.oldTotal-p.historyCount))*80u+m];}else{next[i]=mel[(frame-p.oldTotal)*80u+m];}}`
    };
    for(const [name,code] of Object.entries(shaders)){const module=device.createShaderModule({label:'vad-fbank/'+name,code});const errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');if(errors.length)throw Error(name+' shader: '+errors.map(m=>m.message).join('; '));pipelines[name]=await device.createComputePipelineAsync({label:'vad-fbank/'+name,layout:'auto',compute:{module,entryPoint:'main'}});}
  }
  function reset(){tail=new Float32Array(0);oldTotal=0;nextOutput=0;history=[];historyCount=0;if(gpu){device.queue.writeBuffer(histA,0,new Float32Array(320));device.queue.writeBuffer(histB,0,new Float32Array(320));}}
  function process(packet,{final=false}={}){
    const raw=new Float32Array(tail.length+packet.length);raw.set(tail);raw.set(packet,tail.length);
    const frames=Math.max(0,Math.floor((raw.length-LENGTH)/SHIFT)+1);if(frames>CAP)throw Error('VAD frontend packet exceeds256frames');
    tail=raw.slice(frames*SHIFT);
    const total=oldTotal+frames,right=(lfr-1)/2,end=final?total:Math.max(0,total-right),outputs=Math.max(0,end-nextOutput),outputStart=nextOutput;
    if(frames===0&&outputs===0)return{frames:0,startFrame:outputStart,tensor:null};
    if(gpu){
      device.queue.writeBuffer(rawBuffer,0,raw);device.queue.writeBuffer(uniform,0,Uint32Array.of(frames,oldTotal,historyCount,outputs,outputStart,total,dim,Math.min(4,total)));
      const encoder=device.createCommandEncoder();
      function run(name,bindings,count){if(!count)return;const pipeline=pipelines[name],group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:bindings.map((buffer,binding)=>({binding,resource:{buffer}}))});const pass=encoder.beginComputePass({label:'vad-fbank/'+name});pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();}
      run('window',[rawBuffer,windowWeights,windowBuffer,uniform],frames);run('power',[windowBuffer,trigBuffer,powerBuffer,uniform],frames*BINS);run('mel',[powerBuffer,melWeights,melBuffer,uniform],frames*MEL);run('splice',[melBuffer,histA,cmvnBuffer,featureBuffer,uniform],outputs*dim);run('history',[melBuffer,histA,histB,uniform],Math.min(4,total)*MEL);device.queue.submit([encoder.finish()]);[histA,histB]=[histB,histA];historyCount=Math.min(4,total);oldTotal=total;nextOutput=end;
      return{frames:outputs,startFrame:outputStart,tensor:outputs?ort.Tensor.fromGpuBuffer(featureBuffer,{dataType:'float32',dims:[1,outputs,dim]}):null};
    }
    const newMel=[];
    for(let f=0;f<frames;f++){const power=powerSpectrum(raw,f*SHIFT,c.window),feature=new Float32Array(MEL);for(let m=0;m<MEL;m++){let sum=0;for(let k=0;k<BINS;k++)sum=f32(sum+f32(power[k]*c.weights[m*BINS+k]));feature[m]=Math.log(Math.max(sum,1.1920928955078125e-7));}newMel.push(feature);}
    const get=frame=>frame<oldTotal?history[frame-(oldTotal-history.length)]:newMel[frame-oldTotal];
    const data=new Float32Array(outputs*dim);
    for(let r=0;r<outputs;r++)for(let j=0;j<lfr;j++){const feature=get(Math.max(0,Math.min(total-1,outputStart+r+j-right)));for(let m=0;m<MEL;m++){const d=j*MEL+m;data[r*dim+d]=f32(f32(feature[m]+cmvn.shift[d])*cmvn.scale[d]);}}
    history=[...history,...newMel].slice(-4);historyCount=history.length;oldTotal=total;nextOutput=end;
    return{frames:outputs,startFrame:outputStart,tensor:outputs?new ort.Tensor('float32',data,[1,outputs,dim]):null};
  }
  return{reset,process,info,close(){for(const buffer of buffers)buffer.destroy();}};
}

export async function verifiedBytes(url,expected){
  if(typeof url!=='string'||!/^https:|^blob:/.test(url))throw Error('An explicit HTTPS/blob model asset is required');
  const response=await fetch(url);if(!response.ok)throw Error('VAD asset HTTP '+response.status);const data=await response.arrayBuffer();
  const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(actual!==expected)throw Error('VAD asset SHA256 mismatch');return data;
}

export async function validateNativeFrontend(frontend,{backend,device,reference,referenceSha256}){
  if(!reference||!referenceSha256)throw Error('Native Kaldi frontend calibration URL and SHA256 are required');
  const golden=JSON.parse(new TextDecoder().decode(await verifiedBytes(reference,referenceSha256))),expected=Float32Array.from(golden.normalized.flat());
  const pcm=Float32Array.from({length:4800},(_,i)=>((i*73+i*i*19)%4096-2048)/32768),observed=[];
  frontend.reset();
  for(const [packet,final] of [[pcm.subarray(0,4000),false],[pcm.subarray(4000),false],[new Float32Array(0),true]]){
    const result=frontend.process(packet,{final});if(!result.frames)continue;
    if(backend==='gpu'){
      const bytes=result.frames*frontend.info.mel_bins*frontend.info.lfr*4;
      const buffer=device.createBuffer({label:'vad/untimed-frontend-calibration',size:bytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(result.tensor.gpuBuffer,0,buffer,0,bytes);device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);observed.push(...new Float32Array(buffer.getMappedRange()).slice());buffer.unmap();buffer.destroy();
    }else observed.push(...result.tensor.data);
    result.tensor.dispose?.();
  }
  frontend.reset();if(observed.length!==expected.length)throw Error('Native frontend calibration frame count mismatch');
  let maxAbs=0,sumSquares=0;for(let i=0;i<expected.length;i++){const delta=Math.abs(observed[i]-expected[i]);maxAbs=Math.max(maxAbs,delta);sumSquares+=delta*delta;}
  const rmse=Math.sqrt(sumSquares/expected.length),tolerance={max_abs:.01,rmse:.001},passed=Number.isFinite(maxAbs)&&maxAbs<=tolerance.max_abs&&rmse<=tolerance.rmse;
  const result={passed,elements:observed.length,frames:golden.frames,max_abs:maxAbs,rmse,tolerance,native_fbank_version:golden.kaldi_native_fbank_version,native_numpy_version:golden.numpy_version,reference_sha256:referenceSha256,generator_sha256:golden.generator_sha256,scope:'Untimed deterministic PCM->all native normalized feature values; validation GPU readback excluded from timed processing'};
  if(!passed)throw Error('Native frontend calibration failed: '+JSON.stringify(result));return result;
}

export function sessionOptions({backend,device,ort,outputs,audit=false,allowCpuShapeFallback=false}){
  if(backend==='gpu')ort.env.webgpu.device=device;
  return{executionProviders:backend==='gpu'?['webgpu']:['wasm'],graphOptimizationLevel:'all',logSeverityLevel:audit?0:2,logVerbosityLevel:audit?1:0,enableProfiling:false,...(backend==='gpu'?{preferredOutputLocation:Object.fromEntries(outputs.map(name=>[name,'gpu-buffer'])),extra:{session:{disable_cpu_ep_fallback:allowCpuShapeFallback?'0':'1'}}}:{})};
}

// Copy only a scalar speech probability per frame; model state stays on GPU.
// FSMN's trained head returns248 post-softmax classes; class0 is silence.
export async function createProbabilityReader(device,{classes=1}={}){
  const size=CAP*4,output=device.createBuffer({label:'vad/probability-reduction',size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),readback=device.createBuffer({label:'vad/probability-readback',size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),uniform=device.createBuffer({label:'vad/probability-params',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const code=`struct Params {frames:u32,a:u32,b:u32,c:u32}; @group(0) @binding(0) var<storage,read> input:array<f32>; @group(0) @binding(1) var<storage,read_write> output:array<f32>; @group(0) @binding(2) var<uniform> p:Params; @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){let i=gid.x;if(i<p.frames){output[i]=${classes===1?'input[i]':`clamp(1.0-input[i*${classes}u],0.0,1.0)`};}}`;
  const module=device.createShaderModule({label:'vad/probability-reduction',code}),errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');if(errors.length)throw Error('Probability shader: '+errors[0].message);
  const pipeline=await device.createComputePipelineAsync({label:'vad/probability-reduction',layout:'auto',compute:{module,entryPoint:'main'}});
  return{async read(tensor,frames){
    if(tensor.location!=='gpu-buffer')throw Error('Requested GPU model output fell back to '+tensor.location);
    if(frames>CAP)throw Error('Probability output exceeds frontend capacity');
    device.queue.writeBuffer(uniform,0,Uint32Array.of(frames,0,0,0));const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:tensor.gpuBuffer}},{binding:1,resource:{buffer:output}},{binding:2,resource:{buffer:uniform}}]}));pass.dispatchWorkgroups(Math.ceil(frames/64));pass.end();encoder.copyBufferToBuffer(output,0,readback,0,frames*4);device.queue.submit([encoder.finish()]);await readback.mapAsync(GPUMapMode.READ,0,frames*4);const result=new Float32Array(readback.getMappedRange(0,frames*4)).slice();readback.unmap();return result;
  },close(){output.destroy();readback.destroy();uniform.destroy();}};
}

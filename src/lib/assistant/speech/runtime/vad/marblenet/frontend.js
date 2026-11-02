// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from llm-sds-01; continuous-sources.json preserves source provenance.
// NeMo eval frontend using the checkpoint's original Hann and mel buffers.
export function cpuFeatures(pcm, first, frames, window, mel) {
  const valid = Math.floor(pcm.length / 160) + 1;
  const result = new Float32Array(80 * frames);
  const re = new Float32Array(512), im = new Float32Array(512);
  const power = new Float32Array(257);
  const reflect = index => {
    while (index < 0 || index >= pcm.length) index = index < 0 ? -index : 2 * pcm.length - 2 - index;
    return index;
  };
  for (let t = 0; t < frames; t++) {
    const absolute = first + t;
    if (absolute >= valid) continue;
    re.fill(0); im.fill(0);
    for (let k = 56; k < 456; k++) {
      const index = reflect(absolute * 160 + k - 256);
      const sample = pcm[index] - (index ? .97 * pcm[index - 1] : 0);
      re[k] = sample * window[k - 56];
    }
    for (let i = 1, j = 0; i < 512; i++) {
      let bit = 256;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const x = re[i]; re[i] = re[j]; re[j] = x; }
    }
    for (let size = 2; size <= 512; size <<= 1) {
      const half = size >> 1;
      for (let block = 0; block < 512; block += size) {
        for (let j = 0; j < half; j++) {
          const a = block + j, b = a + half, angle = -2 * Math.PI * j / size;
          const real = re[b] * Math.cos(angle) - im[b] * Math.sin(angle);
          const imaginary = re[b] * Math.sin(angle) + im[b] * Math.cos(angle);
          const ar = re[a], ai = im[a];
          re[a] = ar + real; im[a] = ai + imaginary;
          re[b] = ar - real; im[b] = ai - imaginary;
        }
      }
    }
    for (let k = 0; k < 257; k++) { const magnitude = Math.sqrt(re[k] ** 2 + im[k] ** 2); power[k] = magnitude * magnitude; }
    for (let m = 0; m < 80; m++) {
      let sum = 0;
      for (let k = 0; k < 257; k++) sum += mel[m * 257 + k] * power[k];
      result[m * frames + t] = Math.log(sum + 2 ** -24);
    }
  }
  return result;
}

const FFT_SHADER = `
struct Params { n:u32, first:u32, frames:u32, valid:u32 }
@group(0) @binding(0) var<storage,read> pcm:array<f32>;
@group(0) @binding(1) var<storage,read> window:array<f32>;
@group(0) @binding(2) var<uniform> params:Params;
@group(0) @binding(3) var<storage,read_write> power:array<f32>;
var<workgroup> scratch:array<vec2<f32>,512>;
fn reflected(index:i32)->u32 {
  var i=index;
  let n=i32(params.n);
  loop {
    if(i>=0 && i<n){break;}
    if(i<0){i=-i;}else{i=2*n-2-i;}
  }
  return u32(i);
}
fn sample(k:u32,frame:u32)->f32 {
  if(k<56u || k>=456u){return 0.;}
  let i=reflected(i32(frame*160u+k)-256);
  var value=pcm[i];
  if(i>0u){value=value-0.97*pcm[i-1u];}
  return value*window[k-56u];
}
@compute @workgroup_size(256) fn main(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_id) local:vec3<u32>){
  let t=group.x;
  let k=local.x;
  if(params.first+t>=params.valid){
    power[t*257u+k]=0.;
    if(k==0u){power[t*257u+256u]=0.;}
    return;
  }
  scratch[reverseBits(k)>>23u]=vec2<f32>(sample(k,params.first+t),0.);
  scratch[reverseBits(k+256u)>>23u]=vec2<f32>(sample(k+256u,params.first+t),0.);
  workgroupBarrier();
  for(var size=2u;size<=512u;size=size*2u){
    let half=size/2u;
    let j=k%half;
    let a=(k/half)*size+j;
    let b=a+half;
    let angle=-6.283185307179586*f32(j)/f32(size);
    let twiddle=vec2<f32>(cos(angle),sin(angle));
    let right=scratch[b];
    let rotated=vec2<f32>(right.x*twiddle.x-right.y*twiddle.y,right.x*twiddle.y+right.y*twiddle.x);
    let left=scratch[a];
    scratch[a]=left+rotated;
    scratch[b]=left-rotated;
    workgroupBarrier();
  }
  let value=scratch[k];
  let magnitude=sqrt(dot(value,value));
  power[t*257u+k]=magnitude*magnitude;
  if(k==0u){let nyquist=scratch[256];let mag=sqrt(dot(nyquist,nyquist));power[t*257u+256u]=mag*mag;}
}`;

const MEL_SHADER = `
struct Params { n:u32, first:u32, frames:u32, valid:u32 }
@group(0) @binding(0) var<storage,read> power:array<f32>;
@group(0) @binding(1) var<storage,read> mel:array<f32>;
@group(0) @binding(2) var<uniform> params:Params;
@group(0) @binding(3) var<storage,read_write> features:array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){
  let index=id.x;
  if(index>=80u*params.frames){return;}
  let m=index/params.frames;let t=index%params.frames;
  if(params.first+t>=params.valid){features[index]=0.;return;}
  var energy=0.;
  for(var k=0u;k<257u;k++){energy=energy+mel[m*257u+k]*power[t*257u+k];}
  features[index]=log(energy+0.000000059604644775390625);
}`;

export async function gpuFrontend(device, window, mel) {
  const buffer = (label, bytes, usage) => device.createBuffer({label, size: Math.max(16, Math.ceil(bytes / 16) * 16), usage});
  const coeffUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const windowBuffer = buffer('marblenet original Hann', window.byteLength, coeffUsage);
  const melBuffer = buffer('marblenet original mel', mel.byteLength, coeffUsage);
  device.queue.writeBuffer(windowBuffer, 0, window); device.queue.writeBuffer(melBuffer, 0, mel);
  const fft = await device.createComputePipelineAsync({label:'marblenet FP32 FFT512',layout:'auto',compute:{module:device.createShaderModule({code:FFT_SHADER}),entryPoint:'main'}});
  const filter = await device.createComputePipelineAsync({label:'marblenet FP32 mel-log',layout:'auto',compute:{module:device.createShaderModule({code:MEL_SHADER}),entryPoint:'main'}});
  let pcmBuffer = buffer('marblenet resident PCM', 65536 * 4, coeffUsage | GPUBufferUsage.COPY_SRC), capacity=65536;
  const params = buffer('marblenet frontend params', 16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  return {
    append(packet, offset) {
      if (offset + packet.length > capacity) {
        while (capacity < offset + packet.length) capacity *= 2;
        const next = buffer('marblenet resident PCM grown', capacity * 4, coeffUsage | GPUBufferUsage.COPY_SRC);
        const command = device.createCommandEncoder(); command.copyBufferToBuffer(pcmBuffer, 0, next, 0, offset * 4); device.queue.submit([command.finish()]); pcmBuffer.destroy(); pcmBuffer=next;
      }
      if (packet.length) device.queue.writeBuffer(pcmBuffer, offset * 4, packet);
    },
    compute(total, first, frames) {
      const valid = Math.floor(total / 160) + 1;
      device.queue.writeBuffer(params, 0, new Uint32Array([total, first, frames, valid]));
      const power = buffer('marblenet FP32 power', frames * 257 * 4, GPUBufferUsage.STORAGE);
      const features = buffer('marblenet FP32 features', 80 * frames * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const encoder = device.createCommandEncoder();
      for (const [pipeline, buffers, groups] of [[fft,[pcmBuffer,windowBuffer,params,power],frames],[filter,[power,melBuffer,params,features],Math.ceil(80*frames/64)]]) {
        const bind = device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:buffers.map((item,binding)=>({binding,resource:{buffer:item}}))});
        const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(groups);pass.end();
      }
      device.queue.submit([encoder.finish()]);
      return {buffer:features, dispose:()=>{features.destroy();power.destroy();}};
    },
    close(){pcmBuffer.destroy();params.destroy();windowBuffer.destroy();melBuffer.destroy();}
  };
}

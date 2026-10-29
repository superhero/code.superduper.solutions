import {tensor} from './ort-common.mjs';
// Publisher Qwen2VL-compatible block-major patch layout; fixed native-size
// fixture avoids introducing browser/PIL resampling differences.
export function imagePatches(ort, imageData, config, nextFrame = imageData) {
  const {width:w, height:h, data} = imageData;
  const p = config.patch_size, m = config.merge_size, t = config.temporal_patch_size;
  if (w % (p*m) || h % (p*m) || w*h < config.size.shortest_edge || w*h > config.size.longest_edge)
    throw Error('Use a native fixture within publisher pixel bounds, dimensions divisible by patch*merge');
  const gh=h/p,gw=w/p,patchDim=3*t*p*p,out=new Float32Array(gh*gw*patchDim); let n=0;
  for(let bh=0;bh<gh/m;bh++) for(let bw=0;bw<gw/m;bw++)
    for(let mh=0;mh<m;mh++) for(let mw=0;mw<m;mw++)
      for(let c=0;c<3;c++) for(let frame=0;frame<t;frame++)
        for(let y=0;y<p;y++) for(let x=0;x<p;x++) {
          const index=(((bh*m+mh)*p+y)*w+(bw*m+mw)*p+x)*4+c;
          out[n++]=((frame === 0 ? data : nextFrame.data)[index]*config.rescale_factor-config.image_mean[c])/config.image_std[c];
        }
  return tensor(ort,'float32',out,[gh/m,gw/m,m,m,patchDim]);
}
const hzToMel = hz => hz<1000?hz/(200/3):15+Math.log(hz/1000)/(Math.log(6.4)/27);
const melToHz = mel => mel<15?mel*(200/3):1000*Math.exp((mel-15)*(Math.log(6.4)/27));
export function logMel(ort, samples, cfg) {
  const n=cfg.n_fft,hop=cfg.hop_length,bins=n/2+1,mels=cfg.feature_size;
  const frames=Math.max(1,1+Math.ceil(Math.max(0,samples.length-n)/hop));
  const edges=Array.from({length:mels+2},(_,i)=>melToHz(i*hzToMel(cfg.sampling_rate/2)/(mels+1)));
  const filters=Array.from({length:mels},(_,m)=>Float64Array.from({length:bins},(_,k)=> {
    const f=k*cfg.sampling_rate/n;
    return Math.max(0,Math.min((f-edges[m])/(edges[m+1]-edges[m]),(edges[m+2]-f)/(edges[m+2]-edges[m+1])))*2/(edges[m+2]-edges[m]);
  }));
  const cos=[],sin=[];
  for(let k=0;k<bins;k++){ cos[k]=Float64Array.from({length:n},(_,j)=>Math.cos(2*Math.PI*k*j/n)); sin[k]=Float64Array.from({length:n},(_,j)=>Math.sin(2*Math.PI*k*j/n)); }
  const window=Float32Array.from({length:n},(_,i)=>i>=(n-cfg.win_length)/2&&i<(n+cfg.win_length)/2?0.5-0.5*Math.cos(2*Math.PI*(i-(n-cfg.win_length)/2)/cfg.win_length):0);
  const out=new Float32Array(mels*frames),power=new Float64Array(bins);
  for(let f=0;f<frames;f++) {
    for(let k=0;k<bins;k++) { let re=0,im=0; for(let j=0;j<n;j++) { const v=(samples[f*hop+j]||0)*window[j]; re+=v*cos[k][j]; im-=v*sin[k][j]; } power[k]=re*re+im*im; }
    for(let m=0;m<mels;m++) { let energy=0; for(let k=0;k<bins;k++)energy+=power[k]*filters[m][k]; out[m*frames+f]=(Math.max(cfg.log_floor,Math.log10(energy))+cfg.normalization_offset)/cfg.normalization_divisor; }
  }
  return tensor(ort,'float32',out,[1,mels,frames]);
}
export async function readWave(url) {
  const context=new OfflineAudioContext(1,16000,16000);
  const buffer=await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
  if(buffer.sampleRate!==16000)throw Error('Audio fixture must decode at 16kHz');
  const mono=new Float32Array(buffer.length);
  for(let c=0;c<buffer.numberOfChannels;c++)for(let i=0;i<mono.length;i++)mono[i]+=buffer.getChannelData(c)[i]/buffer.numberOfChannels;
  return mono;
}

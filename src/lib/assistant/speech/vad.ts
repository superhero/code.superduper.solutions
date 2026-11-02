// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import pins from './continuous-assets.json';
import notices from './vad-notices.json';
import type {SpeechArtifact} from './types';
export type VadMode='ten'|'firered'|'fsmn'|'marblenet';
export const vadModes: {id:VadMode;label:string;detail:string}[]=[
 {id:'ten',label:'TEN · CPU',detail:'Known Wasm control · 16 ms frames · CPU speech detection.'},
 {id:'firered',label:'FireRed Stream · GPU',detail:'Original FP32 graph and GPU frontend. Raw detector F1 84.63% on the reference corpus; publisher endpoint smoothing is not applied.'},
 {id:'fsmn',label:'FSMN · GPU (experimental)',detail:'Original FP32 graph and GPU frontend. Raw detector F1 95.85%; publisher endpoint/SNR processing is still required before making it the default.'},
 {id:'marblenet',label:'MarbleNet · GPU',detail:'Exact official weights in a local FP32 export. Raw detector F1 97.87%; about 1.45 seconds of future audio context adds detection delay.'},
];
export function vadArtifacts(mode:VadMode):SpeechArtifact[]{return mode==='ten'?[]:[...pins.vad[mode].map(({id,url,bytes,sha256,type})=>({id:'vad-'+mode+'-'+id,url,bytes,sha256,type})),...notices[mode]];}
export function vadAssetURLs(mode:VadMode,urls:Record<string,string>):Record<string,string>{
 if(mode==='ten')return{module:urls['ten-js']!,wasm:urls['ten-wasm']!};
 const files=pins.vad[mode],result:Record<string,string>={};
 for(const file of files){result[file.key]=urls['vad-'+mode+'-'+file.id]!;if(file.key==='frontendReference')result.frontendReferenceSha256=file.sha256;}
 return result;
}

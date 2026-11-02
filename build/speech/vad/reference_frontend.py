#!/usr/bin/env python3
"""sds-01-only native Kaldi-fbank reference; no trained model inference.

Requires numpy and kaldi-native-fbank in the caller's pinned preparation image.
Save only beside remotely cached model assets; share its JSON URL with browser.
"""
import hashlib,json,os,re,struct,importlib.metadata
from pathlib import Path
import numpy as np
import kaldi_native_fbank as knf

if os.uname().nodename != 'sds-01' and os.environ.get('VERIFIED_TEST_HOST') != 'sds-01':
    raise SystemExit('Only run in the pinned sds-01 preparation container')
root=Path(os.environ.get('VAD_ASSET_ROOT','/home/erik/llm-sds-01/brave-speech-gpu/weights/vad'))
pcm=np.asarray([((i*73+i*i*19)%4096-2048)/32768 for i in range(4800)],dtype=np.float32)
for family,rev,window,lfr in [('firered','c30ec49e8cc69642b0ee65362eba11b9d11c6e54','povey',1),('fsmn','f6e9fbb4cefa7397216c763f21307993f147f585','hamming',5)]:
    p=root/family/rev
    opts=knf.FbankOptions();opts.frame_opts.samp_freq=16000;opts.frame_opts.frame_length_ms=25;opts.frame_opts.frame_shift_ms=10;opts.frame_opts.dither=0;opts.frame_opts.snip_edges=True;opts.frame_opts.window_type=window;opts.mel_opts.num_bins=80;opts.energy_floor=0
    extractor=knf.OnlineFbank(opts);extractor.accept_waveform(16000,(pcm*32768).tolist());features=np.asarray([extractor.get_frame(i) for i in range(extractor.num_frames_ready)],dtype=np.float32)
    if family=='firered':
        b=(p/'cmvn.ark').read_bytes();start=b.index(b'\x00BDM ')+5;assert b[start]==4;rows=struct.unpack_from('<i',b,start+1)[0];start+=5;assert b[start]==4;cols=struct.unpack_from('<i',b,start+1)[0];start+=5;assert rows==2 and cols==81
        stats=np.frombuffer(b,dtype='<f8',offset=start).reshape(rows,cols);count=stats[0,-1];mean=stats[0,:-1]/count;scale=1/np.sqrt(np.maximum(1e-20,stats[1,:-1]/count-mean*mean));shift=-mean
    else:
        text=(p/'vad.mvn').read_text();shift=np.asarray([float(v) for v in re.search(r'<AddShift>.*?\[([^]]+)\]',text,re.S).group(1).split()]);scale=np.asarray([float(v) for v in re.search(r'<Rescale>.*?\[([^]]+)\]',text,re.S).group(1).split()])
    padded=np.concatenate([np.repeat(features[:1],(lfr-1)//2,axis=0),features,np.repeat(features[-1:],(lfr-1)//2,axis=0)],axis=0)
    stacked=np.asarray([padded[i:i+lfr].reshape(-1) for i in range(len(features))],dtype=np.float32)
    normalized=((stacked+shift)*scale).astype(np.float32)
    out={'generator':'kaldi-native-fbank official native reference, no model inference','generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'kaldi_native_fbank_version':importlib.metadata.version('kaldi-native-fbank'),'numpy_version':np.__version__,'fixture':'4800 samples; Float32(((i*73+i*i*19)%4096-2048)/32768)','sample_rate':16000,'window':window,'lfr':lfr,'frames':len(features),'raw_mel':features.tolist(),'normalized':normalized.tolist(),'pcm_sha256':hashlib.sha256(pcm.tobytes()).hexdigest()}
    dest=p/'frontend-reference.json';dest.write_text(json.dumps(out,separators=(',',':'))+'\n');print(json.dumps({'family':family,'path':str(dest),'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}))

"""Local FP32 ONNX export from exact publisher tensors, on sds-01 only.

Uses upstream Jasper class bodies with telemetry/adapter hooks disabled, rather
than installing NeMo's training stack. This is a local export, not a publisher
ONNX artifact. Strict state loads and masked/unmasked parity gate publication.
"""
import ast,copy,hashlib,io,json,logging,math,pathlib,subprocess,sys,tarfile,typing,urllib.request
DEPS=pathlib.Path('/work/pydeps')
subprocess.run([sys.executable,'-m','pip','install','--quiet','--no-deps','--target',str(DEPS),'onnx==1.19.1','onnxruntime==1.23.2','ml_dtypes==0.5.3'],check=True)
sys.path.insert(0,str(DEPS))
import numpy as np,onnx,onnxruntime as ort,torch,yaml
from torch import nn
from torch.nn import functional as F
torch.set_num_threads(1)
OUT=pathlib.Path('/out');OUT.mkdir(exist_ok=True)
REV='9d25eb877d9edab5101ccc843edd04787a6c72c4'
SHA='84bda37e925ac6fd740c2ced55642cb79f94f81348e1fa0db992ca50d4b09706'
archive_path=pathlib.Path('/models/model.nemo');assert hashlib.sha256(archive_path.read_bytes()).hexdigest()==SHA
with tarfile.open(archive_path) as archive:
    cfg=yaml.safe_load(archive.extractfile('./model_config.yaml'))
    state=torch.load(io.BytesIO(archive.extractfile('./model_weights.ckpt').read()),map_location='cpu',weights_only=True)

class AdapterHooks:
    def is_adapter_available(self):return False
class AccessHooks:
    def is_access_enabled(self,*args):return False

source_url='https://raw.githubusercontent.com/NVIDIA/NeMo/v2.3.0/nemo/collections/asr/parts/submodules/jasper.py'
source=urllib.request.urlopen(source_url,timeout=30).read();(OUT/'upstream-jasper.py').write_bytes(source)
selected={'compute_new_kernel_size','get_same_padding','get_asymtric_padding','_masked_conv_init_lens','MaskedConv1d','GroupShuffle','SqueezeExcite','JasperBlock'}
tree=ast.parse(source);nodes=[x for x in tree.body if isinstance(x,(ast.FunctionDef,ast.ClassDef)) and x.name in selected]
assert {x.name for x in nodes}==selected
for node in ast.walk(ast.Module(body=nodes,type_ignores=[])):
    if isinstance(node,(ast.FunctionDef,ast.ClassDef)):node.decorator_list=[]
scope={**vars(typing),'torch':torch,'nn':nn,'F':F,'Tensor':torch.Tensor,'math':math,'logging':logging,'AdapterModuleMixin':AdapterHooks,'AccessMixin':AccessHooks,'PYTORCH_QUANTIZATION_AVAILABLE':False,'_single':torch.nn.modules.utils._single}
exec(compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),source_url,'exec'),scope)

class Native(nn.Module):
    def __init__(self,mask):
        super().__init__();self.encoder=nn.Module();blocks=[];features=80
        for layer in cfg['encoder']['jasper']:
            block=scope['JasperBlock'](features,layer['filters'],repeat=layer['repeat'],kernel_size=layer['kernel'],stride=layer['stride'],dilation=layer['dilation'],dropout=layer['dropout'],residual=layer['residual'],separable=layer.get('separable',False),activation=nn.ReLU(),conv_mask=True)
            for module in block.modules():
                if isinstance(module,scope['MaskedConv1d']):module.use_mask=mask
            blocks.append(block);features=layer['filters']
        self.encoder.encoder=nn.Sequential(*blocks)
        self.decoder=nn.Module();self.decoder.layer0=nn.Linear(128,2)
        neural={k:v for k,v in state.items() if k.startswith(('encoder.','decoder.'))}
        self.load_state_dict(neural,strict=True);self.eval()
    def forward(self,features):
        lengths=torch.ones((features.shape[0],),dtype=torch.long)*features.shape[2]
        return self.forward_lengths(features,lengths)
    def forward_lengths(self,features,lengths):
        xs=[features]
        for layer in self.encoder.encoder:xs,lengths=layer((xs,lengths))
        return torch.softmax(self.decoder.layer0(xs[-1].transpose(1,2)),dim=-1)

reference=Native(True);exported=Native(False);torch.manual_seed(27);checks=[]
with torch.no_grad():
    for valid in [25,26,199,200,321,322,401]:
        padded=valid+(valid%2);features=torch.randn(1,80,padded);features[:,:,valid:]=0
        native=reference.forward_lengths(features,torch.tensor([valid]));candidate=exported(features)
        error=float((native-candidate).abs().max());assert error<1e-6,(valid,error)
        checks.append({'valid_feature_frames':valid,'padded_frames':padded,'max_absolute_probability_error':error})

path=OUT/'model.onnx'
with torch.no_grad():
    torch.onnx.export(exported,torch.zeros(1,80,326),str(path),input_names=['features'],output_names=['probabilities'],dynamic_axes={'features':{2:'frames'},'probabilities':{1:'decisions'}},opset_version=17,do_constant_folding=False,dynamo=False)
model=onnx.load(path);onnx.checker.check_model(model)
session=ort.InferenceSession(str(path),providers=['CPUExecutionProvider']);onnx_checks=[]
with torch.no_grad():
    for frames in [26,200,326,402]:
        features=torch.randn(1,80,frames)
        expected=exported(features).numpy();actual=session.run(None,{'features':features.numpy()})[0]
        error=float(np.max(np.abs(expected-actual)));assert error<1e-5,(frames,error)
        onnx_checks.append({'frames':frames,'max_absolute_probability_error':error})

window=state['preprocessor.featurizer.window'].float();fb=state['preprocessor.featurizer.fb'].float()
assert list(window.shape)==[400] and list(fb.shape)==[1,80,257]
window.numpy().astype('<f4').tofile(OUT/'window.bin');fb.numpy().astype('<f4').tofile(OUT/'mel.bin')
def frontend(pcm):
    x=pcm.unsqueeze(0);x=torch.cat([x[:,:1],x[:,1:]-.97*x[:,:-1]],dim=1)
    spectrum=torch.stft(x,n_fft=512,hop_length=160,win_length=400,window=window,center=True,return_complex=True)
    magnitude=torch.sqrt(torch.view_as_real(spectrum).pow(2).sum(-1));power=magnitude.pow(2)
    features=torch.log(torch.matmul(fb,power)+2**-24)
    valid=features.shape[-1]
    if valid%2:features=F.pad(features,(0,1))
    return features,valid
time=torch.arange(64000,dtype=torch.float64)/16000
pcm=(.08*torch.sin(2*math.pi*191*time)+.04*torch.sin(2*math.pi*463*time)).float();pcm[:16000]=0;pcm[48000:]=0
with torch.no_grad():
    features,valid=frontend(pcm);probabilities=reference.forward_lengths(features,torch.tensor([valid]))[0,:,1]
pcm.numpy().astype('<f4').tofile(OUT/'golden-pcm.bin');features.numpy().astype('<f4').tofile(OUT/'golden-features.bin');probabilities.numpy().astype('<f4').tofile(OUT/'golden-probabilities.bin')
front={'sample_rate':16000,'window_size':400,'hop_size':160,'fft_size':512,'mel_bins':80,'preemphasis':.97,'log_guard':2**-24,'normalization':None,'dither_eval':0,'center':True,'pad_mode':'reflect','pad_to':2,'mag_power':2,'right_feature_context':145,'output_feature_stride':2,'frontend_lookahead_samples_conservative':256,'native_receptive_field_feature_frames':291,'source':'NeMo2.3 FilterbankFeatures semantics; exact window/mel checkpoint buffers','golden':{'pcm_samples':64000,'features_shape':list(features.shape),'valid_feature_frames':valid,'probabilities_shape':list(probabilities.shape)}}
(OUT/'frontend.json').write_text(json.dumps(front,indent=2)+'\n')
manifest={'source':{'repo':'nvidia/Frame_VAD_Multilingual_MarbleNet_v2.0','revision':REV,'sha256':SHA,'bytes':archive_path.stat().st_size},'export':'local FP32 ONNX using exact official state tensors and upstream NeMo2.3 Jasper class bodies; disabled adapter/access hooks; no trained-weight conversion','source_code':{'url':source_url,'sha256':hashlib.sha256(source).hexdigest()},'versions':{'torch':torch.__version__,'onnx':onnx.__version__,'onnxruntime':ort.__version__},'masked_unmasked_probability_parity':checks,'torch_onnx_probability_parity':onnx_checks,'parameters':sum(x.numel() for x in exported.parameters()),'ops':dict((op,sum(n.op_type==op for n in model.graph.node)) for op in sorted(set(n.op_type for n in model.graph.node))),'files':{}}
for file in OUT.iterdir():
    if file.is_file() and file.name!='manifest.json':manifest['files'][file.name]={'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest),flush=True)

---
license: apache-2.0
pipeline_tag: voice-activity-detection
tags:
- FunASR
- FSMN-VAD
---

<div align="center">

### ⭐ Powered by [FunASR](https://github.com/modelscope/FunASR) — please give us a GitHub Star!

This model is part of the **FunASR** ecosystem — one industrial-grade open-source toolkit for **ASR · VAD · punctuation · speaker diarization · emotion / event · LLM-ASR**. A Star really helps the project (and keeps you updated):

[**🌟 FunASR**](https://github.com/modelscope/FunASR)  ·  [**🌟 SenseVoice**](https://github.com/FunAudioLLM/SenseVoice)  ·  [**🌟 Fun-ASR**](https://github.com/FunAudioLLM/Fun-ASR)  ·  [**🌟 FunClip**](https://github.com/modelscope/FunClip)

</div>


## Introduce


Voice activity detection (VAD) plays a important role in speech recognition systems by detecting the beginning and end of effective speech. FunASR provides an efficient VAD model based on the [FSMN structure](https://arxiv.org/abs/1803.05030). To improve model discrimination, we use monophones as modeling units, given the relatively rich speech information. During inference, the VAD system requires post-processing for improved robustness, including operations such as threshold settings and sliding windows.

This repository demonstrates how to leverage FSMN-VAD in conjunction with the funasr_onnx runtime. The underlying model is derived from [FunASR](https://github.com/alibaba-damo-academy/FunASR), which was trained on a massive 5,000-hour dataset.

We have relesed numerous industrial-grade models, including speech recognition, voice activity detection, punctuation restoration, speaker verification, speaker diarization, and timestamp prediction (force alignment). To learn more about these models, kindly refer to the [documentation](https://alibaba-damo-academy.github.io/FunASR/en/index.html) available on FunASR. If you are interested in leveraging advanced AI technology for your speech-related projects, we invite you to explore the possibilities offered by [FunASR](https://github.com/alibaba-damo-academy/FunASR).

## Install funasr_onnx

```shell
pip install -U funasr_onnx
# For the users in China, you could install with the command:
# pip install -U funasr_onnx -i https://mirror.sjtu.edu.cn/pypi/web/simple
```

## Download the model

```shell
git lfs install
git clone https://huggingface.co/funasr/FSMN-VAD
```

## Inference with runtime

### Voice Activity Detection
#### FSMN-VAD
 ```python
 from funasr_onnx import Fsmn_vad

 model_dir = "./FSMN-VAD"
 model = Fsmn_vad(model_dir, quantize=True)

 wav_path = "./FSMN-VAD/asr_example.wav"

 result = model(wav_path)
 print(result)
 ```
- `model_dir`: the model path, which contains `model.onnx`, `config.yaml`, `am.mvn`
- `batch_size`: `1` (Default), the batch size duration inference
- `device_id`: `-1` (Default), infer on CPU. If you want to infer with GPU, set it to gpu_id (Please make sure that you have install the onnxruntime-gpu)
- `quantize`: `False` (Default), load the model of `model.onnx` in `model_dir`. If set `True`, load the model of `model_quant.onnx` in `model_dir`
- `intra_op_num_threads`: `4` (Default), sets the number of threads used for intraop parallelism on CPU

Input: wav formt file, support formats: `str, np.ndarray, List[str]`

Output: `List[str]`: recognition result


## Citations

``` bibtex
@inproceedings{gao2022paraformer,
  title={Paraformer: Fast and Accurate Parallel Transformer for Non-autoregressive End-to-End Speech Recognition},
  author={Gao, Zhifu and Zhang, Shiliang and McLoughlin, Ian and Yan, Zhijie},
  booktitle={INTERSPEECH},
  year={2022}
}
```
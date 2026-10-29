// Direct ORT interface. Graphs remain publisher-owned and unmodified.
// Cache initialization follows LiquidONNX session.py at 850855b397a1b438fec7bcf7d24e94a04646797b.
export const ORT_VERSION = '1.30.0';
export function tensor(ort, type, data, dims) {
  const C = {float32: Float32Array, float16: Uint16Array, int64: BigInt64Array, int32: Int32Array, bool: Uint8Array}[type];
  if (!C) throw Error(`Unsupported tensor type ${type}`);
  const values = typeof data === 'number' ? new C(data) : C.from(data, x => type === 'int64' ? BigInt(x) : x);
  return new ort.Tensor(type, values, dims);
}
export function emptyCache(ort, session) {
  return Object.fromEntries(session.inputNames.flatMap((name, i) => {
    if (!name.startsWith('past')) return [];
    const info = session.inputMetadata[i];
    const dims = info.shape.map(d => typeof d === 'number' ? d : /sequence/i.test(d) ? 0 : 1);
    dims[0] = 1;
    return [[name, tensor(ort, info.type, dims.reduce((a, b) => a * b, 1), dims)]];
  }));
}
export function updateCache(cache, outputs) {
  for (const [name, value] of Object.entries(outputs)) {
    const target = name.replace(/^present_conv\./, 'past_conv.').replace(/^present\.(.*\.conv)$/, 'past.$1').replace(/^present\./, 'past_key_values.');
    if (target in cache) { cache[target]?.dispose?.(); cache[target] = value; }
  }
}
export async function loadSession(ort, pin, stem, {base, log = () => {}, device} = {}) {
  base ||= `https://huggingface.co/${pin.repo}/resolve/${pin.revision}/`;
  const path = `onnx/${stem}.onnx`;
  const files = pin.files.filter(f => f.path.startsWith(`${path}_data`));
  log(`Loading ${stem}`);
  return ort.InferenceSession.create(`${base}${path}`, {
    executionProviders: [{name: 'webgpu', enableMatmulFp32Accumulation: true, ...(device ? {device} : {})}],
    graphOptimizationLevel: 'all', logSeverityLevel: 0,
    externalData: files.map(f => ({path: f.path.split('/').pop(), data: `${base}${f.path}`})),
  });
}
export function decoderFeed(ort, session, ids, past, cache, side = {}) {
  const feed = {...cache, input_ids: tensor(ort, 'int64', ids, [1, ids.length]),
    attention_mask: tensor(ort, 'int64', Array(past + ids.length).fill(1), [1, past + ids.length]),
    position_ids: tensor(ort, 'int64', ids.map((_, i) => past + i), [1, ids.length]),
    logits_to_keep: tensor(ort, 'int64', [1], [1])};
  for (const name of session.inputNames) {
    if (name in side) feed[name] = side[name];
    else if (/^(image|video|audio)_features$/.test(name)) feed[name] = tensor(ort, 'float32', 0, [0, 2048]);
    else if (name === 'audio_out_codes') feed[name] = tensor(ort, 'int64', 0, [0, 12]);
    if (!(name in feed)) throw Error(`Unimplemented decoder input: ${name}`);
  }
  return Object.fromEntries(session.inputNames.map(name => [name, feed[name]]));
}
function half(h) { const s=h&32768?-1:1,e=(h>>10)&31,f=h&1023; return e===0?s*f*2**-24:e===31?f?NaN:s*Infinity:s*(1+f/1024)*2**(e-15); }
export function argmax(t) {
  const data = t.data, start = data.length - t.dims.at(-1); let best = -Infinity, index = -1;
  for (let i = start; i < data.length; i++) { const v = t.type === 'float16' ? half(data[i]) : data[i]; if (!Number.isFinite(v)) throw Error('Nonfinite logits'); if (v > best) { best = v; index = i-start; } }
  return index;
}
export async function generate(ort, session, ids, {side = {}, maxTokens = 64, eos = [124900], onToken = () => {}} = {}) {
  if (!ids.length) throw Error('Decoder requires a nonempty prompt');
  if (ids.length > 1024) throw Error('This modality smoke requires prefill <=1024 tokens');
  const cache = emptyCache(ort, session), tokens = []; let past = 0, current = ids;
  try {
    for (let step = 0; step < maxTokens; step++) {
      const feed = decoderFeed(ort, session, current, past, cache, step ? {} : side);
      const out = await session.run(feed); const token = argmax(out.logits); updateCache(cache, out);
      for (const [name, value] of Object.entries(out)) if (!name.startsWith('present')) value.dispose?.();
      for (const [name, value] of Object.entries(feed)) if (!name.startsWith('past') && !(name in side)) value.dispose?.();
      tokens.push(token); onToken(token); if (eos.includes(token)) break;
      past += current.length; current = [token];
    }
    return tokens;
  } finally { Object.values(cache).forEach(t => t.dispose?.()); }
}

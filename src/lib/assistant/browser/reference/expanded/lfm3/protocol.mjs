// Bounded port of publisher prompt.py + attention.pack_set + readout:
// one question per row, native set attention, no generated answer tokens.
import {tensor} from './ort-common.mjs';
export const PROTOCOL = 'lfm3-d1-single-question-v1';
function encode(tokenizer, text) { return Array.from(tokenizer.encode(text, {add_special_tokens: false}), Number); }
function plain(tokenizer, text) {
  const specials = [...new Set(tokenizer.all_special_tokens || [])].filter(x => x.length > 1).sort((a,b) => b.length-a.length);
  for (const token of specials) text = text.split(token).join(token[0]+'\u200b'+token.slice(1));
  return text;
}
function forms(tokenizer, texts) { return [...new Set(texts.map(t => encode(tokenizer,t)).filter(x => x.length === 1).map(x => x[0]))]; }
export function prepare(tokenizer, state, question) {
  if (typeof state !== 'string') throw Error('This smoke adapter accepts string states only');
  const q = question; let body, groups, labels;
  if (q.type === 'noul') {
    labels = ['yes','no']; groups = [forms(tokenizer,['yes','Yes','YES']),forms(tokenizer,['no','No','NO'])];
    const extra = q.criteria ? `\nYes: ${q.criteria.true}\nNo: ${q.criteria.false}` : '';
    body = `${q.instructions}${extra}\n\nReply with yes or no only.`;
  } else if (q.type === 'choice' && !q.multiple) {
    labels = Object.keys(q.criteria);
    if (!labels.length || labels.length > 26) throw Error('This smoke supports 1..26 choice options');
    const codes = labels.every(k => /^[A-Za-z]$/.test(k.trim())) ? labels.map(k => k.trim()) : labels.map((_,i) => String.fromCharCode(65+i));
    // Publisher fallback aliases are unnecessary for these verified A/B/C cases: reject rather than alter them.
    if (codes.some(code => encode(tokenizer,code).length !== 1)) throw Error('Choice requires a publisher single-token alias');
    groups = codes.map(code => forms(tokenizer,[code,` ${code}`]));
    body = `${q.instructions}\n\nOptions:\n${labels.map((label,i) => `${codes[i]} ${q.criteria[label] || label.replaceAll('_',' ')}`).join('\n')}\n\nReply with the option code only.`;
  } else throw Error('Unsupported typed question: use native noul/choice');
  if (groups.some(g => !g.length)) throw Error('Missing single-token readout');
  const prefix = `${tokenizer.bos_token || '<|startoftext|>'}<|im_start|>user\n${plain(tokenizer,state+'\n\n')}\nQUESTION:\n`;
  const suffix = `${plain(tokenizer,body)}<|im_end|>\n<|im_start|>assistant\n<think></think>`;
  const ids = encode(tokenizer,prefix+suffix), stateLength = ids.length-encode(tokenizer,suffix).length;
  if (ids.length > 1024 || stateLength <= 0) throw Error('Smoke prompt exceeds 1024 tokens or has no state');
  return {ids, stateLength, questionIds: ids.map((_,i) => i < stateLength ? -1 : 1), slot: ids.length-1, groups, labels, prompt: prefix+suffix};
}
export function readout(logits, plan, calibration) {
  if (!(calibration.default > 0)) throw Error('Publisher calibration required');
  const values = plan.groups.map(group => Math.max(...group.map(i => Number(logits[i])))/calibration.default);
  if (values.some(x => !Number.isFinite(x))) throw Error('Nonfinite decision logits');
  const exps = values.map(x => Math.exp(x-Math.max(...values))), total = exps.reduce((a,b) => a+b,0);
  const probabilities = Object.fromEntries(plan.labels.map((label,i) => [label,exps[i]/total]));
  const choice = plan.labels[values.indexOf(Math.max(...values))];
  return {choice, probabilities, output_tokens: 0, temperature: calibration.default};
}
export async function decide(ort, session, tokenizer, calibration, state, question) {
  if (Object.keys(calibration.temperatures || {}).length) throw Error('Per-type calibration needs a reviewed adapter');
  const plan = prepare(tokenizer,state,question), n = plan.ids.length;
  const feed = {input_ids: tensor(ort,'int64',plan.ids,[1,n]), attention_mask: tensor(ort,'int64',Array(n).fill(1),[1,n]), position_ids: tensor(ort,'int64',plan.ids.map((_,i) => i),[1,n]), question_ids: tensor(ort,'int64',plan.questionIds,[1,n]), slot_positions: tensor(ort,'int64',[plan.slot],[1])};
  for (const name of session.inputNames) {
    if (/^(image|video|audio)_features$/.test(name)) feed[name] = tensor(ort,'float32',0,[0,2048]);
    if (!(name in feed)) throw Error(`Unimplemented decision input ${name}`);
  }
  const start = performance.now(); let outputs;
  try {
    outputs = await session.run(feed);
    if (outputs.logits.dims.join(',') !== '1,128000') throw Error(`Unexpected slot logits ${outputs.logits.dims}`);
    return {...readout(outputs.logits.data,plan,calibration),elapsed_ms: performance.now()-start, rendered_tokens: n, native_protocol: PROTOCOL, slot: plan.slot, state_tokens: plan.stateLength};
  } finally { Object.values(feed).forEach(t => t.dispose?.()); Object.values(outputs || {}).forEach(t => t.dispose?.()); }
}

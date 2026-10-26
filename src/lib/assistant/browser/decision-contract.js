// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export function validateDecisionRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['state','questions'].includes(key)) || !Object.hasOwn(request,'state') || Object.keys(request.questions ?? {}).join() !== 'q') throw Error('A decision requires state and one question named q.');
  const q = request.questions.q;
  if (!q || !['choice','score','noul'].includes(q.type)) throw Error('Choose a native choice, score or noul question.');
  const count = q.type === 'noul' ? 2 : Object.keys(q.criteria ?? {}).length;
  if (count < 2 || count > 255) throw Error('Offer between 2 and 255 choices.');
  const json = JSON.stringify(request, (_, value) => {
    if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw Error('Decision numbers must be finite and integers must be safe.');
    return value;
  });
  if (json.length > 1048576) throw Error('Decision input is too large.');
  return JSON.parse(json);
}
export function validateDecisionAnswer(answer, request) {
  const keys = request.questions.q.type === 'noul' ? ['true','false'] : request.questions.q.type === 'score' ? Object.keys(request.questions.q.criteria).map((_, i) => String(i)) : Object.keys(request.questions.q.criteria);
  const probabilities = answer.type === 'noul' ? {true: answer.noul, false: 1 - answer.noul} : answer.probabilities;
  if (!probabilities || Object.keys(probabilities).length !== keys.length || keys.some(key => !Number.isFinite(probabilities[key]) || probabilities[key] < 0 || probabilities[key] > 1) || Math.abs(Object.values(probabilities).reduce((sum,p) => sum+p,0) - 1) > 1e-4) throw Error('Native decision returned invalid or incomplete probabilities.');
  return {...answer, probabilities};
}

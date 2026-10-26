// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Tiny native stand-in: application loading, hashing, Web Locks and Pi stay real.
const fixture = globalThis.browserRuntimeFixture ??= { events: [], turns: [], waiting: [] };
export const Qwen3_5ForConditionalGeneration = {
  async from_pretrained(model, options) {
    const file = options.file;
    fixture.events.push({ event: 'load', file });
    return {
      contextLength: options.maxLength,
      deviceInfo: () => ({ fixture: true }),
      create_session: () => ({
        reset() {},
        async dispose() {},
        generate(messages, { signal }) {
          const input = messages.at(-1).content;
          const content = `Reply from ${file}: ${input}`;
          fixture.turns.push({ file, messages: structuredClone(messages) });
          fixture.events.push({ event: 'start', file, input });
          const complete = new Promise((resolve, reject) => {
            const abort = () => { fixture.events.push({ event: 'abort', file }); reject(signal.reason); };
            signal.addEventListener('abort', abort, { once: true });
            fixture.waiting.push(() => { signal.removeEventListener('abort', abort); resolve(); });
            if (signal.aborted) abort();
          });
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: 'text', text: content };
              await complete;
              fixture.events.push({ event: 'finish', file });
            },
            result: Promise.resolve({ message: { content }, finish_reason: 'stop', usage: { prompt_tokens: 64, completion_tokens: 8 } }),
          };
        },
      }),
      async dispose() { fixture.events.push({ event: 'unload', file }); },
    };
  },
};

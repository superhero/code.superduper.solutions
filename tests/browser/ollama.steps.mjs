// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { selectPage, selectDropdown } from './navigation.helpers.mjs';

const trigger = page => page.getByRole('button', { name: 'AI chat', exact: true });
const messages = page => page.getByRole('region', { name: 'AI conversation', exact: true });
const reply = page => messages(page).locator('article:not(.question) .message-text').last();
const prompt = page => page.getByRole('textbox', { name: 'Message AI', exact: true });
const saved = page => expect(page.getByRole('status', { name: 'Persistence status', exact: true })).toHaveText('All changes saved');
const tab = (page, number) => page.getByRole('tab', { name: `Session ${number}`, exact: true });
const addChat = page => page.getByRole('button', { name: 'New chat', exact: true }).click();
const send = async (page, text) => { await prompt(page).fill(text); await prompt(page).press('Enter'); };

async function fixture(world, connect = true) {
  await world.page.addInitScript(() => {
    const nativeFetch = window.fetch;
    const state = window.ollamaFixture = { requests: [], chats: [], pending: [], deltas: 0, mutations: 0, aborts: 0, mode: 'burst' };
    window.fetch = async (url, options = {}) => {
      if (!/^http:\/\/(localhost:11434|127\.0\.0\.1:11435)\//.test(String(url))) return nativeFetch(url, options);
      state.requests.push(String(url));
      const origin = new URL(url).origin;
      if (String(url).endsWith('/api/tags')) return Response.json({ models: origin.includes('11435') ? [{ name: 'another-local:7b' }] : [
        { name: 'ornith:9b-q8_0' }, { name: 'another-local:7b' }, { name: 'remote:cloud' },
        { name: 'cloud-alias', remote_host: 'https://ollama.com' },
      ] });
      if (String(url).endsWith('/api/show')) {
        const model = JSON.parse(options.body).model;
        return Response.json({ model_info: { 'general.architecture': 'qwen35', 'qwen35.context_length': model === 'ornith:9b-q8_0' ? 262144 : 16384 } });
      }
      const body = JSON.parse(options.body);
      state.chats.push({ origin, ...body });
      if (!['ornith:9b-q8_0', 'another-local:7b'].includes(body.model) || body.think !== false) throw new Error('Unexpected inference request');
      const observer = new MutationObserver(records => {
        state.mutations += records.filter(record => {
          const element = record.type === 'characterData' ? record.target.parentElement : record.target;
          return element instanceof Element && element.closest('[data-streaming-reply]');
        }).length;
      });
      observer.observe(document.querySelector('[data-ollama-panel]'), { subtree: true, characterData: true, childList: true });
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        let timer;
        const finish = () => { observer.disconnect(); options.signal.removeEventListener('abort', abort); };
        const emit = content => { state.deltas++; controller.enqueue(encoder.encode(JSON.stringify({ message: { content }, done: false }) + '\n')); };
        const abort = () => { clearTimeout(timer); state.aborts++; finish(); controller.error(new DOMException('Stopped', 'AbortError')); };
        options.signal.addEventListener('abort', abort, { once: true });
        const complete = (reason = 'stop') => { controller.enqueue(encoder.encode(JSON.stringify({ done: true, done_reason: reason, eval_count: 513, ...(state.mode === "tools" ? { prompt_eval_count: 300 } : {}) }))); controller.close(); finish(); };
        if (state.mode === 'skills') {
          if (body.messages.at(-1).role === 'user') controller.enqueue(encoder.encode(JSON.stringify({ message: { tool_calls: [{ function: { name: 'load_skill', arguments: { name: 'review-code' } } }] }, done: false }) + '\n'));
          else emit('Loaded the code review skill.');
          complete();
        } else if (state.mode === 'tools') {
          const last = body.messages.at(-1);
          const tool = last.role === 'user' ? { name: 'list_files', arguments: {} } : last.tool_name === 'list_files' ? { name: 'read_file', arguments: { path: 'README.md' } } : last.tool_name === 'read_file' ? { name: 'read_settings', arguments: { keys: ['fontSize'], scope: 'effective' } } : last.tool_name === 'read_settings' ? { name: 'git_log', arguments: { limit: 5 } } : last.tool_name === 'git_log' ? { name: 'git_status', arguments: {} } : undefined;
          if (tool) controller.enqueue(encoder.encode(JSON.stringify({ message: { tool_calls: [{ function: tool }] }, done: false }) + '\n'));
          else emit('The README describes a real browser repository.');
          complete();
        } else if (state.mode === 'deferred') {
          state.pending.push({ append: emit, complete });
        } else if (state.mode === 'markdown') {
          emit('# Result\n\n**strong** *emphasis* ~~removed~~ `inline` ==highlight==\n\n- [x] done\n- [ ] pending\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nconst value = "<safe>";\n```\n\n<script>window.ollamaInjected=true</script>\n\n![image](https://example.invalid/tracker.png)\n\nNote[^x]\n\npar');
          state.pending.push({ append: emit, complete });
        } else if (state.mode === 'controlled') {
          emit(`Reply for ${body.messages.at(-1).content}`);
          state.pending.push({ append: emit, complete: reason => { emit(' complete'); complete(reason); }, fail: message => { finish(); controller.error(new Error(message)); } });
        } else if (state.mode === 'slow') {
          emit('Partial reply'); timer = setTimeout(() => emit(' late reply'), 5000);
        } else if (state.mode === 'echo') {
          emit(`Reply from ${origin}: ${body.messages.at(-1).content}`); timer = setTimeout(complete, 50);
        } else {
          emit('hé🙂\n<script>window.ollamaInjected=true</script>\n');
          for (let i = 0; i < 512; i++) emit(`token-${i} `);
          timer = setTimeout(complete, 180);
        }
      } }));
    };
  });
  await world.page.reload(); await saved(world.page);
  await trigger(world.page).click();
  expect(await world.page.evaluate(() => window.ollamaFixture.requests)).toEqual([]);
  await expect(tab(world.page, 1)).toHaveAttribute('aria-selected', 'true');
  if (!connect) return;
  await world.page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(world.page.getByRole('button', { name: 'AI model', exact: true })).toContainText('ornith:9b-q8_0');
}

Then('AI result icons show status on the left and first response plus total time on the right only on hover or focus', async function () {
  const page = this.page; await fixture(this);
  await page.evaluate(() => {
    window.fixtureMonotonic = 1000;
    Object.defineProperty(performance, 'now', { configurable: true, value: () => window.fixtureMonotonic });
    window.ollamaFixture.mode = 'deferred';
  });
  await send(page, 'Write a document.');
  const stamp = messages(page).locator('.question time');
  await expect(stamp).toHaveCount(1);
  expect(await stamp.evaluate(node => node.textContent === new Date(node.dateTime).toLocaleString())).toBe(true);
  await expect(messages(page).locator('.question')).toHaveCSS('text-align', 'right');
  const header = messages(page).locator('article:not(.question) .speaker');
  const tooltips = page.getByRole('tooltip');
  await expect(header).toHaveText('AI');
  await expect(messages(page).locator('.message-timing, .message-footer')).toHaveCount(0);
  await page.evaluate(() => {
    window.fixtureMonotonic += 1250;
    window.ollamaFixture.pending[0].append('# Document\n\nThe actual content.');
  });
  await expect(reply(page)).toContainText('The actual content.');
  await expect(header).toHaveText('AI');
  await page.evaluate(() => {
    window.fixtureMonotonic += 64182;
    window.ollamaFixture.pending[0].append('\n\n---\n\n*Generated on 2024-06-15*');
    window.ollamaFixture.pending[0].complete();
  });
  const completed = page.getByRole('img', { name: 'AI completion', exact: true });
  await expect(completed).toBeVisible();
  expect(await completed.evaluate(node => node.tagName)).toBe('SPAN');
  await expect(completed).toHaveCSS('cursor', 'default');
  await expect(page.getByRole('button', { name: 'AI completion', exact: true })).toHaveCount(0);
  await prompt(page).hover(); await expect(tooltips).toHaveCount(0);
  await completed.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await completed.hover();
  const status = page.getByRole('tooltip', { name: 'Generation completed', exact: true });
  const timing = page.getByRole('tooltip', { name: '1s 250ms + 1m 5s', exact: true });
  await expect(status).toBeVisible(); await expect(timing).toBeVisible(); await expect(tooltips).toHaveCount(2);
  await completed.click();
  await expect(status).toBeVisible(); await expect(timing).toBeVisible();
  expect(await page.evaluate(() => window.ollamaFixture.chats.length)).toBe(1);
  await expect.poll(async () => {
    const [icon, left, right] = await Promise.all([completed.boundingBox(), status.boundingBox(), timing.boundingBox()]);
    return left && right && left.x + left.width <= icon.x && right.x >= icon.x + icon.width
      && Math.abs(left.y + left.height / 2 - icon.y - icon.height / 2) < 1
      && Math.abs(right.y + right.height / 2 - icon.y - icon.height / 2) < 1;
  }).toBe(true);
  await expect(status).toHaveCSS('text-align', 'right'); await expect(timing).toHaveCSS('text-align', 'left');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(tooltips).toHaveCount(0);
    await completed.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await completed.hover();
    await expect(status).toBeVisible(); await expect(timing).toBeVisible();
    await expect.poll(async () => {
      const [icon, left, right] = await Promise.all([completed.boundingBox(), status.boundingBox(), timing.boundingBox()]);
      return left && right && left.x >= 8 && right.x + right.width <= width - 8
        && left.x + left.width <= icon.x && right.x >= icon.x + icon.width;
    }).toBe(true);
  }
  await expect(reply(page)).not.toContainText('Generated on');
  await expect(reply(page)).not.toContainText('1s 250ms');
  await expect(header).toHaveText('AI');
  await page.evaluate(() => window.fixtureMonotonic += 10000);
  await expect(timing).toHaveText('1s 250ms + 1m 5s');
  await prompt(page).hover(); await expect(tooltips).toHaveCount(0);
  await prompt(page).focus(); await completed.focus();
  await expect(status).toBeVisible(); await expect(timing).toBeVisible();
  await completed.press('Escape'); await expect(tooltips).toHaveCount(0);
  await expect(completed).toBeVisible();
  await page.evaluate(() => window.ollamaFixture.mode = 'controlled');
  await send(page, 'Another reply.');
  await expect(completed).toHaveCount(0);
  await expect(header).toHaveText(['AI', 'AI']);
  await page.evaluate(() => window.fixtureMonotonic += 1234);
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
  const interrupted = page.getByRole('img', { name: 'AI interruption', exact: true });
  await interrupted.hover();
  await expect(page.getByRole('tooltip', { name: 'Generation was stopped before the reply finished.', exact: true })).toBeVisible();
  await expect(page.getByRole('tooltip', { name: '0ms + 1s 234ms', exact: true })).toBeVisible();
  await expect(tooltips).toHaveCount(2);
  await expect(header).toHaveText(['AI', 'AI']);
  await expect(messages(page).locator('.message-timing, .message-footer')).toHaveCount(0);
  const payload = await page.evaluate(() => window.ollamaFixture.chats[1].messages);
  expect(payload.every(message => Object.keys(message).every(key => ['role', 'content'].includes(key)))).toBe(true);
  expect(payload.find(message => message.role === 'assistant').content).toContain('Generated on 2024-06-15');
  await mkdir(this.artifactDirectory, { recursive: true });
  await page.screenshot({ path: `${this.artifactDirectory}/ai-generation-time.png` });
});

Then('completing streamed Markdown links never retracts the expanded reply', async function () {
  const page = this.page; await fixture(this);
  const baseline = process.env.AI_LAYOUT_BASELINE === 'true', samples = [];
  const cdp = await this.context.newCDPSession(page);
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' });
  for (let index = 0; index < 3; index++) {
    if (index) { await addChat(page); await page.getByRole("button", { name: "Connect", exact: true }).click(); await expect(prompt(page)).toBeEnabled(); }
    await page.evaluate(() => window.ollamaFixture.mode = 'controlled');
    await send(page, 'Show a documentation link.');
    await expect(reply(page)).toContainText('Reply for Show a documentation link.');
    await page.evaluate(index => window.ollamaFixture.pending[index].append('\n\nRead [the documentation](https://example.invalid/' + 'long-path-'.repeat(200)), index);
    await expect(reply(page)).toContainText('long-path-');
    await expect.poll(() => reply(page).evaluate(node => {
      const content = node.querySelector('.message-content');
      return !content || node.getBoundingClientRect().height + .1 >= content.getBoundingClientRect().height;
    })).toBe(true);
    const expanded = await reply(page).boundingBox();
    await page.evaluate(index => window.ollamaFixture.pending[index].append(')'), index);
    await expect(reply(page).getByRole('link', { name: 'the documentation', exact: true })).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const formatted = await reply(page).boundingBox();
    await page.evaluate(index => window.ollamaFixture.pending[index].complete('length'), index);
    await expect(page.getByRole('img', { name: 'AI interruption', exact: true })).toBeVisible();
    const finished = await reply(page).boundingBox();
    samples.push({ expanded: expanded.height, formatted: formatted.height, finished: finished.height,
      retraction: Math.max(0, expanded.height - formatted.height, expanded.height - finished.height) });
  }
  const traceEnd = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end'); const { stream } = await traceEnd;
  let trace = '', chunk;
  do { chunk = await cdp.send('IO.read', { handle: stream }); trace += chunk.data; } while (!chunk.eof);
  await cdp.send('IO.close', { handle: stream }); await cdp.detach();
  await mkdir(this.artifactDirectory, { recursive: true });
  const stage = baseline ? 'baseline' : 'candidate';
  await writeFile(`${this.artifactDirectory}/ai-height-${stage}.trace.json`, trace);
  await writeFile(`${this.artifactDirectory}/ai-height-${stage}.json`, JSON.stringify({ stage, samples,
    viewport: page.viewportSize(), browser: this.context.browser().version(),
    buildSha256: createHash('sha256').update(await readFile('dist/index.html')).digest('hex'),
    fixtureSha256: createHash('sha256').update('\n\nRead [the documentation](https://example.invalid/' + 'long-path-'.repeat(200) + ')').digest('hex'),
    scope: 'Production browser, fresh profile, local stream fixture, reduced motion, Playwright and Chrome traces enabled. Geometry comparison only; no elapsed-time or field performance claim.' }, null, 2));
  await this.attach(JSON.stringify({ stage, samples }), 'application/json');
  if (baseline) expect(samples.every(sample => sample.retraction > 100)).toBe(true);
  else {
    expect(samples.every(sample => sample.retraction < 1)).toBe(true);
    const retained = samples.at(-1).expanded;
    await addChat(page); await expect(messages(page).locator('article')).toHaveCount(0);
    await tab(page, 3).click();
    await expect.poll(async () => (await reply(page).boundingBox()).height).toBeGreaterThanOrEqual(retained);
    await expect.poll(() => messages(page).evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(1);
    await page.setViewportSize({ width: 900, height: 800 });
    await expect.poll(async () => (await reply(page).boundingBox()).height).toBeLessThan(retained - 100);
  }
});

Then('growing replies animate without retracting and honor reduced motion and manual scrolling', async function () {
  const page = this.page; await fixture(this); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.ollamaFixture.mode = 'controlled');
  await send(page, 'Animate this reply.');
  await expect(reply(page)).toContainText('Reply for Animate this reply.');
  const frames = await page.evaluate(() => new Promise((resolve, reject) => {
    const node = document.querySelector('[data-streaming-reply]'), content = node.querySelector('.message-content');
    const rows = Array.from({ length: 40 }, (_, index) => `Growth line ${index}`).join('\n');
    const samples = [];
    window.ollamaFixture.pending[0].append('\n\n' + rows);
    function sample() {
      const height = node.getBoundingClientRect().height, target = content.getBoundingClientRect().height;
      samples.push({ height, target });
      if (node.textContent.includes('Growth line 39') && Math.abs(height - target) < .1 && !node.getAnimations().some(animation => animation.playState === 'running')) resolve(samples);
      else if (samples.length > 120) reject(new Error('Reply growth did not settle.'));
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
  expect(frames.some(sample => sample.height > frames[0].height + 1 && sample.height < sample.target - 1)).toBe(true);
  expect(frames.every((sample, index) => !index || sample.height >= frames[index - 1].height - .1)).toBe(true);
  const scroller = messages(page);
  await expect.poll(() => scroller.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(1);
  await scroller.hover(); await page.mouse.wheel(0, -250);
  await expect.poll(() => scroller.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeGreaterThan(100);
  const position = await scroller.evaluate(node => node.scrollTop);
  await page.evaluate(() => window.ollamaFixture.pending[0].append('\n\nMore text while reading above.'));
  await expect(reply(page)).toContainText('More text while reading above.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(reply(page)).toHaveCSS('transition-duration', '0s');
  await expect.poll(() => reply(page).evaluate(node => Math.abs(node.getBoundingClientRect().height - node.querySelector('.message-content').getBoundingClientRect().height))).toBeLessThan(.1);
  expect(Math.abs(await scroller.evaluate(node => node.scrollTop) - position)).toBeLessThan(1);
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
  await expect(page.getByRole('img', { name: 'AI interruption', exact: true })).toBeVisible();
  await mkdir(this.artifactDirectory, { recursive: true });
  await writeFile(`${this.artifactDirectory}/ai-growth-frames.json`, JSON.stringify({ frames,
    scope: 'Production browser geometry with normal motion; no elapsed-time speedup claim.' }, null, 2));
});

Then('an AI {string} interruption shows a centered Skull with its reason and clears on the next reply', async function (cause) {
  const page = this.page; await fixture(this);
  await page.evaluate(() => window.ollamaFixture.mode = 'controlled');
  await send(page, 'Keep this partial reply.');
  const stop = page.getByRole('button', { name: 'Stop generating', exact: true });
  await expect(stop).toBeVisible();
  if (cause === 'limit') await page.evaluate(() => window.ollamaFixture.pending[0].complete('length'));
  else if (cause === 'error') await page.evaluate(() => window.ollamaFixture.pending[0].fail('Runtime disconnected before the reply finished.'));
  else await stop.click();
  const skull = page.getByRole('img', { name: 'AI interruption', exact: true });
  const verified = page.getByRole('img', { name: 'AI completion', exact: true });
  await expect(skull).toBeVisible(); await expect(stop).toHaveCount(0);
  await expect(verified).toHaveCount(0);
  await expect(reply(page)).toContainText('Keep this partial reply.');
  const icon = await skull.boundingBox(), input = await page.locator('[data-ai-composer]').boundingBox();
  expect(Math.abs(icon.x + icon.width / 2 - input.x - input.width / 2)).toBeLessThan(1);
  const announcement = cause === 'error' ? page.getByRole('alert') : page.getByRole('status', { name: 'AI status', exact: true });
  const bounds = await announcement.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(1); expect(bounds.height).toBeLessThanOrEqual(1);
  await skull.hover();
  await expect(page.getByRole('tooltip', { name: cause === 'limit'
    ? 'The model reached its output limit. The reply may be incomplete.'
    : cause === 'error' ? 'Runtime disconnected before the reply finished.' : 'Generation was stopped before the reply finished.', exact: true })).toBeVisible();
  await expect(page.getByRole('tooltip')).toHaveCount(2);
  await expect(page.getByRole('tooltip').filter({ hasText: / \+ / })).toBeVisible();
  await mkdir(this.artifactDirectory, { recursive: true });
  await page.screenshot({ path: `${this.artifactDirectory}/ai-interruption-${cause}.png` });
  await send(page, 'Continue.'); await expect(stop).toBeVisible(); await expect(skull).toHaveCount(0);
  await page.evaluate(() => window.ollamaFixture.pending[1].complete());
  await expect(stop).toHaveCount(0); await expect(skull).toHaveCount(0);
  await expect(reply(page)).toContainText('Continue. complete');
  await expect(verified).toBeVisible();
  await expect(verified.locator('.material-symbols-rounded')).toHaveText('verified');
  const completedIcon = await verified.boundingBox();
  expect(Math.abs(completedIcon.x + completedIcon.width / 2 - input.x - input.width / 2)).toBeLessThan(1);
  await verified.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await verified.hover();
  await expect(page.getByRole('tooltip', { name: 'Generation completed', exact: true })).toBeVisible();
  await expect(page.getByRole('tooltip')).toHaveCount(2);
  await page.screenshot({ path: `${this.artifactDirectory}/ai-completion.png` });
  await send(page, 'One more reply.');
  await expect(stop).toBeVisible(); await expect(verified).toHaveCount(0);
});

Then('long AI replies retain aligned widths and a stop control that follows the last message', async function () {
  const page = this.page; await fixture(this);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.ollamaFixture.mode = 'controlled');
  await send(page, 'Review this example.');
  const stop = page.getByRole('button', { name: 'Stop generating', exact: true });
  await expect(stop).toBeVisible();
  await expect.poll(() => reply(page).evaluate(node => Math.abs(node.getBoundingClientRect().height - node.querySelector('.message-content').getBoundingClientRect().height))).toBeLessThan(.1);
  const before = await stop.boundingBox();
  const firstReply = await messages(page).locator('article').last().boundingBox();
  expect(Math.abs(before.y - firstReply.y - firstReply.height - 12)).toBeLessThan(1);
  await page.evaluate(() => window.ollamaFixture.pending[0].append(
    '\n\n' + '## Review\n\nA paragraph in a long reply.\n\n'.repeat(24) +
    '```ts\nconst longLine = "' + 'value'.repeat(180) + '";\n```'
  ));
  await expect(reply(page).locator('h2')).toHaveCount(24);
  expect((await stop.boundingBox()).y - before.y).toBeGreaterThan(100);
  for (const viewport of [{ width: 1280, height: 900 }, { width: 900, height: 800 }]) {
    await page.setViewportSize(viewport);
    await expect(stop).toBeVisible();
    await expect.poll(() => reply(page).evaluate(node => Math.abs(node.getBoundingClientRect().height - node.querySelector('.message-content').getBoundingClientRect().height))).toBeLessThan(.1);
    await expect.poll(async () => {
      const bounds = await messages(page).evaluate(region => {
        const panel = region.closest('[role="tabpanel"]');
        const input = panel.querySelector('[data-ai-composer]');
        const button = panel.querySelector('.generation-stop');
        const card = region.querySelector('article');
        const lastMessage = [...region.querySelectorAll('article')].at(-1);
        const text = panel.querySelector('[aria-label="AI status"]');
        const wideCode = [...region.querySelectorAll('article:not(.question) pre')].at(-1);
        const rect = element => element.getBoundingClientRect();
        const center = element => rect(element).x + rect(element).width / 2;
        return {
          noHorizontalOverflow: region.scrollWidth === region.clientWidth,
          scrollable: region.scrollHeight > region.clientHeight,
          aligned: Math.abs(rect(card).left - rect(input).left) < 1 && Math.abs(rect(card).right - rect(input).right) < 1,
          centered: Math.abs(center(button) - center(input)) < 1,
          followsReply: Math.abs(rect(button).top - rect(lastMessage).bottom - 12) < 1,
          statusHidden: rect(text).width <= 1 && rect(text).height <= 1,
          wideCodeScrollable: wideCode.scrollWidth > wideCode.clientWidth,
          scrollbarHidden: getComputedStyle(region).scrollbarWidth === 'none',
        };
      });
      return Object.values(bounds).every(Boolean);
    }).toBe(true);
  }
  const scroller = messages(page), bottom = await scroller.evaluate(element => element.scrollTop);
  await scroller.hover(); await page.mouse.wheel(0, -400);
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeLessThan(bottom);
  // Let scrolling dismiss its tooltip before entering the now-visible control.
  await stop.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await stop.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Stop generating');
  await expect(stop.locator('.generation-stop-symbol')).toHaveCSS('opacity', '1');
  await expect.poll(() => stop.evaluate(button => {
    const group = button.querySelector('.generation-symbol'), ring = button.querySelector('.generation-orbit');
    const overlay = button.querySelector('.generation-stop-symbol');
    const rect = element => element.getBoundingClientRect();
    const centerX = element => rect(element).x + rect(element).width / 2;
    const centerY = element => rect(element).y + rect(element).height / 2;
    const top = document.elementFromPoint(centerX(group), centerY(group));
    return getComputedStyle(overlay).color === getComputedStyle(button.closest('[data-ollama-panel]')).backgroundColor
      && Math.abs(rect(group).width / group.offsetWidth - 1.25) < .01
      && Math.abs(rect(overlay).width / overlay.offsetWidth - 1.25) < .01
      && Math.abs(centerX(overlay) - centerX(ring)) < 1 && Math.abs(centerY(overlay) - centerY(ring)) < 1
      && overlay.contains(top);
  })).toBe(true);
  await mkdir(this.artifactDirectory, { recursive: true });
  await page.screenshot({ path: `${this.artifactDirectory}/ai-generation-layout.png` });
  await stop.click();
  await expect(stop).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'AI status', exact: true })).toHaveText('Stopped');
});

Then('the Ollama pane discovers local models and batches streamed text', async function () {
  const page = this.page; await fixture(this);
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await prompt(page).fill('hello'); await prompt(page).press('Enter');
  const expected = 'hé🙂\n<script>window.ollamaInjected=true</script>\n' + Array.from({ length: 512 }, (_, i) => `token-${i} `).join('');
  await expect(reply(page)).toHaveText(expected);
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.ollamaInjected)).toBeUndefined();
  const metrics = await page.evaluate(() => ({ ...window.ollamaFixture, viewport: [innerWidth, innerHeight], userAgent: navigator.userAgent }));
  expect(metrics.deltas).toBe(513); expect(metrics.mutations).toBeGreaterThan(0); expect(metrics.mutations).toBeLessThan(32);
  await mkdir(this.artifactDirectory, { recursive: true });
  await writeFile(`${this.artifactDirectory}/ollama-rendering.json`, JSON.stringify({ ...metrics,
    scope: 'Production browser fixture, fresh profile, reduced motion, Playwright tracing enabled. Structural DOM update count; no elapsed-time improvement claim.' }, null, 2));
  await this.attach(JSON.stringify(metrics), 'application/json');
  await page.screenshot({ path: `${this.artifactDirectory}/ollama-wide.png` });
  await trigger(page).click(); await expect(messages(page)).toHaveCount(0);
  await trigger(page).click(); await expect(reply(page)).toHaveText(expected);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(messages(page).locator('article')).toHaveCount(0);
  await tab(page, 1).click(); await expect(reply(page)).toHaveText(expected);
});

Then('AI input settings change the controls and keyboard behavior live and after reload', async function () {
  const page = this.page; await fixture(this); await page.evaluate(() => window.ollamaFixture.mode = 'echo');
  const sendButton = () => page.getByRole('button', {name:'Send',exact:true});
  await expect(sendButton()).toHaveCount(0); await send(page,'default Enter sends');
  await expect(reply(page)).toContainText('default Enter sends'); await expect(page.getByRole('button',{name:'Stop generating',exact:true})).toHaveCount(0);
  await selectPage(page,'Settings');
  const aiSettings = page.getByRole('region',{name:'Editor settings',exact:true}).getByRole('region',{name:'AI',exact:true});
  const visibility = aiSettings.getByRole('switch',{name:'Show Send button',exact:true});
  await expect(visibility).not.toBeChecked(); await visibility.check(); await saved(page);
  await page.getByRole('switch',{name:'Send on Enter',exact:true}).uncheck(); await saved(page); await selectPage(page,'Editor');
  await expect(sendButton()).toBeVisible(); await prompt(page).fill('first line'); await prompt(page).press('Enter'); await page.keyboard.insertText('second line');
  await expect(prompt(page).locator('.cm-line')).toHaveText(['first line','second line']);
  expect(await page.evaluate(() => window.ollamaFixture.chats.length)).toBe(1);
  await sendButton().click(); await expect(reply(page)).toContainText('first line');
  await expect(page.getByRole('button',{name:'Stop generating',exact:true})).toHaveCount(0);
  expect(await page.evaluate(() => window.ollamaFixture.chats.at(-1).messages.at(-1).content)).toBe('first line\nsecond line');
  await selectPage(page,'Settings'); await visibility.uncheck(); await saved(page);
  await page.reload(); await saved(page);
  await expect(aiSettings.getByRole('switch',{name:'Show Send button',exact:true})).not.toBeChecked();
  await expect(page.getByRole('switch',{name:'Send on Enter',exact:true})).not.toBeChecked();
  await selectPage(page,'Editor'); await trigger(page).click(); await page.getByRole('button',{name:'Connect',exact:true}).click();
  await expect(prompt(page)).toBeEnabled(); await expect(sendButton()).toHaveCount(0);
  await page.evaluate(() => window.ollamaFixture.mode = 'echo'); await prompt(page).fill('keyboard send'); await prompt(page).press('Enter');
  await expect(prompt(page).locator('.cm-line')).toHaveCount(2); expect(await page.evaluate(() => window.ollamaFixture.chats.length)).toBe(0);
  await prompt(page).press('Control+Enter'); await expect(reply(page)).toContainText('keyboard send');
});

Then('AI messages render inline and display math without external resources', async function () {
  const page=this.page; await fixture(this); await page.evaluate(() => window.ollamaFixture.mode='echo');
  await this.context.setOffline(true);
  await send(page,String.raw`Here's some LaTeX math: $E = mc^2$ and $\int_{0}^{1} x\,dx = \frac{1}{2}$.

\[\sum_{n=1}^{5}n=15\]`);
  await expect(reply(page).locator('.katex')).toHaveCount(3);
  await expect(reply(page).locator('.katex-display')).toHaveCount(1);
  await expect(messages(page).locator('.question .katex')).toHaveCount(3);
  await expect(reply(page).locator('math')).toHaveCount(3);
  await expect(reply(page).locator('.katex-error')).toHaveCount(0);
  await expect(reply(page).locator('.markdown-block:has(.katex)').first()).toHaveCSS('overflow-y','hidden');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px KaTeX_Main'))).toBe(true);
  expect(this.requests.some(request => !request.url.startsWith(this.baseURL))).toBe(false);
  await mkdir(this.artifactDirectory,{recursive:true}); await page.screenshot({path:`${this.artifactDirectory}/ai-math.png`});
});

Then('the AI composer formats visible Markdown and sends its unchanged source', async function () {
  const page = this.page; await fixture(this); await page.evaluate(() => window.ollamaFixture.mode = 'echo');
  const source = '# Heading\n\n**bold** *italic* ~~old~~ `code` ==marked==';
  const input = prompt(page); await input.fill(source); await expect(input.locator('.cm-line')).toHaveText(source.split('\n'));
  await expect(input.locator('.ai-md-strong').filter({ hasText: 'bold' })).toHaveCSS('font-weight', '700');
  await expect(input.locator('.ai-md-emphasis').filter({ hasText: 'italic' })).toHaveCSS('font-style', 'italic');
  await expect(input.locator('.ai-md-strike').filter({ hasText: 'old' })).toHaveCSS('text-decoration-line', 'line-through');
  await expect(input.locator('.ai-md-code').filter({ hasText: 'code' })).toBeVisible();
  await expect(input.locator('.ai-md-mark').filter({ hasText: 'marked' })).toBeVisible();
  await input.press('Control+a'); await input.press('Backspace'); await expect(input.locator('.cm-placeholder')).toBeVisible();
  await input.press('Control+z'); await expect(input.locator('.cm-line')).toHaveText(source.split('\n'));
  await input.press('Control+Shift+Z'); await expect(input.locator('.cm-placeholder')).toBeVisible(); await input.press('Control+z');
  await expect(input.locator('.cm-line')).toHaveText(source.split('\n'));
  await input.press('ArrowRight'); await input.press('Control+End');
  await expect.poll(() => page.evaluate(() => getSelection().toString())).toBe('');
  await input.press('Shift+Enter'); await page.keyboard.insertText('next line');
  expect(await page.evaluate(() => window.ollamaFixture.chats.length)).toBe(0);
  await input.press('Enter'); await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  await expect(messages(page).locator('.question strong')).toHaveText('bold'); await expect(reply(page).locator('strong')).toHaveText('bold');
  const request = await page.evaluate(() => window.ollamaFixture.chats[0].messages.at(-1).content);
  expect(request).toBe(source + '\nnext line'); await expect(input.locator('.cm-placeholder')).toBeVisible();
  await page.setViewportSize({ width: 600, height: 800 }); await input.fill('**compact**');
  await expect(input.locator('.ai-md-strong').filter({ hasText: 'compact' })).toHaveCSS('font-weight', '700');
  await mkdir(this.artifactDirectory, { recursive: true }); await page.screenshot({ path: `${this.artifactDirectory}/ai-markdown-composer.png` });
});

Then('AI Markdown replies preserve stable blocks and selections through completion', async function () {
  const page = this.page; await fixture(this); await page.evaluate(() => window.ollamaFixture.mode = 'markdown');
  await send(page, '**question**'); const answer = reply(page);
  await expect(answer.getByRole('heading', { name: 'Result', exact: true })).toBeVisible();
  await expect(answer.locator('strong')).toHaveText('strong'); await expect(answer.locator('em')).toHaveText('emphasis');
  await expect(answer.locator('mark')).toHaveText('highlight'); await expect(answer.locator('table')).toHaveCount(1);
  await expect(answer.getByRole('checkbox')).toHaveCount(2); await expect(answer.getByRole('checkbox').first()).toBeChecked();
  await expect(answer.locator('pre code')).toHaveText('const value = "<safe>";\n'); await expect(answer.locator('script, img')).toHaveCount(0);
  await expect(messages(page).locator('.question strong')).toHaveText('question');
  await page.evaluate(() => {
    window.aiStableHeading = document.querySelector('[data-streaming-reply] h1');
    const range = document.createRange(); range.selectNodeContents(window.aiStableHeading);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    window.ollamaFixture.pending[0].append('t complete\n\n[^x]: footnote detail');
  });
  await expect(answer.locator('.footnotes')).toContainText('footnote detail');
  expect(await page.evaluate(() => document.querySelector('[data-streaming-reply] h1') === window.aiStableHeading)).toBe(true);
  expect(await page.evaluate(() => getSelection().toString())).toBe('Result');
  await page.evaluate(() => window.ollamaFixture.pending[0].complete());
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('article:not(.question) h1') === window.aiStableHeading)).toBe(true);
  expect(await page.evaluate(() => getSelection().toString())).toBe('Result');
  expect(await page.evaluate(() => window.ollamaInjected)).toBeUndefined();
  expect(this.requests.some(request => request.url.includes('example.invalid'))).toBe(false);
  await mkdir(this.artifactDirectory, { recursive: true }); await page.screenshot({ path: `${this.artifactDirectory}/ai-markdown-reply.png` });
});

Then('stopping and closing Ollama cancel generation and preserve partial replies', async function () {
  const page = this.page; await fixture(this);
  await page.evaluate(() => window.ollamaFixture.mode = 'slow');
  await prompt(page).fill('first'); await prompt(page).press('Enter');
  await expect(reply(page)).toHaveText('Partial reply');
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
  await expect(page.getByRole('status', { name: 'AI status', exact: true })).toHaveText('Stopped');
  expect(await page.evaluate(() => window.ollamaFixture.aborts)).toBe(1);
  await prompt(page).fill('second'); await prompt(page).press('Enter'); await expect(reply(page)).toHaveText('Partial reply');
  await trigger(page).click();
  await expect(messages(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.ollamaFixture.aborts)).toBe(2);
  await page.setViewportSize({ width: 600, height: 800 });
  await trigger(page).click();
  const dialog = page.getByRole('dialog', { name: 'AI', exact: true });
  await expect(dialog).toBeVisible();
  await expect(messages(page).locator('article')).toHaveCount(4);
  const bounds = await dialog.boundingBox(); expect(Math.round(bounds.width)).toBe(600);
  await mkdir(this.artifactDirectory, { recursive: true });
  await page.screenshot({ path: `${this.artifactDirectory}/ollama-compact.png` });
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger(page)).toBeFocused();
});

Then('Ollama conversations keep independent connection choices drafts and transcripts', async function () {
  const page = this.page; await fixture(this, false);
  await addChat(page); await expect(tab(page, 2)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Manage AI connections', exact: true }).click();
  await page.getByRole('button', { name: 'New connection', exact: true }).click();
  await page.getByRole('textbox', { name: 'Connection name', exact: true }).fill('Second runtime');
  await page.getByRole('textbox', { name: 'Connection runtime URL', exact: true }).fill('http://127.0.0.1:11435');
  await page.getByRole('button', { name: 'Save connection', exact: true }).click();
  await tab(page, 1).click();
  await expect(page.getByRole('button', { name: 'AI connection', exact: true })).toContainText('Local Ollama');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(prompt(page)).toBeEnabled(); await prompt(page).fill('first draft');
  await tab(page, 2).click();
  await expect(page.getByRole('button', { name: 'AI connection', exact: true })).toContainText('Second runtime');
  await expect(prompt(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI model', exact: true })).toContainText('another-local:7b');
  await page.evaluate(() => window.ollamaFixture.mode = 'echo');
  await send(page, 'second thread'); await expect(reply(page)).toHaveText('Reply from http://127.0.0.1:11435: second thread');
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  await prompt(page).fill('second draft'); await tab(page, 1).click();
  await expect(prompt(page)).toHaveText('first draft');
  await expect(messages(page).locator('article')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'AI model', exact: true })).toContainText('ornith:9b-q8_0');
  await prompt(page).press('Enter'); await expect(reply(page)).toHaveText('Reply from http://localhost:11434: first draft');
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  const chats = await page.evaluate(() => window.ollamaFixture.chats);
  expect(chats.map(chat => [chat.origin, chat.model, chat.messages.filter(message => message.role !== 'system')])).toEqual([
    ['http://127.0.0.1:11435', 'another-local:7b', [{ role: 'user', content: 'second thread' }]],
    ['http://localhost:11434', 'ornith:9b-q8_0', [{ role: 'user', content: 'first draft' }]],
  ]);
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(prompt(page)).toBeEnabled(); await expect(messages(page).locator('article')).toHaveCount(2);
  await tab(page, 2).click(); await expect(prompt(page)).toHaveText('second draft');
  await expect(reply(page)).toHaveText('Reply from http://127.0.0.1:11435: second thread');
  await trigger(page).click(); await trigger(page).click();
  await expect(tab(page, 2)).toHaveAttribute('aria-selected', 'true'); await expect(prompt(page)).toHaveText('second draft');
  await mkdir(this.artifactDirectory, { recursive: true });
  await page.screenshot({ path: `${this.artifactDirectory}/ollama-conversations.png` });
});

Then('switching Ollama conversations isolates streams and closing a tab cancels only its requests', async function () {
  const page = this.page; await fixture(this);
  await page.evaluate(() => window.ollamaFixture.mode = 'controlled');
  await send(page, 'one'); await expect(reply(page)).toHaveText('Reply for one');
  await addChat(page); await send(page, 'two'); await expect(reply(page)).toHaveText('Reply for two');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await page.evaluate(() => window.ollamaFixture.pending[0].complete());
  await expect(reply(page)).toHaveText('Reply for two');
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toBeVisible();
  await tab(page, 1).click(); await expect(reply(page)).toHaveText('Reply for one complete');
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close Session 2', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.ollamaFixture.aborts)).toBe(1);
  await expect(tab(page, 1)).toHaveAttribute('aria-selected', 'true'); await expect(reply(page)).toHaveText('Reply for one complete');
  await addChat(page); await send(page, 'three'); await expect(reply(page)).toHaveText('Reply for three');
  await tab(page, 1).click(); await send(page, 'four'); await expect(reply(page)).toHaveText('Reply for four');
  await trigger(page).click();
  await expect.poll(() => page.evaluate(() => window.ollamaFixture.aborts)).toBe(3);
  await trigger(page).click(); await expect(reply(page)).toHaveText('Reply for four');
  await tab(page, 3).click(); await expect(reply(page)).toHaveText('Reply for three');
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
});

Then('Ollama conversation tabs work before connecting with overflow and keyboard controls', async function () {
  const page = this.page; await fixture(this, false);
  for (let i = 0; i < 6; i++) await addChat(page);
  await expect(page.getByRole('tab')).toHaveCount(7);
  expect(await page.evaluate(() => window.ollamaFixture.requests)).toEqual([]);
  await expect(tab(page, 7)).toBeFocused(); await tab(page, 7).press('ArrowLeft');
  await expect(tab(page, 6)).toHaveAttribute('aria-selected', 'true'); await expect(tab(page, 6)).toBeFocused();
  await tab(page, 6).press('Home'); await expect(tab(page, 1)).toBeFocused();
  const list = page.getByRole('tablist', { name: 'AI conversations', exact: true });
  await expect.poll(() => list.evaluate(element => element.scrollLeft)).toBe(0);
  await list.hover(); await page.mouse.wheel(0, 180);
  await expect.poll(() => list.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await tab(page, 1).press('End'); await expect(tab(page, 7)).toBeFocused();
  await tab(page, 7).press('Delete'); await expect(tab(page, 6)).toBeFocused(); await expect(page.getByRole('tab')).toHaveCount(6);
  const border = await page.locator('[data-ollama-panel]').evaluate(element => getComputedStyle(element).borderLeftWidth);
  expect(border).toBe('2px');
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.getByRole('tab', { selected: true })).toBeVisible();
  let tabBounds;
  try {
    await expect.poll(async () => {
      const [selected, strip] = await Promise.all([page.getByRole('tab', { selected: true }).boundingBox(), list.boundingBox()]);
      tabBounds = { selected, strip, scroll: await list.evaluate(element => ({ left: element.scrollLeft, width: element.scrollWidth, client: element.clientWidth })) };
      // Allow fractional font widths against rounded CSS-pixel scroll offsets.
      return selected.x >= strip.x - 1 && selected.x + selected.width <= strip.x + strip.width + 1;
    }).toBe(true);
  } finally { await this.attach(JSON.stringify(tabBounds), 'application/json'); }
  expect(await page.locator('[data-ollama-panel]').evaluate(element => getComputedStyle(element).borderLeftWidth)).toBe('0px');
  await mkdir(this.artifactDirectory, { recursive: true });
  await page.screenshot({ path: `${this.artifactDirectory}/ollama-offline-tabs.png` });
  for (let i = 0; i < 6; i++) await page.getByRole('tab', { selected: true }).press('Delete');
  await expect(page.getByRole('tab')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.ollamaFixture.requests)).toEqual([]);
});

Then('the Ollama pane receives a real Ornith response', { timeout: 320000 }, async function () {
  const page = this.page;
  // This opt-in profile is the only scenario allowed to contact the real runtime.
  await this.context.route('http://localhost:11434/**', route => route.continue());
  await trigger(page).click(); await addChat(page);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI model', exact: true })).toContainText('ornith:9b-q8_0');
  await prompt(page).fill('Reply with exactly ORNITH_LOCAL_OK and nothing else.'); await prompt(page).press('Enter');
  await expect(reply(page)).toContainText('ORNITH_LOCAL_OK', { timeout: 300000 });
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0, { timeout: 300000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await tab(page, 1).click(); await expect(prompt(page)).toBeDisabled(); await expect(messages(page).locator('article')).toHaveCount(0);
  await tab(page, 2).click(); await expect(reply(page)).toContainText('ORNITH_LOCAL_OK');
  await mkdir(this.artifactDirectory, { recursive: true });
  await writeFile(`${this.artifactDirectory}/ollama-live.json`, JSON.stringify({ model: 'ornith:9b-q8_0', runtime: 'http://localhost:11434', origin: this.baseURL, reply: await reply(page).innerText() }, null, 2));
  await page.screenshot({ path: `${this.artifactDirectory}/ollama-live.png` });
});

Then('AI session titles can be renamed from their context menus without interrupting replies', async function () {
  const page = this.page; await fixture(this);
  await page.evaluate(() => window.ollamaFixture.mode = 'controlled');
  await send(page, 'keep this reply'); await expect(reply(page)).toHaveText('Reply for keep this reply');
  await addChat(page); await expect(tab(page, 2)).toHaveAttribute('aria-selected', 'true');
  await prompt(page).fill('second draft');
  await tab(page, 1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const rename = page.getByRole('textbox', { name: 'Rename Session 1', exact: true });
  await expect(rename).toBeFocused(); await expect(rename).toHaveValue('Session 1');
  await rename.fill('  Planning  '); await rename.press('Enter');
  const renamed = page.getByRole('tab', { name: 'Planning', exact: true });
  await expect(renamed).toBeVisible(); await expect(renamed).toBeFocused();
  await expect(tab(page, 2)).toHaveAttribute('aria-selected', 'true');
  await expect(prompt(page)).toHaveText('second draft');
  expect(await page.evaluate(() => window.ollamaFixture.aborts)).toBe(0);
  await page.evaluate(() => window.ollamaFixture.pending[0].complete());
  await renamed.click(); await expect(reply(page)).toHaveText('Reply for keep this reply complete');

  await renamed.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const edit = page.getByRole('textbox', { name: 'Rename Planning', exact: true });
  await edit.fill('Discard this'); await edit.press('Escape');
  await expect(renamed).toBeFocused(); await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  for (const cancel of ['blank', 'blur']) {
    await renamed.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await edit.fill(cancel === 'blank' ? '   ' : 'Discard on blur');
    if (cancel === 'blank') await edit.press('Enter');
    else await prompt(page).click();
    await expect(renamed).toBeVisible(); await expect(edit).toHaveCount(0);
  }
  await trigger(page).click(); await trigger(page).click();
  await expect(renamed).toHaveAttribute('aria-selected', 'true');
  await expect(reply(page)).toHaveText('Reply for keep this reply complete');
  await renamed.press('ArrowRight'); await expect(tab(page, 2)).toBeFocused();
  await expect(prompt(page)).toHaveText('second draft');
  await page.setViewportSize({ width: 600, height: 800 });
  await tab(page, 2).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Rename Session 2', exact: true }).press('Escape');
  await expect(page.getByRole('dialog', { name: 'AI', exact: true })).toBeVisible();
  await expect(tab(page, 2)).toBeFocused();
  await expect(prompt(page)).toHaveText('second draft');
  await addChat(page); await expect(tab(page, 3)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Close Planning', exact: true }).click();
  await expect(renamed).toHaveCount(0); await expect(tab(page, 3)).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.ollamaFixture.chats)).toHaveLength(1);
  await mkdir(this.artifactDirectory, { recursive: true });
  await page.screenshot({ path: `${this.artifactDirectory}/session-tabs.png` });
});

Then('AI connection settings prefill existing profiles and persist edits without duplicates', async function () {
  const page = this.page; await fixture(this, false);
  const named = name => page.getByRole('button', { name, exact: true });
  const name = page.getByRole('textbox', { name: 'Connection name', exact: true });
  const address = page.getByRole('textbox', { name: 'Connection runtime URL', exact: true });
  const records = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('code-ai-connections');
    request.onerror = () => reject(new Error('Fixture connection storage unavailable'));
    request.onsuccess = () => { const db = request.result, tx = db.transaction('connections'), read = tx.objectStore('connections').getAll();
      read.onsuccess = () => resolve(read.result); tx.oncomplete = () => db.close(); };
  }));
  await expect(page.getByRole('textbox', { name: /runtime url/i })).toHaveCount(0);
  await named('Manage AI connections').click();
  await expect(page.getByRole('heading', { name: 'Edit connection', exact: true })).toBeVisible();
  await expect(name).toHaveValue('Local Ollama'); await expect(address).toHaveValue('http://localhost:11434');
  await name.fill('Desk runtime'); await address.fill('http://127.0.0.1:11435'); await named('Save connection').click();
  await expect(named('AI connection')).toContainText('Desk runtime');
  await expect(page.getByRole('textbox', { name: /runtime url/i })).toHaveCount(0);
  expect((await records()).map(record => [record.id, record.label])).toEqual([['local-ollama', 'Desk runtime']]);
  await page.reload(); await saved(page); await trigger(page).click();
  await expect(named('AI connection')).toContainText('Desk runtime');
  await named('Connect').click(); await expect(named('AI model')).toContainText('another-local:7b');
  expect(await page.evaluate(() => window.ollamaFixture.requests)).toEqual(['http://127.0.0.1:11435/api/tags', 'http://127.0.0.1:11435/api/show']);
  await named('Manage AI connections').click();
  await expect(name).toHaveValue('Desk runtime'); await expect(address).toHaveValue('http://127.0.0.1:11435');
  await expect(page.getByRole('heading', { name: 'Edit connection', exact: true })).toBeVisible();
  await named('New connection').click(); await expect(name).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'New connection', exact: true })).toBeVisible();
  await name.fill('Second connection'); await named('Save connection').click();
  await expect(named('AI connection')).toContainText('Second connection');
  await named('Manage AI connections').click(); await expect(name).toHaveValue('Second connection');
  await expect(page.getByRole('heading', { name: 'Edit connection', exact: true })).toBeVisible();
  await name.fill('Renamed connection'); await named('Save connection').click();
  await expect(named('AI connection')).toContainText('Renamed connection');
  const updated = await records(); expect(updated).toHaveLength(2);
  expect(updated.map(record => record.label).sort()).toEqual(['Desk runtime', 'Renamed connection']);
  await named('AI connections').click(); await page.setViewportSize({ width: 600, height: 800 });
  await named('Edit Desk runtime').click();
  await expect(name).toHaveValue('Desk runtime');
  await mkdir(this.artifactDirectory, { recursive: true }); await page.screenshot({ path: `${this.artifactDirectory}/edit-connection.png` });
});

Then('the complete Markdown catalog is usable in the composer and conversation', async function () {
  const page = this.page; await fixture(this); await page.evaluate(() => window.ollamaFixture.mode = 'deferred');
  const source = '++inserted++ !!spoiler!! $x^2$ {中国:zhōng|guó} ::verified:: [^note]\n\n::: tabs#choice\n@tab One\nFirst\n@tab Two\nSecond\n:::\n\n[^note]: Detail';
  await prompt(page).fill(source);
  await expect(prompt(page).locator('.cm-line')).toHaveText(source.split('\n'));
  await expect(prompt(page).locator('.ai-md-inserted').filter({hasText:'inserted'})).toHaveCSS('text-decoration-line','underline');
  await expect(prompt(page).locator('.ai-md-spoiler').filter({hasText:'spoiler'})).toBeVisible();
  await expect(prompt(page).locator('.ai-md-code').filter({hasText:'x^2'})).toBeVisible();
  await expect(prompt(page).locator('.ai-md-ruby').filter({hasText:'zhōng'})).toBeVisible();
  await prompt(page).press('Enter');
  expect(await page.evaluate(() => window.ollamaFixture.chats[0].messages.at(-1).content)).toBe(source);
  await this.context.setOffline(true);
  const document = '# Catalog\n\n[Jump](#target)\n\n> [!TIP]\n> A helpful alert.\n\n*[HTML]: Hyper Text Markup Language\n\nHTML :smile: H~2~O x^2^ ++added++ !!secret!! {中国:zhōng|guó} ::verified:: *Recommended*\n\nTerm\n: Definition\n\n::: tabs#examples\n@tab One\nFirst panel\n@tab Two\nSecond panel\n:::\n\n::: details More\n**Hidden details**\n:::\n\n::: demo Example\n**Preview**\n:::\n\n::: fields\n@`value` type=string required\nThe description.\n:::\n\n@grids grid-cols-2\n@grid\nLeft\n@grid\nRight\n@end\n\n![Caption =120x80](https://example.invalid/picture.png#dark)\n\n{% youtube abcdef12345 %}\n\n@[audio title="Sound"](https://example.invalid/sample.mp3)\n\n@startuml\nAlice -> Bob\n@enduml\n\n```mathjax\n\\frac{1}{2}+x^2\n```\n\n## Target {#target style="color:inherit"}';
  await page.evaluate(text => window.ollamaFixture.pending[0].append(text), document);
  const answer = reply(page);
  await expect(answer.locator('mjx-container[jax="SVG"]')).toHaveCount(1);
  await expect(answer.locator('mjx-container svg')).toBeVisible();
  await expect(answer.locator('.markdown-alert')).toContainText('helpful alert');
  await expect(answer.locator('abbr')).toHaveAttribute('title','Hyper Text Markup Language');
  await expect(answer.locator('.chat-badge')).toHaveText('Recommended');
  await expect(answer.locator('dt').first()).toHaveText('Term');
  await expect(answer.locator('.field-name')).toHaveText('value');
  await expect(answer.locator('figcaption')).toHaveText('Caption');
  await expect(answer.locator('.chat-resource-load')).toHaveCount(4);
  await expect(answer.locator('img,iframe,audio,video')).toHaveCount(0);
  const second = answer.getByRole('tab',{name:'Two',exact:true}); await second.click();
  await expect(answer.getByRole('tabpanel')).toHaveText('Second panel');
  await second.press('ArrowLeft'); await expect(answer.getByRole('tab',{name:'One',exact:true})).toBeFocused();
  await expect(answer.getByRole('tabpanel')).toHaveText('First panel');
  const spoiler = answer.locator('.spoiler'); await spoiler.click(); await expect(spoiler).toHaveAttribute('aria-expanded','true');
  await spoiler.press('Enter'); await expect(spoiler).toHaveAttribute('aria-expanded','false');
  await second.click(); await spoiler.click();
  await page.evaluate(() => window.ollamaFixture.pending[0].append('\n\nA later streamed paragraph.'));
  await expect(answer).toContainText('A later streamed paragraph.');
  await expect(second).toHaveAttribute('aria-selected','true'); await expect(spoiler).toHaveAttribute('aria-expanded','true');
  const before = page.url(); await answer.getByRole('link',{name:'Jump',exact:true}).click();
  await expect(answer.getByRole('heading',{name:'Target',exact:true})).toBeFocused(); expect(page.url()).toBe(before);
  await page.evaluate(() => window.ollamaFixture.pending[0].complete());
  await expect(page.getByRole('button',{name:'Stop generating',exact:true})).toHaveCount(0);
  await expect(second).toHaveAttribute('aria-selected','true');
  expect(this.requests.some(request => /example.invalid|youtube|plantuml|cdn.jsdelivr|mathjax/.test(request.url))).toBe(false);
  await this.context.setOffline(false);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.route('https://example.invalid/picture.png', route => route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
  await answer.getByRole('button',{name:'Load image',exact:true}).first().click();
  await expect(answer.locator('img')).toHaveAttribute('loading','lazy'); await expect(answer.locator('img')).toHaveAttribute('width','120');
  await expect.poll(() => answer.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await mkdir(this.artifactDirectory,{recursive:true}); await page.screenshot({path:`${this.artifactDirectory}/mdit-catalog.png`});
});

Then('AI Markdown resolves repository includes and snippets while sending original directives', async function () {
  const page = this.page; await fixture(this); await page.evaluate(() => window.ollamaFixture.mode = 'deferred');
  const source = '<!-- @include: docs/a.md -->\n\n<<< code.ts#example{2 ts}';
  // Import through the application, including ordinary files and no Node-side preview service.
  const directory = `${this.artifactDirectory}/markdown-import`;
  await mkdir(`${directory}/docs`,{recursive:true});
  await writeFile(`${directory}/docs/a.md`,'## Local document\n\n<!-- @include: b.md -->');
  await writeFile(`${directory}/docs/b.md`,'**Nested repository content**');
  await writeFile(`${directory}/code.ts`,'// #region example\nconst first = 1;\nconst second = 2;\n// #endregion example');
  await page.getByLabel('Import directory',{exact:true}).setInputFiles(directory); await saved(page);
  await send(page,source);
  await expect(messages(page).locator('.question h2')).toHaveText('Local document');
  await expect(messages(page).locator('.question strong')).toHaveText('Nested repository content');
  await expect(messages(page).locator('.question pre code')).toContainText('const first = 1;');
  await expect(messages(page).locator('.question .chat-code-line-highlight')).toHaveText('const second = 2;');
  await page.evaluate(text => window.ollamaFixture.pending[0].append(text),source);
  await expect(reply(page).getByRole('heading',{name:'Local document',exact:true})).toBeVisible();
  await expect(reply(page).locator('strong')).toHaveText('Nested repository content');
  expect(await page.evaluate(() => window.ollamaFixture.chats[0].messages.at(-1).content)).toBe(source);
  await page.evaluate(() => window.ollamaFixture.pending[0].complete());
  await expect(page.getByRole('button',{name:'Stop generating',exact:true})).toHaveCount(0);
  await mkdir(this.artifactDirectory,{recursive:true}); await page.screenshot({path:`${this.artifactDirectory}/mdit-imports.png`});
});

Then('rendered Markdown retains clear hierarchy lists and nested spacing without overflowing the AI pane', async function () {
  const page = this.page; await fixture(this); await page.evaluate(() => window.ollamaFixture.mode = 'deferred');
  await send(page, 'Review the release plan and the examples.');
  const source = `# Release plan

A focused release with **clear ownership**, *practical milestones* and a concise review of the work. Read the [implementation guide](https://example.invalid/guide), inspect \`release.target\`, or follow the note[^review].

## Delivery checklist

1. Confirm the scope and owners.
2. Prepare the release candidate.
   - Review compatibility with existing consumers.
   - Run the focused validation scenarios.
3. Publish the approved version.

- [x] Review the API contract
- [ ] Confirm deployment readiness

### Implementation

Keep the public interface small. The configuration below makes the intended behavior explicit.

\`\`\`ts
const release = {
  name: 'October release',
  target: 'production',
  verify: true,
};
const identifier = '${'a'.repeat(110)}';
\`\`\`

#### Compatibility

| Component | Owner | Status | Duration |
| :--- | :--- | :--- | ---: |
| Browser storage | Platform | Ready | 12 ms |
| Repository history | Editor | In review | 480 ms |
| Markdown rendering | Interface | Ready | 28 ms |

> A release is ready when a reviewer can understand its behavior.
>
> Keep the scope explicit and document the important decisions.

##### Review notes

> [!NOTE]
> The preview uses the same document styles in every conversation.
>
> - Keep nested content readable.
> - Preserve clear paragraph spacing.

> [!TIP]
> Prefer a short example that explains one decision.

> [!WARNING]
> Check compatibility before changing public contracts.

::: details Validation details
The candidate has completed the source checks.

A second paragraph explains the remaining manual review.

- Inspect the result at a narrow width.
- Verify both light and dark appearances.
:::

::: tabs
@tab TypeScript
**Typed configuration** with an explicit target.

A second paragraph inside the selected tab.
@tab JavaScript
Use the same values without type annotations.
:::

::: fields
@\`target\` type=string required
The environment receiving the release.

This value stays explicit at the call site.

@\`verify\` type=boolean default=true
Run validation before publishing.
:::

Definition
: A bounded change with a named owner and visible validation.

Inline extensions: ==highlight==, ++added++, ~~removed~~, H~2~O, x^2^, !!a hidden note!! and *Recommended*.

The expected growth is $x^2 + y^2 = z^2$.

###### References

Use the documented contract as the source for the next review.

[^review]: Review the behavior before publishing the release.`;
  await page.evaluate(text => { window.ollamaFixture.pending[0].append(text); window.ollamaFixture.pending[0].complete(); }, source);
  const answer = reply(page), region = messages(page);
  await expect(answer.getByRole('heading', { name: 'Release plan', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', {name:'Stop generating',exact:true})).toHaveCount(0);
  await mkdir(this.artifactDirectory, {recursive:true});
  const measurements = [];
  for (const palette of ['default', 'obsidian']) for (const theme of ['light', 'dark']) {
    await page.evaluate(({palette,theme}) => { document.documentElement.dataset.palette = palette; document.documentElement.dataset.theme = theme; }, {palette,theme});
    for (const width of [1280,600]) {
      await page.setViewportSize({width,height:940});
      await expect.poll(() => region.evaluate(node => node.clientWidth > 0)).toBe(true);
      await region.evaluate(node => node.scrollTop = 0);
      const result = await answer.evaluate(node => {
        const headingSizes = [...node.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(heading => Number.parseFloat(getComputedStyle(heading).fontSize));
        const list = node.querySelector('ol:not(.footnotes-list)'), bullet = list.querySelector('ul');
        const note = node.querySelector('blockquote:not(.markdown-alert)'), paragraphs = note.querySelectorAll('p');
        const code = node.querySelector('pre'), document = node.querySelector('.markdown-message');
        const headerLines = [...node.querySelectorAll('th')].map(header => { const range = node.ownerDocument.createRange(); range.selectNodeContents(header); return range.getClientRects().length; });
        return {headingSizes,bodySize:Number.parseFloat(getComputedStyle(document).fontSize),numbered:getComputedStyle(list).listStyleType,bulleted:getComputedStyle(bullet).listStyleType,
          headerLines,
          quoteGap:paragraphs[1].getBoundingClientRect().top - paragraphs[0].getBoundingClientRect().bottom,
          codeScrolls:code.scrollWidth > code.clientWidth,documentFits:document.scrollWidth <= document.clientWidth + 1,
          pageFits:window.document.documentElement.scrollWidth <= innerWidth,
          inlineCodeBackground:getComputedStyle(node.querySelector('p code')).backgroundColor};
      });
      measurements.push({palette,theme,width,...result});
      if (process.env.MARKDOWN_STYLE_BASELINE !== 'true') {
        expect(result.numbered).toBe('decimal'); expect(['disc','circle','square']).toContain(result.bulleted);
        expect(result.headingSizes.every((size,index,array) => index === 0 || size < array[index-1])).toBe(true);
        expect(Math.min(...result.headingSizes)).toBeGreaterThanOrEqual(result.bodySize);
        expect(result.headerLines.every(count => count === 1)).toBe(true);
        expect(result.quoteGap).toBeGreaterThan(5);
        expect(result.codeScrolls).toBe(true); expect(result.documentFits).toBe(true); expect(result.pageFits).toBe(true);
        expect(result.inlineCodeBackground).toBe('rgba(0, 0, 0, 0)');
      }
      await page.screenshot({path:`${this.artifactDirectory}/markdown-${palette}-${theme}-${width}-top.png`});
      await answer.getByRole('heading',{name:'Review notes',exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:`${this.artifactDirectory}/markdown-${palette}-${theme}-${width}-extensions.png`});
    }
  }
  await answer.locator('summary',{hasText:'Validation details'}).click();
  await expect(answer.locator('details')).toHaveAttribute('open','');
  await expect(answer.locator('details')).toContainText('A second paragraph');
  await answer.getByRole('tab',{name:'JavaScript',exact:true}).click();
  await expect(answer.getByRole('tabpanel')).toContainText('without type annotations');
  await answer.getByRole('tab',{name:'JavaScript',exact:true}).press('ArrowLeft');
  const focused = answer.getByRole('tab',{name:'TypeScript',exact:true}); await focused.hover();
  await expect(focused).toBeFocused();
  expect(await focused.evaluate(node => node.matches(':focus-visible'))).toBe(true);
  await page.screenshot({path:`${this.artifactDirectory}/markdown-tabs-focused.png`});
  await answer.locator('.field-name').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:`${this.artifactDirectory}/markdown-definitions.png`});
  await answer.locator('.footnotes').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${this.artifactDirectory}/markdown-footnotes.png`});
  await writeFile(`${this.artifactDirectory}/markdown-presentation.json`,JSON.stringify(measurements,null,2));
});

Then('AI settings configure the Pi tools instructions and per-model context with visible results', async function () {
  const page = this.page; await fixture(this);
  const directory = `${this.artifactDirectory}/pi-repository`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/README.md`, '# Browser repository\nA verified local project.');
  await page.getByLabel('Import directory', { exact: true }).setInputFiles(directory); await saved(page);
  await selectPage(page, 'Settings');
  const instruction = page.locator('#setting-aiInstructions');
  await instruction.fill('Read the repository before explaining it.'); await instruction.press('Tab'); await saved(page);
  await expect(page.locator('#setting-ai-tool-list_files')).toBeChecked();
  await page.locator('#setting-ai-tool-search_text').uncheck(); await saved(page);
  await selectPage(page, 'Editor');
  const limit = page.getByRole('spinbutton', { name: 'Model context limit', exact: true });
  await expect(limit).toHaveValue('262144'); await expect(limit).toHaveAttribute('max', '262144');
  await limit.fill('8192'); await limit.press('Tab'); await saved(page);
  await page.evaluate(() => window.ollamaFixture.mode = 'tools');
  await send(page, 'Inspect this repository.');
  await expect(reply(page)).toHaveText('The README describes a real browser repository.');
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  const calls = await page.evaluate(() => window.ollamaFixture.chats);
  expect(calls).toHaveLength(6); expect(calls[0].messages[0].content).toContain('Read the repository before explaining it.');
  expect(calls[0].tools.map(tool => tool.function.name)).toEqual(['git_log', 'git_commit', 'git_branches', 'git_status', 'git_diff', 'list_files', 'read_file', 'read_settings']);
  expect(calls.every(call => call.options.num_ctx === 8192)).toBe(true);
  expect(calls[2].messages.at(-1).content).toContain('A verified local project.');
  expect(JSON.parse(calls[3].messages.at(-1).content).values.fontSize).toBe(13);
  expect(JSON.parse(calls[4].messages.at(-1).content)).toHaveProperty('commits');
  expect(JSON.parse(calls[5].messages.at(-1).content)).toHaveProperty('files');
  const activities = messages(page).locator('.tool-activity'); await expect(activities).toHaveCount(5);
  await activities.nth(1).locator('summary').click(); await expect(activities.nth(1)).toContainText('A verified local project.');
  await expect(page.locator('.context-meter')).toContainText('813 /');
  await selectDropdown(page, 'AI model', 'another-local:7b'); await expect(limit).toHaveValue('16384');
  await selectDropdown(page, 'AI model', 'ornith:9b-q8_0'); await expect(limit).toHaveValue('8192');
  await addChat(page); await expect(page.getByRole('button', { name: 'AI connection', exact: true })).toBeVisible();
  await selectDropdown(page, 'AI connection', 'local-ollama'); await expect(prompt(page)).toBeEnabled();
  await tab(page, 2).click({ button: 'middle' }); await expect(tab(page, 2)).toHaveCount(0);
  await expect(tab(page, 1)).toHaveAttribute('aria-selected', 'true');
  await mkdir(this.artifactDirectory, { recursive: true }); await page.screenshot({ path: `${this.artifactDirectory}/pi-tools-context.png` });
  await page.reload(); await saved(page); await selectPage(page, 'Settings');
  await expect(instruction).toHaveValue('Read the repository before explaining it.');
  await expect(page.locator('#setting-ai-tool-search_text')).not.toBeChecked();
});

Then('AI skills can be imported edited toggled and loaded through Pi', async function () {
  const page=this.page;await fixture(this);await selectPage(page,'Settings');
  await page.getByLabel('Import skill file',{exact:true}).setInputFiles({name:'SKILL.md',mimeType:'text/markdown',buffer:Buffer.from('---\nname: review-code\ndescription: Review code using repository evidence.\n---\nRead files first. Skill proof: browser-skill-42')});
  await expect(page.getByRole('textbox',{name:'Skill name',exact:true})).toHaveValue('review-code');
  await page.getByRole('button',{name:'Save skill',exact:true}).click();await saved(page);
  const enabled=page.getByRole('switch',{name:'Enable skill review-code',exact:true});await expect(enabled).toBeChecked();
  await page.getByRole('button',{name:'Edit skill review-code',exact:true}).click();
  await page.getByRole('textbox',{name:'Skill description',exact:true}).fill('Review implementation with evidence.');
  await page.getByRole('button',{name:'Save skill',exact:true}).click();await saved(page);
  await enabled.uncheck();await saved(page);await enabled.check();await saved(page);
  await selectPage(page,'Editor');await page.evaluate(()=>window.ollamaFixture.mode='skills');
  await send(page,'Use review-code to review the implementation.');await expect(reply(page)).toHaveText('Loaded the code review skill.');
  await expect(page.getByRole('button',{name:'Stop generating',exact:true})).toHaveCount(0);
  const calls=await page.evaluate(()=>window.ollamaFixture.chats);expect(calls).toHaveLength(2);
  expect(calls[0].messages[0].content).toContain('Review implementation with evidence.');expect(calls[0].messages[0].content).not.toContain('browser-skill-42');
  expect(calls[1].messages.at(-1).content).toContain('browser-skill-42');
  await expect(messages(page).locator('.tool-activity')).toContainText('load_skill');
  await page.reload();await saved(page);await selectPage(page,'Settings');await expect(enabled).toBeChecked();
  await page.getByRole('button',{name:'Remove skill review-code',exact:true}).click();await saved(page);await expect(enabled).toHaveCount(0);
});

Then('Git and AI panes can remain open together across reload',async function(){
  const page=this.page;await page.setViewportSize({width:1600,height:900});await fixture(this,false);
  const directory=`${this.artifactDirectory}/both-panes`;await mkdir(directory,{recursive:true});await writeFile(`${directory}/README.md`,'# Both panes');
  await page.getByLabel('Import directory',{exact:true}).setInputFiles(directory);await saved(page);
  const closeGit=()=>page.getByRole('region',{name:/^Git ·/}).getByRole('button',{name:'Close',exact:true});
  await page.getByRole('button',{name:'Git operations',exact:true}).click();
  await expect(page.getByRole('button',{name:'Close AI',exact:true})).toBeVisible();await expect(closeGit()).toBeVisible();
  const ai=await page.locator('[data-ollama-panel]').boundingBox();const git=await page.locator('[data-git-panel]').boundingBox();expect(ai.x).toBeGreaterThanOrEqual(git.x+git.width-2);
  await page.screenshot({path:`${this.artifactDirectory}/git-ai-desktop.png`});await saved(page);
  await page.reload();await saved(page);await expect(page.getByRole('button',{name:'Close AI',exact:true})).toBeVisible();await expect(closeGit()).toBeVisible();
  await page.setViewportSize({width:600,height:800});
  await expect(page.getByRole('button',{name:'Close AI',exact:true})).toBeVisible();await expect(closeGit()).toBeVisible();
  const top=await page.locator('[data-git-panel]').boundingBox(),bottom=await page.locator('[data-ollama-panel]').boundingBox();expect(bottom.y).toBeGreaterThanOrEqual(top.y+top.height-2);
  await page.screenshot({path:`${this.artifactDirectory}/git-ai-compact.png`});
  await page.setViewportSize({width:1600,height:900});
  await closeGit().click();await expect(page.getByRole('button',{name:'Close AI',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Git operations',exact:true}).click();await page.getByRole('button',{name:'Close AI',exact:true}).click();await expect(closeGit()).toBeVisible();
});

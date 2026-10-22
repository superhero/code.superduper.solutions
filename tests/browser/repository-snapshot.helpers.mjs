// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { repositorySelector } from './navigation.helpers.mjs';

/** Read fixture metadata without mounting a closed History pane or changing navigation. */
async function readRepository(page, method) {
  const repositoryId = await repositorySelector(page).getAttribute('data-value');
  assert.ok(repositoryId);
  for (const worker of page.workers()) {
    if (await worker.evaluate(() => self.name) !== 'code-repositories') continue;
    return worker.evaluate(({repositoryId,method}) => new Promise((resolve, reject) => {
      const id = `repository-snapshot:${crypto.randomUUID()}`;
      const original = globalThis.postMessage;
      const restore = () => { globalThis.postMessage = original; clearTimeout(timeout); };
      const timeout = setTimeout(() => { restore(); reject(new Error('Repository snapshot timed out')); }, 10000);
      globalThis.postMessage = function (reply, ...options) {
        if (reply?.id !== id) return original.call(this, reply, ...options);
        restore();
        if (reply.error) reject(new Error(reply.error.message));
        else resolve(reply.value);
      };
      try { globalThis.dispatchEvent(new MessageEvent('message', {data:{id,method,args:[repositoryId]}})); }
      catch (error) { restore(); reject(error); }
    }), {repositoryId,method});
  }
  throw new Error('The repository worker must be running');
}

export const repositorySnapshot = page => readRepository(page,'open');
export const repositoryGitStatus = page => readRepository(page,'gitStatus');

export async function repositoryHistories(page) {
  const snapshot = await repositorySnapshot(page);
  return {edits:snapshot.history.map(entry => entry.oid),commits:snapshot.commits.map(entry => entry.oid)};
}

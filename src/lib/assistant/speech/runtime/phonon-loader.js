// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
/** Pthreads auto-initialize without main-thread options. Resolve their Wasm URL before importing a cached Blob module. */
export function patchPhononModule(source, wasmURL) {
  const before = 'new URL("phonon_browser.wasm",import.meta.url).href';
  if (source.split(before).length !== 2 || !wasmURL.startsWith('blob:')) throw Error('Phonon Blob loader context differs from its pinned build.');
  return source.replace(before, JSON.stringify(wasmURL));
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
/** Resolve package metadata into a canonical, navigable GitHub repository URL. */
export function githubRepository(repository) {
  let value = typeof repository === 'string' ? repository : repository?.url;
  if (typeof value !== 'string') throw new Error('Missing package GitHub repository.');
  value = value.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^git@github.com:/, 'https://github.com/');
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) value = `https://github.com/${value}`;
  const url = new URL(value);
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname !== 'github.com' || parts.length < 2) throw new Error(`Unsupported package repository: ${value}`);
  return `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/, '')}`;
}

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {formats,providers} from '../../src/lib/formatting/formats.ts';
import {selectDropdown} from './navigation.helpers.mjs';
export const formatterPane=page=>page.getByRole('region',{name:'Formatters',exact:true});
export function formatterProvider(name){const provider=providers.find(item=>item.id===name || item.name===name);assert.ok(provider,name);return provider;}
export function formatterRow(page,name){const provider=formatterProvider(name),format=formats.find(item=>item.providers.includes(provider.id));assert.ok(format);return formatterPane(page).locator(`[data-format="${format.id}"]`);}
export async function selectFormatterPackage(page,name){
  const provider=formatterProvider(name),format=formats.find(item=>item.providers.includes(provider.id));assert.ok(format);
  await formatterPane(page).getByLabel('Find a formatter preference',{exact:true}).fill(format.label);
  const trigger=page.getByRole('button',{name:`${format.label} formatter`,exact:true});
  if(await trigger.getAttribute('data-value')!==provider.id){await selectDropdown(page,`${format.label} formatter`,provider.id);await expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');}
  return formatterRow(page,name);
}
export async function installFormatterPackage(page,name){
  const provider=formatterProvider(name),row=await selectFormatterPackage(page,name);
  const button=row.getByRole('button',{name:`Install ${provider.name}`,exact:true});
  if(await button.count())await button.click();
  await expect(row.getByRole('status')).toHaveText('Installed',{timeout:30_000});
}

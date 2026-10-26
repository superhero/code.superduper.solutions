// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
Then('repository engine choices inherit defaults and can clear explicit overrides',async function(){
  const saved=()=>expect(this.page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  const choice=this.page.getByRole('button',{name:'JSON language engine',exact:true});
  await selectPage(this.page, 'Settings', 'Languages');await selectDropdown(this.page,'Settings scope','global');
  await selectDropdown(this.page,'JSON language engine','none');await saved();
  await selectDropdown(this.page,'Settings scope','repository');
  await expect(choice).toHaveAttribute('data-value','inherit');await expect(choice).toContainText('Inherited · Disabled');
  await selectDropdown(this.page,'JSON language engine','json');await saved();
  await expect(choice).toHaveAttribute('data-value','json');
  await selectDropdown(this.page,'JSON language engine','inherit');await saved();
  await expect(choice).toContainText('Inherited · Disabled');
  await selectDropdown(this.page,'Settings scope','global');
  await selectDropdown(this.page,'JSON language engine','json');await saved();
  await selectDropdown(this.page,'Settings scope','repository');
  await expect(choice).toHaveAttribute('data-value','inherit');await expect(choice).toContainText('Inherited · JSON / JSONC');
  await this.page.reload({waitUntil:'networkidle'});await saved();
  await selectDropdown(this.page,'Settings scope','repository');
  await expect(choice).toHaveAttribute('data-value','inherit');await expect(choice).toContainText('Inherited · JSON / JSONC');
});

// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown,repositoryAction,openStagedHistory} from './navigation.helpers.mjs';

const colors=control=>control.evaluate(element=>({background:getComputedStyle(element).backgroundColor,foreground:getComputedStyle(element).color}));
async function foregroundOnly(page,control){
  await page.mouse.move(1,1);await expect(control).toBeEnabled();await control.evaluate(element=>element.blur());
  const before=await colors(control),palette=await control.evaluate(element=>{
    const probe=document.createElement('span');probe.style.background='var(--color-background)';probe.style.color='var(--color-foreground)';element.append(probe);
    const background=getComputedStyle(probe).backgroundColor,normalForeground=getComputedStyle(probe).color;
    probe.style.color='var(--control-hover-foreground,var(--color-hover-foreground))';const foreground=getComputedStyle(probe).color;
    probe.remove();return {background,normalForeground,foreground,settingsButton:Boolean(element.closest('.settings-page')&&element.matches('[data-slot="button"]'))};
  });
  if(palette.settingsButton){expect(before.background).toBe(palette.background);expect(before.foreground).toBe(palette.normalForeground);}
  await control.hover();await expect(control).toHaveCSS('background-color',before.background);await expect(control).toHaveCSS('color',palette.foreground);
  return before;
}

Then('standard controls preserve their backgrounds on hover and retain keyboard focus feedback',async function(){
  const page=this.page;await page.setViewportSize({width:1800,height:1000});
  await selectPage(page,'Settings','Editor');
  await foregroundOnly(page,page.getByRole('button',{name:'Indentation',exact:true}));
  await selectPage(page,'Settings','Appearance');
  await foregroundOnly(page,page.getByRole('button',{name:'Color mode',exact:true}));
  const reset=page.getByRole('button',{name:'Reset color mappings',exact:true});
  const before=await foregroundOnly(page,reset);
  await foregroundOnly(page,page.getByRole('button',{name:'Blend Local names color',exact:true}));
  await foregroundOnly(page,page.getByRole('button',{name:'Blend Parameter text color',exact:true}));
  await foregroundOnly(page,page.getByRole('button',{name:'Reset Parameter text color mix',exact:true}));
  await foregroundOnly(page,page.getByRole('button',{name:'Reset selection opacity',exact:true}));
  await reset.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  await expect(reset).toBeFocused();await expect.poll(()=>reset.evaluate(element=>element.matches(':focus-visible'))).toBe(true);
  await expect(reset).not.toHaveCSS('background-color',before.background);
  await selectPage(page,'Settings','Languages');
  const mappings=page.getByRole('region',{name:'Language mappings',exact:true});
  await foregroundOnly(page,mappings.getByRole('button',{name:'Add',exact:true}));
  await foregroundOnly(page,mappings.getByRole('button',{name:/^Show \d+ more of /}));
  await foregroundOnly(page,page.getByRole('region',{name:'Syntax highlighting',exact:true}).getByRole('button',{name:/^Show \d+ more of /}));
  await selectDropdown(page,'GraphQL language engine','graphql');
  await foregroundOnly(page,page.getByRole('button',{name:'Install GraphQL language engine',exact:true}));
  await selectDropdown(page,'JSON formatter','dprint-json');
  await foregroundOnly(page,page.getByRole('region',{name:'Formatters',exact:true}).locator('[data-format="json"]').getByRole('button',{name:'Install JSON',exact:true}));
  await selectPage(page,'Settings','Controls');
  await foregroundOnly(page,page.getByRole('button',{name:'Add Undo shortcut',exact:true}));
  await foregroundOnly(page,page.getByRole('button',{name:'Remove Undo shortcut 1',exact:true}));
  await selectPage(page,'Settings','AI');
  const ai=page.getByRole('tabpanel',{name:'AI',exact:true});
  await foregroundOnly(page,ai.getByRole('button',{name:'New skill',exact:true}));
  await foregroundOnly(page,ai.getByRole('button',{name:'Import SKILL.md',exact:true}));
  await selectPage(page,'Settings','Git');
  const integration=page.getByRole('region',{name:'GitHub integration',exact:true});
  await foregroundOnly(page,integration.getByRole('button',{name:'Install',exact:true}));
  await integration.getByRole('button',{name:'Install',exact:true}).click();await expect(integration.getByRole('button',{name:'Add connection',exact:true})).toBeEnabled();
  await foregroundOnly(page,integration.getByRole('button',{name:'Add connection',exact:true}));
  await selectPage(page,'Resources');
  await foregroundOnly(page,page.getByRole('region',{name:'Resources',exact:true}).locator('summary').first());
  await repositoryAction(page,'Rename repository');
  const dialog=page.getByRole('dialog',{name:'Rename repository',exact:true});
  await dialog.getByRole('textbox',{name:'Repository name',exact:true}).fill('Hover preview');
  await foregroundOnly(page,dialog.getByRole('button',{name:'Rename repository',exact:true}));
  await foregroundOnly(page,dialog.getByRole('button',{name:'Cancel',exact:true}));
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
});

Then('disabled controls stay unchanged while toolbars trees and history retain hover fills',async function(){
  const page=this.page;await page.setViewportSize({width:1800,height:1000});await page.mouse.move(1,1);
  const undo=page.locator('.editor-toolbar').getByRole('button',{name:'Undo',exact:true});
  await expect(undo).toBeEnabled();const toolbar=await colors(undo);await undo.hover();
  await expect(undo).not.toHaveCSS('background-color',toolbar.background);await expect(undo).toHaveCSS('color',toolbar.foreground);
  const redo=page.locator('.editor-toolbar').getByRole('button',{name:'Redo',exact:true});
  await expect(redo).toBeDisabled();const disabled=await colors(redo);await redo.hover({force:true});
  await expect(redo).toHaveCSS('background-color',disabled.background);await expect(redo).toHaveCSS('color',disabled.foreground);
  const tree=page.getByRole('treeitem',{name:'file10.txt',exact:true}).locator(':scope > .tree-row');
  const treeBefore=await tree.evaluate(element=>getComputedStyle(element,'::before').backgroundColor);await tree.hover();
  await expect.poll(()=>tree.evaluate(element=>getComputedStyle(element,'::before').backgroundColor)).not.toBe(treeBefore);
  await openStagedHistory(page);
  for(const [view,name] of [['Staged','Staged changes'],['Committed','Commit history']]){
    await page.getByRole('navigation',{name:'History views',exact:true}).getByRole('button',{name:view,exact:true}).click();
    const graph=page.getByRole('list',{name,exact:true}),row=graph.locator('li.selectable:has(> .change-load:enabled)').first();
    await page.mouse.move(1,1);await expect(row).toBeVisible();
    const background=await row.evaluate(element=>getComputedStyle(element,'::before').backgroundColor);
    await row.locator(':scope > .change-load').hover();
    await expect.poll(()=>row.evaluate(element=>getComputedStyle(element,'::before').backgroundColor)).not.toBe(background);
  }
  await selectPage(page,'Settings','Git');
  const integration=page.getByRole('region',{name:'GitHub integration',exact:true}),add=integration.getByRole('button',{name:'Add connection',exact:true});
  await expect(add).toBeDisabled();await page.mouse.move(1,1);const addColors=await colors(add),installColors=await colors(integration.getByRole('button',{name:'Install',exact:true}));
  expect(addColors.background).toBe(installColors.background);expect(addColors.foreground).not.toBe(installColors.foreground);
  await add.hover({force:true});expect(await colors(add)).toEqual(addColors);
});

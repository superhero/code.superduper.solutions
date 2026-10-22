// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {editMessage} from './edit-message.ts';
import {renderCommitMarkdown} from '../editor/commit-markdown.ts';
const unescape=text=>text.replaceAll('\\r','\r').replaceAll('\\n','\n').replaceAll('\\t','\t');
Then(/^an edit in "([^"]*)" from «([\s\S]*)» to «([\s\S]*)» is described as «([\s\S]*)»$/,function(path,before,after,message){
  const actual=editMessage(path,unescape(before),unescape(after));
  // Subjects remain Markdown-safe in Git and render as the requested plain text.
  const rendered=renderCommitMarkdown(actual).replace(/<[^>]+>/g,'').trim();
  assert.equal(rendered,message);
});
Then('whole-document formatting has one short subject and manual layout changes remain distinct',function(){
  assert.equal(editMessage('main.ts','const value=1;','const value = 1;\n','format'),'Format document');
  assert.equal(editMessage('main.ts','const value=1;','const value = 1;'),'Adjust whitespace');
  assert.equal(editMessage('main.ts','const value = 1;','const value = 1;'),'Restore original content');
});
Then('generated subjects have a bounded single line and preserve literal identifiers',function(){
  const name='longName'.repeat(20);
  const message=editMessage('main.ts',`const ${name} = 10;`,`const ${name} = 20;`);
  assert.ok(Array.from(message).length<=72);assert.ok(message.endsWith('…'));assert.ok(!/[\r\n]/.test(message));
  const literal=editMessage('main.ts','const __name__ = 1;','const __name__ = 2;');
  const html=renderCommitMarkdown(literal);assert.ok(!/<(?:em|strong)>/.test(html));assert.match(html,/__name__/);
  const strings=editMessage('config.json','"token": "old-private-value"','"token": "new-private-value"');
  assert.equal(strings,'Update token string');assert.ok(!strings.includes('private-value'));
  assert.equal(editMessage('config.yml','token: old_private_value','token: new_private_value'),'Update token');
});

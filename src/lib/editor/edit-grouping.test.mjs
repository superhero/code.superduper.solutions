// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {EditorSelection,EditorState} from '@codemirror/state';
import {EditGrouping,singleEditedLine} from './edit-grouping.ts';

const initial=()=>EditorState.create({doc:'one\ntwo',selection:{anchor:7}});
const type=(state,text='x')=>state.update({changes:{from:state.selection.main.head,insert:text},
  selection:{anchor:state.selection.main.head+text.length},userEvent:'input.type'});
Then('contiguous typing composition and deletion keep the same row edit group',function(){
  const grouping=new EditGrouping();let transaction=type(initial());
  const first=grouping.next(transaction,'file',0);assert.equal(first.line,2);
  transaction=type(transaction.state);assert.deepEqual(grouping.next(transaction,'file',1499),first);
  const head=transaction.state.selection.main.head;
  transaction=transaction.state.update({changes:{from:head-1,to:head},selection:{anchor:head-1},userEvent:'delete.backward'});
  assert.deepEqual(grouping.next(transaction,'file',1500),first);
  transaction=transaction.state.update({changes:{from:head-1,to:head-1,insert:'z'},selection:{anchor:head},userEvent:'input.type.compose'});
  assert.deepEqual(grouping.next(transaction,'file',1501),first);
  transaction=transaction.state.update({selection:{anchor:7}});
  grouping.reset();transaction=transaction.state.update({changes:{from:7,to:8},userEvent:'delete.forward'});
  const forward=grouping.next(transaction,'file',1502);assert.notEqual(forward.id,first.id);
  transaction=transaction.state.update({changes:{from:7,to:8},userEvent:'delete.forward'});
  assert.deepEqual(grouping.next(transaction,'file',1503),forward);
});
Then('a row edit group ends on {string}',function(boundary){
  const grouping=new EditGrouping();let transaction=type(initial()),time=1,document='file';
  const first=grouping.next(transaction,document,0);let state=transaction.state;
  if(boundary==='pause')time=1500;
  else if(boundary==='document change')document='other-file';
  else if(boundary==='focus loss')grouping.reset();
  else if(boundary==='cursor move'){
    const away=state.update({selection:{anchor:7}});grouping.next(away,document,time++);
    const back=away.state.update({selection:state.selection});grouping.next(back,document,time++);state=back.state;
  }else if(boundary==='row change'){
    transaction=state.update({changes:{from:0,insert:'x'},selection:{anchor:1},userEvent:'input.type'});
    const next=grouping.next(transaction,document,time);assert.notEqual(next.id,first.id);assert.equal(next.line,1);return;
  }else{
    const head=state.selection.main.head;
    if(boundary==='selection replace')state=state.update({selection:EditorSelection.single(head-1,head)}).state;
    if(boundary==='multiple cursors')state=EditorState.create({doc:state.doc,extensions:[EditorState.allowMultipleSelections.of(true)],
      selection:EditorSelection.create([EditorSelection.cursor(1),EditorSelection.cursor(head)])});
    transaction=state.update({changes:{from:state.selection.main.from,to:state.selection.main.to,insert:boundary==='line break'?'\n':'x'},
      userEvent:boundary==='paste'?'input.paste':boundary==='format'?'input.format':'input.type'});
    assert.equal(grouping.next(transaction,document,time++),undefined,boundary);state=transaction.state;
    state=state.update({selection:EditorSelection.single(state.doc.length)}).state;
  }
  const next=grouping.next(type(state),document,time);assert.notEqual(next.id,first.id,boundary);
});
Then('single row detection rejects multiline edits and preserves CRLF row numbers',function(){
  assert.equal(singleEditedLine('one\r\ntwo','one\r\ntwox'),2);
  assert.equal(singleEditedLine('one\ntwo','one\nx'),2);
  assert.equal(singleEditedLine('','x'),1);
  assert.equal(singleEditedLine('one\ntwo','one\ntwo'),undefined);
  assert.equal(singleEditedLine('one\ntwo','onex\ntwox'),undefined);
  assert.equal(singleEditedLine('one\ntwo','one\nt\nwo'),undefined);
  assert.equal(singleEditedLine('one\ntwo','onetwo'),undefined);
});

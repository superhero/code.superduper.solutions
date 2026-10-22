// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { layoutGitGraph, mainlineVersions, projectGraphBranches } from "./git-graph.ts";
import { historyBranchConnections, historyBranchMessageRows, historyConnectionKey, traceHistoryBranches } from "./history-motion.ts";

Then("branch labels independently expand their paths and nested junctions without inventing ancestry", function () {
  const versions=[version("main","root"),version("side-a","a","root"),version("nested","a"),version("a","root"),version("side-b","root"),version("root")];
  const before=structuredClone(versions);
  const project=ids=>projectGraphBranches(versions,"main",new Set(ids));
  const collapsed=project([]);
  assert.deepEqual(collapsed.versions.map(entry=>entry.oid),["main","root"]);
  assert.deepEqual(collapsed.branches.get("root").map(branch=>[branch.id,branch.count]),[["branch:side-a",2],["branch:side-b",1]]);
  assert.equal(collapsed.branches.has("a"),false);
  const first=project(["branch:side-a"]);
  assert.deepEqual(first.versions.map(entry=>entry.oid),["main","side-a","a","root"]);
  assert.deepEqual(first.branches.get("a").map(branch=>branch.id),["branch:nested"]);
  assert.ok(!first.versions.some(entry=>entry.oid==="side-b"));
  const nested=project(["branch:side-a","branch:nested"]);
  assert.ok(nested.versions.some(entry=>entry.oid==="nested"));
  assert.deepEqual(project(["branch:nested"]).versions,collapsed.versions);
  const all=project(["branch:side-a","branch:nested","branch:side-b"]);
  assert.equal(all.versions.length,versions.length);
  assert.deepEqual(versions,before);
  const scoped=[{...version("tip","hidden"),graphParents:["baseline"]},{...version("other","hidden"),graphParents:["baseline"]}];
  const baseline=projectGraphBranches(scoped,"tip",new Set());
  assert.deepEqual(baseline.anchors,["baseline"]);
  assert.equal(baseline.branches.get("baseline")[0].id,"branch:other");
  assert.ok(layoutGitGraph(baseline.versions,baseline.anchors).rows.some(row=>row.anchor&&row.version.oid==="baseline"));
  const missing=projectGraphBranches([version("tip","unknown"),version("other","unknown")],"tip",new Set(["branch:other"]));
  assert.ok(!layoutGitGraph(missing.versions,missing.anchors).rows.some(row=>row.version.oid==="unknown"));
  assert.equal(layoutGitGraph(missing.versions,missing.anchors).rows.flatMap(row=>row.segments).length,0);
  const merge=[version("merge","a","root"),version("a","root"),version("root")];
  const folded=projectGraphBranches(merge,"merge",new Set());
  assert.equal(folded.branches.get("merge")[0].connection,true);
  const connected=projectGraphBranches(merge,"merge",new Set(["connection:merge:root"]));
  assert.deepEqual(connected.versions[0].graphParents,["a","root"]);
});

Then("collapsed ancestry follows the selected first parent without changing retained history", function () {
  const versions = [version("merge","left","right"),version("fork","root"),version("left","root"),version("right","root"),version("root")];
  const original = structuredClone(versions);
  const mainline = mainlineVersions(versions,"merge");
  assert.deepEqual(mainline.map(entry=>entry.oid),["merge","left","root"]);
  assert.equal(layoutGitGraph(mainline).laneCount,1);
  assert.deepEqual(mainline[0].parents,["left","right"]);
  assert.deepEqual(mainline[0].graphParents,["left"]);
  assert.deepEqual(mainlineVersions(versions,"fork").map(entry=>entry.oid),["fork","root"]);
  assert.deepEqual(mainlineVersions(versions,"root").map(entry=>entry.oid),["root"]);
  assert.deepEqual(mainlineVersions(versions,"root",true).map(entry=>entry.oid),["merge","left","root"]);
  assert.deepEqual(mainlineVersions(versions,"fork",true).map(entry=>entry.oid),["fork","root"]);
  const linear=[version("c","b"),version("b","a"),version("a")];
  assert.deepEqual(mainlineVersions(linear,"b",true).map(entry=>entry.oid),["c","b","a"]);
  assert.deepEqual(versions,original);
  assert.deepEqual(mainlineVersions([],null),[]);
  assert.deepEqual(mainlineVersions(versions,"missing"),mainline);
  const projected=[{...version("tip","hidden"),graphParents:["base"]},version("base")];
  assert.deepEqual(mainlineVersions(projected,"tip").map(entry=>entry.oid),["tip","base"]);
  assert.deepEqual(mainlineVersions([version("a","b"),version("b","a")],"a").map(entry=>entry.oid),["a","b"]);
});

const version = (oid, ...parents) => ({ oid, parents, message: `Change ${oid}`, timestamp: 0 });

// Follow rendered lines across row boundaries to recover their Git edges. This
// catches disconnected lanes and false junctions independently of placement.
function renderedEdges(graph) {
  const edges = [];
  const pending = new Map();
  for (const row of graph.rows) {
    const next = new Map();
    for (const segment of row.segments) {
      assert.ok(segment.from >= 0 && segment.from < graph.laneCount);
      assert.ok(segment.to >= 0 && segment.to < graph.laneCount);
      if (segment.kind === "outgoing") {
        assert.equal(segment.from, row.lane);
        assert.equal(next.has(segment.to), false, "parent paths cannot join between commits");
        next.set(segment.to, row.version.oid);
      } else {
        assert.ok(pending.has(segment.from), "every incoming line continues a child edge");
        const child = pending.get(segment.from);
        pending.delete(segment.from);
        if (segment.kind === "incoming") {
          assert.equal(segment.to, row.lane);
          edges.push(`${child}->${row.version.oid}`);
        } else {
          assert.equal(segment.kind, "through");
          assert.equal(segment.from, segment.to);
          assert.equal(next.has(segment.to), false);
          next.set(segment.to, child);
        }
      }
    }
    assert.equal(pending.size, 0, "every child edge continues or reaches its parent");
    for (const [lane, child] of next) pending.set(lane, child);
  }
  assert.equal(pending.size, 0, "no line continues below the final commit");
  return edges.sort();
}

Then("a linear Git graph traces every parent in a single lane", function () {
  const graph = layoutGitGraph([version("c", "b"), version("b", "a"), version("a")]);
  assert.equal(graph.laneCount, 1);
  assert.deepEqual(graph.rows.map(row => row.lane), [0, 0, 0]);
  assert.deepEqual(renderedEdges(graph), ["b->a", "c->b"]);
});

Then("divergent Git futures meet only at their real common ancestor", function () {
  const graph = layoutGitGraph([
    version("new-tip", "new-parent"), version("old-tip", "old-parent"),
    version("old-parent", "shared"), version("new-parent", "shared"), version("shared"),
  ]);
  assert.equal(graph.laneCount, 2);
  assert.deepEqual(graph.rows.map(row => row.lane), [0, 1, 1, 0, 0]);
  assert.deepEqual(renderedEdges(graph), [
    "new-parent->shared", "new-tip->new-parent", "old-parent->shared", "old-tip->old-parent",
  ]);
  assert.equal(graph.rows.at(-1).segments.filter(segment => segment.kind === "incoming").length, 2);
});

Then("a Git merge graph traces both parent paths back to their shared root", function () {
  const graph = layoutGitGraph([
    version("merge", "left", "right", "right"), version("left", "root"),
    version("right", "root"), version("root"),
  ]);
  assert.equal(graph.laneCount, 2);
  assert.deepEqual(renderedEdges(graph), ["left->root", "merge->left", "merge->right", "right->root"]);
  assert.equal(graph.rows[0].segments.length, 2, "duplicate parent entries do not duplicate graph edges");
});

Then("a partial Git graph stops at missing parents and ignores backwards edges", function () {
  const graph = layoutGitGraph([
    version("child", "missing", "parent"), version("unrelated", "absent"),
    version("parent", "child", "parent"),
  ]);
  assert.deepEqual(renderedEdges(graph), ["child->parent"]);
  assert.equal(graph.rows[1].segments.some(segment => segment.kind === "outgoing"), false);
});

Then("a scoped Git graph connects projected ancestors without changing actual parents", function () {
  const versions = [
    { ...version("new-tip", "hidden-checkout"), graphParents: ["shared"] },
    version("old-tip", "shared"),
    { ...version("unrelated", "hidden-root"), graphParents: [] },
    version("shared"),
  ];
  const before = structuredClone(versions);
  const graph = layoutGitGraph(versions);
  assert.deepEqual(renderedEdges(graph), ["new-tip->shared", "old-tip->shared"]);
  assert.equal(graph.rows[3].segments.filter(segment => segment.kind === "incoming").length, 2);
  assert.equal(graph.rows[2].segments.some(segment => segment.kind !== "through"), false);
  assert.deepEqual(versions, before, "Drawing a hidden ancestry bridge never rewrites Git parents");
});

Then("scoped Git forks meet at their certified hidden baseline without joining unrelated roots", function () {
  const versions = [
    { ...version("recent", "hidden-checkout"), graphParents: ["baseline"] },
    version("older-tip", "older-root"),
    { ...version("older-root", "baseline"), graphParents: ["baseline"] },
    { ...version("unrelated", "separate-baseline"), graphParents: ["separate-baseline"] },
    version("unknown", "baseline"),
  ];
  const graph = layoutGitGraph(versions);
  assert.deepEqual(graph.rows.filter(row => row.anchor).map(row => row.version.oid), ["baseline"]);
  assert.deepEqual(renderedEdges(graph), ["older-root->baseline", "older-tip->older-root", "recent->baseline", "unknown->baseline"]);
  assert.equal(graph.rows.at(-1).anchor, true);
  assert.equal(graph.rows.at(-1).segments.filter(segment => segment.kind === "incoming").length, 3);
  assert.equal(graph.rows.find(row => row.version.oid === "unrelated").segments.some(segment => segment.kind === "outgoing"), false);
});

Then("a Git graph reuses empty lanes while retaining continuous parent paths", function () {
  const graph = layoutGitGraph([
    version("a", "b"), version("x", "y"), version("b"),
    version("z", "q"), version("y"), version("q"),
  ]);
  assert.equal(graph.laneCount, 2);
  assert.deepEqual(graph.rows.map(row => row.lane), [0, 1, 0, 0, 1, 0]);
  assert.deepEqual(renderedEdges(graph), ["a->b", "x->y", "z->q"]);
});

Then("an empty Git graph has no rows or lanes", function () {
  assert.deepEqual(layoutGitGraph([]), { rows: [], laneCount: 0 });
});

Then("Git graph layout leaves frozen history unchanged and is deterministic", function () {
  const versions = [version("later", "root"), version("other", "root"), version("root")];
  const before = structuredClone(versions);
  for (const item of versions) { Object.freeze(item.parents); Object.freeze(item); }
  Object.freeze(versions);
  const first = layoutGitGraph(versions);
  assert.deepEqual(layoutGitGraph(versions), first);
  assert.deepEqual(versions, before);
  assert.deepEqual(first.rows.map(row => row.version.oid), ["later", "other", "root"]);
  first.rows.forEach((row, index) => assert.equal(row.version, versions[index]));
  assert.deepEqual(renderedEdges(first), ["later->root", "other->root"]);
});

Then("history line summaries list up to ten lines and count larger changes", async function () {
  const {changedLines} = await import("./line-summary.ts");
  const change = (before, after, binary = false) => ({path: "file.txt", before, after, binary});
  const ten = Array.from({length:10}, (_, i) => ({from:i*2+1,to:i*2+1}));
  assert.equal(changedLines(change(ten,ten)), "lines 1, 3, 5, 7, 9, 11, 13, 15, 17, 19");
  const eleven = [...ten, {from:21,to:21}];
  assert.equal(changedLines(change(eleven,eleven)), "11 lines edited");
  assert.equal(changedLines(change([{from:3,to:13}],[{from:3,to:13}])), "11 lines edited");
  assert.equal(changedLines(change([],eleven)), "11 lines added");
  assert.equal(changedLines(change(eleven,[])), "11 lines deleted");
  assert.equal(changedLines(change(eleven,ten)), "11 lines → 10 lines edited");
  assert.equal(changedLines(change([],[])), "");
  assert.equal(changedLines(change(eleven,eleven,true)), "binary change");
});

const motionRow = (oid,timestamp) => ({version:{oid,timestamp,parents:[],message:oid},lane:0,segments:[]});
function motionFixture(){
  const before=[motionRow("newer",100),motionRow("between",80),motionRow("junction",10),motionRow("older",5)];
  const after=[before[0],motionRow("branch-b",90),before[1],motionRow("branch-a",70),before[2],before[3]];
  const branches=[{id:"branch:a",tip:"branch-a",count:1},{id:"branch:b",tip:"branch-b",count:1}];
  return {before,after,branches};
}
Then('branch message motion includes intervening commits and leaves newer and older messages alone',function(){
  const {before,after,branches}=motionFixture(),snapshot=structuredClone({before,after});
  assert.deepEqual([...historyBranchMessageRows(before,after,"junction",branches)].sort(),["between","branch-a","branch-b","junction"]);
  assert.deepEqual({before,after},snapshot,'Selecting an animation range does not mutate graph data');
});
Then('branch message motion follows dates even when graph rows are not in timestamp order',function(){
  const {before,after,branches}=motionFixture();
  before.unshift(motionRow("intervening-out-of-order",50));
  after.push(before[0]);
  after[after.length-2]={...after.at(-2),lane:4};
  assert.ok(historyBranchMessageRows(before,after,"junction",branches).has("intervening-out-of-order"));
  assert.ok(!historyBranchMessageRows(before,after,"junction",branches).has("older"),
    'A lane change outside the timestamp interval does not animate an older message');
});
Then('branch message motion has the same bounded scope when opening and closing',function(){
  const {before,after,branches}=motionFixture();
  assert.deepEqual([...historyBranchMessageRows(before,after,"junction",branches)].sort(),
    [...historyBranchMessageRows(after,before,"junction",branches)].sort());
});
Then('connection-only branch message motion stays between its endpoint timestamps',function(){
  const rows=[motionRow("newer",60),motionRow("junction",50),motionRow("between",30),motionRow("target",10),motionRow("older",0)];
  assert.deepEqual([...historyBranchMessageRows(rows,rows,"junction",[{id:"connection",tip:"target",count:0,connection:true}])].sort(),
    ["between","junction","target"]);
});

Then('a branch slide includes straight runs across retained commits and excludes their original edges',function(){
  const versions=[version('side-tip','side-mid'),version('main-tip','main-mid'),version('side-mid','root'),version('main-mid','root'),version('root')];
  const before=layoutGitGraph(versions.filter(version=>!version.oid.startsWith('side-'))),after=layoutGitGraph(versions);
  const snapshot=structuredClone({before,after});
  assert.deepEqual([...historyBranchConnections(before.rows,after.rows)].sort(),[
    'side-tip:outgoing:0:0:0','main-tip:through:0:0:0','side-mid:incoming:0:0:0',
    'side-mid:outgoing:0:0:0','main-mid:through:0:0:0','root:incoming:0:0:0',
  ].sort(),'The added branch can occupy lane zero while retained ancestry occupies another lane');
  assert.deepEqual({before,after},snapshot,'Choosing connected segments leaves the graph unchanged');
});
Then('a connection-only branch slide includes its complete vertical run to the existing parent',function(){
  const versions=[version('merge','a','root'),version('a','b'),version('b','root'),version('root')];
  const before=layoutGitGraph([{...versions[0],graphParents:['a']},...versions.slice(1)]),after=layoutGitGraph(versions);
  assert.deepEqual([...historyBranchConnections(before.rows,after.rows)].sort(),[
    'merge:outgoing:0:1:1','a:through:1:1:1','b:through:1:1:1','root:incoming:1:0:1',
  ].sort());
});
Then('an added branch slide leaves already expanded branches visible even across newly inserted rows',function(){
  const versions=[version('main-tip','main-mid'),version('old-tip','root'),version('new-tip','root'),version('main-mid','root'),version('root')];
  const before=layoutGitGraph(versions.filter(version=>version.oid!=='new-tip')),after=layoutGitGraph(versions);
  const moving=historyBranchConnections(before.rows,after.rows);
  assert.deepEqual([...moving].sort(),[
    'new-tip:outgoing:2:2:2','main-mid:through:2:2:2','root:incoming:2:0:2',
  ].sort());
  const inserted=after.rows.find(row=>row.version.oid==='new-tip');
  assert.ok(inserted.segments.some(segment=>segment.kind==='through'&&segment.from===1));
  assert.ok(inserted.segments.filter(segment=>segment.kind==='through').every(segment=>!moving.has(historyConnectionKey(inserted,segment))),
    'Inserting a row does not make existing parent edges part of the new branch animation');
});

const growthSegment=(id,from,to,lane=1,controls)=>({id,from:{x:from[0],y:from[1]},to:{x:to[0],y:to[1]},lane,color:'green',...(controls?{controls:controls.map(([x,y])=>({x,y}))}:{})});
Then('branch growth stitches the bend and all row fragments into one stroke from the junction',function(){
  const segments=[growthSegment('upper',[20,40],[20,0]),growthSegment('bend',[0,100],[20,80],1,[[0,90],[20,90]]),growthSegment('lower',[20,80],[20,40])];
  const before=structuredClone(segments);
  const trace=traceHistoryBranches(segments,[{id:'middle',x:20,y:40},{id:'tip',x:20,y:0}]);
  assert.equal(trace.paths.length,1);
  assert.equal(trace.paths[0].d,'M 0 100 C 0 90, 20 90, 20 80 L 20 40 L 20 0');
  assert.equal(trace.paths[0].start,0);
  assert.ok(trace.paths[0].length>108&&trace.paths[0].length<112);
  assert.ok(Math.abs(trace.nodes.get('tip')-trace.length)<1e-6);
  assert.ok(Math.abs(trace.nodes.get('tip')-trace.nodes.get('middle')-40)<1e-6);
  assert.deepEqual(segments,before);
});
Then('nested branch strokes and nodes wait until growth reaches their shared junction',function(){
  const trace=traceHistoryBranches([
    growthSegment('nested',[20,40],[20,0],2),growthSegment('upper',[0,50],[0,0],1),
    growthSegment('bend',[0,50],[20,40],2),growthSegment('lower',[0,100],[0,50],1),
  ],[{id:'junction',x:0,y:50},{id:'tip',x:20,y:0}]);
  assert.equal(trace.paths.length,2);
  assert.equal(trace.paths.find(path=>path.id==='bend').start,50);
  assert.equal(trace.nodes.get('junction'),50);
  assert.ok(trace.nodes.get('tip')>110);
  assert.equal(trace.length,trace.nodes.get('tip'));
});
Then('sibling growth strokes remain separate even when their colors match',function(){
  const trace=traceHistoryBranches([
    growthSegment('green',[0,100],[20,0],1),growthSegment('same-color',[0,100],[40,0],2),
  ],[{id:'first',x:20,y:0},{id:'second',x:40,y:0}]);
  assert.equal(trace.paths.length,2);
  assert.ok(trace.paths.every(path=>path.start===0));
  assert.ok(trace.nodes.get('first')<trace.nodes.get('second'));
  assert.equal(trace.length,trace.nodes.get('second'));
  assert.deepEqual(traceHistoryBranches([],[]),{paths:[],length:0,nodes:new Map()});
});

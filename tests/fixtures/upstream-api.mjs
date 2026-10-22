// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {apiBase} from '../../src/lib/remotes/policy.ts';
export const fixtureToken='only-a-local-fixture-token';
const token=fixtureToken,sha='1234567890abcdef1234567890abcdef12345678';
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
export function upstreamApiFixture(provider){
 const host=provider==='github'?'https://github.com':provider==='gitlab'?'https://gitlab.example.test':'https://bitbucket.org';
 const html=`${host}/owner/repository`,repo={name:'repository',full_name:'owner/repository',description:'Fixture',html_url:html,clone_url:`${html}.git`,default_branch:'main',private:true,path_with_namespace:'owner/repository',web_url:html,http_url_to_repo:`${html}.git`,visibility:'private',is_private:true,mainbranch:{name:'main'},links:{html:{href:html},clone:[{name:'https',href:`${html}.git`}]}};
 const review={id:1,number:1,iid:1,title:'Review fixture',body:'Description',description:'Description',state:'open',html_url:`${html}/pull/1`,web_url:`${html}/-/merge_requests/1`,user:{login:'fixture'},author:{username:'fixture',display_name:'fixture'},head:{ref:'feature',sha},base:{ref:'main'},source:{branch:{name:'feature'},commit:{hash:sha}},destination:{branch:{name:'main'}},source_branch:'feature',target_branch:'main',sha,draft:false,links:{html:{href:`${html}/pull-requests/1`}}};
 const issue={...review,title:'Issue fixture',content:{raw:'Description'},reporter:{display_name:'fixture'}};
 const calls=[];
 const transport=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),path=url.pathname,raw=await request.text();
  assert.equal(url.origin,new URL(apiBase(provider,host)).origin);assert.equal(request.headers.get('authorization'),`Bearer ${token}`);assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');
  const body=raw?JSON.parse(raw):undefined;calls.push({method:request.method,path,query:url.search,body});
  const page=items=>provider==='bitbucket'?{values:items}:items;
  if(/\/(user|users\/current)$/.test(path))return json({login:'fixture',name:'Fixture',username:'fixture',nickname:'fixture',display_name:'Fixture'});
  if(path.endsWith('/search/repositories'))return json({items:[repo]});
  if(path.endsWith('/user/permissions/repositories'))return json({values:[{repository:repo}]});
  if(/\/(branches|refs\/branches)$/.test(path))return json(page([{name:'main',commit:{sha,id:sha},target:{hash:sha},protected:true}]));
  if(path.endsWith('/check-runs'))return json({check_runs:[{name:'CI',status:'completed',conclusion:'success',html_url:`${html}/actions/1`}]});
  if(path.endsWith('/status'))return json({statuses:[{context:'CI',state:'success',target_url:`${html}/actions/1`}]});
  if(path.endsWith('/statuses'))return json({values:[{key:'CI',name:'CI',state:'SUCCESSFUL',url:`${html}/pipelines/1`}]});
  if(path.endsWith('/pipelines'))return json([{id:1,status:'success',web_url:`${html}/-/pipelines/1`}]);
  if(/\/(pulls|pullrequests|merge_requests)(\/|$)/.test(path)){
   if(path.endsWith('/merge')&&provider==='github')return json({merged:true,sha});
   if(request.method==='GET'&&/\/(pulls|pullrequests|merge_requests)$/.test(path))return json(page([review]));
   return json(review);
  }
  if(/\/issues(\/|$)/.test(path))return json(request.method==='GET'&&path.endsWith('/issues')?page([issue]):issue);
  if(request.method==='GET'&&(/\/user\/repos$/.test(path)||path.endsWith('/projects')))return json([repo]);
  return json(repo);
 };
 return {host,calls,transport};
}

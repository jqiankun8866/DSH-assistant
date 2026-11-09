import test from 'node:test';
import assert from 'node:assert/strict';
import {XhsRetrieval} from '../src/assistant/xhs-retrieval.mjs';
function fixture(){let now=1000;const calls=[];const routing=new XhsRetrieval({now:()=>now,perform:async(peer,action,data)=>{calls.push({peer,action,data});return action==='search'?{notes:[{title:'source'}]}:{text:'source'}}});return {routing,calls,advance:ms=>now+=ms};}
test('same search reuses a dated snapshot, refresh and expiry fetch again',async()=>{
 const f=fixture();const a=await f.routing.call('owner','search',{query:'穿搭'});a.notes[0].title='mutated';
 const b=await f.routing.call('owner','search',{query:'穿搭'});assert.equal(b.retrieval.cached,true);assert.equal(b.notes[0].title,'source');assert.equal(f.calls.length,1);
 await f.routing.call('owner','search',{query:'穿搭',refresh:true});assert.equal(f.calls.length,2);
 f.advance(120000);await f.routing.call('owner','search',{query:'穿搭'});assert.equal(f.calls.length,3);
});
test('cache isolates peers and never caches personal lists or AI',async()=>{
 const f=fixture();await f.routing.call('a','search',{query:'穿搭'});await f.routing.call('b','search',{query:'穿搭'});
 for(const action of ['favorites','likes','ask'])for(let i=0;i<2;i++)await f.routing.call('a',action,{query:'规划',reason:'user-request'});
 assert.equal(f.calls.length,8);
});
test('automatic AI routes are rejected before browser IO, explicit request works',async()=>{
 const f=fixture();await f.routing.call('a','search',{query:'穿搭'});
 for(const reason of [undefined,'complex-plan','insufficient-results'])
  await assert.rejects(f.routing.call('a','ask',{query:'规划',reason,searchQuery:'穿搭'}),/user-request/);
 assert.equal(f.calls.length,1);
 const r=await f.routing.call('a','ask',{query:'规划',reason:'user-request'});
 assert.equal(r.retrieval.verified,false);assert.equal(f.calls.length,2);
});
test('failed refresh invalidates cached search and cannot trigger AI fallback',async()=>{
 const f=fixture();await f.routing.call('a','search',{query:'穿搭'});f.routing.perform=async()=>{throw Error('请登录')};
 await assert.rejects(f.routing.call('a','search',{query:'穿搭',refresh:true}),/请登录/);
 await assert.rejects(f.routing.call('a','ask',{query:'穿搭',reason:'insufficient-results',searchQuery:'穿搭'}),/user-request/);
 await assert.rejects(f.routing.call('a','search',{query:'穿搭'}),/请登录/);
});
test('stopped and cancelled requests cannot read cached data',async()=>{
 const f=fixture();await f.routing.call('a','read',{url:'https://example.com'});
 await assert.rejects(f.routing.call('a','read',{url:'https://example.com'},AbortSignal.abort()),/abort/i);
 f.routing.clear();await f.routing.call('a','read',{url:'https://example.com'});assert.equal(f.calls.length,2);
});

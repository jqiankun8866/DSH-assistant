import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantService, installAssistantTools } from '../src/assistant/service.mjs';

function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'dsh-core-')); let now=Date.parse('2026-10-29T08:00:00Z'); const sent=[];
  const service=new AssistantService({root,now:()=>now,send:async m=>{sent.push(m);return {accepted:true}}});
  t.after(async()=>{await service.close();rmSync(root,{recursive:true,force:true});});
  const call=(tool,action,data={},peer='weixin:a')=>service.call(peer,tool,action,data);
  return {root,service,sent,call,advance:n=>{now+=n}};
}
test('memory has explicit provenance, updates one key, persists and isolates users',async t=>{
  const f=fixture(t);
  f.call('assistant_memory','set',{key:'food',value:'少辣',source:'用户说：记住我吃少辣',confirmed:true});
  f.call('assistant_memory','set',{key:'food',value:'不辣',source:'用户纠正：不吃辣',confirmed:true});
  assert.equal(f.call('assistant_memory','list').memories.length,1);
  assert.equal(f.call('assistant_memory','search',{query:'不辣'}).memories.length,1);
  assert.equal(f.call('assistant_memory','list',{},'weixin:b').memories.length,0);
  assert.equal(f.call('assistant_memory','delete',{key:'food'},'weixin:b').deleted,false);
  const second=new AssistantService({root:f.root,send:async()=>({accepted:true})});
  assert.equal(second.call('weixin:a','assistant_memory','list').memories[0].value,'不辣'); await second.close();
  f.call('assistant_memory','delete',{key:'food'});assert.equal(f.call('assistant_memory','list').memories.length,0);
});
test('sensitive memory requires confirmation; malformed/foreign calls are rejected',t=>{
  const f=fixture(t);
  assert.throws(()=>f.call('assistant_memory','set',{key:'health',value:'猜测',category:'health',source:'收藏',confirmed:false}));
  assert.throws(()=>f.call('assistant_profile','get',{},'web:a'));
  assert.throws(()=>f.call('assistant_memory','clear',{}));
});
test('tool adapter binds the actual session and returns renderable output',t=>{
  const f=fixture(t);const tools=[];const sections=[];
  installAssistantTools({get:n=>n==='tools'?{register:t=>tools.push(t)}:{section:s=>sections.push(s)}},f.service,x=>x);
  assert.ok(tools.some(t=>t.name==='assistant_health'));assert.ok(sections.some(s=>s.name==='wechat-assistant-core'));assert.equal(tools.some(t=>t.name==='chinese_meme_lookup'),false);assert.equal(f.service.android,undefined);assert.equal(tools.some(t=>t.name.startsWith('mobile_')),false);
  const tool=tools.find(t=>t.name==='assistant_profile');
  const result=tool.execute({action:'get'},{agent:{id:'weixin:a'},signal:new AbortController().signal});
  assert.equal(result.profile.enabled,false);assert.equal(tool.output.render({},result)[0].type,'text');
});

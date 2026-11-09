import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reactToThanks} from '../src/assistant/meme-reaction.mjs';
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'meme-context-')),db=new DatabaseSync(':memory:');
 t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true})});
 const candidates=[
  {file:'cat.png',title:'咪要对你坏！',tags:['表情包'],collectedAt:300},
  {file:'denial.png',title:'才不是大肥鱼！',tags:['生气','否认'],savedAt:200},
  {file:'thanks.png',title:'谢谢',tags:['感谢'],hasText:true,collectedAt:100},
 ].map(item=>{const path=join(dir,item.file);writeFileSync(path,'fixture');return {...item,path}});
 const sent=[];let seq=0;
 return {sent,call:extra=>reactToThanks({db,root:dir,candidates,peer:'weixin:context',input:'谢谢',reply:'不客气',events:[],afterSeq:++seq,send:async(p,f)=>sent.push(f),...extra})};
}
test('actual cold and vaccination questions never receive automatic teasing or denial images',async t=>{
 const f=fixture(t);
 for(const input of ['最近是不是挺多人感冒的','成年人也要打疫苗吗','生病了还要上班'])
  assert.equal((await f.call({input,reply:'这轮在认真讨论健康问题。'})).status,'sensitive-context');
 assert.equal(f.sent.length,0);
});
test('medical reply and recent context also suppress a short acknowledgment',async t=>{
 const f=fixture(t);
 assert.equal((await f.call({input:'收到',reply:'先和医生确认接种安排。'})).status,'sensitive-context');
 assert.equal((await f.call({input:'谢谢',events:[{seq:0,type:'user/message',data:{content:[{type:'text',text:'成年人也要打疫苗吗'}]}}]})).status,'sensitive-context');
 assert.equal(f.sent.length,0);
});
test('unmatched ordinary answers wait for model context selection instead of newest-image fallback',async t=>{
 const f=fixture(t);
 for(const input of ['帮我整理今天工作计划','今天天气如何','我最近好烦'])
  assert.equal((await f.call({input,reply:'回答'})).status,'needs-model-selection');
 assert.equal(f.sent.length,0);
});
test('a relevant collected image beats newer but unrelated images; unmatched social turns stay quiet',async t=>{
 const f=fixture(t);assert.equal((await f.call({})).status,'sent');
 assert.match(f.sent[0],/thanks\.png$/);
 assert.equal((await f.call({input:'晚安',reply:'晚安'})).status,'no-context-match');
 assert.equal(f.sent.length,1);
});

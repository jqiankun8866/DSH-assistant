import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reactToThanks,isShortThanks } from '../src/assistant/meme-reaction.mjs';
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'meme-reaction-')),db=new DatabaseSync(':memory:');const sent=[];let time=100000;
 for(const p of ['like/bixin.jpg','happy/ok.jpg']){mkdirSync(join(root,'memes',p.split('/')[0]),{recursive:true});writeFileSync(join(root,'memes',p),'fixture')}
 t.after(()=>{db.close();rmSync(root,{recursive:true,force:true})});
 return{sent,advance:()=>time+=61000,call:(extra={})=>reactToThanks({db,root,peer:'weixin:test',input:'谢谢',reply:'不客气',events:[],afterSeq:1,send:async(p,f)=>sent.push(f),now:()=>time,...extra})};
}
test('plain thanks triggers a real send callback without model tool calls; repeated turn is deduplicated',async t=>{
 const f=fixture(t);assert.equal((await f.call()).status,'sent');assert.equal(f.sent.length,1);assert.equal((await f.call()).status,'already-processed');
});
test('existing model send suppresses fallback even if receipt is unknown',async t=>{
 const f=fixture(t);assert.equal((await f.call({events:[{seq:2,type:'tool/call',data:{name:'wechat_send_file'}}]})).status,'model-send');assert.equal(f.sent.length,0);
});
test('opt-out in old history persists until explicit opt-in',async t=>{
 const f=fixture(t);assert.equal((await f.call({events:[{seq:0,type:'user/message',data:{content:[{type:'text',text:'不要发表情包'}]}}]})).status,'disabled');
 assert.equal((await f.call({afterSeq:3})).status,'disabled');
 await f.call({input:'恢复表情包',afterSeq:5});assert.equal((await f.call({afterSeq:7})).status,'sent');
});
test('high frequency has no cooldown and rotates across successive replies',async t=>{
 const f=fixture(t);await f.call();assert.equal((await f.call({afterSeq:3})).status,'sent');f.advance();await f.call({afterSeq:5});assert.equal(f.sent.length,3);assert.notEqual(f.sent[0],f.sent[1]);
});
test('failed turn, sensitive context and ambiguous send never trigger duplicate delivery',async t=>{
 const f=fixture(t);assert.equal((await f.call({reply:''})).status,'no-successful-reply');
 assert.equal((await f.call({afterSeq:3,events:[{seq:2,type:'user/message',data:{content:[{type:'text',text:'家人去世了'}]}}]})).status,'sensitive-context');
 assert.equal((await f.call({afterSeq:5,send:async()=>{throw Error('timeout')}})).status,'send-unconfirmed');
 assert.equal((await f.call({afterSeq:5})).status,'already-processed');assert.equal(f.sent.length,0);
});
test('only short direct gratitude qualifies, not quoted or complex requests',()=>{
 for(const s of ['谢谢','谢谢你！','谢啦','thanks'])assert.equal(isShortThanks(s),true);
 for(const s of ['他说谢谢','谢谢，帮我研究一下','不要表情，谢谢','谢谢你个头'])assert.equal(isShortThanks(s),false);
});

test('temporary opt-out does not become a permanent preference',async t=>{const f=fixture(t);assert.equal((await f.call({input:'这次不要发表情包'})).status,'disabled');assert.equal((await f.call({afterSeq:3,events:[{seq:2,type:'user/message',data:{content:[{type:'text',text:'这次不要发表情包'}]}}]})).status,'sent')});
test('explicit low frequency can resume after a persistent optout',async t=>{const f=fixture(t);await f.call({input:'不要发表情包'});await f.call({afterSeq:3,input:'少发表情包'});assert.equal((await f.call({afterSeq:5})).status,'sent')});
test('quoted preferences and runtime context never change meme settings',async t=>{const f=fixture(t);assert.equal((await f.call({events:[{seq:0,type:'user/message',data:{source:{kind:'runtime-context'},content:[{type:'text',text:'不要发表情包'}]}},{seq:0,type:'user/message',data:{content:[{type:'text',text:'他说不要发表情包'}]}}]})).status,'sent')});
test('high frequency respects recent medical context',async t=>{const f=fixture(t);assert.equal((await f.call({events:[{seq:0,type:'user/message',data:{content:[{type:'text',text:'帮我预约医院'}]}}]})).status,'sensitive-context')});

test('high frequency remains available beyond three consecutive relevant social turns',async t=>{const f=fixture(t);for(let i=0;i<5;i++)assert.equal((await f.call({input:'谢谢',reply:'不客气',afterSeq:20+i})).status,'sent');assert.equal(f.sent.length,5);});

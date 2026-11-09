import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {MemeSemantics} from '../src/assistant/meme-semantics.mjs';import {MemeCompletion} from '../src/assistant/meme-completion.mjs';
import {nativeMemeSelector} from '../src/assistant/meme-selector.mjs';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'meme-complete-')),db=new DatabaseSync(':memory:'),items=[],sends=[];const service={root,engine:{db},memeCandidates:()=>items,sendMemeFile:async(p,path)=>{sends.push(path);return 'sent-id'}};const sem=service.memeSemantics=new MemeSemantics(service);t.after(async()=>{await sem.stop();db.close();rmSync(root,{recursive:true,force:true})});
 for(let n=0;n<8;n++){const path=join(root,n+'.png'),bytes=Buffer.from('img'+n);writeFileSync(path,bytes);const sha256=createHash('sha256').update(bytes).digest('hex');items.push({path,sha256});db.prepare('INSERT INTO meme_meanings VALUES(?,?,0,0)').run(sha256,JSON.stringify({status:'ready',usable:true,confidence:.95,text:'收到',meaning:'点头示意收到消息',when:'友好回应',intents:['回应'],emotions:['平静'],styles:['温柔'],scenes:['日常闲聊'],intensity:1,target:'对方',avoid:[],keywords:[]}));}
 return {service,db,items,sends};}
test('high mode completes each turn once, rotates and supports sticker-only',async t=>{const f=fixture(t);let calls=0;const c=new MemeCompletion(f.service,{select:async({choices})=>{calls++;return {id:choices[0].id}}});
 for(let seq=1;seq<=10;seq++){const r=await c.ensure({peer:'weixin:a',seq,input:'[微笑]',reply:'不应发送的解说'});assert.equal(r.sent,true);assert.equal(r.stickerOnly,true);await c.ensure({peer:'weixin:a',seq,input:'[微笑]',reply:''});}
 assert.equal(f.sends.length,10);assert.equal(calls,10);assert.equal(new Set(f.sends.slice(0,8)).size,8);
});
test('explicit opt-out and an earlier real delivery suppress completion',async t=>{const f=fixture(t);const c=new MemeCompletion(f.service,{select:()=>assert.fail()});
 assert.equal((await c.ensure({peer:'weixin:a',seq:1,input:'这次不要发表情包',reply:'好'})).sent,false);
 const events=[{seq:3,type:'tool/call',data:{name:'wechat_meme_send',callId:'x'}},{seq:4,type:'tool/result',data:{message:{toolCallId:'x',content:[{type:'text',text:'{"sent":true,"messageId":"id","id":"hash"}'}]}}}];
 assert.equal((await c.ensure({peer:'weixin:a',seq:2,input:'谢谢',reply:'好',events})).status,'already-sent');assert.equal(f.sends.length,0);
});
test('invalid selector id falls back to known neutral image; uncertain send is not retried',async t=>{const f=fixture(t);const c=new MemeCompletion(f.service,{select:async()=>({id:'invented'})});
 assert.equal((await c.ensure({peer:'weixin:a',seq:1,input:'谢谢',reply:'不客气'})).sent,true);
 f.service.sendMemeFile=async()=>{throw Error('timeout')};assert.equal((await c.ensure({peer:'weixin:a',seq:2,input:'你好',reply:'嗨'})).status,'send-failed');assert.equal((await c.ensure({peer:'weixin:a',seq:2,input:'你好',reply:'嗨'})).status,'send-failed');
});
test('selector receives compact context, no tools or whole chat history',async()=>{let prompt;const select=nativeMemeSelector(async p=>{prompt=p;return {text:'{"id":"0","reason":"反差接梗"}',usage:{inputTokens:100}}});const r=await select({input:'快点啊',reply:'我在等',choices:[{id:'a',token:'private-token',text:'快点等着',meaning:'反差'}]});assert.equal(r.id,'a');assert.doesNotMatch(prompt,/private-token/);assert.match(prompt,/反差/)});
test('ordinary document delivery does not count as a meme',async t=>{const f=fixture(t);const c=new MemeCompletion(f.service,{select:async({choices})=>({id:choices[0].id})});const r=await c.ensure({peer:'weixin:a',seq:1,input:'把文档发我',reply:'文件发好了',events:[{seq:2,type:'tool/call',data:{name:'wechat_send_file'}}]});assert.equal(r.sent,true);assert.equal(f.sends.length,1)});

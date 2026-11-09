import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,writeFileSync,existsSync,unlinkSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {MemeSemantics,validateMeaning,parseMeaning,vocabulary} from '../src/assistant/meme-semantics.mjs';
import {nativeMemeAnalyzer} from '../src/assistant/meme-vision.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const meaning=(over={})=>({usable:true,confidence:0.95,text:'不客气',meaning:'温柔回应对方的感谢',when:'别人表达感谢之后',intents:['回应'],emotions:['开心'],styles:['可爱'],scenes:['日常闲聊'],intensity:1,target:'对方',avoid:[],keywords:['猫'],...over});
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'meme-semantics-')),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE meme_user_items(peer TEXT)');let now=100000000;const files=[],sent=[];
 const service={root,engine:{db},now:()=>now,xhs:{config:{ownerPeer:'weixin:a'}},onError:()=>{},memeCandidates:peer=>files.filter(i=>i.peer===peer&&existsSync(i.path)&&digest(readFileSync(i.path))===i.sha256),sendMemeFile:async(peer,path)=>{sent.push(path);return 'message-id'}};
 const m=new MemeSemantics(service,{now:()=>now});
 t.after(async()=>{await m.stop();db.close();rmSync(root,{recursive:true,force:true})});
 const add=(v=meaning(),peer='weixin:a')=>{const path=join(root,files.length+'.png'),data=Buffer.from('image'+files.length),sha256=digest(data);writeFileSync(path,data);const item={path,sha256,peer};files.push(item);if(v)db.prepare('INSERT INTO meme_meanings VALUES(?,?,?,0)').run(sha256,JSON.stringify({...v,status:'ready'}),now);return item;};
 return {m,db,files,sent,add,advance:n=>now+=n};
}
test('expanded dimensions cover teasing, idling, affection without unlimited tags',()=>{
 assert.equal(vocabulary.intents.length,37);assert.equal(vocabulary.emotions.length,28);
 assert.ok(vocabulary.styles.includes('阴阳怪气'));assert.ok(vocabulary.scenes.includes('工作'));
 assert.throws(()=>validateMeaning(meaning({intents:['回应','调侃','围观']})),/意图/);
 assert.throws(()=>validateMeaning(meaning({emotions:['凭空编的']})),/情绪/);
 assert.throws(()=>parseMeaning('根据文件名推测是开心'),/JSON/);
 assert.throws(()=>validateMeaning(meaning({meaning:'没有图片'})),/实际理解/);
});
test('intent beats recentness, style may relax but wrong intent never does',t=>{
 const f=fixture(t);f.add(meaning({intents:['调侃'],text:'咪要对你坏'}));const good=f.add();
 const result=f.m.search('weixin:a',{intent:'回应',style:'克制'});assert.equal(result.results.length,1);assert.equal(result.results[0].id,good.sha256);assert.equal(result.styleRelaxed,true);
 assert.equal(f.m.search('weixin:a',{intent:'安慰'}).results.length,0);
});
test('generic acknowledgment never pulls denial or teasing from the existing cache',t=>{
 const f=fixture(t);f.add(meaning({intents:['否认','回应'],text:'才不是大肥鱼'}));f.add(meaning({intents:['回应','吐槽'],text:'新的退展'}));
 assert.equal(f.m.search('weixin:a',{intent:'回应',context:'谢谢'}).results.length,0);
 assert.equal(f.m.search('weixin:a',{intent:'否认'}).results.length,1);
});
test('food state cannot masquerade as a polite acknowledgment',t=>{
 const f=fixture(t);f.add(meaning({text:'',meaning:'捧饭准备干饭',when:'表达自己想吃饭'}));assert.equal(f.m.search('weixin:a',{intent:'回应'}).results.length,0);
 assert.equal(f.m.inventory('weixin:a').pending,1);
 assert.deepEqual(validateMeaning(meaning({intents:['表达状态'],meaning:'捧饭准备干饭',when:'表达自己想吃饭'})).intents,['表达状态']);
});
test('medical and distressed conversations abstain even for a short thanks',t=>{
 const f=fixture(t);f.add();for(const context of ['成年人也要打疫苗吗\n谢谢','最近感冒了','失业了很难过','这次不发表情包'])assert.equal(f.m.search('weixin:a',{intent:'回应',context}).results.length,0);
});
test('unknown, rejected, low confidence and private user images are excluded',t=>{
 const f=fixture(t);f.add(null);f.add(meaning(),'weixin:b');const rejected=f.add();f.db.prepare('UPDATE meme_meanings SET data=? WHERE hash=?').run(JSON.stringify({status:'rejected'}),rejected.sha256);
 assert.equal(f.m.search('weixin:a',{intent:'回应'}).results.length,0);assert.deepEqual(f.m.inventory('weixin:a'),{total:2,ready:0,pending:1,rejected:1});
});
test('candidate cap, peer token isolation, deletion and one-shot delivery',async t=>{
 const f=fixture(t);for(let i=0;i<8;i++)f.add();const r=f.m.search('weixin:a',{intent:'回应'});assert.equal(r.results.length,5);assert.equal(r.results[0].path,undefined);
 await assert.rejects(f.m.send('weixin:b',r.results[0].token),/当前会话/);
 const removed=f.files.find(i=>i.sha256===r.results[0].id);unlinkSync(removed.path);await assert.rejects(f.m.send('weixin:a',r.results[0].token),/删除/);
 await f.m.send('weixin:a',r.results[1].token);await assert.rejects(f.m.send('weixin:a',r.results[1].token),/过期/);assert.equal(f.sent.length,1);
 assert.ok(!f.m.search('weixin:a',{intent:'回应'}).results.some(i=>i.id===r.results[1].id));
});
test('rotation allows small galleries again after cooldown, never immediately',async t=>{
 const f=fixture(t);f.add();await f.m.send('weixin:a',f.m.search('weixin:a',{intent:'回应'}).results[0].token);assert.equal(f.m.search('weixin:a',{intent:'回应'}).results.length,0);f.advance(16*60000);assert.equal(f.m.search('weixin:a',{intent:'回应'}).results.length,1);
});
test('exclusions, strong intensity and target remain hard even with soft label matching',t=>{
 const f=fixture(t);f.add(meaning({avoid:['关系不熟']}));f.add(meaning({intensity:3}));f.add(meaning({target:'自己'}));assert.equal(f.m.search('weixin:a',{intent:'回应',style:'克制',avoid:['关系不熟'],maxIntensity:1,target:'对方'}).results.length,0);
});
test('ordinary chat includes neighboring intentions and moderate expressions without relabeling',t=>{
 const f=fixture(t);const tease=f.add(meaning({intents:['调侃'],intensity:2,text:'再来一口Token'}));
 const self=f.add(meaning({intents:['自嘲'],intensity:1,text:'我真是个小机灵鬼'}));
 f.add(meaning({intents:['否认'],intensity:1,text:'才不是'}));
 const result=f.m.search('weixin:a',{intent:'调侃',maxIntensity:1,context:'能不能少花点token\n[微笑]'});
 assert.equal(result.results.length,2);assert.equal(result.results[0].id,tease.sha256);
 assert.equal(result.results.find(i=>i.id===self.sha256).match,'related');assert.equal(result.intensityRelaxed,true);
 assert.equal(f.m.meaning(self.sha256).intents[0],'自嘲');
 assert.equal(f.m.search('weixin:a',{intent:'调侃',maxIntensity:1,strict:true}).results.length,0);
});
test('abstract visual reply can cross all intent labels, with exploration slots and strict opt-out',t=>{
 const f=fixture(t);for(let i=0;i<5;i++)f.add(meaning({intents:['调侃'],intensity:2}));
 const abstract=f.add(meaning({intents:['等待'],styles:['抽象'],text:'抓紧时间快点等着',meaning:'反差幽默地调侃等待没有捷径',when:'等候时幽默回应'}));
 const result=f.m.search('weixin:a',{intent:'调侃',context:'怎么还没好'});
 assert.equal(result.results.length,5);assert.equal(result.results.find(i=>i.id===abstract.sha256).match,'creative');
 assert.ok(!f.m.search('weixin:a',{intent:'调侃',strict:true}).results.some(i=>i.id===abstract.sha256));
 assert.equal(f.m.search('weixin:a',{intent:'调侃',context:'急救'}).results.length,0);
});
test('vision runs once per hash; failed annotations stay pending with backoff',async t=>{
 const f=fixture(t),item=f.add(null);let calls=0;f.m.analyze=async()=>{calls++;return meaning()};await f.m.annotate(item);await f.m.annotate(item);assert.equal(calls,1);assert.equal(f.m.meaning(item.sha256).status,'ready');
 const pending=f.add(null);f.m.analyze=async()=>{calls++;throw Error('unavailable')};await f.m.annotate(pending);await f.m.annotate(pending);assert.equal(calls,2);assert.equal(f.m.meaning(pending.sha256).status,'pending');
});
test('native visual adapter passes actual image blocks and parses only final text',async()=>{
 let observed;const ctx={get:k=>k==='attachments'?{admitPromptContent:async parts=>{assert.equal(parts[0].type,'image');assert.ok(parts[0].data);return parts}}:k==='llm'?{stream:async function*(options){observed=options;yield {type:'reasoning-delta',index:0,text:'私有推理不可拼入JSON'};yield {type:'text-delta',index:1,text:JSON.stringify(meaning())};yield {type:'block-end',index:1,block:{type:'text',text:JSON.stringify(meaning())}};yield {type:'finish',reason:{kind:'stop'}}}}:null};
 const result=await nativeMemeAnalyzer(ctx,()=>({provider:'test',model:'vision'}))({data:Buffer.from([137,80,78,71,13,10,26,10,1]),signal:new AbortController().signal});assert.equal(result.meaning,meaning().meaning);assert.equal(observed.messages[0].content[0].type,'image');assert.ok(observed.signal);
});
test('quota failure pauses the whole queue across restart and resumes after backoff',async t=>{
 const f=fixture(t);f.add(null);f.add(null);let calls=0;f.m.analyze=async()=>{calls++;throw Object.assign(Error('quota'),{code:'ACCOUNT_QUOTA'})};await f.m.tick();await f.m.tick();assert.equal(calls,1);assert.equal(f.m.worker().reason,'ACCOUNT_QUOTA');
 const restarted=new MemeSemantics(f.m.service,{now:f.m.now,analyze:f.m.analyze});await restarted.tick();assert.equal(calls,1);await restarted.stop();
 f.advance(3600001);f.m.analyze=async()=>{calls++;return meaning()};await f.m.tick();assert.equal(f.m.inventory('weixin:a').ready,2);
});

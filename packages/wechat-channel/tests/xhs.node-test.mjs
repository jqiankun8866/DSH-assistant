import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createServer } from 'node:http';
import { Assistant } from '../src/assistant/assistant.mjs';
import { XhsService } from '../src/assistant/xhs-service.mjs';
import { XhsBrowser,noteUrl,extractScript,parsePopularity } from '../src/assistant/xhs-browser.mjs';

const peer='weixin:owner',id='123456789012345678901234';
const url='https://www.xiaohongshu.com/explore/'+id;
test('tag-only video descriptions are not marked as sufficient recommendation evidence',()=>{
 const evaluate=text=>runInNewContext(extractScript('read'),{
  location:{origin:'https://www.xiaohongshu.com',href:url,pathname:'/explore/'+id},
  document:{body:{innerText:''},querySelectorAll:()=>[{innerText:'我',pathname:'/user/profile/owner'}],
   querySelector:selector=>selector==='#detail-desc'?{innerText:text}:selector==='#detail-title'?{innerText:'外套'}:null},
 });
 assert.equal(evaluate('#男生穿搭 #高个子 #皮衣 '.repeat(20)).recommendationReady,false);
 assert.equal(evaluate('#男生穿搭 #高个子 #皮衣 '.repeat(20)).shareable,true);
 assert.equal(evaluate('这件衣服搭配直筒裤和低饱和衬衫。'.repeat(8)).recommendationReady,true);
});
function fixture(t,{send,browser}={}){
 const root=mkdtempSync(join(tmpdir(),'xhs-test-'));let now=Date.parse('2026-10-30T08:00:00+08:00');const sent=[],calls=[];
 const engine=new Assistant({path:join(root,'test.sqlite'),now:()=>now,send:send??(async m=>{sent.push(m);return{accepted:true}})});
 const fake=browser??{async perform(p,a,d){calls.push(a);return a==='search'?{notes:[{id,title:'外套',url}]}:{ready:true,title:'外套',text:'原作者笔记正文',url,scope:'仅文字'}}};
 const service=new XhsService({root,engine,config:{ownerPeer:peer},browser:fake,now:()=>now});
 t.after(async()=>{await service.stop();engine.close();rmSync(root,{recursive:true,force:true})});
 return{root,engine,service,sent,calls,advance:ms=>{now+=ms},configure:()=>service.call(peer,'xhs_routine','set',{enabled:true,daily:'08:01',topics:['穿搭'],share:true})};
}
test('URL validation permits note links and rejects foreign origins, credentials and non-notes',()=>{
 assert.equal(noteUrl(url+'?xsec_token=a&ignored=x'),url+'?xsec_token=a');
 assert.equal(noteUrl('分享 http://xhslink.com/o/abc'), 'https://xhslink.com/o/abc');
 for(const u of ['https://www.xiaohongshu.com.evil/explore/'+id,'file:///x','https://user@www.xiaohongshu.com/explore/'+id,'https://www.xiaohongshu.com/settings'])assert.throws(()=>noteUrl(u));
});
test('XHS is disabled by default and rejects another peer before browser IO',async t=>{
 const f=fixture(t);assert.equal(f.service.settings(peer).enabled,false);await f.service.tick();assert.equal(f.calls.length,0);
 await assert.rejects(f.service.call('weixin:other','xhs_browser','favorites'));assert.equal(f.calls.length,0);
 await assert.rejects(f.service.call(peer,'xhs_routine','set',{enabled:true,topics:['穿搭']}));
});
test('daily job reads, shares once, retains journal and deduplicates subsequent days',async t=>{
 const f=fixture(t);await f.configure();f.advance(60000);await Promise.all([f.service.tick(),f.service.tick()]);
 assert.deepEqual(f.calls,['search','read']);assert.equal(f.sent.length,1);
 assert.equal((await f.service.call(peer,'xhs_routine','history')).notes.length,1);
 f.advance(86400000);f.engine.inbound(peer);await f.service.tick();assert.equal(f.sent.length,1);
 assert.equal((await f.service.call(peer,'xhs_routine','get')).runs.length,2);
});
test('tag-only video can be shared without invented exercise details',async t=>{
 const f=fixture(t,{browser:{async perform(p,a){return a==='search'?{notes:[{id,url}]}:{ready:true,title:'练胸动作示范',text:'#练胸',url,media:'video',shareable:true,recommendationReady:false}}}});
 await f.configure();f.advance(60000);await f.service.tick();
 assert.equal(f.sent.length,1);assert.ok(f.sent[0].text.includes('练胸动作示范'));
 assert.ok(f.sent[0].text.includes(url));assert.ok(!f.sent[0].text.includes('组'));
});
test('quiet hours defer a window, late starts skip, and global pause prevents browsing',async t=>{
 const f=fixture(t);await f.configure();f.engine.configure(peer,{quiet:{start:'00:00',end:'09:00'}});f.advance(60000);await f.service.tick();assert.equal(f.calls.length,0);
 f.advance(3600000);await f.service.tick();assert.equal(f.calls.length,0);
 assert.equal((await f.service.call(peer,'xhs_routine','get')).runs[0].status,'missed');
 f.advance(86400000);f.engine.configure(peer,{enabled:false});await f.service.tick();assert.equal(f.calls.length,0);
});
test('read-only mode records without sending and unanswered shares stop further pushes',async t=>{
 const f=fixture(t);await f.configure();await f.service.call(peer,'xhs_routine','set',{share:false});f.advance(60000);await f.service.tick();assert.equal(f.sent.length,0);
 assert.equal((await f.service.call(peer,'xhs_routine','history')).notes.length,1);
 f.engine.db.prepare("UPDATE xhs_reads SET state='sent',sharedAt=?").run(Date.parse('2026-10-30T08:01:00+08:00'));
 f.advance(86400000);assert.equal(f.service.canShare(peer),false);f.engine.inbound(peer);assert.equal(f.service.canShare(peer),true);
});
test('cancellation during async browsing prevents a pending share',async t=>{
 let finish;const gate=new Promise(r=>finish=r);
 const f=fixture(t,{browser:{async perform(p,a){if(a==='search'){await gate;return{notes:[{id,url}]}}return{ready:true,title:'x',text:'正文',url}}}});
 await f.configure();f.advance(60000);const pending=f.service.tick();await f.service.call(peer,'xhs_routine','set',{enabled:false});finish();await pending;assert.equal(f.sent.length,0);
});
test('uncertain delivery is journaled and never automatically repeated',async t=>{
 let attempts=0;const f=fixture(t,{send:async()=>{attempts++;throw Error('timeout')}});await f.configure();f.advance(60000);await f.service.tick();
 assert.equal((await f.service.call(peer,'xhs_routine','history')).notes[0].state,'uncertain');
 f.advance(86400000);f.engine.inbound(peer);await f.service.tick();assert.equal(attempts,1);
});
test('browser lock rejects concurrent operations and releases after a failure',async t=>{
 const root=mkdtempSync(join(tmpdir(),'xhs-lock-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let release;
 const browser=new XhsBrowser({root,config:{ownerPeer:peer},runCommand:async args=>args[0]==='tab'&&args[1]==='list'?{tabs:[]}:{targetId:'test'}});
 const running=browser.locked(()=>new Promise(r=>release=r));
 await assert.rejects(browser.locked(()=>{}),/上一项请求/);
 while(!release)await new Promise(r=>setImmediate(r));release();await running;
 await assert.rejects(browser.locked(()=>{throw Error('test')}),/test/);
 assert.equal(await browser.locked(()=>42),42);
});
test('wrong browser account is rejected before submitting a search',async t=>{
 const root=mkdtempSync(join(tmpdir(),'xhs-account-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const calls=[];
 const browser=new XhsBrowser({root,config:{ownerPeer:peer,profilePath:'/user/profile/expected'},runCommand:async args=>{
  calls.push(args);if(args[0]==='tab')return args[1]==='list'?{tabs:[]}:{targetId:'test'};
  if(args[0]==='get')return{url:'https://www.xiaohongshu.com/explore'};
  return {result:{login:true,blocked:false,account:'/user/profile/someone-else'}};
 }});
 await assert.rejects(browser.perform(peer,'search',{query:'private interest'}),/账号变了/);
 assert.equal(calls.some(c=>c.some(v=>v.includes('search_result_ai'))),false);
});
test('an interrupted claimed occurrence is not repeated after worker recovery',async t=>{
 const f=fixture(t);await f.configure();f.advance(60000);const p=f.service.settings(peer);
 f.engine.db.prepare("INSERT INTO xhs_runs VALUES(?,?,?,'running',NULL)").run(peer+':'+p.nextDue,peer,p.nextDue);
 f.service.start();await f.service.tick();assert.equal(f.sent.length,0);assert.equal(f.calls.length,0);
 assert.equal((await f.service.call(peer,'xhs_routine','get')).runs[0].status,'interrupted');
 assert.ok(f.service.settings(peer).nextDue>p.nextDue);
});

function collectionPage({mode='favorites',active='收藏',query='?tab=fav&subTab=note',count=3,limit=5}={}) {
 const tab=label=>({innerText:label,classList:{contains:c=>c==='active'&&label===active}});
 const tabs=['笔记','收藏','点赞'].map(tab);
 const containers=['published','saved','liked'].slice(0,count).map(title=>({
  getBoundingClientRect:()=>({left:-1146,right:162,height:4548}),
  querySelectorAll:()=>Array.from({length:8},(_,i)=>({getAttribute:()=>String(i),querySelector:q=>q==='.title'?{innerText:title+i}:q==='a.cover'?{href:url+'?xsec_token=keep'}:{innerText:'author'}}))
 }));
 return runInNewContext(extractScript(mode,limit),{URL,location:{origin:'https://www.xiaohongshu.com',href:'https://www.xiaohongshu.com/user/profile/owner'+query},innerWidth:1600,document:{body:{innerText:''},querySelectorAll:q=>q.includes('a[href')?[{innerText:'我',pathname:'/user/profile/owner'}]:q==='.reds-tab-item.sub-tab-list'?tabs:q==='.reds-tab-item.active'?[tab(active)]:q.includes('.tab-content-item')?containers:[]}});
}
test('explicit larger collection limit returns more than five without inventing unloaded notes',()=>{assert.equal(collectionPage({limit:20}).notes.length,8)});
test('favorites use the selected tab despite negative layout coordinates, capped at five',()=>{const r=collectionPage();assert.equal(r.ready,true);assert.equal(r.notes.length,5);assert.equal(r.notes[0].title,'saved0');assert.match(r.notes[0].url,/xsec_token=keep/)});
test('likes select their own panel instead of saved or published notes',()=>{const r=collectionPage({mode:'likes',active:'点赞',query:'?tab=liked'});assert.equal(r.ready,true);assert.equal(r.notes[0].title,'liked0')});
test('mismatched tabs, non-note subtabs and ambiguous panels fail closed',()=>{for(const settings of [{active:'点赞'},{query:'?tab=liked'},{query:'?tab=fav&subTab=album'},{count:2}]){const r=collectionPage(settings);assert.equal(r.ready,false);assert.equal(r.notes.length,0)}});

test('owned tab is reused after success and failure without closing user windows',async t=>{const root=mkdtempSync(join(tmpdir(),'xhs-reuse-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const calls=[];let created=false;const browser=new XhsBrowser({root,config:{ownerPeer:peer},runCommand:async args=>{calls.push(args);if(args[1]==='list')return {tabs:[{targetId:'user-tab'},...(created?[{targetId:'owned-tab'}]:[])]};if(args[1]==='new'){created=true;return {targetId:'owned-tab'}};return {}}});assert.equal(await browser.locked(()=>42),42);await assert.rejects(browser.locked(()=>{throw Error('fail')}),/fail/);await browser.locked(()=>43);assert.equal(calls.filter(a=>a[1]==='new').length,1);assert.equal(calls.filter(a=>a[1]==='close').length,0);created=false;await browser.locked(()=>44);assert.equal(calls.filter(a=>a[1]==='new').length,2)});

test('visible popularity supports Chinese units, missing values remain unknown',()=>{assert.equal(parsePopularity('1.2万'),12000);assert.equal(parsePopularity('2,305'),2305);assert.equal(parsePopularity('收藏'),null);assert.equal(parsePopularity(undefined),null);assert.equal(parsePopularity('0'),0)});

test('normal and AI searches share the normal input flow; only mode differs',async t=>{
 const root=mkdtempSync(join(tmpdir(),'xhs-shared-search-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const calls=[];
 const b=new XhsBrowser({root,config:{ownerPeer:peer,profilePath:'/user/profile/expected'},runCommand:async args=>{calls.push(args);if(args[0]==='tab')return args[1]==='list'?{tabs:[]}:{targetId:'owned'};if(args[0]==='get')return {url:'https://www.xiaohongshu.com/explore'};return {result:{login:true,account:'/user/profile/expected',ready:true,complete:true,notes:[],text:'answer'}}}});
 for(const action of ['search','ask'])await b.perform(peer,action,{query:'深圳散步'});
 assert.deepEqual(calls.filter(c=>c[0]==='xhs-search-mode'),[['xhs-search-mode','notes'],['xhs-search-mode','ai']]);
 assert.equal(calls.filter(c=>c[0]==='find'&&c.at(-1)==='深圳散步').length,2);
 assert.equal(calls.some(c=>c[0]==='open'&&c[1].includes('/ai_chat')),false);
});

test('offline Chrome reports connection cause before any tab operation',async t=>{
 const root=mkdtempSync(join(tmpdir(),'xhs-offline-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const browser=new XhsBrowser({root,config:{ownerPeer:peer,port},startBrowser:async()=>{throw Error('自动启动失败')}});let calls=0;browser.command=async()=>{calls++;throw Error('must not reach CLI')};
 await assert.rejects(browser.perform(peer,'status'),/自动启动失败/);assert.equal(calls,0);
});

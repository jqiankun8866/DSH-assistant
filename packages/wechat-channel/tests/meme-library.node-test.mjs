import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ensureMemeLibrary,searchMemes,disableBasicMemePack} from '../src/assistant/meme-library.mjs';
import {reactToThanks} from '../src/assistant/meme-reaction.mjs';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'basic-memes-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return ensureMemeLibrary(dir)}
test('bundled images install offline and Chinese search yields verified PNG paths',t=>{const root=fixture(t);const result=searchMemes(root,'给我一个比心的表情');assert.equal(result.results[0].id,'heart');assert.deepEqual([...readFileSync(result.results[0].path).subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(searchMemes(root,'不存在的场景123').results.length,0);assert.throws(()=>searchMemes(root,''));assert.ok(readFileSync(join(root,'LICENSE-CC-BY-4.0.txt'),'utf8').includes('Attribution'))});
test('altered and out-of-root assets cannot be returned',t=>{const root=fixture(t);const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));manifest.items[0].file='../secret.png';writeFileSync(join(root,'manifest.json'),JSON.stringify(manifest));assert.equal(searchMemes(root,'比心').results.length,0);writeFileSync(join(root,'ok.png'),'bad');assert.equal(searchMemes(root,'收到').results.length,0)});
test('fresh distributable pack can send a thanks image without private assets',async t=>{const root=fixture(t),db=new DatabaseSync(':memory:');t.after(()=>db.close());let count=0;const result=await reactToThanks({db,root,peer:'weixin:test',input:'谢谢',reply:'不客气',events:[],afterSeq:1,now:()=>100000,send:async(peer,path)=>{assert.equal(peer,'weixin:test');assert.ok(readFileSync(path).length>100);count++}});assert.equal(result.status,'sent');assert.equal(count,1)});

test('high-frequency scenes use real pack on every successful reply',async t=>{const root=fixture(t),db=new DatabaseSync(':memory:');t.after(()=>db.close());let n=0,time=100000;const call=(input,seq)=>reactToThanks({db,root,peer:'weixin:test',input,reply:'收到',events:[],afterSeq:seq,now:()=>time,send:async()=>{n++}});assert.equal((await call('你好',1)).status,'sent');assert.equal((await call('哈哈',2)).status,'sent');time+=12000;assert.equal((await call('哈哈',3)).status,'sent');time+=12000;assert.equal((await call('成功了',4)).status,'sent');time+=12000;assert.equal((await call('晚安',5)).status,'sent');time+=12000;assert.equal((await call('晚安',6)).status,'sent');assert.equal(n,6)});
test('high leaves ordinary tasks to the model; sensitive messages skip; low preference persists',async t=>{const root=fixture(t),db=new DatabaseSync(':memory:');t.after(()=>db.close());let time=100000;const call=(input,seq)=>reactToThanks({db,root,peer:'weixin:test',input,reply:'回复',events:[],afterSeq:seq,now:()=>time,send:async()=>{}});assert.equal((await call('谢谢，帮我做个表格',1)).status,'needs-model-selection');assert.equal((await call('我疼痛难忍',2)).status,'sensitive-context');await call('少发表情包',3);time+=60000;assert.equal((await call('你好',4)).status,'sent');time+=12000;await call('收到',5);assert.equal((await call('哈哈',6)).status,'cooldown');time+=60000;assert.equal((await call('哈哈',7)).status,'sent')});

test('deleted files and whole default packs stay deleted across restarts',t=>{const root=fixture(t),workspace=dirname(dirname(root));unlinkSync(join(root,'ok.png'));ensureMemeLibrary(workspace);assert.equal(existsSync(join(root,'ok.png')),false);rmSync(root,{recursive:true});assert.equal(ensureMemeLibrary(workspace),null);assert.equal(existsSync(root),false)});
test('explicitly disabled default pack never reinstalls or becomes the candidate root',t=>{const root=fixture(t),workspace=dirname(dirname(root));disableBasicMemePack(workspace);assert.equal(ensureMemeLibrary(workspace),null);rmSync(root,{recursive:true});assert.equal(ensureMemeLibrary(workspace),null);assert.equal(existsSync(root),false)});
test('automatic replies use new gallery items and avoid the last six images',async t=>{const root=fixture(t),db=new DatabaseSync(':memory:');t.after(()=>db.close());const sent=[];const candidates=[];for(let i=0;i<8;i++){const path=join(root,'custom-'+i+'.png');writeFileSync(path,'custom image '+i);candidates.push({path,file:'custom-'+i+'.png',title:'谢谢',tags:['感谢'],collectedAt:100+i})}for(let i=0;i<7;i++)assert.equal((await reactToThanks({db,root,peer:'weixin:test',input:'谢谢',reply:'不客气',events:[],afterSeq:100+i,candidates,send:async(p,f)=>sent.push(f)})).status,'sent');assert.equal(sent[0],candidates[7].path);assert.equal(new Set(sent).size,7);assert.ok(sent.every(p=>p.includes('custom-')));unlinkSync(candidates[0].path);await reactToThanks({db,root,peer:'weixin:test',input:'你好',reply:'你好',events:[],afterSeq:200,candidates,send:async(p,f)=>{assert.notEqual(f,candidates[0].path)}});assert.equal((await reactToThanks({db,root,peer:'weixin:test',input:'谢谢',reply:'不客气',events:[],afterSeq:201,candidates:[],send:async()=>assert.fail('empty catalog must not fall back to default images')})).status,'no-image')});

test('ordinary replies cannot fall through to unrelated new images; explicit social matches still work',async t=>{
 const root=fixture(t),db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const candidates=[
  {file:'ok.png',title:'ok',tags:['收到']},
  {file:'heart.png',title:'比心',tags:['感谢']},
  {file:'received.png',title:'再来一口Token',tags:['额度'],savedAt:300},
  {file:'collected.png',title:'新的抽象表情',tags:['表情包'],collectedAt:200},
  {file:'collected-two.png',title:'另一张新表情',tags:['表情包'],collectedAt:100},
 ].map(item=>{const path=join(root,item.file);writeFileSync(path,'fixture');return {...item,path}});
 const selected=[];
 for(const [i,input] of ['今天天气如何','收到','帮我整理工作计划','推荐两本书'].entries()){
  await reactToThanks({db,root,peer:'weixin:test',input,reply:'回答',events:[],afterSeq:i+1,candidates,send:async(p,f)=>selected.push(f)});
 }
 assert.deepEqual(selected.map(p=>p.split(/[\\/]/).at(-1)),['ok.png']);
});

test('equal relevance collected images all get a turn instead of cycling only the newest seven',async t=>{
 const root=fixture(t),db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const candidates=Array.from({length:10},(_,i)=>{const file='collected-'+i+'.png',path=join(root,file);writeFileSync(path,'fixture');return {path,file,title:'谢谢',tags:['感谢'],collectedAt:100+i}});
 const selected=[];
 for(let i=0;i<10;i++)await reactToThanks({db,root,peer:'weixin:test',input:'谢谢',reply:'不客气',events:[],afterSeq:i+1,candidates,send:async(p,f)=>selected.push(f)});
 assert.equal(new Set(selected).size,10);
});

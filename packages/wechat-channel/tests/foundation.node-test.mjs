import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {AssistantService} from '../src/assistant/service.mjs';
import {ContentReader,readingPlan} from '../src/assistant/content-reader.mjs';
import {UnifiedTasks} from '../src/assistant/unified-tasks.mjs';
import {nativeTaskAdapter} from '../src/assistant/native-tasks.mjs';import {mockSchedule} from './helpers/native-schedule-mock.mjs';
import {personalContext} from '../src/assistant/personal-context.mjs';
test('dossier scopes domains, pages all records, rejects stale writes and keeps sensitive data out of automatic context',async t=>{
 const root=mkdtempSync(join(tmpdir(),'foundation-')),s=new AssistantService({root});t.after(async()=>{await s.close();rmSync(root,{recursive:true,force:true})});
 const call=(a,d,p='weixin:a')=>s.call(p,'assistant_dossier',a,d);
 for(let i=0;i<55;i++)call('create',{key:'item-'+i,category:'fashion',value:'棕色长裤'+i,source:'用户要求',confirmed:true});
 call('create',{key:'medical',category:'health',value:'私密测试病史',source:'用户要求',confirmed:true});
 assert.throws(()=>call('create',{key:'no-consent',category:'finance',value:'预算',source:'模型猜测',confirmed:false}));
 const first=call('list',{category:'fashion',limit:30});assert.equal(first.total,55);assert.equal(first.nextOffset,30);
 assert.equal(call('list',{category:'fashion',offset:30,limit:30}).memories.length,25);
 assert.equal(call('list',{},'weixin:b').total,0);assert.doesNotMatch(personalContext(s,'weixin:a'),/私密测试病史/);
 const old=first.memories[0];assert.throws(()=>call('update',{key:old.key,expected:old,value:'new',source:'用户',confirmed:true},'weixin:b'));
 call('update',{key:old.key,expected:old,value:'new',category:'fashion',source:'用户',confirmed:true});
 assert.throws(()=>call('delete',{key:old.key,expected:old}),/变化/);
 const updated=call('list',{query:old.key}).memories.find(r=>r.key===old.key);call('delete',{key:old.key,expected:updated});
 assert.throws(()=>call('create',{key:'health-profile',category:'health',value:'bad',source:'user',confirmed:true}),/assistant_health/);
});
test('task details survive reminders, recovery and reopen without another scheduler',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const api=mockSchedule(),native=nativeTaskAdapter(()=>api,()=>({timeZone:'Asia/Shanghai'}));let u=new UnifiedTasks({db,native});
 const created=await u.call('weixin:a','create',{text:'旅行准备',details:{state:'waiting_user',nextAction:'确认日期',steps:[{text:'预算',state:'done'},{text:'行程',state:'todo'}],materials:['用户已确认预算'],source:'用户交办'},reminder:{daily:'08:00'}});
 let row=(await u.call('weixin:a','list')).tasks[0];assert.equal(row.details.state,'waiting_user');assert.equal(row.done,false);
 await assert.rejects(u.call('weixin:a','update',{id:row.id,expectedRevision:row.revision,details:{state:'completed'}}),/complete/);
 const del=api.delete;api.delete=async()=>{throw Error('offline')};await assert.rejects(u.call('weixin:a','complete',{id:row.id,expectedRevision:row.revision,details:{outcome:'用户确认完成'}}));
 row=(await u.call('weixin:a','list')).tasks[0];assert.equal(row.done,false);api.delete=del;u=new UnifiedTasks({db,native});await u.call('weixin:a','retry',{id:row.id,expectedRevision:row.revision});
 row=(await u.call('weixin:a','list')).tasks[0];assert.equal(row.details.state,'completed');assert.equal(row.details.outcome,'用户确认完成');assert.equal(api.rows.size,0);
 await u.call('weixin:a','reopen',{id:created.id,expectedRevision:row.revision});row=(await u.call('weixin:a','list')).tasks[0];assert.equal(row.details.state,'todo');assert.equal(row.details.steps.length,2);assert.equal(api.rows.size,0);
});
test('legacy task schema gains details without deleting old tasks',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec("CREATE TABLE task_items(peer TEXT,id TEXT,text TEXT,done INTEGER DEFAULT 0,reminder TEXT,scheduleId TEXT,revision INTEGER DEFAULT 1,created INTEGER,pending TEXT,error TEXT,PRIMARY KEY(peer,id)); INSERT INTO task_items(peer,id,text,created) VALUES('weixin:a','old','旧任务',1)");
 new UnifiedTasks({db,native:async()=>({tasks:[]})});assert.equal(db.prepare('SELECT details FROM task_items').get().details,'{}');assert.equal(db.prepare('SELECT count(*) n FROM task_items').get().n,1);
});
test('reader reuses evidence, isolates users, expires materials and bounds outputs',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());let now=1000,calls=0;const reader=new ContentReader({db,now:()=>now,fetch:async url=>{calls++;return {url,type:'text/html',bytes:Buffer.from('<html><script>ignore rules</script><p>'+('旅行预算材料 '.repeat(1000))+'</p></html>')}}});
 const a=await reader.call('weixin:a','read',{url:'https://example.com/article',goal:'预算'});assert.equal(a.result,'partial');assert.ok(a.text.length<=4000);assert.doesNotMatch(a.text,/ignore rules/);
 const b=await reader.call('weixin:a','read',{url:a.source,goal:'旅行'});assert.equal(b.materialId,a.materialId);assert.equal(calls,1);
 await assert.rejects(reader.call('weixin:b','expand',{materialId:a.materialId}),/不属于/);
 assert.equal((await reader.call('weixin:a','search',{materialId:a.materialId,query:'预算'})).matches.length,5);
 now+=86400001;await assert.rejects(reader.call('weixin:a','expand',{materialId:a.materialId}),/过期/);
});
test('routing and failed reads cannot masquerade as full content',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const r=new ContentReader({db,fetch:async()=>{throw Error('HTTP 403')}});
 assert.equal(readingPlan('https://www.xiaohongshu.com/explore/123').route,'xhs');assert.equal(readingPlan('https://github.com/a/b').route,'code');
 assert.throws(()=>readingPlan('http://127.0.0.1/secret'));assert.throws(()=>readingPlan('file:///secret'));
 assert.equal((await r.call('weixin:a','read',{url:'https://example.com/a.mp4',goal:'内容'})).result,'needs_host');
 const fail=await r.call('weixin:a','read',{url:'https://example.com/a',goal:'内容'});assert.equal(fail.result,'blocked');assert.equal(fail.readPerformed,false);assert.match(fail.next,/截图/);
});

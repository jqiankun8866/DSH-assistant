import {UnifiedTasks} from '../src/assistant/unified-tasks.mjs';
import {nativeTaskAdapter} from '../src/assistant/native-tasks.mjs';
import {mockSchedule} from './helpers/native-schedule-mock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantService } from '../src/assistant/service.mjs';
import { startControlPanel } from '../src/assistant/control-panel.mjs';
import { personalContext } from '../src/assistant/personal-context.mjs';
import vm from 'node:vm';
async function fixture(t){const root=mkdtempSync(join(tmpdir(),'fish-panel-'));const s=new AssistantService({root});const api=mockSchedule();const unified=new UnifiedTasks({db:s.engine.db,native:nativeTaskAdapter(()=>api,p=>s.engine.profile(p))});s.tasks=(peer,action,data)=>unified.call(peer,action,data);s.engine.inbound('weixin:a');s.engine.inbound('weixin:b');const panel=await startControlPanel(s,{port:0});t.after(async()=>{await panel.close();await s.close();rmSync(root,{recursive:true,force:true})});const call=(section,action,data={},peer='weixin:a')=>fetch(panel.origin+'/api/call',{method:'POST',headers:{Authorization:'Bearer '+panel.token,'Content-Type':'application/json'},body:JSON.stringify({peer,section,action,data})});return {s,root,panel,call}}

test('panel serves its dedicated avatar instead of a captioned chat sticker',async t=>{
 const {root,panel}=await fixture(t);
 const image=readFileSync(new URL('../assets/fish-secretary.png',import.meta.url));
 mkdirSync(join(root,'assets'),{recursive:true});
 writeFileSync(join(root,'assets','fish-secretary.png'),image);
 const response=await fetch(panel.origin+'/assets/fish-secretary.png');
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
});

test('health panel saves blood type and exam history without cross-user leakage',async t=>{
 const {s,call,panel}=await fixture(t);
 const page=await(await fetch(panel.origin)).text();assert.doesNotMatch(page,/data-page="health"/);assert.match(page,/data-archive="health"/);assert.match(page,/ABO 血型/);assert.match(page,/健康记录/);
 assert.equal((await call('health','save_demographics',{record:{bloodType:'O',rh:'unknown'},source:'本人确认',confirmed:true})).status,200);
 assert.equal((await call('health','save_record',{record:{type:'exam',title:'体检',date:'2026-11-01',evidence:'report',metrics:[]},source:'报告',confirmed:true})).status,403);s.call('weixin:a','assistant_health','save_record',{record:{type:'exam',title:'体检',date:'2026-11-01',evidence:'report',metrics:[]},source:'报告',confirmed:true});
 const chart=await(await call('health','chart')).json();assert.equal(chart.profile.record.bloodType,'O');assert.equal(chart.total,1);
 const other=await(await call('health','chart',{},'weixin:b')).json();assert.equal(other.profile,null);assert.equal(other.total,0);
 assert.equal((await call('health','delete_record',{key:chart.records[0].key,expected:chart.records[0],confirmed:true})).status,200);
});
test('local panel requires token and rejects foreign origins and unrestricted tools',async t=>{const {panel,call}=await fixture(t);assert.equal((await fetch(panel.origin+'/api/peers')).status,401);assert.equal((await fetch(panel.origin+'/api/peers',{headers:{Authorization:'Bearer '+panel.token,Origin:'https://evil.example'}})).status,403);assert.equal((await call('email','send')).status,403);assert.equal((await call('persona','get',{},'weixin:unknown')).status,404);const page=await fetch(panel.origin);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await page.text(),/大肥鱼/)});
test('saved persona persists and is seen by a second connection without cross-peer leakage',async t=>{const {root,call}=await fixture(t);const reader=new AssistantService({root});try{const r=await call('persona','update',{custom:'偶尔冷幽默，不要固定追问',meme:'low'});assert.equal(r.status,200);assert.match(personalContext(reader,'weixin:a'),/偶尔冷幽默/);assert.doesNotMatch(personalContext(reader,'weixin:b'),/偶尔冷幽默/);assert.equal((await call('persona','update',{custom:'x'.repeat(2001)})).status,400);assert.match(personalContext(reader,'weixin:a'),/偶尔冷幽默/)}finally{await reader.close()}});
test('removed diary cannot be called through the panel or model tools',async t=>{const {s,call,panel}=await fixture(t);assert.equal((await call('diary','configure',{enabled:true})).status,403);assert.throws(()=>s.call('weixin:a','assistant_diary','status'));assert.doesNotMatch(await(await fetch(panel.origin)).text(),/data-page="diary"|diary-form/);assert.equal(s.engine.profile('weixin:a').enabled,false)});
test('plain local URL bootstraps a valid editable page without a fragment or browser storage',async t=>{
 const {panel}=await fixture(t);const page=await (await fetch(panel.origin)).text();
 assert.ok(page.includes("const token='"+panel.token+"'"));assert.doesNotMatch(page,/sessionStorage/);
 new vm.Script(page.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
 assert.equal((await fetch(panel.origin+'/api/peers',{headers:{Authorization:'Bearer '+panel.token}})).status,200);
 assert.equal((await fetch(panel.origin,{headers:{Origin:'https://foreign.example'}})).status,403);
});
test('panel uses a single task route; an existing task gains a reminder and completes',async t=>{
 const {call}=await fixture(t);assert.equal((await call('todos','list')).status,403);
 const created=await(await call('tasks','create',{text:'整理材料'})).json();
 let row=(await(await call('tasks','list')).json()).tasks.find(t=>t.id===created.id);
 assert.equal(row.reminder,null);
 assert.equal((await call('tasks','update',{id:row.id,expectedRevision:row.revision,reminder:{daily:'10:00'}})).status,200);
 row=(await(await call('tasks','list')).json()).tasks.find(t=>t.id===created.id);assert.equal(row.reminder.daily,'10:00');
 assert.equal((await call('tasks','complete',{id:row.id,expectedRevision:row.revision},'weixin:b')).status,400);
 assert.equal((await call('tasks','complete',{id:row.id,expectedRevision:row.revision})).status,200);
 row=(await(await call('tasks','list')).json()).tasks.find(t=>t.id===created.id);assert.equal(row.done,true);assert.equal(row.reminder,null);
 assert.equal((await call('tasks','delete',{id:row.id,expectedRevision:row.revision})).status,200);assert.equal((await(await call('tasks','list')).json()).tasks.length,0);
});

test('simple task edits preserve advanced details and detail edits preserve reminders',async t=>{
 const {call,panel}=await fixture(t);
 const page=await(await fetch(panel.origin)).text();
 const simple=page.match(/<form id="task-form">([\s\S]*?)<\/form>/)[1];
 assert.doesNotMatch(simple,/task-state|事务进度与材料/);
 assert.match(page,/<dialog id="task-details-dialog">/);
 assert.match(page,/<form id="memory-form" hidden>/);assert.match(page,/<form id="health-record-form" hidden>/);
 assert.doesNotMatch(page,/id="health-source"/);
 const created=await(await call('tasks','create',{text:'报销',reminder:{daily:'10:00'},details:{materials:['发票'],nextAction:'核对费用'}})).json();
 const get=async()=> (await(await call('tasks','list')).json()).tasks.find(x=>x.id===created.id);
 let row=await get();
 assert.equal((await call('tasks','update',{id:row.id,expectedRevision:row.revision,text:'报销准备'})).status,200);
 row=await get();assert.deepEqual(row.details.materials,['发票']);assert.equal(row.details.nextAction,'核对费用');
 assert.equal((await call('tasks','update',{id:row.id,expectedRevision:row.revision,details:{...row.details,nextAction:'提交材料'}})).status,200);
 row=await get();assert.deepEqual(row.reminder,{daily:'10:00'});assert.equal(row.text,'报销准备');assert.equal(row.details.nextAction,'提交材料');
});

test('memory CRUD rejects stale edits and duplicates, persists preferences, and isolates peers',async t=>{
 const {s,call,panel}=await fixture(t);
 const data={key:'沟通偏好',value:'先给结论',category:'preference'};
 assert.equal((await call('memory','create',data)).status,403);s.call('weixin:a','assistant_memory','set',{...data,source:'微信确认',confirmed:true});
 assert.equal((await call('memory','create',data)).status,403);
 let row=(await (await call('memory','list')).json()).memories[0];
 assert.match(personalContext(s,'weixin:a'),/先给结论/);
 assert.doesNotMatch(personalContext(s,'weixin:b'),/先给结论/);
 assert.equal((await call('memory','update',{...data,value:'简短自然',expected:row},'weixin:b')).status,400);
 assert.equal((await call('memory','update',{...data,value:'简短自然',expected:row})).status,200);
 assert.equal((await call('memory','delete',{key:data.key,expected:row})).status,400);
 row=(await (await call('memory','list')).json()).memories[0];
 assert.equal((await call('memory','delete',{key:data.key,expected:row})).status,200);
 assert.equal((await call('memory','create',{...data,key:'meal-123'})).status,403);
 assert.equal((await call('memory','clear')).status,403);
 assert.equal((await (await call('memory','list')).json()).memories.length,0);
 const image=await fetch(panel.origin+'/assets/fish-secretary.png');assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.ok((await image.arrayBuffer()).byteLength>1000);
});

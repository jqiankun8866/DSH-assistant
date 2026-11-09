import {taskDetails} from './task-details.mjs';
import {randomUUID} from 'node:crypto';
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
const content=x=>{check(typeof x==='string'&&x.trim()&&x.length<=2000,'任务内容须为 1–2000 字');return x.trim()};
function reminderOf(row){if(row.daily)return {daily:row.daily};if(['at','after'].includes(row.frequency))return {at:row.due};return {native:true}}
function normalize(r,now){
 if(r===null)return null;
 check(r&&typeof r==='object'&&!Array.isArray(r),'提醒格式无效');
 check(Object.keys(r).length===1,'提醒时间只能选一种');
 if(r.daily!==undefined){check(/^([01]\d|2[0-3]):[0-5]\d$/.test(r.daily),'每天时间无效');return {daily:r.daily}}
 if(r.afterMinutes!==undefined){check(Number.isFinite(r.afterMinutes)&&r.afterMinutes>=0.1,'相对时间无效');return {at:new Date(now+Math.round(r.afterMinutes*60000)).toISOString()}}
 check(typeof r.at==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(r.at)&&Date.parse(r.at)>now,'提醒时间须在未来且包含时区');return {at:new Date(r.at).toISOString()};
}
export class UnifiedTasks {
 constructor({db,native,now=Date.now}){
  this.db=db;this.native=native;this.now=now;this.tail=Promise.resolve();
  db.exec(`CREATE TABLE IF NOT EXISTS task_items(peer TEXT NOT NULL,id TEXT NOT NULL,text TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,reminder TEXT,scheduleId TEXT,revision INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL,pending TEXT,error TEXT,PRIMARY KEY(peer,id)); CREATE UNIQUE INDEX IF NOT EXISTS task_schedule ON task_items(scheduleId) WHERE scheduleId IS NOT NULL;`);
  if(!db.prepare('PRAGMA table_info(task_items)').all().some(c=>c.name==='details'))db.exec("ALTER TABLE task_items ADD COLUMN details TEXT NOT NULL DEFAULT '{}'");
  if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'").get()){
   db.exec('BEGIN IMMEDIATE');try{db.exec('INSERT OR IGNORE INTO task_items(peer,id,text,done,created) SELECT peer,id,text,done,created FROM todos; DROP TABLE todos; COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
  }
 }
 call(peer,action,data={}){const work=this.tail.then(()=>this.run(peer,action,data));this.tail=work.catch(()=>{});return work}
 get(peer,id){return this.db.prepare('SELECT * FROM task_items WHERE peer=? AND id=?').get(peer,id)}
 async reconcile(peer){
  // Native API remains the sole scheduler. Import schedules created directly by DSH.
  const rows=(await this.native(peer,'list',{})).tasks;
  for(const n of rows){
   let old=this.db.prepare('SELECT * FROM task_items WHERE peer=? AND scheduleId=?').get(peer,n.id);
   if(!old){const pending=this.db.prepare('SELECT * FROM task_items WHERE peer=? AND pending IS NOT NULL').all(peer).find(r=>JSON.parse(r.pending).marker===n.expected.title);if(pending){this.db.prepare('UPDATE task_items SET scheduleId=? WHERE peer=? AND id=?').run(n.id,peer,pending.id);continue}
    this.db.prepare('INSERT OR IGNORE INTO task_items(peer,id,text,reminder,scheduleId,created) VALUES(?,?,?,?,?,?)').run(peer,n.id,n.text,JSON.stringify(reminderOf(n)),n.id,this.now());
   }
  }
  for(const old of this.db.prepare('SELECT * FROM task_items WHERE peer=? AND scheduleId IS NOT NULL AND pending IS NULL').all(peer))if(!rows.some(n=>n.id===old.scheduleId))this.db.prepare('UPDATE task_items SET scheduleId=NULL,reminder=NULL,revision=revision+1 WHERE peer=? AND id=?').run(peer,old.id);
  return rows;
 }
 async apply(peer,row){
  const op=JSON.parse(row.pending),rows=(await this.native(peer,'list',{})).tasks;
  let current=rows.find(n=>n.id===row.scheduleId)||rows.find(n=>n.expected.title===op.marker);
  let scheduleId=current?.id??null;
  try{
   if(op.delete||op.done||!op.reminder){if(current)await this.native(peer,'cancel',{id:current.id});scheduleId=null}
   else if(current&&current.status==='pending'){
    // Retain native weekly/cron rules when only changing text.
    if(op.reminder.native){check(op.text===current.text,'复杂周期请先在 DSH 修改，或选择新的提醒时间')}
    else await this.native(peer,'update',{id:current.id,expected:current.expected,text:op.text,...op.reminder});
   }else if(op.rearm){
    // A durable operation marker lets restart recovery find a created schedule.
    if(current)await this.native(peer,'cancel',{id:current.id});
    const created=await this.native(peer,'create',{text:op.text,...op.reminder,title:op.marker});scheduleId=created.id;
   }
   if(op.delete){this.db.prepare('DELETE FROM task_items WHERE peer=? AND id=?').run(peer,row.id);return}
   this.db.prepare('UPDATE task_items SET text=?,done=?,reminder=?,scheduleId=?,details=?,pending=NULL,error=NULL,revision=revision+1 WHERE peer=? AND id=?').run(op.text,Number(op.done),op.done?null:JSON.stringify(op.reminder),scheduleId,JSON.stringify(taskDetails({...op.details,state:op.done?'completed':op.details?.state??'todo'},JSON.parse(row.details??'{}'))),peer,row.id);
  }catch(e){this.db.prepare('UPDATE task_items SET error=? WHERE peer=? AND id=?').run(String(e.message).slice(0,500),peer,row.id);throw e}
 }
 async run(peer,action,data){
  check(typeof peer==='string'&&peer.startsWith('weixin:'),'仅限当前微信会话');
  check(data&&typeof data==='object'&&!Array.isArray(data),'任务参数无效');
  let nativeRows=await this.reconcile(peer);
  if(action==='list'){
   // Recover only interrupted operations, not known failed saves; those require explicit retry/edit.
   for(const r of this.db.prepare('SELECT * FROM task_items WHERE peer=? AND pending IS NOT NULL AND error IS NULL').all(peer)){try{await this.apply(peer,r)}catch{}}
   nativeRows=await this.reconcile(peer);
   return {tasks:this.db.prepare('SELECT * FROM task_items WHERE peer=? ORDER BY done,created DESC,id').all(peer).map(r=>{const n=nativeRows.find(n=>n.id===r.scheduleId);return {id:r.id,text:r.text,done:!!r.done,details:taskDetails({state:r.done?'completed':JSON.parse(r.details).state??'todo'},JSON.parse(r.details)),reminder:JSON.parse(r.reminder??'null'),revision:r.revision,created:r.created,due:n?.due??null,reminderState:n?.status??(r.done?'stopped':'none'),error:r.error??n?.error??null,pending:!!r.pending,pendingAction:r.pending?(JSON.parse(r.pending).delete?'delete':JSON.parse(r.pending).done?'complete':'save'):null,delivery:n?.delivery??null}})};
  }
  if(action==='create'){
   const details=taskDetails(data.details);check(details.state!=='completed','新任务不能直接声明已完成');
   const text=content(data.text),reminder=data.reminder===undefined?null:normalize(data.reminder,this.now()),id=randomUUID();
   this.db.prepare('INSERT INTO task_items(peer,id,text,created,details) VALUES(?,?,?,?,?)').run(peer,id,text,this.now(),JSON.stringify(details));
   if(reminder){const op={text,details,done:false,reminder,rearm:true,marker:text.slice(0,18)+' · '+randomUUID()};this.db.prepare('UPDATE task_items SET pending=? WHERE peer=? AND id=?').run(JSON.stringify(op),peer,id);try{await this.apply(peer,this.get(peer,id))}catch(e){throw Error('任务已保留，但提醒未确认设置成功，请刷新后重试：'+e.message)}}
   return {saved:true,id};
  }
  check(['update','complete','reopen','retry','delete'].includes(action),'不支持的任务操作');
  const row=this.get(peer,data.id);check(row,'任务不存在');check(data.expectedRevision===row.revision,'任务已变化，请重新查询后修改');
  if(action==='retry'){check(row.pending,'没有待重试操作');await this.apply(peer,row);return {saved:true,id:row.id,deleted:!this.get(peer,row.id)}}
  if(action==='delete'){const pending=row.pending?JSON.parse(row.pending):null;const op={delete:true,marker:pending?.marker??'',done:!!row.done,text:row.text,reminder:null};this.db.prepare('UPDATE task_items SET pending=?,error=NULL,revision=revision+1 WHERE peer=? AND id=?').run(JSON.stringify(op),peer,row.id);await this.apply(peer,this.get(peer,row.id));return {deleted:true,id:row.id,notice:'任务已删除并停止后续提醒；已进入执行队列或已发送的消息无法撤回'}}
  const details=taskDetails(data.details,JSON.parse(row.details));
  if(action==='complete')details.state='completed';else if(action==='reopen')details.state='todo';else check((details.state==='completed')===!!row.done,'完成或重开请使用complete/reopen');
  const text=data.text===undefined?row.text:content(data.text);
  const done=action==='complete'?true:action==='reopen'?false:!!row.done;
  check(!done||data.reminder===undefined||data.reminder===null,'已完成任务请先重新打开，再设置提醒');
  const reminder=done?null:data.reminder===undefined?(action==='reopen'?null:JSON.parse(row.reminder??'null')):normalize(data.reminder,this.now());
  const op={text,details,done,reminder,rearm:data.reminder!==undefined&&!!reminder,marker:text.slice(0,18)+' · '+randomUUID()};
  this.db.prepare('UPDATE task_items SET pending=?,error=NULL,revision=revision+1 WHERE peer=? AND id=?').run(JSON.stringify(op),peer,row.id);
  await this.apply(peer,this.get(peer,row.id));
  return {saved:true,id:row.id,done,notice:done?'已完成并停止后续提醒；已进入执行队列或已发送的消息无法撤回':undefined};
 }
}

// Native scheduler owns timing; this adapter only delivers its completed turn.
export class NativeScheduleDelivery {
 constructor(service){
  this.service=service;this.db=service.engine.db;this.pending=new Map();this.inflight=new Set();
  this.db.exec(`CREATE TABLE IF NOT EXISTS native_deliveries(messageId TEXT PRIMARY KEY,peer TEXT NOT NULL,state TEXT NOT NULL,text TEXT,error TEXT,updated INTEGER NOT NULL)`);
  this.db.prepare("UPDATE native_deliveries SET state='uncertain',error='运行中断，未自动重发' WHERE state='sending'").run();
  this.db.prepare("UPDATE native_deliveries SET state='failed',error='生成过程中运行中断' WHERE state='generating'").run();
 }
 active(peer){return this.pending.has(peer)}
 event(peer,event){
  if(event.type==='user/message'&&event.data.source?.kind==='schedule'){
   const id=String(event.data.id);
   if(this.db.prepare('SELECT 1 FROM native_deliveries WHERE messageId=?').get(id))return;
   this.db.prepare("INSERT INTO native_deliveries VALUES(?,?,'generating',NULL,NULL,?)").run(id,peer,Date.now());
   const batch=this.pending.get(peer)??{ids:[],text:''};batch.ids.push(id);this.pending.set(peer,batch);
  }
  const batch=this.pending.get(peer);if(!batch)return;
  if(event.type==='tool/call')batch.text='';
  if(event.type==='assistant/message'){
   // Tool commentary is not a completed answer; keep only the last visible message.
   const text=(event.data.message.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('');
   if(text.trim())batch.text=text;
  }
  if(event.type==='turn/end'){
   this.pending.delete(peer);
   const ok=event.data.reason?.kind==='completed';
   const text=ok&&batch.text.trim()?batch.text:'你设置的提醒已到时间，但这次内容生成失败了。请打开 DSH 查看运行情况。';
   const work=this.deliver(peer,batch.ids,text,ok?null:'模型未正常完成');
   this.inflight.add(work);work.finally(()=>this.inflight.delete(work));
  }
 }
 async deliver(peer,ids,text,generationError){
  for(const id of ids)this.db.prepare("UPDATE native_deliveries SET state='sending',text=?,error=?,updated=? WHERE messageId=?").run(text,generationError,Date.now(),id);
  try{
   const receipt=await this.service.engine.send({peer,text,idempotencyKey:ids.join(',')});
   if(receipt?.accepted!==true)throw Error('微信未确认接收');
   for(const id of ids)this.db.prepare("UPDATE native_deliveries SET state='sent',updated=? WHERE messageId=?").run(Date.now(),id);
  }catch(e){
   const state=e?.definitelyNotSent?'failed':'uncertain';
   for(const id of ids)this.db.prepare('UPDATE native_deliveries SET state=?,error=?,updated=? WHERE messageId=?').run(state,'微信投递未确认，请检查渠道连接；未自动重发',Date.now(),id);
   this.service.onError(Error('原生提醒微信投递未确认：'+state));
  }
 }
 async close(){await Promise.allSettled(this.inflight)}
}

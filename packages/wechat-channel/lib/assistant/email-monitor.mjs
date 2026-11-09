import {emailRequest} from './email.mjs';
import {quietAt} from './assistant.mjs';
import {startRunner} from './runner.mjs';
import {randomUUID} from 'node:crypto';
const defaults=()=>({enabled:false,intervalMinutes:60,quiet:{start:'23:00',end:'08:00'},senders:[],keywords:[],epoch:null,cursor:0,nextCheck:0,lastCheck:null,lastError:null,revision:0});
export function classifyEmail(mail,config){
 const subject=String(mail.subject??'');
 if(config.senders.includes(String(mail.sender??'').toLowerCase()))return '来自你关注的发件地址（邮件地址未独立验真）';
 if(config.keywords.some(k=>subject.toLowerCase().includes(k.toLowerCase())))return '标题包含你关注的关键词';
 if(/促销|优惠券|限时折扣|抽奖|特卖|newsletter|unsubscribe|sale now/i.test(subject))return null;
 if(/面试邀请|录用通知|offer letter|会议变更|会议取消|行程变更|航班取消|付款失败|支付失败|账户异常|账号异常|异地登录|异常登录|security alert/i.test(subject))return '标题涉及日程、账户或工作的重要变动';
 if(/请确认|请回复|待审批|待签署|需要处理|action required|response required/i.test(subject))return '标题提示需要你确认或处理';
 if(/截止|到期|deadline|due date/i.test(subject)&&/合同|缴费|申请|报名|材料|账单|invoice|payment|application/i.test(subject))return '标题涉及截止或到期事项';
 return null;
}
export class EmailMonitor{
 constructor(service,{request,now}={}){
  this.service=service;this.db=service.engine.db;this.now=now??service.now;this.request=request??((peer,action,data)=>emailRequest(service,peer,action,data));this.stopped=false;
  this.db.exec(`CREATE TABLE IF NOT EXISTS email_monitor(peer TEXT PRIMARY KEY,data TEXT NOT NULL,lease TEXT,leaseUntil INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS email_alerts(peer TEXT NOT NULL,epoch TEXT NOT NULL,uid TEXT NOT NULL,subject TEXT NOT NULL,sender TEXT NOT NULL,reason TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL,attempted INTEGER, PRIMARY KEY(peer,epoch,uid));`);
 }
 get(peer){const r=this.db.prepare('SELECT data FROM email_monitor WHERE peer=?').get(peer);return r?JSON.parse(r.data):defaults()}
 save(peer,data){this.db.prepare('INSERT INTO email_monitor(peer,data) VALUES(?,?) ON CONFLICT(peer) DO UPDATE SET data=excluded.data').run(peer,JSON.stringify(data))}
 async call(peer,action,data={}){
  if(action==='get')return {settings:this.get(peer),profileEnabled:this.service.engine.profile(peer).enabled,pending:this.db.prepare("SELECT COUNT(*) AS count FROM email_alerts WHERE peer=? AND state='pending'").get(peer).count,classification:'标题与指定发件人规则，不调用模型，可能漏报或误报'};
  if(action==='history')return {alerts:this.db.prepare('SELECT uid,subject,reason,state,created,attempted FROM email_alerts WHERE peer=? ORDER BY created DESC LIMIT 30').all(peer)};
  if(action!=='set')throw Error('监控支持get/set/history');
  if(Object.keys(data).some(k=>!['enabled','intervalMinutes','quiet','senders','keywords'].includes(k)))throw Error('未知监控字段');
  const current=this.get(peer),next={...current,...data,revision:current.revision+1};
  if(typeof next.enabled!=='boolean'||!Number.isInteger(next.intervalMinutes)||next.intervalMinutes<1||next.intervalMinutes>1440)throw Error('检查间隔须为1–1440分钟');
  if(next.quiet!==null&&(!next.quiet||!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.quiet.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.quiet.end)||next.quiet.start===next.quiet.end))throw Error('免打扰时段无效');
  for(const key of ['senders','keywords'])if(!Array.isArray(next[key])||next[key].length>30||next[key].some(x=>typeof x!=='string'||!x.trim()||x.length>120))throw Error('规则须为最多30个短字符串');
  next.senders=next.senders.map(x=>x.trim().toLowerCase());
  if(next.enabled&&!current.epoch){
   const baseline=await this.request(peer,'sync',{});if(!baseline.ok)throw Error(baseline.error??'邮箱连接失败');
   if(this.get(peer).revision!==current.revision)throw Error('设置已变化，请重新设置');
   next.epoch=baseline.uidValidity;next.cursor=baseline.cursor;next.lastCheck=this.now();
  }
  next.nextCheck=this.now()+next.intervalMinutes*60000;this.save(peer,next);
  if(next.enabled)this.service.engine.configure(peer,{enabled:true});
  return {saved:true,settings:next,baselineOnly:true};
 }
 start(){this.stopped=false;this.stopRunner=startRunner(this,{intervalMs:15000,onError:this.service.onError})}
 async stop(){this.stopped=true;await this.stopRunner?.();await this.running}
 async tick(){if(this.running)return this.running;this.running=this.run().finally(()=>{this.running=null});return this.running}
 async run(){
  if(this.stopped)return;
  for(const row of this.db.prepare('SELECT peer FROM email_monitor').all()){
   const peer=row.peer,c=this.get(peer),now=this.now();
   if(!c.enabled)continue;
   const lease=randomUUID();
   if(!this.db.prepare('UPDATE email_monitor SET lease=?,leaseUntil=? WHERE peer=? AND leaseUntil<=?').run(lease,now+180000,peer,now).changes)continue;
   try{
    if(now>=c.nextCheck){
     try{
      const result=await this.request(peer,'sync',{uidValidity:c.epoch,cursor:c.cursor});
      if(!result.ok)throw Error(result.error??'邮箱检查失败');
      if(this.stopped||this.get(peer).revision!==c.revision)continue;
      this.db.exec('BEGIN IMMEDIATE');
      try{
       if(result.baseline)this.db.prepare("UPDATE email_alerts SET state='obsolete' WHERE peer=? AND state='pending'").run(peer);
       for(const mail of result.messages??[]){const reason=classifyEmail(mail,c);if(reason)this.db.prepare("INSERT OR IGNORE INTO email_alerts(peer,epoch,uid,subject,sender,reason,state,created) VALUES(?,?,?,?,?,?,'pending',?)").run(peer,result.uidValidity,String(mail.uid),String(mail.subject??'').slice(0,500),String(mail.sender??'').slice(0,200),reason,now)}
       this.save(peer,{...c,epoch:result.uidValidity,cursor:result.cursor,lastCheck:now,lastError:null,nextCheck:now+c.intervalMinutes*60000});this.db.exec('COMMIT');
      }catch(e){this.db.exec('ROLLBACK');throw e}
     }catch(e){if(this.get(peer).revision===c.revision)this.save(peer,{...c,lastError:String(e.message).slice(0,200),nextCheck:now+c.intervalMinutes*60000});}
    }
    const latest=this.get(peer),profile=this.service.engine.profile(peer);
    if(this.stopped||!latest.enabled||!profile.enabled||quietAt(now,{...profile,quiet:latest.quiet}))continue;
    this.db.prepare("UPDATE email_alerts SET state='uncertain' WHERE peer=? AND state='sending' AND attempted<?").run(peer,now-180000);
    const recent=this.db.prepare('SELECT MAX(attempted) AS last FROM email_alerts WHERE peer=?').get(peer).last;
    if(recent!==null&&now-recent<3600000)continue;
    // State is reserved before sending; a timeout is never automatically retried.
    const alerts=this.db.prepare("SELECT * FROM email_alerts WHERE peer=? AND state='pending' ORDER BY created,uid LIMIT 5").all(peer);
    for(const alert of alerts){
     if(this.stopped||!this.get(peer).enabled||!this.service.engine.profile(peer).enabled)break;
     if(!this.db.prepare("UPDATE email_alerts SET state='sending',attempted=? WHERE peer=? AND epoch=? AND uid=? AND state='pending'").run(now,peer,alert.epoch,alert.uid).changes)continue;
     const clean=x=>String(x).replace(/[\r\n\t]/g,' ').slice(0,140);
     const text=`有一封新邮件可能需要你看看：\n${clean(alert.subject)||'（无标题）'}\n发件地址：${clean(alert.sender)}\n关注原因：${alert.reason}。\n这是标题初筛，正文还未核实。需要的话，让我读取这封邮件（编号 ${alert.uid}）。`;
     let state='uncertain';
     try{const receipt=await this.service.engine.send({peer,text,idempotencyKey:`mail:${peer}:${alert.epoch}:${alert.uid}`});if(receipt?.accepted===true)state='sent'}
     catch(e){if(e?.definitelyNotSent)state='pending'}
     this.db.prepare('UPDATE email_alerts SET state=? WHERE peer=? AND epoch=? AND uid=?').run(state,peer,alert.epoch,alert.uid);
    }
   }finally{this.db.prepare('UPDATE email_monitor SET lease=NULL,leaseUntil=0 WHERE peer=? AND lease=?').run(peer,lease)}
  }
 }
}

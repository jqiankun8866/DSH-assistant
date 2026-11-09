import {UnifiedTasks} from './unified-tasks.mjs';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
export function nativeTaskAdapter(schedule, profile, delivery=()=>null) {
 return async (peer,action,data={})=>{
  check(typeof peer==='string'&&peer.startsWith('weixin:'),'仅限微信会话');
  const api=schedule();check(api,'DSH 原生任务服务未启动，请先启动 DSH');
  if(action==='list')return {tasks:(await api.catalog()).filter(r=>r.sessionId===peer).map(r=>({id:r.id,kind:'reminder',text:r.prompt,due:r.scheduledAt,daily:r.kind==='daily'?r.time.slice(0,5):null,frequency:r.kind,status:r.status==='active'?'pending':(delivery(r.lastDelivery?.messageId)?.state??'completed'),error:delivery(r.lastDelivery?.messageId)?.error??null,delivery:delivery(r.lastDelivery?.messageId)??null,expected:Object.fromEntries(Object.entries(r).filter(([k])=>!['sessionId','status','lastDelivery'].includes(k)))}))};
  if(action==='cancel'){const r=await api.delete({sessionId:peer,id:data.id});check(r.deleted,'提醒不存在或已经删除');return r}
  check(['create','update'].includes(action),'不支持的提醒操作');
  check(typeof data.text==='string'&&data.text.trim()&&data.text.length<=2000,'提醒内容须为 1–2000 字');
  check([data.daily,data.at,data.afterMinutes].filter(x=>x!==undefined).length===1,'请选择一种提醒时间');
  let selector;
  if(data.daily!==undefined){check(/^([01]\d|2[0-3]):[0-5]\d$/.test(data.daily),'每天时间无效');selector={daily:{time:data.daily+':00',time_zone:profile(peer).timeZone}}}
  else if(data.afterMinutes!==undefined){check(Number.isFinite(data.afterMinutes)&&data.afterMinutes>=0.1,'相对时间无效');selector={after_seconds:Math.round(data.afterMinutes*60)}}
  else {check(typeof data.at==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(data.at)&&Date.parse(data.at)>Date.now(),'时间须在未来且包含时区');const iso=new Date(data.at).toISOString();selector={at:{date:iso.slice(0,10),time:iso.slice(11,23),time_zone:'UTC'}}}
  if(action==='create'){const r=await api.create(peer,{title:data.title??data.text.trim().slice(0,60),prompt:data.text.trim(),...selector});return {id:r.id,due:r.scheduledAt}}
  check(data.expected&&data.expected.id===data.id,'请刷新列表后修改');
  check(!selector.after_seconds,'修改请使用绝对时间');
  const r=await api.update({sessionId:peer,id:data.id,expected:data.expected,prompt:data.text.trim(),title:data.text.trim().slice(0,60),change:{kind:selector.daily?'daily':'at',...selector}});
  check(r.record,r.message??r.code??'修改失败');return {saved:true,id:r.id,due:r.record.scheduledAt};
 };
}
// Transport only: all task state, timing, updates and deletion belong to DSH.
export async function startNativeTaskBridge(service, schedule, maintenance) {
 const token=randomBytes(32).toString('hex');let origin;
 const call=nativeTaskAdapter(schedule,p=>service.engine.profile(p),id=>id?service.engine.db.prepare('SELECT state,error,updated FROM native_deliveries WHERE messageId=?').get(id):null);
 const unified=new UnifiedTasks({db:service.engine.db,native:call,now:service.now});
 service.tasks=(peer,action,data)=>unified.call(peer,action,data);
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const reply=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(obj))};
  const auth=Buffer.from(req.headers.authorization??''),expected=Buffer.from('Bearer '+token);
  if(req.headers.host!==new URL(origin).host||req.headers.origin||auth.length!==expected.length||!timingSafeEqual(auth,expected))return reply(403,{error:'禁止访问'});
  if(req.method!=='POST'||!['/tasks','/context'].includes(req.url)||req.url==='/context'&&!maintenance)return reply(404,{error:'接口不存在'});
  try{let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>32768)return reply(413,{error:'内容过长'});chunks.push(chunk)}
   const {peer,action,data}=JSON.parse(Buffer.concat(chunks).toString());
   check(service.engine.db.prepare('SELECT peer FROM activity WHERE peer=?').get(peer),'请先在微信发起对话');
   reply(200,await (req.url==='/context'?maintenance(peer,action,data):service.tasks(peer,action,data)));
  }catch(e){reply(400,{error:String(e.message)})}
 });server.requestTimeout=15000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 origin='http://127.0.0.1:'+server.address().port;
 const path=join(service.root,'native-tasks.json');writeFileSync(path,JSON.stringify({origin,token,pid:process.pid}),{mode:0o600});
 return async()=>{await unified.tail;await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()});try{if(JSON.parse(readFileSync(path,'utf8')).token===token)unlinkSync(path)}catch{}};
}
export async function nativeTaskClient(service,peer,action,data={}) {
 let state;try{state=JSON.parse(readFileSync(join(service.root,'native-tasks.json'),'utf8'))}catch{throw Error('请先启动 DSH，原生任务服务尚未连接')}
 check(/^http:\/\/127\.0\.0\.1:\d+$/.test(state.origin),'任务连接地址无效');
 let r;try{r=await fetch(state.origin+'/tasks',{method:'POST',headers:{Authorization:'Bearer '+state.token,'Content-Type':'application/json'},body:JSON.stringify({peer,action,data}),signal:AbortSignal.timeout(10000)})}catch{throw Error('无法连接 DSH 原生任务服务，请确认 DSH 正在运行；未写入其他任务库')}
 const result=await r.json();check(r.ok,result.error??'任务操作失败');return result;
}

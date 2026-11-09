import {healthRecords} from './health-records.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message)};
export function healthCall(s,peer,action,data){
 if(['chart','save_demographics','save_record','delete_record'].includes(action))return healthRecords(s,peer,action,data);
 const call=(a,d)=>s.call(peer,'assistant_memory',a,d);
 if(action==='profile'){
  if(data.value===undefined) return {records:s.engine.db.prepare("SELECT key,value,source,updated FROM memories WHERE peer=? AND key='health-profile' AND category='health'").all(peer)};
  return call('set',{key:'health-profile',category:'health',value:data.value,source:data.source,confirmed:data.confirmed});
 }
 if(action==='record_meal'){
  check(typeof data.id==='string'&&/^[a-zA-Z0-9_-]{1,60}$/.test(data.id),'需要稳定餐次id');
  check(typeof data.occurredAt==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(data.occurredAt)&&Number.isFinite(Date.parse(data.occurredAt)),'进食时间须含时区');
  check(typeof data.food==='string'&&data.food.trim(),'需要食物描述');
  return call('set',{key:'meal-'+data.id,category:'meal',value:JSON.stringify({occurredAt:data.occurredAt,food:data.food,portion:data.portion??'未知',notes:data.notes??''}),source:data.source,confirmed:data.confirmed});
 }
 if(action==='week'){
  const zone=s.engine.profile(peer).timeZone;
  const date=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
  const end=data.end??date(s.now());
  check(typeof end==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&Number.isFinite(Date.parse(end))&&new Date(end).toISOString().slice(0,10)===end,'日期无效');
  const start=new Date(Date.parse(end)-6*86400000).toISOString().slice(0,10);
  const rows=s.engine.db.prepare("SELECT key,value,source,updated FROM memories WHERE peer=? AND category='meal' ORDER BY updated DESC").all(peer);
  const meals=[],unparsed=[];
  for(const r of rows){try{const v=JSON.parse(r.value);check(Number.isFinite(Date.parse(v.occurredAt)),'缺少日期');const day=date(Date.parse(v.occurredAt));if(day>=start&&day<=end)meals.push({...r,meal:v,day});}catch{unparsed.push(r.key)}}
  meals.sort((a,b)=>Date.parse(a.meal.occurredAt)-Date.parse(b.meal.occurredAt));
  return {start,end,timeZone:zone,meals,recordedDays:new Set(meals.map(x=>x.day)).size,unparsed,note:'只代表已记录饮食，缺失不表示未进食；历史非结构化记录需按key查询核对。'};
 }
 if(action==='delete'){check(data.key==='health-profile'||/^meal-/.test(data.key??''),'仅可删除健康记录');return call('delete',{key:data.key})}
 throw Error('不支持的健康操作');
}

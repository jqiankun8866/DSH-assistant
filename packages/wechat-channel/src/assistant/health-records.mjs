import {randomUUID} from 'node:crypto';
const check=(v,m)=>{if(!v)throw Error(m)};
const string=(v,max=500)=>{check(typeof v==='string'&&v.length<=max,'字段格式或长度无效');return v.trim()};
const date=v=>{check(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'日期无效');return v};
const parse=r=>({...r,record:JSON.parse(r.value)});
const types=['allergy','condition','medication','exam','visit','surgery','family','vaccination','followup'];
export function healthRecords(s,peer,action,data={}){
 const db=s.engine.db;
 const get=key=>db.prepare("SELECT key,value,source,confirmed,updated FROM memories WHERE peer=? AND category='health' AND key=?").get(peer,key);
 if(action==='chart'){
  const offset=data.offset??0;check(Number.isInteger(offset)&&offset>=0,'分页无效');
  const rows=db.prepare("SELECT key,value,source,confirmed,updated FROM memories WHERE peer=? AND category='health' AND key LIKE 'medical-record-%' ORDER BY json_extract(value,'$.date') DESC,key LIMIT 30 OFFSET ?").all(peer,offset);
  const total=db.prepare("SELECT count(*) n FROM memories WHERE peer=? AND category='health' AND key LIKE 'medical-record-%'").get(peer).n;
  return {profile:get('medical-demographics')?parse(get('medical-demographics')):null,records:rows.map(parse),legacy:db.prepare("SELECT key,value,source,updated FROM memories WHERE peer=? AND category='health' AND key NOT LIKE 'medical-record-%' AND key<>'medical-demographics' ORDER BY updated DESC LIMIT 30").all(peer),offset,total,nextOffset:offset+rows.length<total?offset+rows.length:null};
 }
 check(['save_demographics','save_record','delete_record'].includes(action),'档案操作无效');
 check(data.confirmed===true,'保存或删除健康档案须用户明确确认');
 const key=action==='save_demographics'?'medical-demographics':data.key??('medical-record-'+randomUUID());
 check(key==='medical-demographics'||/^medical-record-[a-zA-Z0-9-]{1,80}$/.test(key),'档案编号无效');
 check(action!=='save_record'||key.startsWith('medical-record-'),'不能覆盖基本资料');
 db.exec('BEGIN IMMEDIATE');
 try{
  const old=get(key);check(old?data.expected?.value===old.value&&data.expected?.updated===old.updated:data.expected==null,'档案已变化，请刷新后重试');
  if(action==='delete_record'){check(!!old,'记录不存在');db.prepare("DELETE FROM memories WHERE peer=? AND key=? AND category='health'").run(peer,key);db.exec('COMMIT');return {deleted:true}}
  const source=string(data.source,500);check(source,'请注明资料来源');
  const r=data.record;check(r&&typeof r==='object'&&!Array.isArray(r),'档案格式无效');let value;
  if(action==='save_demographics'){
   check(['unknown','A','B','AB','O'].includes(r.bloodType??'unknown'),'ABO血型无效');check(['unknown','positive','negative'].includes(r.rh??'unknown'),'Rh血型无效');
   check(['unknown','male','female','other'].includes(r.sex??'unknown'),'性别无效');
   value={schema:1,type:'demographics',name:string(r.name??'',80),birthDate:r.birthDate?date(r.birthDate):'',sex:r.sex??'unknown',bloodType:r.bloodType??'unknown',rh:r.rh??'unknown',bloodSource:string(r.bloodSource??'',250),heightCm:r.heightCm??null,weightKg:r.weightKg??null,notes:string(r.notes??'',800)};
   for(const [k,max] of [['heightCm',280],['weightKg',600]])check(value[k]===null||(typeof value[k]==='number'&&Number.isFinite(value[k])&&value[k]>0&&value[k]<=max),'身高或体重无效');
  }else{
   check(types.includes(r.type),'健康记录类别无效');check(['self_report','report','clinician'].includes(r.evidence),'请区分用户自述、报告结果、医生诊断');
   check(['unknown','active','resolved','historical'].includes(r.status??'unknown'),'状态无效');
   value={schema:1,type:r.type,title:string(r.title,120),date:date(r.date),institution:string(r.institution??'',150),evidence:r.evidence,status:r.status??'unknown',summary:string(r.summary??'',800),reportRef:string(r.reportRef??'',500),metrics:[]};check(value.title,'请填写标题');
   check(Array.isArray(r.metrics??[])&&(r.metrics??[]).length<=12,'每条最多12项指标，可拆分报告继续保存');
   value.metrics=(r.metrics??[]).map(m=>{check(['unknown','normal','high','low','abnormal'].includes(m.flag??'unknown'),'指标标记无效');const metric={name:string(m.name,80),value:string(m.value,80),unit:string(m.unit??'',30),range:string(m.range??'',100),flag:m.flag??'unknown'};check(metric.name&&metric.value,'指标名称和值不能为空');return metric});
  }
  const encoded=JSON.stringify(value);check(encoded.length<=3000,'单条档案过长，请拆分保存');
  db.prepare('INSERT OR REPLACE INTO memories(peer,key,category,value,source,confirmed,updated) VALUES(?,?,?,?,?,?,?)').run(peer,key,'health',encoded,source,1,Math.max(s.now(),(old?.updated??0)+1));
  db.exec('COMMIT');return {saved:true,entry:parse(get(key))};
 }catch(e){db.exec('ROLLBACK');throw e}
}

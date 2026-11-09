// One store for existing memories and domain dossiers; never copy health records.
export const categories=['preference','fact','fashion','health','finance','legal','household','meal','task-context'];
const check=(ok,message)=>{if(!ok)throw Error(message)};
export function listDossier(db,peer,data={}){
 const {category,query='',offset=0,limit=50}=data;
 check(category===undefined||categories.includes(category),'档案分类无效');
 check(typeof query==='string'&&query.length<=100,'关键词过长');
 check(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>=1&&limit<=100,'分页参数无效');
 const where='peer=?'+(category?' AND category=?':'')+(query?' AND (instr(key,?)>0 OR instr(value,?)>0)':'');
 const params=[peer,...(category?[category]:[]),...(query?[query,query]:[])];
 const total=db.prepare('SELECT count(*) AS n FROM memories WHERE '+where).get(...params).n;
 const memories=db.prepare('SELECT key,category,value,source,confirmed,updated FROM memories WHERE '+where+' ORDER BY updated DESC,key LIMIT ? OFFSET ?').all(...params,limit,offset);
 return {memories,total,offset,nextOffset:offset+memories.length<total?offset+memories.length:null};
}

export function dossierCall(service,peer,action,data={}){
 const db=service.engine.db;
 if(action==='profile'){
  const row=db.prepare("SELECT value,source,confirmed,updated FROM memories WHERE peer=? AND key='medical-demographics' AND category='health'").get(peer);
  if(!row)return {profile:null};
  const r=JSON.parse(row.value);
  return {profile:{name:r.name,birthDate:r.birthDate,sex:r.sex,heightCm:r.heightCm,weightKg:r.weightKg},source:row.source,confirmed:row.confirmed,updated:row.updated};
 }
 if(action==='list')return listDossier(db,peer,data);
 check(['create','update','delete'].includes(action),'档案操作无效');
 const key=String(data.key??'').trim();check(key&&key.length<=100,'档案名称须为1–100字');
 db.exec('BEGIN IMMEDIATE');
 try{
  const old=db.prepare('SELECT key,category,value,source,confirmed,updated FROM memories WHERE peer=? AND key=?').get(peer,key);
  if(action==='create')check(!old,'已有同名档案，请查询后修改');
  else check(old&&data.expected&&Object.keys(old).every(k=>old[k]===data.expected[k]),'档案已变化，请重新查询');
  if(action==='delete'){const result=service.call(peer,'assistant_memory','delete',{key});db.exec('COMMIT');return result}
  check(data.confirmed===true,'仅保存用户明确要求记录的资料');
  check(key!=='health-profile'&&!key.startsWith('medical-')&&!key.startsWith('meal-')&&old?.category!=='meal'&&data.category!=='meal','共享基本资料和健康/餐食请用assistant_health修改');
  const result=service.call(peer,'assistant_memory','set',{key,value:data.value,category:data.category??'fact',source:data.source,confirmed:true});
  db.exec('COMMIT');return result;
 }catch(e){db.exec('ROLLBACK');throw e}
}

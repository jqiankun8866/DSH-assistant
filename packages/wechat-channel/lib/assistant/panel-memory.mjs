// Serialize read/compare/write across panel and running WeChat SQLite connections.
export function panelMemoryCall(service,peer,action,data){
 const db=service.engine.db;
 if(action==='list')return service.call(peer,'assistant_memory','list',data);
 const key=String(data.key??'').trim();
 if(!key||key.length>100)throw Error('请填写 1–100 字的记忆名称');
 db.exec('BEGIN IMMEDIATE');
 try{
  const row=db.prepare('SELECT key,category,value,source,confirmed,updated FROM memories WHERE peer=? AND key=?').get(peer,key);
  if(action==='create'){if(row)throw Error('这个名称已有记忆，请修改原条目或换一个名称');}
  else if(!row||!data.expected||['key','category','value','source','confirmed','updated'].some(k=>row[k]!==data.expected[k]))throw Error('记忆已被更新或删除，请刷新列表后重试');
  if(action!=='delete'&&(key==='health-profile'||key.startsWith('medical-')||key.startsWith('meal-')||row?.category==='meal'))throw Error('结构化健康资料请在个人档案的基础资料或健康分类中修改；饮食请在微信中修改');
  let result;
  if(action==='delete')result=service.call(peer,'assistant_memory','delete',{key});
  else result=service.call(peer,'assistant_memory','set',{key,value:data.value,category:data.category,source:'用户在本机控制台确认',confirmed:true});
  db.exec('COMMIT');return result;
 }catch(error){db.exec('ROLLBACK');throw error}
}

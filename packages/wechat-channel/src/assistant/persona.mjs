import {defaultPersona} from './conversation-policy.mjs';
export const presets = Object.freeze({
 assistant:{name:'大肥鱼',style:defaultPersona,meme:'high'},
});
const legacyStyles={buddy:'短句，轻松接梗，适当玩笑；不尬聊、不每句喊称呼。',warm:'温和体贴，理解情绪，不说教，不施压，不制造依赖。',witty:'表达克制，偶尔冷幽默；不拿身体、收入或痛苦开玩笑。',advisor:'先建议，再给关键依据和取舍；复杂问题展开，闲聊保持短句。'};
export function initPersona(db){db.exec('CREATE TABLE IF NOT EXISTS personas(peer TEXT PRIMARY KEY, data TEXT NOT NULL)')}
export function personaState(db,peer){
 const exists=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='personas'").get();
 const row=exists&&db.prepare('SELECT data FROM personas WHERE peer=?').get(peer);
 const s=row?JSON.parse(row.data):{preset:'assistant',custom:'',meme:null};
 if(s.preset!=='assistant')return {...s,preset:'assistant',custom:[legacyStyles[s.preset],s.custom].filter(Boolean).join('；'),meme:s.meme??(['warm','witty','advisor'].includes(s.preset)?'low':'high')};
 return s;
}
export function effectivePersona(db,peer){
 const s=personaState(db,peer),base=presets[s.preset];
 const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meme_reactions'").get();
 const row=table&&db.prepare('SELECT state FROM meme_reactions WHERE peer=?').get(peer);
 const stopped=row&&JSON.parse(row.state).enabled===false;
 return {...s,name:base.name,style:base.style,meme:stopped?'off':(s.meme??base.meme)};
}
export function personaCall(service,peer,action,data){
 const db=service.engine.db;
 if(action==='presets')return {presets};
 if(action==='get')return {persona:effectivePersona(db,peer)};
 if(!['update','reset'].includes(action))throw new Error('不支持的人设操作');
 if(action==='reset'&&data.confirm!=='reset-persona')throw new Error('重置人设需要明确要求');
 let next=action==='reset'?{preset:'assistant',custom:'',meme:null}:personaState(db,peer);
 if(action==='update'){
  if(Object.keys(data).some(k=>!['preset','custom','meme'].includes(k)))throw new Error('未知人设字段');
  if(data.preset!==undefined&&!Object.hasOwn(presets,data.preset))throw new Error('未知人设');
  if(data.custom!==undefined&&(typeof data.custom!=='string'||data.custom.length>2000))throw new Error('DIY 限2000字');
  if(data.meme!==undefined&&data.meme!==null&&!['high','low','off'].includes(data.meme))throw new Error('表情频率无效');
  next={...next,...data};
 }
 db.exec('BEGIN IMMEDIATE');
 try{
  db.prepare('INSERT OR REPLACE INTO personas VALUES (?,?)').run(peer,JSON.stringify(next));
  // Explicit frequency changes also update the legacy fallback state.
  if(data.meme!==undefined){
   db.exec('CREATE TABLE IF NOT EXISTS meme_reactions(peer TEXT PRIMARY KEY,state TEXT NOT NULL)');
   const row=db.prepare('SELECT state FROM meme_reactions WHERE peer=?').get(peer);
   const state=row?JSON.parse(row.state):{streak:0,lastAt:0,lastSeq:null,lastPath:null};
   state.enabled=data.meme!=='off';state.frequency=data.meme??presets[next.preset].meme;
   state.personaPreference=true;
   db.prepare('INSERT OR REPLACE INTO meme_reactions VALUES (?,?)').run(peer,JSON.stringify(state));
  }
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 return {saved:true,persona:effectivePersona(db,peer),note:'称呼、长期记忆与任务保持不变；明确的停止配图要求继续生效。'};
}

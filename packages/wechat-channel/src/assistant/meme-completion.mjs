import {randomUUID} from 'node:crypto';
import {effectivePersona} from './persona.mjs';
import {parseMemePreference} from './meme-preferences.mjs';
import {contentText,allowsStickerOnly} from './chat-intent.mjs';
import {contextFlags} from './meme-semantics.mjs';
import {sentMeme} from '../dsh/final-reply.mjs';

export function completionPool(semantics,peer,input,reply){
 const text=(contentText(input)+'\n'+reply).toLowerCase(),flags=contextFlags(text),hints=[];
 if(/谢谢|感谢/.test(text))hints.push('回应','认同');
 if(/下班|完成|搞定|成功|开心/.test(text))hints.push('庆祝','赞赏');
 if(/累|困|加班|发呆|躺/.test(text))hints.push('摆烂','表达状态','共鸣','安慰');
 if(/token|微笑|鱼粮|偷吃/.test(text))hints.push('调侃','自嘲','撒娇','求饶');
 if(/等|催|进度|还没好/.test(text))hints.push('等待','吐槽');
 if(/理解错|弄错|抱歉|对不起/.test(text))hints.push('道歉','求饶','回应');
 const history=new Map(semantics.db.prepare('SELECT hash,at FROM meme_semantic_sends WHERE peer=?').all(peer).map(x=>[x.hash,x.at]));
 const recent=[...history].sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);
 const all=semantics.catalog(peer).filter(i=>i.semantic?.status==='ready'&&i.semantic.intensity<=2&&!i.semantic.avoid.some(x=>flags.includes(x)));
 let pool=all.filter(i=>!recent.includes(i.sha256));
 if(!pool.length)pool=all.filter(i=>i.sha256!==recent[0]);
 if(!pool.length)pool=all;
 const rank=i=>{const s=i.semantic;return s.intents.filter(v=>hints.includes(v)).length*8+(s.keywords??[]).filter(k=>k.length>=2&&text.includes(k.toLowerCase())).length*3+(s.intensity===1?1:0)};
 const sorted=pool.sort((a,b)=>rank(b)-rank(a)||(history.get(a.sha256)??0)-(history.get(b.sha256)??0));
 // Use broad semantic candidates, including abstract images; never force one exact label.
 const selected=sorted.slice(0,14);
 for(const i of sorted.filter(i=>i.semantic.intensity===1&&i.semantic.intents.some(x=>['回应','安慰','认同'].includes(x))).slice(0,2))if(!selected.includes(i))selected.push(i);
 const offers=new Map();const results=selected.map(i=>{const token=randomUUID();offers.set(token,{hash:i.sha256,path:i.path,expires:semantics.now()+600000,completion:true});const s=i.semantic;return {token,id:i.sha256,text:s.text,meaning:s.meaning,when:s.when,intents:s.intents,styles:s.styles,intensity:s.intensity,target:s.target};});
 semantics.offers.set(peer,offers);return results;
}

export class MemeCompletion {
 constructor(service,{select,now=Date.now}={}){
  this.service=service;this.select=select;this.now=now;this.pending=new Map();
  service.engine.db.exec('CREATE TABLE IF NOT EXISTS meme_reply_completions(peer TEXT NOT NULL,seq INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(peer,seq))');
 }
 async ensure({peer,seq,input,reply,events=[],history}){
  const key=peer+':'+seq;if(this.pending.has(key))return this.pending.get(key);
  const job=this.run({peer,seq,input,reply,events,history}).finally(()=>this.pending.delete(key));this.pending.set(key,job);return job;
 }
 async stop(){await Promise.allSettled([...this.pending.values()])}
 async run({peer,seq,input,reply,events,history}){
  const s=this.service,db=s.engine.db,start=this.now();
  const old=db.prepare('SELECT data FROM meme_reply_completions WHERE peer=? AND seq=?').get(peer,seq);if(old)return JSON.parse(old.data);
  const save=result=>{const record={...result,durationMs:this.now()-start};db.prepare('INSERT OR REPLACE INTO meme_reply_completions VALUES(?,?,?)').run(peer,seq,JSON.stringify(record));return record};
  const preference=parseMemePreference(contentText(input)),frequency=preference?.meme??effectivePersona(db,peer).meme;
  if(frequency!=='high')return save({status:'not-high',sent:false});
  const confirmed=sentMeme(events,seq);if(confirmed)return save({status:'already-sent',sent:true,id:confirmed.id});
  if(events.some(e=>e.seq>seq&&e.type==='tool/call'&&e.data?.name==='wechat_meme_send'))return save({status:'delivery-already-attempted',sent:false});
  const choices=completionPool(s.memeSemantics,peer,input,reply);
  if(!choices.length)return save({status:'no-usable-image',sent:false});
  let chosen,usage,error;
  try {
   if(!this.select)throw Error('selector-unavailable');
   const recent=history??events.filter(e=>e.type==='assistant/message'||(e.type==='user/message'&&e.data?.source?.kind==='user')).slice(-6).map(e=>({role:e.type==='user/message'?'user':'assistant',text:contentText(e.data?.content??e.data?.message?.content).slice(0,350)})).filter(x=>x.text);
   const result=await this.select({input:contentText(input).slice(0,1000),reply:reply.slice(0,1000),history:recent.slice(-6),choices});
   chosen=choices.find(i=>i.id===result.id);usage=result.usage;
   if(!chosen)throw Error('selector-returned-invalid-id');
  }catch(e){error=String(e.message).slice(0,160);chosen=choices.find(i=>i.intensity===1&&i.intents.some(x=>['回应','安慰','认同'].includes(x)))??choices[0]}
  // Record the attempt before network IO. Ambiguous failures never send a second copy.
  save({status:'sending',sent:false,id:chosen.id,usage:usage??null});
  try {
   const sent=await s.memeSemantics.send(peer,chosen.token,contentText(input)+'\n'+reply);
   return save({status:'sent',sent:true,id:sent.id,stickerOnly:allowsStickerOnly(input),usage:usage??null,selectionError:error??null,meaning:chosen.meaning});
  }catch(e){return save({status:'send-failed',sent:false,id:chosen.id,error:String(e.message).slice(0,200),usage:usage??null})}
 }
}

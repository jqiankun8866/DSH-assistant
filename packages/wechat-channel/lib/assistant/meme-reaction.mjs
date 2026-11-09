import { listMemes } from './meme-library.mjs';
import {parseMemePreference} from './meme-preferences.mjs';
import { effectivePersona, personaState } from './persona.mjs';
import { existsSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';

export function inputText(input){return typeof input==='string'?input:Array.isArray(input)?input.filter(b=>b.type==='text').map(b=>b.text).join('\n'):'';}
export function isShortThanks(input){
  const text=inputText(input).toLowerCase().replace(/[\s，。！？!,.~～、]/g,'');
  return /^(谢谢(你|啦|了|哦|哈)?|多谢(啦|你)?|谢啦|感谢(你)?|thanks|thankyou)$/.test(text);
}
export function socialScene(input){
 const raw=inputText(input).trim();
 if(raw.length>40||/帮我|查询|搜索|分析|安排|提醒|制作|怎么|怎么办|为什么|症状|疼|药|病|去世|难过|分手|失业|自残|自杀/.test(raw))return null;
 const t=raw.toLowerCase().replace(/[\s，。！？!,.~～、]/g,'');
 if(isShortThanks(raw))return ['heart.png','ok.png','memes/like/bixin.jpg','memes/happy/ok.jpg'];
 if(/^(你好|嗨|hi|hello|早|早安|早上好|晚上好|拜拜|再见)[呀啊啦哦哈]*$/.test(t))return ['wave.png','happy.png'];
 if(/^(哈{2,}|笑死(我了)?|笑哭|太好笑了|哈哈笑死)$/.test(t))return ['laugh.png','happy.png'];
 if(/^(太棒了|好耶|搞定了|成功了|终于搞定了|终于完成了|开心|太开心了|恭喜)[呀啊啦!]*$/.test(t))return ['celebrate.png','happy.png','thumbs-up.png'];
 if(/^(好的|好嘞|收到|没问题|ok|okk|可以的|稳了|牛|厉害|真棒)$/.test(t))return ['ok.png','thumbs-up.png'];
 if(/^(晚安|睡了|睡觉了|我睡了|困了)[呀啊啦哦]*$/.test(t))return ['sleep.png','wave.png'];
 if(/^(抱抱|辛苦了|你辛苦了|爱你|比心)[呀啊啦哦]*$/.test(t))return ['hug.png','heart.png'];
 if(/^(尴尬了|好尴尬|绷不住了|笑不活了)$/.test(t))return ['awkward.png','laugh.png'];
 return null;
}
// This is a narrow delivery fallback, not another model turn. No retry after an
// ambiguous send failure, and any send-file call in the turn suppresses it.
export async function reactToThanks({db,root,peer,input,reply,events,afterSeq,send,candidates,semanticSelection=false,now=Date.now}){
  if(!db||!send||!peer.startsWith('weixin:'))return {status:'unavailable'};
  db.exec('CREATE TABLE IF NOT EXISTS meme_reactions(peer TEXT PRIMARY KEY,state TEXT NOT NULL)');
  const row=db.prepare('SELECT state FROM meme_reactions WHERE peer=?').get(peer);
  const state=row?JSON.parse(row.state):{enabled:true,frequency:'high',streak:0,lastAt:0,lastPath:null,lastSeq:null};
  if(state.lastSeq===afterSeq)return {status:'already-processed'};
  // Honor opt-outs already present before this feature was installed too.
  for(const event of (state.personaPreference?[]:events)){
    if(event.type!=='user/message')continue;
    if(event.data?.source?.kind&&event.data.source.kind!=='user')continue;
    const value=parseMemePreference(inputText(event.data?.content??event.data?.message?.content));
    if(value?.scope==='persistent'){state.enabled=value.meme!=='off';state.frequency=value.meme;}
  }
  const request=parseMemePreference(inputText(input));
  if(request?.scope==='persistent'){
    const saved=personaState(db,peer);saved.meme=request.meme;
    db.exec('CREATE TABLE IF NOT EXISTS personas(peer TEXT PRIMARY KEY,data TEXT NOT NULL)');
    db.prepare('INSERT OR REPLACE INTO personas VALUES (?,?)').run(peer,JSON.stringify(saved));
    state.enabled=request.meme!=='off';state.frequency=request.meme;state.personaPreference=true;
  }
  const effectiveFrequency=request?.meme??effectivePersona(db,peer).meme;
  const current=events.filter(e=>e.seq>afterSeq);
  const sentByModel=current.some(e=>e.type==='tool/call'&&['wechat_send_file','wechat_meme_send'].includes(e.data?.name));
  const failed=current.some(e=>e.type==='turn/end'&&['error','cancelled','aborted'].includes(e.data?.reason?.kind));
  const save=()=>db.prepare('INSERT OR REPLACE INTO meme_reactions VALUES(?,?)').run(peer,JSON.stringify(state));
  const finish=status=>{state.lastSeq=afterSeq;if(['not-social','needs-model-selection','no-context-match','sensitive-context','no-successful-reply','streak-limit'].includes(status))state.streak=0;state.lastDecision=status;save();return{status}};
  if(sentByModel){state.streak++;state.lastAt=now();state.lastPath=null;return finish('model-send')}
  if(request?.meme==='off'||(!request&&(!state.enabled||effectiveFrequency==='off')))return finish('disabled');
  if(!reply||failed)return finish('no-successful-reply');
  const high=effectiveFrequency==='high';
  const contextScene=socialScene(input);
  const scene=contextScene;
  const recentUsers=events.filter(e=>e.type==='user/message'&&(!e.data?.source?.kind||e.data.source.kind==='user')).slice(-3).map(e=>inputText(e.data?.content??e.data?.message?.content)).join('\n');
  const context=recentUsers+'\n'+inputText(input)+'\n'+reply;
  if(/自杀|自残|急救|去世|病危|呼吸困难|难过|分手|失业|疼痛|看病|挂号|手术|生病|感冒|流感|疫苗|接种|发烧|发热|咳嗽|感染|疾病|吃药|用药|医生|医院/.test(context))return finish('sensitive-context');
  // Arbitrary prose needs the existing conversational model's judgment. This
  // deterministic fallback may only handle an explicit light social exchange.
  if(semanticSelection)return finish('needs-model-selection');
  if(!scene)return finish(high?'needs-model-selection':'not-social');
  if(!high&&/帮我|提醒|创建任务|取消任务|预约|提交|制作|报错|转账|付款/.test(recentUsers+'\n'+inputText(input)))return finish('sensitive-context');
  if(!high&&state.streak>=1)return finish('streak-limit');
  if(!high&&state.lastAt&&now()-state.lastAt<60000)return finish('cooldown');
  const catalog=candidates??listMemes(root);
  const recent=Array.isArray(state.recentPaths)?state.recentPaths:(state.lastPath?[state.lastPath]:[]);
  const valid=catalog.filter(i=>i.path&&existsSync(i.path));
  const byPath=new Map(valid.map(item=>[item.path,item]));
  const history=(Array.isArray(state.rotationPaths)?state.rotationPaths:recent).filter(path=>byPath.has(path));
  const source=item=>item?.collectedAt>0?'collected':item?.savedAt>0?'received':'builtin';
  const sourceOrder={collected:0,received:1,builtin:2};
  const lastSource=new Map();history.forEach((path,i)=>lastSource.set(source(byPath.get(path)),i));
  const words=inputText(input).toLowerCase();
  // Generic high-frequency eligibility is not evidence that OK/heart matches.
  const rank=item=>[...new Set([item.title??'',...(item.tags??[])])].reduce((n,t)=>n+(t.length>=2&&words.includes(t.toLowerCase())?2:0),0)+
    (contextScene?.includes(item.file?.replaceAll('\\','/'))?2:0);
  // Relevance is an eligibility gate, not merely a sorting preference.
  // Keep bounded LRU history beyond the six-image cooldown, so older new images
  // are not permanently starved by the newest seven files.
  const available=valid.filter(item=>rank(item)>0).sort((a,b)=>rank(b)-rank(a)||
    Number(source(a)==='builtin')-Number(source(b)==='builtin')||
    (lastSource.get(source(a))??-1)-(lastSource.get(source(b))??-1)||
    sourceOrder[source(a)]-sourceOrder[source(b)]||
    history.lastIndexOf(a.path)-history.lastIndexOf(b.path)||
    (b.collectedAt??b.savedAt??0)-(a.collectedAt??a.savedAt??0));
  let candidate=available.find(i=>!recent.includes(i.path))??available.find(i=>i.path!==state.lastPath)??(high?available[0]:undefined);
  // Compatibility for old isolated callers without a manifest; the live runtime
  // always supplies a verified per-user catalog, including an empty one.
  if(!candidate&&candidates===undefined&&!catalog.length&&root){
    const legacy=scene.map(p=>join(root,p)).find(p=>existsSync(p)&&p!==state.lastPath);
    if(legacy){const canonical=realpathSync(root),path=realpathSync(legacy),rel=relative(canonical,path);if(rel.startsWith('..')||isAbsolute(rel))return finish('invalid-image');candidate={path};}
  }
  if(!candidate)return finish(valid.length?'no-context-match':'no-image');
  const path=candidate.path;
  state.recentPaths=[...recent.filter(p=>p!==path),path].slice(-6);
  state.rotationPaths=[...history.filter(p=>p!==path),path].slice(-128);
  // Reserve before IO: a thrown timeout does not prove the image was not sent.
  state.lastAt=now();state.lastPath=path;state.lastSeq=afterSeq;state.streak++;state.lastDecision='sending';save();
  try{await send(peer,path);return{status:'sent',source:source(candidate),candidateCount:valid.length}}catch{return{status:'send-unconfirmed',source:source(candidate),candidateCount:valid.length}}
}

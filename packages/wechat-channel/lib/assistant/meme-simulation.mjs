import {DatabaseSync} from 'node:sqlite';
import {MemeSemantics} from './meme-semantics.mjs';
import {MemeCompletion} from './meme-completion.mjs';
import {nativeTextRequest,nativeMemeSelector} from './meme-selector.mjs';
import {defaultPersona,conversationPolicy} from './conversation-policy.mjs';
import {isEmojiOnly} from './chat-intent.mjs';

// Isolated simulation: memory-only database and a file verifier replace WeChat transport.
export async function simulateMemeConversation(service,request,inputs){
 if(!Array.isArray(inputs)||inputs.length<1||inputs.length>10||inputs.some(s=>typeof s!=='string'||!s.trim()||s.length>300))throw Error('模拟限1–10条，每条300字内');
 const db=new DatabaseSync(':memory:'),files=service.memeSemantics.catalog(service.xhs.config.ownerPeer),peer='weixin:simulation';
 const sent=[];const shadow={engine:{db},root:service.root,memeCandidates:()=>files,now:Date.now,sendMemeFile:async(p,path)=>{sent.push(path);return 'simulation-'+sent.length}};
 const sem=shadow.memeSemantics=new MemeSemantics(shadow);
 for(const item of files)if(item.semantic?.status==='ready')db.prepare('INSERT INTO meme_meanings VALUES(?,?,?,0)').run(item.sha256,JSON.stringify(item.semantic),Date.now());
 const completion=new MemeCompletion(shadow,{select:nativeMemeSelector(request)}),results=[],history=[];
 try {
  for(const [index,input] of inputs.entries()){
   const start=Date.now();let reply='',replyUsage;
   if(!isEmojiOnly(input)){
    const response=await request(defaultPersona+'\n'+conversationPolicy+'\n这是本地对话模拟，不调用工具、不更改真实设置。只生成自然回复，不解释测试。轻松闲聊不要补工具或成本建议；用户没要求修改时不声称改了设置。\n'+JSON.stringify({history:history.slice(-6),user:input}),384);
    reply=response.text;replyUsage=response.usage;
   }
   const result=await completion.ensure({peer,seq:index+1,input,reply,events:[],history:history.slice(-6)});
   const image=files.find(i=>i.sha256===result.id);
   results.push({round:index+1,user:input,reply:result.stickerOnly?'':reply,sent:result.sent,status:result.status,image:image?{id:image.sha256,path:image.path,text:image.semantic.text,meaning:image.semantic.meaning,intents:image.semantic.intents,styles:image.semantic.styles}:null,elapsedMs:Date.now()-start,selectorUsage:result.usage??null,replyUsage:replyUsage??null,selectionError:result.selectionError??null});
   history.push({role:'user',text:input},{role:'assistant',text:reply,imageMeaning:image?.semantic?.meaning});
  }
  return {simulation:true,realMessagesSent:0,rounds:results.length,sent:results.filter(r=>r.sent).length,uniqueImages:new Set(results.map(r=>r.image?.id).filter(Boolean)).size,results};
 }finally{await sem.stop();db.close()}
}

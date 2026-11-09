import {imageExt} from './received-memes.mjs';
import {annotationPrompt,parseMeaning} from './meme-semantics.mjs';

// Native DSH attachment blocks; OpenAI image_url is not a DSH message format.
// API shape cross-checked against Aegink/dsh-channel-qq/src/emoji-tagging.ts.
export function nativeMemeAnalyzer(ctx,selection,messageFactory=content=>({role:'user',content}),observe=()=>{}){
 return async({data,signal})=>{
  const llm=ctx.get('llm'),attachments=ctx.get('attachments');
  if(!llm||!attachments)throw Object.assign(Error('DSH视觉或附件服务未就绪'),{code:'UNAVAILABLE'});
  const explicit=selection?.();const model=explicit?.provider&&explicit?.model?explicit:ctx.get('agentDefaultModel')?.currentSelection();
  if(!model?.provider||!model?.model)throw Object.assign(Error('尚未配置DSH模型'),{code:'NO_MODEL'});
  const ext=imageExt(data),mediaType={'.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'}[ext];
  // Multi-frame emotions need a sequence review; do not guess from frame one.
  if(ext==='.gif'||(ext==='.webp'&&data.includes(Buffer.from('ANIM'))))throw Error('动态图需逐帧语义复核');
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(60000)]);
  const info=await llm.resolveModel?.(model.provider,model.model,bounded);
  if(info?.inputModalities&&!info.inputModalities.includes('image'))throw Error('当前DSH模型不支持视觉');
  const content=await attachments.admitPromptContent([{type:'image',data:data.toString('base64'),mediaType,name:'meme-index'+ext},{type:'text',text:annotationPrompt}]);
  const blocks=new Map(),eventTypes=[];let text='',usage,failed=false;const start=Date.now();
  try {for await(const part of llm.stream({provider:model.provider,model:model.model,maxTokens:4096,signal:bounded,messages:[messageFactory(content)]})){
   eventTypes.push(part.type);if(part.type==='usage')usage=part.usage;
   bounded.throwIfAborted();
   if(part.type==='finish'&&part.reason?.kind!=='stop'){const code=part.reason?.failure?.code??part.reason?.kind;throw Object.assign(Error('视觉请求未正常完成：'+code),{code});}
   if(part.type==='text-delta')blocks.set(part.index,(blocks.get(part.index)??'')+part.text);
   if(part.type==='block-end'&&part.block?.type==='text')blocks.set(part.index,part.block.text);
   text=[...blocks.values()].join('\n');if(text.length>16000)throw Error('标注响应过长');
  }
  return parseMeaning(text);
  }catch(e){failed=true;throw e}finally{try{observe({chain:'meme-annotation',provider:model.provider,model:model.model,usage,durationMs:Date.now()-start,failed,inputChars:annotationPrompt.length,outputChars:text.length,eventTypes})}catch{}}
 };
}

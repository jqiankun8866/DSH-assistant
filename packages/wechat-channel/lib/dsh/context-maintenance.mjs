// Local authenticated maintenance only; no model tool and no outbound WeChat message.
import {simulateMemeConversation} from '../assistant/meme-simulation.mjs';
import {nativeTextRequest} from '../assistant/meme-selector.mjs';
export function contextMaintenance(ctx, runtime) {
 const running=new Set();
 return async(peer,action,data={})=>{
  if(typeof peer!=='string'||!peer.startsWith('weixin:'))throw Error('仅限微信会话');
  if(!['inspect','compact','simulate','usage'].includes(action))throw Error('不支持的上下文操作');
  if(running.has(peer))throw Error('该会话正在整理上下文');
  running.add(peer);
  try {
   if(action==='usage')return runtime.assistant.usageMeter.summary();
   if(action==='simulate'){
    if(peer!==runtime.assistant?.xhs?.config?.ownerPeer)throw Error('仅图库拥有者可测试');
    return await simulateMemeConversation(runtime.assistant,runtime.assistant.memeTextRequest??nativeTextRequest(ctx,()=>runtime.modelSelection()),data.inputs);
   }
   const agent=await runtime.agentFor(peer);
   const presets=ctx.get('agentPresets'),meter=ctx.get('tokenMeter');
   const engine=presets?.serviceFor(agent,'compaction');
   if(!meter||!engine)throw Error('DSH原生上下文服务不可用');
   const snapshot=()=>{const m=meter.measure(agent.session),schemas=ctx.get('tools')?.schemas?.(agent);return {estimatedTokens:m.totalTokens,surfaceTokens:m.surfaceTokens,visibleNodes:m.nodes.length,basis:m.baseline.kind,preset:presets.composedPreset(agent.ctx),...(schemas?{tools:{count:schemas.length,schemaChars:JSON.stringify(schemas).length,names:schemas.map(t=>t.name)}}:{})}};
   const before=snapshot();
   if(action==='inspect')return before;
   // Native maintenance rejects a busy agent and flushes committed history atomically.
   const result=await engine.compactNow(agent,AbortSignal.timeout(180000));
   return {changed:result!==null,before,after:snapshot(),rawHistoryRetained:true};
  } finally {running.delete(peer)}
 };
}


const check=(ok,message)=>{if(!ok)throw Error(message)};
const queryKey=query=>typeof query==='string'?query.trim():'';
/** Short-lived source reuse, not user memory. Ask is only for explicit requests. */
export class XhsRetrieval {
  constructor({perform,now=Date.now}){this.perform=perform;this.now=now;this.cache=new Map();}
  clear(){this.cache.clear();}
  trim(map,ttl){for(const [key,value] of map)if(this.now()-value.at>=ttl)map.delete(key);while(map.size>16)map.delete(map.keys().next().value);}
  async call(peer,action,data,signal){
    signal?.throwIfAborted();this.trim(this.cache,120000);
    const query=queryKey(data.query);
    if(action==='ask'){
      check(data.reason==='user-request','点点AI仅接受用户明确指定，reason须为user-request；复杂规划或结果不足请直接检索。');

    }
    const cacheable=action==='search'||action==='read';
    if(data.refresh!==undefined)check(typeof data.refresh==='boolean','refresh须为布尔值');
    const key=JSON.stringify([peer,action,action==='search'?query:data.url,action==='search'?(data.limit??12):null]);
    const cached=cacheable&&!data.refresh?this.cache.get(key):null;
    if(cached){return {...structuredClone(cached.result),retrieval:{...cached.result.retrieval,cached:true,ageMs:this.now()-cached.at}};}
    if(cacheable)this.cache.delete(key);
    const result=await this.perform(peer,action,data,signal);
    signal?.throwIfAborted();

    if(!cacheable&&action!=='ask')return result;
    const enriched={...result,retrieval:{route:action==='ask'?'xhs-ai':action==='search'?'direct-search':'note-text',cached:false,fetchedAt:result.fetchedAt??new Date(this.now()).toISOString(),...(cacheable?{expiresAt:new Date(this.now()+120000).toISOString()}:{}),...(action==='ask'?{reason:data.reason,verified:false}:{}),next:action==='search'?'先按需求、地点和时间筛选，再参考点赞收藏；普通推荐最多读两篇，够用即回答。':action==='ask'?'这是点点AI回答；关键结论须核对原笔记，原笔记链接不能编造。':'只引用正文实际包含的信息，视频标签不足不触发反复搜索。'}};
    if(cacheable){this.cache.set(key,{at:this.now(),result:structuredClone(enriched)});this.trim(this.cache,120000);}
    return enriched;
  }
}

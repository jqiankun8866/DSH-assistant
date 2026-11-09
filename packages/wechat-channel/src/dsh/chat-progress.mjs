// Delay nonessential progress; fast actions, memory lookups and memes stay silent.
export class ChatProgress {
 constructor({send,onError=()=>{},delay=8000,setTimer=setTimeout,clearTimer=clearTimeout}){this.send=send;this.onError=onError;this.delay=delay;this.setTimer=setTimer;this.clearTimer=clearTimer;this.states=new Map()}
 cancel(peer){const s=this.states.get(peer);if(s?.timer!==undefined)this.clearTimer(s.timer);this.states.delete(peer)}
 event(peer,event){
  if(event.type==='user/message'){
   const kind=event.data?.source?.kind;
   if(!kind||kind==='user'||kind==='schedule')this.cancel(peer);
   return;
  }
  if(event.type==='turn/end'){this.cancel(peer);return}
  if(event.type!=='tool/call'||this.states.has(peer))return;
  const name=(event.data?.name??'').toLowerCase();
  if(/meme|sticker|wechat_send_file|assistant_(profile|memory|persona|tasks)|schedule_/.test(name))return;
  let text;
  if(/web_images/.test(name))text='我找张清楚的给你，稍等一下呀～';
  else if(/search|browse|fetch|web/.test(name))text='我再帮你看看，稍等一下呀～';
  else if(/document|ppt|slide|sheet|office|pdf/.test(name))text='还在帮你整理呢，做好就发给你～';
  else if(/speech|transcrib|audio|video/.test(name))text='我还在整理这段内容，等我一下呀～';
  else return;
  const state={timer:undefined};this.states.set(peer,state);
  state.timer=this.setTimer(()=>{state.timer=undefined;if(this.states.get(peer)!==state)return;Promise.resolve().then(()=>this.send(peer,text)).catch(this.onError)},this.delay);
  state.timer?.unref?.();
 }
 dispose(){for(const peer of this.states.keys())this.cancel(peer)}
}

// Keep the final visible answer, not text that preceded tool execution.
import {isEmojiOnly} from '../assistant/chat-intent.mjs';
export function sentMeme(events,afterSeq){
 const calls=new Set();let delivery=null;
 for(const e of events){
  if(e.seq<=afterSeq)continue;
  if(e.type==='tool/call'&&e.data?.name==='wechat_meme_send')calls.add(e.data.callId);
  if(e.type==='tool/result'&&calls.has(e.data?.message?.toolCallId)&&!e.data.message.isError){
   try {const r=JSON.parse(e.data.message.content.filter(b=>b.type==='text').map(b=>b.text).join(''));if(r.sent===true&&r.messageId)delivery=r;}catch{}
  }
 }
 return delivery;
}
export function finalReply(events,afterSeq,input){
 let text='';
 for(const event of events){
  if(event.seq<=afterSeq)continue;
  if(event.type==='tool/call')text='';
  if(event.type==='assistant/message')text=(event.data?.message?.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('');
 }
 const delivered=sentMeme(events,afterSeq);
 return delivered&&(delivered.replyMode==='sticker-only'||isEmojiOnly(input))?'':text;
}

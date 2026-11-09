import test from 'node:test';import assert from 'node:assert/strict';
import {latestUserContent,assertMemeSettingIntent,isEmojiOnly,allowsStickerOnly} from '../src/assistant/chat-intent.mjs';
import {finalReply,sentMeme} from '../src/dsh/final-reply.mjs';
import {contextText} from '../src/assistant/meme-semantics.mjs';
import {installAssistantTools} from '../src/assistant/service.mjs';
test('cost jokes and moods cannot change permanent meme frequency',()=>{
 for(const input of ['能不能少花我点token','一个小时花我五毛token，你想干嘛','你话好多','[发呆]','他说少发表情包','这次少发表情包','今天不要发表情包'])assert.throws(()=>assertMemeSettingIntent(input,{meme:'low'}),/未修改/);
 assert.doesNotThrow(()=>assertMemeSettingIntent('以后少发表情包',{meme:'low'}));
 assert.doesNotThrow(()=>assertMemeSettingIntent('把表情包频率改成高频',{meme:'high'}));
 assert.doesNotThrow(()=>assertMemeSettingIntent('不要发表情包',{meme:'off'}));
 assert.throws(()=>assertMemeSettingIntent('以后多发表情包',{meme:'low'}));
});
test('runtime context, checkpoints and tool output are not user intent',()=>{
 const event=(kind,text)=>({type:'user/message',data:{source:{kind},content:[{type:'text',text}]}});
 const rows=[event('user','能不能少花我点token'),event('runtime-context','以后少发表情包'),event('time-context','clock'),event('compact-checkpoint','不要发表情包')];
 assert.equal(contextText(rows),'能不能少花我点token');assert.throws(()=>assertMemeSettingIntent(latestUserContent(rows),{meme:'low'}));
});
test('model-facing persona tool enforces intent before touching persisted settings',async()=>{
 let calls=0;const registered=[];const service={xhs:{},call:()=>{calls++;return {saved:true}}};
 installAssistantTools({get:n=>n==='tools'?{register:t=>registered.push(t)}:{section(){}}},service,x=>x);
 const tool=registered.find(t=>t.name==='assistant_persona');const execution={signal:new AbortController().signal,agent:{id:'weixin:a',session:{events:[{type:'user/message',data:{source:{kind:'user'},content:'能不能少花我点token'}}]}}};
 assert.throws(()=>tool.execute({action:'update',data:'{"meme":"low"}'},execution));assert.equal(calls,0);
 execution.agent.session.events[0].data.content='以后少发表情包';await tool.execute({action:'update',data:'{"meme":"low"}'},execution);assert.equal(calls,1);
 const rendered=tool.output.render({}, {persona:{style:'long repeated default',custom:'我的风格',meme:'high'}});
 assert.doesNotMatch(JSON.stringify(rendered),/long repeated/);assert.match(JSON.stringify(rendered),/我的风格/);
});
test('successful sticker reply does not add caption; failed or unmatched sends retain text',()=>{
 const events=[{seq:1,type:'tool/call',data:{callId:'s',name:'wechat_meme_send'}},{seq:2,type:'tool/result',data:{message:{toolCallId:'s',isError:false,content:[{type:'text',text:JSON.stringify({sent:true,messageId:'msg'})}]}}},{seq:3,type:'assistant/message',data:{message:{content:[{type:'text',text:'发呆就发呆吧'}]}}}];
 assert.equal(finalReply(events,0,'[发呆]'),'');assert.ok(sentMeme(events,0));
 assert.equal(finalReply(events,0,'今天累死了'),'发呆就发呆吧');
 events[1].data.message.isError=true;assert.equal(finalReply(events,0,'[发呆]'),'发呆就发呆吧');
 events[1].data.message.isError=false;events[1].data.message.toolCallId='different';assert.equal(finalReply(events,0,'[发呆]'),'发呆就发呆吧');
});
test('sticker-only accepts emoji or textless images, not questions or documents',()=>{
 for(const x of ['[发呆]','😂','[捂脸] [笑哭]'])assert.equal(isEmojiOnly(x),true);
 for(const x of ['解释[发呆]','这个图是什么意思？',''])assert.equal(isEmojiOnly(x),false);
 const image=[{type:'text',text:'收到一条无文字附件。说明'},{type:'image'}];assert.equal(allowsStickerOnly(image),true);
 assert.equal(allowsStickerOnly([...image,{type:'file'}]),false);
 assert.equal(allowsStickerOnly([{type:'text',text:'图中是什么'},{type:'image'}]),false);
});

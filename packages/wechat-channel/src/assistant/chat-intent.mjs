import {parseMemePreference} from './meme-preferences.mjs';
export const contentText=c=>typeof c==='string'?c:Array.isArray(c)?c.filter(x=>x.type==='text').map(x=>x.text).join('\n'):'';
export function latestUserContent(events=[]) {
 const event=events.findLast(e=>e.type==='user/message'&&(!e.data?.source?.kind||e.data.source.kind==='user'));
 return event?.data?.content??event?.data?.message?.content??'';
}
export function isEmojiOnly(content) {
 const text=contentText(content).trim();
 return !!text&&text.length<=100&&/^(?:\[[^\[\]\s]{1,8}\]|\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u200d\ufe0f\s])+$/u.test(text);
}
export function allowsStickerOnly(content) {
 if(isEmojiOnly(content))return true;
 return Array.isArray(content)&&content.some(x=>x.type==='image')&&!content.some(x=>x.type==='file')&&contentText(content).startsWith('收到一条无文字附件。');
}
// Do not let a model turn a cost joke or a transient mood into a durable setting.
export function assertMemeSettingIntent(content, data) {
 if(!Object.hasOwn(data,'meme'))return;
 const text=contentText(content).trim();
 let request=parseMemePreference(text);
 if(!request&&!/[“”"「」『』：:]/.test(text)) {
  const match=/^(?:(?:以后|请|麻烦你|把|将)\s*)*(?:表情包?|配图)(?:频率)?(?:调成|调为|设为|设置为|改成|改为|恢复为)(高频|低频|偶尔|关闭|默认|每轮)(?:吧|。)?$/.exec(text);
  if(match)request={meme:{高频:'high',每轮:'high',低频:'low',偶尔:'low',关闭:'off',默认:null}[match[1]],scope:'persistent'};
 }
 if(!request||request.scope!=='persistent'||request.meme!==data.meme)
  throw Error('未修改设置：当前用户没有明确要求这项长期表情频率。费用调侃、吐槽或“省点token”不等于减少表情；自然接话，保持现有设置，不要用其他工具绕过。');
}

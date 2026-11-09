import {createHash} from 'node:crypto';
import {personalContext} from './personal-context.mjs';
import {conversationStyle} from './conversation-style.mjs';

export function modelPersonaText(service,peer){return conversationStyle+'\n\n'+personalContext(service,peer)}
const digest=text=>createHash('sha256').update(text).digest('hex');
function init(db){db.exec('CREATE TABLE IF NOT EXISTS persona_prompt_receipts(peer TEXT PRIMARY KEY,hash TEXT NOT NULL,assembledAt INTEGER NOT NULL,characters INTEGER NOT NULL)')}
export function personaPromptStatus(service,peer){
 init(service.engine.db);
 const text=modelPersonaText(service,peer),receipt=service.engine.db.prepare('SELECT hash,assembledAt,characters FROM persona_prompt_receipts WHERE peer=?').get(peer);
 return {text,scope:'current-assistant-user',matchesCurrent:receipt?.hash===digest(text),lastAssembly:receipt?.assembledAt??null};
}
export function registerPersonalPrompt(systemPrompt,service,peer){
 init(service.engine.db);
 return systemPrompt.section({name:'im-weixin:personal-preferences',order:10250,interpolate:false,text:()=>{
  const text=modelPersonaText(service,peer);
  service.engine.db.prepare('INSERT OR REPLACE INTO persona_prompt_receipts VALUES(?,?,?,?)').run(peer,digest(text),service.now(),text.length);
  return text;
 }});
}

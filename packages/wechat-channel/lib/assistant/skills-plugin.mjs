import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill';
export const name='assistant-skills';
export const inject=['skills'];
const names=['assistant-steward','assistant-email','assistant-health','assistant-finance','assistant-office-delivery','assistant-onboarding','assistant-xhs','assistant-fashion'];
export function apply(ctx,config) {
  const root=resolve(config.root);
  const candidates=names.map(name=>{
    const directory=join(root,name),locator=join(directory,'SKILL.md');
    const raw=readFileSync(locator,'utf8'),match=/^---\r?\nname: ([\w-]+)\r?\ndescription: ([^\r\n]+)\r?\n---\r?\n/.exec(raw);
    if(!match||match[1]!==name)throw new Error('Invalid assistant skill: '+name);
    return {name,description:match[2],invocation:{modelInvocable:true,userInvocable:true},provider:'dsh-assistant',source:'bundled',rank:BUNDLED_SKILL_RANK,resourceBase:{kind:'directory',path:directory.replaceAll('\\','/')},locator};
  });
  ctx.skills.registerProvider(()=>({name:'dsh-assistant',list:()=>candidates,get:async candidate=>{
    const {rank,locator,...summary}=candidate;
    return {...summary,content:readFileSync(locator,'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').trim()};
  }}));
}

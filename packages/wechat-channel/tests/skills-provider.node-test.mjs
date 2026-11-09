import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

test('every shipped skill is loadable and removed mobile options cannot restore tools',async()=>{
 const root=fileURLToPath(new URL('../../../',import.meta.url));
 const source=readFileSync(new URL('../src/assistant/skills-plugin.mjs',import.meta.url),'utf8')
  .replace("import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill';",'const BUNDLED_SKILL_RANK=0;');
 const {apply}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 for(const enableMobile of [false,true]){
  let provider;apply({skills:{registerProvider(f){provider=f()}}},{root:root+'/skills',enableMobile});
  const list=provider.list();assert.equal(list.length,8);assert.ok(!list.some(x=>x.name==='assistant-experience'));
  assert.deepEqual(list.map(x=>x.name).sort(),readdirSync(root+'/skills').filter(n=>existsSync(root+'/skills/'+n+'/SKILL.md')).sort());
  for(const row of list){const value=await provider.get(row);assert.ok(value.content.length>100);assert.ok(value.invocation.modelInvocable)}
 }
});

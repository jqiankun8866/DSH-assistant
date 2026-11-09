import test from 'node:test';import assert from 'node:assert/strict';
import {contextMaintenance} from '../src/dsh/context-maintenance.mjs';
import {startNativeTaskBridge} from '../src/assistant/native-tasks.mjs';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {AssistantService} from '../src/assistant/service.mjs';
import {mockSchedule} from './helpers/native-schedule-mock.mjs';
test('context maintenance delegates to retained native engine without a chat turn or message',async()=>{
 let size=450000,calls=0;const agent={ctx:{},session:{}};
 const engine={compactNow:async(a,signal)=>{assert.equal(a,agent);assert.equal(signal.aborted,false);calls++;size=18000;return {}}};
 const ctx={get:n=>n==='agentPresets'?{serviceFor:(a,key)=>{assert.equal(key,'compaction');return engine},composedPreset:()=> 'wechat-assistant'}:{measure:()=>({totalTokens:size,surfaceTokens:size-100,nodes:[1],baseline:{kind:'estimated'}})}};
 const call=contextMaintenance(ctx,{agentFor:async()=>agent});
 assert.equal((await call('weixin:a','inspect')).estimatedTokens,450000);assert.equal(calls,0);
 const result=await call('weixin:a','compact');assert.equal(result.after.estimatedTokens,18000);assert.equal(calls,1);
 await assert.rejects(call('desktop:a','compact'));await assert.rejects(call('weixin:a','reset'));
 engine.compactNow=async()=>{throw Error('busy')};await assert.rejects(call('weixin:a','compact'),/busy/);
 assert.equal((await call('weixin:a','inspect')).estimatedTokens,18000);
});
test('context endpoint requires bearer, local host, known peer and no browser origin',async()=>{
 const root=mkdtempSync(join(tmpdir(),'context-fish-'));const service=new AssistantService({root});service.inbound('weixin:a');let calls=0;
 const stop=await startNativeTaskBridge(service,()=>mockSchedule(),async()=>{calls++;return {ok:true}});
 try {const {origin,token}=JSON.parse(readFileSync(join(root,'native-tasks.json'),'utf8'));
  const post=(headers={},peer='weixin:a')=>fetch(origin+'/context',{method:'POST',headers,body:JSON.stringify({peer,action:'inspect'})});
  assert.equal((await post()).status,403);
  assert.equal((await post({Authorization:'Bearer '+token,Origin:'http://evil.test'})).status,403);
  assert.equal((await post({Authorization:'Bearer '+token},'weixin:unknown')).status,400);
  assert.equal((await post({Authorization:'Bearer '+token})).status,200);assert.equal(calls,1);
 }finally{await stop();await service.close();rmSync(root,{recursive:true,force:true})}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureNativeCapabilities} from '../src/dsh/native-capabilities.mjs';
test('legacy WeChat session gains native tools before first turn and persists selection',async()=>{
  let selected, mounts=0;const events=[];
  const agent={session:{append:(...x)=>events.push(x)}};
  const ctx={get:n=>n==='agentPresets'?{composedPreset:()=>selected,mount:async(c,id)=>{assert.equal(c,ctx);mounts++;selected=id;return {id}}}:{stateOf:()=>null}};
  await ensureNativeCapabilities(ctx,agent);await ensureNativeCapabilities(ctx,agent);
  assert.equal(mounts,1);assert.deepEqual(events,[['agent-preset/selected',{agentPreset:'wechat-assistant'}]]);
});
test('legacy standard migrates only before agent publication',async()=>{
 let selected='standard';const events=[];
 const ctx={get:n=>n==='agentPresets'?{composedPreset:()=>selected,mount:async(c,id)=>{selected=id;return {id}}}:{stateOf:()=> 'standard'}};
 const agent={session:{append:(...e)=>events.push(e)}};
 await ensureNativeCapabilities(ctx,agent);assert.equal(selected,'standard');
 await ensureNativeCapabilities(ctx,agent,{unpublished:true});assert.equal(selected,'wechat-assistant');assert.equal(events.length,1);
});
test('persisted preset restored without overwriting user choice',async()=>{
  const ctx={get:n=>n==='agentPresets'?{composedPreset:()=>undefined,mount:async(c,id)=>{assert.equal(id,'minimal');return {id}}}:{stateOf:()=> 'minimal'}};
  await ensureNativeCapabilities(ctx,{session:{append:()=>assert.fail('must preserve recorded selection')}});
});
test('missing preset fails closed instead of pretending native tools exist',async()=>{
  const ctx={get:n=>n==='agentPresets'?{composedPreset:()=>undefined,mount:async()=>{throw Error('preset unavailable')}}:undefined};
  await assert.rejects(ensureNativeCapabilities(ctx,{session:{append:()=>assert.fail()}}),/unavailable/);
});

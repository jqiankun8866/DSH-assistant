import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {UsageMeter} from '../src/assistant/usage-meter.mjs';import {nativeTextRequest,nativeMemeSelector} from '../src/assistant/meme-selector.mjs';
test('native stream usage is recorded once; absent usage is not zero usage',async()=>{
 const db=new DatabaseSync(':memory:');const meter=new UsageMeter(db);let withUsage=true;
 const llm={async *stream(){yield {type:'text-delta',index:0,text:'hello'};if(withUsage)yield {type:'usage',usage:{inputTokens:12,outputTokens:2,totalTokens:14}};yield {type:'finish',reason:{kind:'stop'}}}};
 const request=nativeTextRequest({get:()=>llm},()=>({provider:'test',model:'test'}),undefined,x=>meter.record(x));
 assert.equal((await request('test')).usage.inputTokens,12);withUsage=false;assert.equal((await request('test')).usage,undefined);
 const r=meter.summary().rows[0];assert.equal(r.requests,2);assert.equal(r.reportedRequests,1);assert.equal(r.missingUsageRequests,1);assert.equal(r.tokens.totalTokens,14);db.close();
});
test('short selection ids map back to verified hash without exposing send token',async()=>{
 const hash='e'.repeat(64);let prompt;
 const select=nativeMemeSelector(async x=>{prompt=x;return {text:'{"id":"0"}',usage:{totalTokens:22}}});
 const r=await select({input:'谢谢',reply:'好呀',choices:[{id:hash,token:'secret-send-token',text:'收到',meaning:'友好回应',when:'duplicate detail',intents:['回应'],styles:['温柔']}]});
 assert.equal(r.id,hash);assert.doesNotMatch(prompt,/eeeeeeee|secret-send-token|duplicate detail/);assert.equal(r.usage.totalTokens,22);
 await assert.rejects(()=>nativeMemeSelector(async()=>({text:'{"id":"99"}'}))({choices:[{id:hash}]}),/invalid-id/);
});

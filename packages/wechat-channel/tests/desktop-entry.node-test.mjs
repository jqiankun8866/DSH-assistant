import test from 'node:test';
import assert from 'node:assert/strict';
import {publishWechatSession} from '../src/dsh/desktop-entry.mjs';
test('desktop entry attaches and pins the original ID without creating an agent or copying history',async()=>{
 const ids=new Set(),pins=new Set(),calls=[];
 const registry={create:async(cwd,title)=>{calls.push([cwd,title]);return {attachSession:async id=>ids.add(id)}},pinSession:async id=>pins.add(id)};
 const agent={id:'weixin:account:peer',session:{original:true}};
 const title={rename:async(session,name)=>{assert.equal(session,agent.session);assert.equal(name,'大肥鱼·微信')}};
 const ctx={get:key=>({workspaceRegistry:registry,sessionTitle:title})[key]};
 await publishWechatSession(ctx,agent,'C:/wechat');await publishWechatSession(ctx,agent,'C:/wechat');
 assert.deepEqual([...ids],[agent.id]);assert.deepEqual([...pins],[agent.id]);assert.equal(calls[0][0],'C:/wechat');
});
test('headless host remains supported without a desktop registry',async()=>{
 await publishWechatSession({get:()=>undefined},{id:'weixin:a'},'C:/wechat');
});

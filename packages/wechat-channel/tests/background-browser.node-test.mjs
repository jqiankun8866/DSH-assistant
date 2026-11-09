import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {BackgroundBrowser} from '../src/assistant/background-browser.mjs';
test('task creates a background target and attaches without activation',async()=>{
 const browser=new BackgroundBrowser();const calls=[];
 browser.send=async(method,params)=>{calls.push({method,params});if(method==='Target.createTarget')return {targetId:'owned'};if(method==='Target.attachToTarget')return {sessionId:'session'};if(method==='Target.getTargets')return {targetInfos:[]};return {}};
 browser.waitForPage=async()=>({});
 browser.navigate=async()=>assert.fail('new tabs load their target directly, without a second navigation');
 assert.deepEqual(await browser.command(['tab','new','https://example.com']),{targetId:'owned'});
 assert.equal(calls[0].params.background,true);
 assert.equal(calls[0].params.url,'https://example.com');
 await assert.rejects(browser.command(['tab','close','user-tab']),/只允许/);
 await browser.command(['tab','close','owned']);
 assert.deepEqual(calls.map(c=>c.method),['Target.createTarget','Target.attachToTarget','Target.closeTarget','Target.getTargets']);
});
test('failed navigation closes only the owned background target',async()=>{
 const browser=new BackgroundBrowser();const closed=[];browser.send=async(method,params)=>{if(method==='Target.createTarget')return {targetId:'owned'};if(method==='Target.attachToTarget')return {sessionId:'session'};if(method==='Target.closeTarget')closed.push(params.targetId);return {}};
 browser.waitForPage=async()=>{throw Error('network failure')};await assert.rejects(browser.command(['tab','new','https://example.com']),/network failure/);assert.deepEqual(closed,['owned']);assert.equal(browser.target,null);
});
test('new target readiness waits through the initial blank document without reloading',async()=>{
 const browser=new BackgroundBrowser();let reads=0;const calls=[];
 browser.send=async(method,params)=>{calls.push(method);if(method==='Target.createTarget')return {targetId:'owned'};if(method==='Target.attachToTarget')return {sessionId:'session'};if(method==='Page.getFrameTree')return {frameTree:{frame:{}}};throw Error('unexpected '+method)};
 browser.evaluate=async expression=>runInNewContext(expression,{location:{href:++reads===1?'about:blank':'https://example.com'},document:{readyState:'complete'}});
 await browser.command(['tab','new','https://example.com']);assert.equal(reads,2);
 assert.ok(!calls.includes('Page.navigate'));assert.ok(!calls.includes('Target.activateTarget'));assert.equal(browser.target,'owned');
});
test('AI fill ignores hidden duplicate inputs and preserves literal user text',async()=>{
 class Textarea{constructor(hidden){this.hidden=hidden;this.focused=false;}checkVisibility(){return true}closest(){return this.hidden?{}:null}focus(){this.focused=true}select(){this.selected=true}}
 const hidden=new Textarea(true),visible=new Textarea(false),browser=new BackgroundBrowser();
 browser.evaluate=async expression=>runInNewContext(expression,{document:{querySelectorAll:()=>[hidden,visible]},getComputedStyle:e=>({opacity:e.hidden?'0.00001':'1'}),HTMLTextAreaElement:Textarea,Event:class{}});
 browser.send=async(method,params)=>{assert.equal(method,'Input.insertText');visible.text=params.text;};
 const text='路线"; throw Error("not code")';await browser.command(['find','role','textbox','fill',text]);
 assert.equal(hidden.focused,false);assert.equal(visible.focused,true);assert.equal(visible.text,text);assert.equal(visible.selected,true);
});
test('AI submit uses only target-scoped input, never foreground activation',async()=>{
 const browser=new BackgroundBrowser();let clicked=0;
 const button={checkVisibility:()=>true,closest:()=>null,dispatchEvent:e=>{assert.equal(e.type,'click');clicked++}};
 browser.evaluate=async expression=>runInNewContext(expression,{document:{querySelectorAll:()=>[button],querySelector:()=>clicked?{}:null},getComputedStyle:()=>({opacity:'1'}),MouseEvent:class{constructor(type){this.type=type}},window:{},URL,location:{href:'https://www.xiaohongshu.com/ai_chat'}});
 browser.send=async()=>assert.fail('must not activate browser');await browser.command(['xhs-search-submit','ai']);assert.equal(clicked,1);
});
test('search mode explicitly unchecks normal search and checks AI without toggling twice',async()=>{
 let active=true,clicks=0;const button={checkVisibility:()=>true,closest:()=>null,classList:{contains:()=>active},click:()=>{active=!active;clicks++}};
 const browser=new BackgroundBrowser();browser.evaluate=async expression=>runInNewContext(expression,{document:{querySelectorAll:()=>[button]}});
 await browser.command(['xhs-search-mode','notes']);assert.equal(active,false);await browser.command(['xhs-search-mode','notes']);assert.equal(clicks,1);
 await browser.command(['xhs-search-mode','ai']);assert.equal(active,true);assert.equal(clicks,2);
});
test('ordinary submission navigates only the owned tab to the public search result',async()=>{
 const browser=new BackgroundBrowser();const query='深圳散步 & 地铁';let destination;
 browser.evaluate=async()=>query;
 browser.navigate=async url=>{destination=new URL(url);return {}};
 browser.send=async()=>assert.fail('must not activate browser');
 await browser.command(['xhs-search-submit','notes']);
 assert.equal(destination.origin,'https://www.xiaohongshu.com');
 assert.equal(destination.pathname,'/search_result_ai');
 assert.equal(decodeURIComponent(destination.searchParams.get('keyword')),query);
});

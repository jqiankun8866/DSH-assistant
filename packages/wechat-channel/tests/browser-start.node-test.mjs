import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureBrowser,launchChrome} from '../src/assistant/browser-start.mjs';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('cold launch opens XHS rather than leaving a visible blank startup tab',async t=>{
 const root=mkdtempSync(join(tmpdir(),'xhs-start-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 let call,unref=false;
 await launchChrome({chromePath:process.execPath,userDataDir:root,port:9333},{platform:'win32',spawnProcess:(exe,args,options)=>{
  call={exe,args,options};const child=new EventEmitter();child.unref=()=>{unref=true};queueMicrotask(()=>child.emit('spawn'));return child;
 }});
 assert.equal(call.args.at(-1),'https://www.xiaohongshu.com/explore');
 assert.ok(!call.args.includes('about:blank'));assert.ok(call.args.includes('--start-minimized'));
 assert.ok(call.args.includes('--remote-debugging-port=9333'));assert.equal(call.options.windowsHide,true);assert.equal(unref,true);
});
test('connected browser is reused without launch or changing user window state',async()=>{await ensureBrowser({},undefined,{probe:async()=>true,launch:()=>assert.fail(),minimize:()=>assert.fail()})});
test('offline browser starts once and minimizes after readiness',async()=>{let probes=0,launched=0,minimized=0;await ensureBrowser({},undefined,{probe:async()=>++probes>=3,launch:async()=>launched++,minimize:async()=>{assert.equal(probes,3);minimized++},wait:async()=>{}});assert.equal(launched,1);assert.equal(probes,3);assert.equal(minimized,1)});
test('failed launch and readiness timeout do not silently succeed',async()=>{
 await assert.rejects(ensureBrowser({},undefined,{probe:async()=>false,launch:async()=>{throw Error('missing Chrome')}}),/missing Chrome/);
 let count=0;await assert.rejects(ensureBrowser({},undefined,{probe:async()=>false,launch:async()=>count++,wait:async()=>{}}),/连接未就绪/);assert.equal(count,1);
});
test('cancelled operation never launches browser',async()=>{await assert.rejects(ensureBrowser({},AbortSignal.abort(),{probe:()=>assert.fail(),launch:()=>assert.fail()}))});

/** Opt-in real Windows Chrome smoke test. Uses a fresh profile and random
 * loopback port; never connects to the user's logged-in browser or sends chat. */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {createServer} from 'node:net';
import {ensureBrowser} from '../packages/wechat-channel/lib/assistant/browser-start.mjs';
import {BackgroundBrowser} from '../packages/wechat-channel/lib/assistant/background-browser.mjs';
import {XhsBrowser} from '../packages/wechat-channel/lib/assistant/xhs-browser.mjs';

const server=createServer();await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});
const port=server.address().port;await new Promise(ok=>server.close(ok));
const parent=realpathSync(tmpdir()),root=mkdtempSync(join(parent,'dsh-xhs-cold-'));
const config={port,userDataDir:join(root,'profile'),ownerPeer:'weixin:smoke',profilePath:'/user/profile/'+'a'.repeat(24)};
const signal=AbortSignal.timeout(60000),transport=new BackgroundBrowser(port),task=new BackgroundBrowser(port);
const browser=new XhsBrowser({root:join(root,'state'),config});
const probe=async()=>{try{return (await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(700)})).ok}catch{return false}};
const pages=async()=> (await transport.send('Target.getTargets',{},signal)).targetInfos.filter(t=>t.type==='page');
const started=Date.now();let launched=false;
try{
 await ensureBrowser(config,signal,{probe});launched=true;
 const initial=await pages();assert.equal(initial.length,1,'fresh Chrome should have one startup page');
 transport.target=initial[0].targetId;
 transport.session=(await transport.send('Target.attachToTarget',{targetId:transport.target,flatten:true},signal)).sessionId;
 await transport.waitForPage('https://www.xiaohongshu.com/explore',signal);
 assert.match((await transport.command(['get','url'],signal)).url,/^https:\/\/www\.xiaohongshu\.com\//);
 const {windowId}=await transport.send('Browser.getWindowForTarget',{targetId:transport.target},signal);
 const {bounds}=await transport.send('Browser.getWindowBounds',{windowId},signal);
 assert.equal(bounds.windowState,'minimized','automatic startup must remain minimized');
 const {targetId}=await task.command(['tab','new','https://www.xiaohongshu.com/explore'],signal);
 assert.notEqual(targetId,transport.target);assert.ok((await pages()).every(t=>t.url!=='about:blank'));
 await task.command(['tab','close',targetId],signal);
 assert.equal((await pages()).length,1,'closing the task must preserve the startup page');
 await assert.rejects(browser.perform(config.ownerPeer,'status',{},signal),/登录/,'fresh users should be asked to log in, without a blank page');
 assert.ok((await pages()).every(t=>t.url.startsWith('https://www.xiaohongshu.com/')));
 console.log(JSON.stringify({ok:true,isolatedProfile:true,initialPage:'XHS',windowState:bounds.windowState,noBlankPages:true,taskCleanup:true,loginPrompt:true,elapsedMs:Date.now()-started}));
}finally{
 browser.close();task.close();
 if(launched){try{await transport.send('Browser.close',{},AbortSignal.timeout(5000))}catch{} }
 transport.close();
 // Delete only the exact test directory, after its isolated browser exits.
 for(let i=0;launched&&await probe()&&i<25;i++)await new Promise(ok=>setTimeout(ok,200));
 if(launched&&await probe())throw Error('Isolated test Chrome is still running; retained '+root);
 const resolved=realpathSync(root);
 if(dirname(resolved)!==parent||!basename(resolved).startsWith('dsh-xhs-cold-'))throw Error('Unexpected smoke-test cleanup path');
 rmSync(resolved,{recursive:true,force:true,maxRetries:15,retryDelay:200});
}

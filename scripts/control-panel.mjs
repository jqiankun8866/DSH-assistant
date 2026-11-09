import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Direct CLI launches must follow the deployment too, not only the PS launcher.
const deploymentPath=join(homedir(),'.dsh','profiles','desktop','assistant-deployment.json');
const deployment=existsSync(deploymentPath)?JSON.parse(readFileSync(deploymentPath,'utf8')):null;
const moduleRoot=deployment?pathToFileURL(join(deployment.stage,'lib','assistant')+'/'):new URL('../packages/wechat-channel/src/assistant/',import.meta.url);
const {AssistantService}=await import(new URL('service.mjs',moduleRoot));
const {startControlPanel}=await import(new URL('control-panel.mjs',moduleRoot));

const defaultRoot=join(homedir(),'.dsh-plugin-wechat','workspace','.assistant');
const marker=join(defaultRoot,'location.json');
const root=process.env.DSH_ASSISTANT_ROOT??(existsSync(marker)?JSON.parse(readFileSync(marker,'utf8')).root:defaultRoot);
const statusPath=join(root,'control-panel.json');
const open=url=>{if(!process.argv.includes('--no-open')){const cmd=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';spawn(cmd,process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url],{windowsHide:true,stdio:'ignore'}).unref()}};
if(!existsSync(join(root,'assistant.sqlite')))throw Error('找不到微信助手数据库，请先启动 DSH 微信助手并发起对话。');
let existing;
try{existing=JSON.parse(readFileSync(statusPath,'utf8'));if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(existing.origin))existing=null}catch{}
let healthy=false;
if(existing)try{healthy=(await fetch(existing.origin+'/api/health',{headers:{Authorization:'Bearer '+existing.token},signal:AbortSignal.timeout(1500)})).ok}catch{}
if(healthy){
 if(deployment && existing.stage!==deployment.stage)throw Error('旧版本面板仍在运行，请通过“打开大肥鱼面板.cmd”更新面板进程；不复用旧版。');
 open(existing.origin+'/#'+existing.token);console.log('已有面板正在运行');process.exit(0);
}
// A second connection to the same SQLite database; deliberately never start
// schedulers here. The running WeChat service remains the sole task executor.
const service=new AssistantService({root});
let panel;
try{panel=await startControlPanel(service,{port:Number(process.env.DSH_PANEL_PORT??17960)})}catch(e){if(e.code==='EADDRINUSE')panel=await startControlPanel(service,{port:0});else{await service.close();throw e}}
mkdirSync(root,{recursive:true});
writeFileSync(statusPath,JSON.stringify({origin:panel.origin,token:panel.token,pid:process.pid,entry:fileURLToPath(import.meta.url),stage:deployment?.stage??null,version:deployment?.version??null,startedAt:new Date().toISOString()}),{mode:0o600});
console.log('大肥鱼控制台已启动：'+panel.origin);
open(panel.url);
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await panel.close();await service.close();try{if(JSON.parse(readFileSync(statusPath,'utf8')).pid===process.pid)unlinkSync(statusPath)}catch{}process.exit(0)}
process.on('SIGINT',stop);process.on('SIGTERM',stop);

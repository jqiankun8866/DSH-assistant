// Read-only inventory: no messages, schedules, model calls or credential output.
import {existsSync,readFileSync} from 'node:fs';import {homedir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
import deploymentAudit from './deployment-audit.cjs';
const read=p=>{try{return JSON.parse(readFileSync(p,'utf8'))}catch{return null}};
const base=join(homedir(),'.dsh-plugin-wechat','workspace','.assistant');
const root=process.env.DSH_ASSISTANT_ROOT??read(join(base,'location.json'))?.root??base;
const report={at:new Date().toISOString(),scope:'read-only local inventory; no live WeChat delivery or model quality claim',node:process.versions.node,storagePresent:existsSync(join(root,'assistant.sqlite')),capabilities:{}};
// Check the deployed entry itself: a stale status file is not evidence that
// pnpm has left the managed plugin in place. Never print profile credentials.
const profile=join(homedir(),'.dsh','profiles','desktop');
try {
 report.capabilities.deployment=deploymentAudit.audit(profile,process.env.DSH_RESOURCES??join(homedir(),'AppData/Local/Programs/DeepSeek Harness/resources'));
} catch {report.capabilities.deployment={configured:false,entryPresent:false}}
if(report.storagePresent){
 const db=new DatabaseSync(join(root,'assistant.sqlite'),{readOnly:true});
 try{const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 for(const [cap,table] of Object.entries({preferences:'profiles',memory:'memories',tasks:'task_items',emailMonitor:'email_monitor',xhsHistory:'xhs_reads',memeCollection:'meme_collected',readingCache:'reading_materials'}))report.capabilities[cap]={tablePresent:names.has(table)};
 if(names.has('task_items'))report.capabilities.tasks.detailsSupported=db.prepare('PRAGMA table_info(task_items)').all().some(r=>r.name==='details');
 if(names.has('memories'))report.capabilities.memory.categories=db.prepare('SELECT DISTINCT category FROM memories ORDER BY category').all().map(r=>r.category);
 }finally{db.close()}
}
const status=read(join(root,'status.json'));
report.lastStartupManifest=status?{at:status.at,tools:status.tools,scheduler:status.scheduler}:null;
for(const [cap,file,path] of [['panel','control-panel.json','/api/health'],['tasksBridge','native-tasks.json',null]]){
 const state=read(join(root,file));let reachable=false;
 if(state&&/^http:\/\/127\.0\.0\.1:\d+$/.test(state.origin))try{const r=await fetch(state.origin+(path??'/'),{headers:{Authorization:'Bearer '+state.token},signal:AbortSignal.timeout(2000)});reachable=path?r.ok:r.status===404}catch{}
 report.capabilities[cap]={configured:!!state,reachable};
}
report.capabilities.xhsBrowser={configured:existsSync(join(root,'xhs-config.json')),login:'not_verified'};
report.capabilities.office={configuredAssets:[process.env.LOCALAPPDATA,join(homedir(),'AppData','Local')].filter(Boolean).some(base=>existsSync(join(base,'Programs','DeepSeek Harness','resources','runtime','office-skills'))),realDocumentDelivery:'not_tested'};
report.capabilities.wechat={realInboundAndOutbound:'requires_live_acceptance'};
report.capabilities.envoy={integration:'not_installed_by_this_release',runtime:'not_verified'};
console.log(JSON.stringify(report,null,2));

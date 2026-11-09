import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const credentialPath=(root,peer)=>join(root,'email',createHash('sha256').update(peer).digest('hex')+'.xml');
export async function emailCall(service,peer,action,data={}){
 if(!['status','list','read'].includes(action))throw Error('邮箱只支持status/list/read');
 return emailRequest(service,peer,action,data);
}
export async function emailRequest(service,peer,action,data={}){
 if(!['status','list','read','sync'].includes(action))throw Error('不支持的邮箱操作');
 const path=credentialPath(service.root,peer);
 if(action==='status'){
  let provider='QQ';try{const c=JSON.parse(readFileSync(path.replace(/\.xml$/,'.settings.json'),'utf8').replace(/^\uFEFF/,''));provider=['QQ','Gmail','iCloud','Custom'].includes(c.provider)?c.provider:'Custom'}catch{}
  return {configured:existsSync(path),provider,readOnly:true,credentialStore:'Windows DPAPI，本机当前用户',automaticMonitoring:service.emailMonitor?.get(peer)?.enabled??false,scope:'当前用户绑定的一个邮箱收件箱；支持TLS IMAP授权码，不含OAuth登录'};
 }
 if(!existsSync(path))return {configured:false,error:'请先使用本机邮箱配置窗口，为当前微信用户设置邮箱、IMAP服务器和授权码；不要把授权码发送到聊天'};
 if(action==='list'&&(!Number.isInteger(data.limit??5)||(data.limit??5)<1||(data.limit??5)>10))throw Error('读取数量须为1–10');
 if(action==='read'&&(!/^\d{1,12}$/.test(String(data.uid))||!/^(?:[a-f0-9]{16}:)?\d+$/.test(String(data.uidValidity))))throw Error('请用list返回的uid和uidValidity读取邮件');
 const python=join(homedir(),'.dsh','dsh-runtimes','dsh-primary-runtime','dependencies','python',process.platform==='win32'?'python.exe':'bin/python3');
 const result=await new Promise((resolve,reject)=>{
  const child=execFile(python,[fileURLToPath(new URL('./email_worker.py',import.meta.url)),path],{windowsHide:true,timeout:60000,maxBuffer:512*1024,encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}},(error,stdout)=>{
   if(error)return reject(Error('邮箱读取超时或进程失败，未修改邮件'));
   try{resolve(JSON.parse(stdout))}catch{reject(Error('邮箱响应无法解析，未修改邮件'))}
  });child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({action,limit:data.limit??5,uid:data.uid,uidValidity:data.uidValidity,cursor:data.cursor}));
 });return result;
}

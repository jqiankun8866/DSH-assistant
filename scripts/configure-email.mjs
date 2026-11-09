import {homedir} from 'node:os';
import {join} from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const base=join(homedir(),'.dsh-plugin-wechat/workspace/.assistant');
const marker=join(base,'location.json');
const root=process.env.DSH_ASSISTANT_ROOT??(existsSync(marker)?JSON.parse(readFileSync(marker,'utf8')).root:base);
const db=new DatabaseSync(join(root,'assistant.sqlite'),{readOnly:true});
let peers;try{peers=db.prepare("SELECT peer FROM activity WHERE peer LIKE 'weixin:%'").all().map(r=>r.peer)}finally{db.close()}
const index=process.argv.indexOf('--peer');const requested=index>=0?process.argv[index+1]:null;
const peer=requested??(peers.length===1?peers[0]:null);
if(!peer||!peers.includes(peer))throw Error('请先通过微信聊天；若绑定多个用户，请让 DSH 按当前会话传入 --peer，不能猜测要修改的账户。');
const credential=join(root,'email',createHash('sha256').update(peer).digest('hex')+'.xml');
const child=spawn('powershell.exe',['-NoProfile','-STA','-File',fileURLToPath(new URL('./setup-qq-email.ps1',import.meta.url)),'-CredentialPath',credential],{windowsHide:true,stdio:'inherit'});
child.on('error',()=>{console.error('配置窗口启动失败');process.exitCode=1});child.on('exit',code=>{process.exitCode=code??1});

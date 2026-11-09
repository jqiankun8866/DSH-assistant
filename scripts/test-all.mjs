import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=args=>{const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1)};
run(['scripts/build-channel.mjs']);
run(['--test','--test-concurrency=1',...readdirSync(join(root,'packages/wechat-channel/tests')).filter(n=>n.endsWith('.node-test.mjs')).sort().map(n=>join('packages/wechat-channel/tests',n))]);

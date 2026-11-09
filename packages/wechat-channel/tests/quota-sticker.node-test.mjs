import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sendQuotaSticker} from '../src/dsh/quota-sticker.mjs';
import {TurnFailure,isQuotaFailure} from '../src/dsh/turn-failure.mjs';
test('quota sends local image without a model; rate/auth/network errors never send',async()=>{
 const root=mkdtempSync(join(tmpdir(),'quota-'));let calls=0;
 try{const path=join(root,'memes/dafeiyu-001/system');mkdirSync(path,{recursive:true});writeFileSync(join(path,'quota-empty.png'),'fixture');
 const sendFile=async p=>{assert.equal(p,join(path,'quota-empty.png'));calls++;return 'accepted'};
 for(const error of [{status:402},{code:'ACCOUNT_QUOTA'},{code:'insufficient_quota'},new TurnFailure({code:'ACCOUNT_QUOTA',status:402})])assert.equal((await sendQuotaSticker({error,workspace:root,sendFile})).sent,true);
 assert.equal(calls,4);
 for(const error of [{status:429},{status:401},{status:503},new Error('fetch failed'),new Error('Selected model is at capacity')]){assert.equal(isQuotaFailure(error),false);assert.equal((await sendQuotaSticker({error,workspace:root,sendFile})).sent,false)}
 assert.equal(calls,4);
 assert.equal((await sendQuotaSticker({error:{status:402},workspace:root,sendFile:async()=>{throw Error('offline')}})).reason,'delivery-failed');
 assert.equal((await sendQuotaSticker({error:{status:402},workspace:join(root,'missing'),sendFile})).reason,'missing-asset');
 }finally{rmSync(root,{recursive:true,force:true})}
});

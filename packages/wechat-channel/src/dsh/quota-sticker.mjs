import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {isQuotaFailure} from './turn-failure.mjs';
// Pre-generated local asset, no model/vision/retrieval calls on this error path.
export async function sendQuotaSticker({error,workspace,sendFile,onError=()=>{}}){
 if(!isQuotaFailure(error))return {sent:false,reason:'not-quota'};
 const file=join(workspace,'memes','dafeiyu-001','system','quota-empty.png');
 if(!existsSync(file))return {sent:false,reason:'missing-asset'};
 try{const messageId=await sendFile(file);return {sent:true,messageId}}
 catch(e){onError(e);return {sent:false,reason:'delivery-failed'}}
}

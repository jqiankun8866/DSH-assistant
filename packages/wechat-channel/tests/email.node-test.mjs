import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {emailCall,credentialPath} from '../src/assistant/email.mjs';
test('email defaults unconfigured, isolates credential paths, rejects writes and bad IDs before IO',async t=>{const root=mkdtempSync(join(tmpdir(),'email-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const service={root};assert.equal((await emailCall(service,'weixin:a','status')).configured,false);assert.equal((await emailCall(service,'weixin:a','list')).configured,false);assert.notEqual(credentialPath(root,'weixin:a'),credentialPath(root,'weixin:b'));const path=credentialPath(root,'weixin:a');mkdirSync(dirname(path));writeFileSync(path,'fixture');assert.equal((await emailCall(service,'weixin:b','status')).configured,false);await assert.rejects(emailCall(service,'weixin:a','send',{}));await assert.rejects(emailCall(service,'weixin:a','list',{limit:11}));await assert.rejects(emailCall(service,'weixin:a','read',{uid:'1 BODY[]',uidValidity:'5'}));await assert.rejects(emailCall(service,'weixin:a','read',{uid:'1'}))});

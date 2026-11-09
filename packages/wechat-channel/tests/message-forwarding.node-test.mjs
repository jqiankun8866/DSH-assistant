import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldForwardUserMessage as forward} from '../src/dsh/message-forwarding.mjs';
test('internal user-role snapshots never go to WeChat',()=>{
 for(const kind of ['time-context','runtime-context','tool-registry','skill-catalog','plugin'])assert.equal(forward({source:{kind},content:[{type:'text',text:'internal'}]}),false);
 assert.equal(forward({content:[{type:'text',text:'unknown source'}]}),false);
});
test('scheduled turns and WeChat echoes are suppressed',()=>{
 const message={source:{kind:'user'}};assert.equal(forward(message,{scheduled:true}),false);assert.equal(forward(message,{fromWechat:true}),false);
});
test('explicit human desktop messages still forward',()=>{assert.equal(forward({source:{kind:'user'}}),true)});
